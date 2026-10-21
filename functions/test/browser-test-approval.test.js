"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {approveBrowserTestMember}=require("../approve-browser-test-member");
function fixture(){
  const uid="U"+"a".repeat(32),id="12345678-1234-1234-1234-123456789abc";
  const data=new Map([["users/"+uid,{userId:uid,memberId:"G2-"+"A".repeat(32),role:"member",isActive:true,monthlyPoints:0,lifetimeHours:0}]]);
  const db={projectId:"g2-member-test",collection:n=>({doc:id=>({path:n+"/"+id})}),runTransaction:async fn=>fn({get:async ref=>({exists:data.has(ref.path),data:()=>data.get(ref.path)}),create:(ref,value)=>{assert.ok(!data.has(ref.path));data.set(ref.path,value);}})};
  return {uid,id,data,args:{db,auth:{getUser:async()=>({uid,disabled:false,metadata:{lastSignInTime:"2026-10-21T08:00:00Z"}})},FieldValue:{serverTimestamp:()=>"timestamp"},env:{G2_FIREBASE_PROJECT_ID:"g2-member-test",G2_MEMBER_ENABLED:"false",G2_TEST_BROWSER_MEMBER_UID:uid,G2_TEST_BROWSER_APPROVAL_ID:id}}};
}
test("admission only changes the test allowlist and receipt; restart never reverses revocation",async()=>{
  const f=fixture(),before=JSON.stringify(f.data.get("users/"+f.uid));
  assert.equal((await approveBrowserTestMember(f.args)).state,"approved");
  assert.equal(JSON.stringify(f.data.get("users/"+f.uid)),before);
  assert.equal(f.data.size,3);f.data.get("sandboxMembers/"+f.uid).enabled=false;
  assert.equal((await approveBrowserTestMember(f.args)).state,"already_completed");
  assert.equal(f.data.get("sandboxMembers/"+f.uid).enabled,false);
});
test("wrong project, real awards, inactive/unregistered/nonzero profiles and mismatched identity fail closed",async()=>{
  for(const mutate of [f=>f.args.env.G2_FIREBASE_PROJECT_ID="member-3e17e",f=>f.args.db.projectId="member-3e17e",f=>f.args.env.G2_MEMBER_ENABLED="true",f=>f.data.clear(),f=>f.data.get("users/"+f.uid).isActive=false,f=>f.data.get("users/"+f.uid).monthlyPoints=1,f=>f.data.get("users/"+f.uid).memberId="OTHER",f=>f.data.get("users/"+f.uid).role="admin",f=>f.args.auth.getUser=async()=>({uid:f.uid,disabled:true})]){
    const f=fixture();mutate(f);await assert.rejects(approveBrowserTestMember(f.args));assert.equal(f.data.has("sandboxMembers/"+f.uid),false);
  }
});

