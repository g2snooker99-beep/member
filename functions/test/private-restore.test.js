"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),http=require("node:http");
const {buildPrivateRestore}=require("../private-restore"),{createHandler}=require("../render-http");
const origin="https://g2-member-test-api.onrender.com";
const base={G2_FIREBASE_PROJECT_ID:"g2-member-test",G2_MEMBER_ENABLED:"false",G2_MEMBER_API_ORIGIN:origin,G2_TEST_PRIVATE_RESTORE_RUN_ID:"12345678-1234-1234-1234-123456789012",G2_TEST_PRIVATE_RESTORE_KEY:"a".repeat(64),G2_TEST_PRIVATE_RESTORE_TOKEN:"b".repeat(43)};
const db={projectId:"g2-member-test",collection:()=>({doc:()=>({})})};
test("private restore is disabled by default and refuses live targets",()=>{
 assert.equal(buildPrivateRestore({db,env:{}}),null);
 assert.throws(()=>buildPrivateRestore({db:{projectId:"member-3e17e"},env:base}));
 assert.throws(()=>buildPrivateRestore({db,env:{...base,G2_MEMBER_ENABLED:"true"}}));
});
test("private data operation requires scoped token/origin and rejects malformed archives",async()=>{
 const op=buildPrivateRestore({db,env:base}),server=http.createServer(createHandler({service:null,auth:null,origin,privateRestore:op}));
 await new Promise(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+server.address().port+"/internal/private-restore";
 try{
  assert.equal((await fetch(url)).status,403);
  assert.equal((await fetch(url,{headers:{Origin:origin,Authorization:"Bearer invalid"}})).status,403);
  const headers={Origin:origin,Authorization:"Bearer "+base.G2_TEST_PRIVATE_RESTORE_TOKEN};
  assert.equal((await (await fetch(url,{headers})).json()).state,"idle");
  assert.equal((await fetch(url,{method:"POST",headers,body:"invalid"})).status,400);
 }finally{await new Promise(r=>server.close(r));}
});
