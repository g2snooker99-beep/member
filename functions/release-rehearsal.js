"use strict";
const assert=require("node:assert/strict"),{createHash,randomUUID}=require("node:crypto"),http=require("node:http");
async function runReleaseRehearsal({db,auth,FieldValue,FieldPath,Timestamp,GeoPoint,env}){
  assert.equal(env.G2_MEMBER_ENABLED,"false");assert.equal(env.G2_FIREBASE_PROJECT_ID,"g2-member-test");assert.equal(db.projectId,"g2-member-test");
  assert.ok(!env.FIRESTORE_EMULATOR_HOST&&!env.FIREBASE_AUTH_EMULATOR_HOST);
  const runId=env.G2_TEST_RELEASE_RUN_ID;assert.match(runId||"",/^[a-f0-9-]{36}$/);
  const root=db.collection("releaseRehearsals").doc(runId),winzy=db.collection("users").doc("Uadf0812b101c84881dc5f248d71d0d76");
  const before=await winzy.get(),score=before.exists?before.data().monthlyPoints:null;
  if((await root.get()).data()?.state==="passed")return {runId,state:"passed",alreadyCompleted:true,winzyPoints:score};
  // Create-only: interrupted runs never reset existing fixtures. Investigate,
  // retain the failed namespace, then explicitly request a new run identifier.
  await root.create({state:"running",dummyOnly:true,startedAt:FieldValue.serverTimestamp()});
  let server;
  try{
    const scoped={collection:n=>root.collection(n),runTransaction:fn=>db.runTransaction(fn)};
    const result=await require("./release-scenarios").releaseScenarios({db:scoped,root,physicalDb:db,FieldValue,FieldPath,Timestamp,GeoPoint,runId});
    const prefix=createHash("sha256").update(runId).digest("hex").slice(0,28),A="U"+prefix+"0001",S="U"+prefix+"0002",U="U"+prefix+"000a";
    const service=require("./service").buildService({db:scoped,auth,FieldValue,FieldPath,ownerUid:A,now:()=>new Date("2026-11-15T12:00:00Z")});
    server=http.createServer(require("./render-http").createHandler({service,auth,origin:env.G2_MEMBER_API_ORIGIN}));
    await new Promise(r=>server.listen(0,"127.0.0.1",r));
    const config=JSON.parse(env.G2_TEST_FIREBASE_WEB_CONFIG_JSON);assert.equal(config.projectId,"g2-member-test");
    const custom=await auth.createCustomToken(S);
    const login=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key="+config.apiKey,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:custom,returnSecureToken:true}),signal:AbortSignal.timeout(15000)});
    assert.equal(login.status,200);const token=(await login.json()).idToken;
    async function post(name,data){const r=await fetch("http://127.0.0.1:"+server.address().port+"/api/"+name,{method:"POST",headers:{Origin:env.G2_MEMBER_API_ORIGIN,"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
    assert.deepEqual((await post("memberSession",{})).body.data.capabilities,{staff:true,admin:false});
    const request={userId:U,monthId:"2026-11",points:2,requestId:randomUUID()};
    assert.equal((await post("memberAddPoints",request)).status,200);
    assert.equal((await post("memberAddPoints",request)).body.data.duplicate,true);
    assert.equal((await scoped.collection("users").doc(U).get()).data().monthlyPoints,6);
    assert.equal((await post("memberCloseMonth",{month:"2026-10"})).status,403);
    await scoped.collection("memberStaffAccess").doc(S).update({enabled:false});
    assert.equal((await post("memberAddPoints",{...request,requestId:randomUUID()})).status,403);
    result.checks.push("real_http_custom_auth_manual_retry_admin_denial_revocation");
    const after=await winzy.get();assert.equal(after.exists?after.data().monthlyPoints:null,score);
    result.checks.push("winzy_points_preserved");
    await root.update({...result,state:"passed",completedAt:FieldValue.serverTimestamp(),winzyPoints:score});
    return {...result,state:"passed",runId,winzyPoints:score};
  }catch(e){await root.update({state:"failed",errorCode:String(e.code||e.name||"unknown"),errorMessage:String(e.message||"").slice(0,250),failedAt:FieldValue.serverTimestamp()});throw e;}
  finally{if(server)await new Promise(r=>server.close(r));}
}
module.exports={runReleaseRehearsal};
