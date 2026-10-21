"use strict";
// HTTP transport only: the same transaction/ACL implementation as Functions.
const http=require("node:http");
const {readFile}=require("node:fs/promises");
const path=require("node:path");
const PROJECT="g2-member-test";
const routes={memberLineLogin:(s,u,d)=>s.exchange(d.idToken),memberRegister:(s,u,d)=>s.register(u,d),memberAddPoints:(s,u,d)=>s.addPoints(u,d),memberOpenMonth:(s,u,d)=>s.openMonth(u,d.month),memberCloseMonth:(s,u,d)=>s.closeMonth(u,d.month),memberRedeemReward:(s,u,d)=>s.redeem(u,d),memberSetStaff:(s,u,d)=>s.setStaff(u,d)};
function validateConfig(env){
  if(env.G2_MEMBER_ENABLED!=="false"||env.G2_FIREBASE_PROJECT_ID!==PROJECT||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST)throw Error("Sandbox isolation required");
  if(!/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(env.G2_MEMBER_API_ORIGIN||""))throw Error("Canonical Render origin required");
  if(!/^\d{5,20}$/.test(env.MEMBER_LINE_CHANNEL_ID||""))throw Error("LINE channel required");
  let credential;try{credential=JSON.parse(env.G2_TEST_FIREBASE_SERVICE_ACCOUNT_JSON||"null");}catch{throw Error("Invalid test credential JSON");}
  if(credential&&(credential.project_id!==PROJECT||!credential.client_email?.endsWith("@g2-member-test.iam.gserviceaccount.com")||credential.type!=="service_account"))throw Error("Test-only service account required");
  return credential;
}
function createHandler({service,auth,origin,publicConfig=null,clock=Date.now}){
  const buckets=new Map();
  function send(res,code,data){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data));}
  return async(req,res)=>{
    res.setHeader("Referrer-Policy","no-referrer");res.setHeader("X-Frame-Options","DENY");
    const url=new URL(req.url,"http://localhost");
    if(req.method==="GET"&&url.pathname==="/health")return send(res,200,{projectId:PROJECT,awardsEnabled:false,backendReady:!!service});
    if(req.method==="GET"&&url.pathname==="/config.js"){
      res.writeHead(200,{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store"});return res.end("window.G2_MEMBER_CONFIG="+JSON.stringify(publicConfig||{firebase:null,liffId:""})+";");
    }
    const files={"/":"index.html","/index.html":"index.html","/app.js":"app.js"};
    if(req.method==="GET"&&files[url.pathname]){
      try{const body=await readFile(path.join(__dirname,"../secure-public",files[url.pathname]));res.writeHead(200,{"Content-Type":url.pathname.endsWith(".js")?"application/javascript; charset=utf-8":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});return res.end(body);}catch{return send(res,503,{error:"unavailable"});}
    }
    const name=url.pathname.startsWith("/api/")?url.pathname.slice(5):"";
    if(!Object.hasOwn(routes,name))return send(res,404,{error:"not-found"});
    if(req.method!=="POST")return send(res,405,{error:"method-not-allowed"});
    if(req.headers.origin!==origin)return send(res,403,{error:"permission-denied"});
    if(!(req.headers["content-type"]||"").startsWith("application/json"))return send(res,415,{error:"invalid-argument"});
    // Do not trust arbitrary X-Forwarded-For. Bound the global map and requests
    // per socket peer as a backstop; authorization remains the real boundary.
    const now=clock(),peer=req.socket.remoteAddress||"unknown";
    if(buckets.size>1000)for(const [k,b] of buckets)if(b.until<=now)buckets.delete(k);
    let bucket=buckets.get(peer);if(!bucket||bucket.until<=now){bucket={count:0,until:now+60000};buckets.set(peer,bucket);}
    if(++bucket.count>120||buckets.size>2000)return send(res,429,{error:"resource-exhausted"});
    if(!service)return send(res,503,{error:"unavailable",message:"Test credentials not connected"});
    try{
      let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384){send(res,413,{error:"invalid-argument"});return;}}
      const data=JSON.parse(body);if(!data||typeof data!=="object"||Array.isArray(data))return send(res,400,{error:"invalid-argument"});
      let uid;
      if(name!=="memberLineLogin"){
        const match=/^Bearer ([^\s]{20,8192})$/.exec(req.headers.authorization||"");
        if(!match)return send(res,401,{error:"unauthenticated"});
        try{uid=(await auth.verifyIdToken(match[1],true)).uid;}catch{return send(res,401,{error:"unauthenticated"});}
      }
      return send(res,200,{data:await routes[name](service,uid,data)});
    }catch(e){
      const codes={"unauthenticated":401,"permission-denied":403,"invalid-argument":400,"failed-precondition":409,"already-exists":409};
      const code=codes[e.code];return send(res,code||503,{error:code?e.code:"unavailable",message:code?e.message:"Service unavailable; retry the same request safely"});
    }
  };
}
function start(env=process.env){
  const credential=validateConfig(env);let service=null,auth=null;
  if(credential){
    const admin=require("firebase-admin"),{buildService}=require("./service");
    const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:PROJECT},"render-test");
    auth=app.auth();
    service=buildService({db:app.firestore(),auth,FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:env.MEMBER_LINE_CHANNEL_ID,ownerUid:env.MEMBER_OWNER_LINE_UID||"",sandboxOnly:true,verifyLine:async(token,channel)=>{
      const response=await fetch("https://api.line.me/oauth2/v2.1/verify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({id_token:token,client_id:channel}),signal:AbortSignal.timeout(5000)});
      if(!response.ok){const e=Error("LINE rejected login");e.code="unauthenticated";throw e;}return response.json();
    }});
  }
  let publicConfig=null;
  if(env.G2_TEST_FIREBASE_WEB_CONFIG_JSON&&env.G2_TEST_LIFF_ID){const firebase=JSON.parse(env.G2_TEST_FIREBASE_WEB_CONFIG_JSON);if(firebase.projectId!==PROJECT)throw Error("Wrong browser Firebase project");publicConfig={firebase,liffId:env.G2_TEST_LIFF_ID,backendUrl:env.G2_MEMBER_API_ORIGIN};}
  const server=http.createServer(createHandler({service,auth,origin:env.G2_MEMBER_API_ORIGIN,publicConfig}));
  server.requestTimeout=15000;server.headersTimeout=10000;server.listen(Number(env.PORT||10000),"0.0.0.0");
  process.on("SIGTERM",()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),25000).unref();});
  return server;
}
module.exports={validateConfig,createHandler,start};
if(require.main===module){try{start();}catch{console.error("Test backend configuration invalid; check sandbox settings privately");process.exitCode=1;}}
