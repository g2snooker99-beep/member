"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),http=require("node:http");
const {validateConfig,createHandler}=require("../render-http");
const origin="https://g2-member-test-api.onrender.com";
const base={G2_MEMBER_ENABLED:"false",G2_FIREBASE_PROJECT_ID:"g2-member-test",G2_MEMBER_API_ORIGIN:origin,MEMBER_LINE_CHANNEL_ID:"2010084269"};
test("Render rejects live projects, live flags, emulators and wrong credentials",()=>{
  assert.equal(validateConfig(base),null);
  assert.throws(()=>validateConfig({...base,G2_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:"private-sensitive-value"}),e=>!e.message.includes("private-sensitive-value"));
  for(const patch of [{G2_FIREBASE_PROJECT_ID:"member-3e17e"},{G2_MEMBER_ENABLED:"true"},{FIRESTORE_EMULATOR_HOST:"localhost:8080"},{G2_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:"service_account",project_id:"member-3e17e",client_email:"x@member-3e17e.iam.gserviceaccount.com"})}])assert.throws(()=>validateConfig({...base,...patch}));
});
test("HTTP auth, Origin, missing keys, duplicates and Firebase outage",async()=>{
  let ready=false,outage=false,revoked=false,calls=0;
  const service={exchange:async()=>({customToken:"test-only"}),addPoints:async(uid,d)=>{calls++;assert.equal(uid,"verified-server-uid");if(outage)throw Error("private key and internal detail");return {duplicate:d.requestId==="retry"};}};
  const auth={verifyIdToken:async(token,checkRevoked)=>{assert.equal(checkRevoked,true);if(revoked)throw Error("revoked");return {uid:"verified-server-uid"};}};
  const server=http.createServer((req,res)=>createHandler({service:ready?service:null,auth,origin})(req,res));
  await new Promise(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+server.address().port;
  const post=(data={},headers={})=>fetch(url+"/api/memberAddPoints",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",...headers},body:JSON.stringify(data)});
  const bearer={Authorization:"Bearer "+"a".repeat(30)};
  try{
    assert.equal((await post()).status,503);ready=true;
    assert.equal((await post()).status,401);
    assert.equal((await post({}, {...bearer,Origin:"https://attacker.invalid"})).status,403);
    revoked=true;assert.equal((await post({},bearer)).status,401);revoked=false;
    assert.deepEqual((await (await post({requestId:"retry"},bearer)).json()).data,{duplicate:true});
    outage=true;const failure=await post({},bearer);assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private key/);
    assert.equal(calls,2);
    assert.equal((await fetch(url+"/service.js")).status,404);
    assert.equal((await fetch(url+"/health")).status,200);
  }finally{await new Promise(r=>server.close(r));}
});
