"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{approveTestOwner}=require("../approve-test-owner"),{buildService}=require("../service"),{createHash}=require("node:crypto");
const A="U"+"a".repeat(32),OTHER="U"+"b".repeat(32),RUN="11111111-1111-4111-8111-111111111111",NOW=new Date("2026-10-22T01:32:00Z");
function fixture(){
 const env={G2_FIREBASE_PROJECT_ID:"g2-member-test",G2_MEMBER_ENABLED:"false",G2_MEMBER_API_ORIGIN:"https://g2-member-test-api.onrender.com",G2_TEST_OWNER_UID:A,G2_TEST_OWNER_APPROVAL_RUN_ID:RUN,G2_TEST_OWNER_APPROVAL_MODE:"apply",MEMBER_OWNER_LINE_UID:A};
 const values=new Map([["users/"+A,{userId:A,memberId:"G2-"+A.slice(1).toUpperCase(),role:"member",isActive:true,monthlyPoints:23,lifetimeHours:77,unknown:{keep:true}}],["publicLeaderboard/"+createHash("sha256").update(A).digest("hex"),{nickname:"owner",points:23}]]);
 let writes=0;
 const snap=(ref,map=values)=>({exists:map.has(ref.path),data:()=>structuredClone(map.get(ref.path))});
 const doc=path=>({path,get:async()=>snap({path})});
 const db={projectId:"g2-member-test",collection:c=>({doc:id=>doc(c+"/"+id)}),runTransaction:async fn=>{
  const changes=[],tx={get:async ref=>snap(ref),update:(ref,patch)=>changes.push(()=>values.set(ref.path,{...values.get(ref.path),...patch})),create:(ref,data)=>changes.push(()=>{assert.equal(values.has(ref.path),false);values.set(ref.path,data);}),delete:ref=>changes.push(()=>values.delete(ref.path))};
  const result=await fn(tx);for(const c of changes){c();writes++;}return result;
 }};
 const account={uid:A,disabled:false,metadata:{lastSignInTime:NOW.toISOString()}},auth={getUser:async()=>account};
 const FieldValue={serverTimestamp:()=>"stamp"};
 return {env,values,db,auth,account,FieldValue,now:()=>NOW,writes:()=>writes};
}
test("owner binding preserves member identity, points and extra fields and enables live server capabilities",async()=>{
 const f=fixture(),p=structuredClone(f.values.get("users/"+A)),service=buildService({...f,ownerUid:A,channelId:"123456",sandboxOnly:true});
 assert.deepEqual((await service.session(A)).capabilities,{staff:false,admin:false});
 const result=await approveTestOwner(f);assert.equal(result.adminReady,true);assert.equal(result.pointsWritten,0);
 const after=f.values.get("users/"+A);for(const key of ["userId","memberId","monthlyPoints","lifetimeHours","unknown"])assert.deepEqual(after[key],p[key]);
 assert.deepEqual((await service.session(A)).capabilities,{staff:true,admin:true});
 assert.equal([...f.values.keys()].some(k=>k.startsWith("publicLeaderboard/")),false);
 const count=f.writes();assert.equal((await approveTestOwner(f)).state,"already_completed");assert.equal(f.writes(),count);
});
test("inspection is read only and does not accept an unpinned owner as admin",async()=>{
 const f=fixture();f.env.G2_TEST_OWNER_APPROVAL_MODE="inspect";f.env.MEMBER_OWNER_LINE_UID=OTHER;
 const before=JSON.stringify([...f.values]);const r=await approveTestOwner(f);assert.equal(r.state,"inspected");assert.equal(r.adminReady,false);assert.equal(r.pinnedOwnerMatches,false);
 assert.equal(f.writes(),0);assert.equal(JSON.stringify([...f.values]),before);
});
test("production, emulator and incorrect owner settings fail before any grants",async()=>{
 for(const change of [{G2_FIREBASE_PROJECT_ID:"member-3e17e"},{G2_MEMBER_ENABLED:"true"},{G2_MEMBER_API_ORIGIN:"https://g2snooker.onrender.com"},{FIRESTORE_EMULATOR_HOST:"localhost:8080"},{FIREBASE_AUTH_EMULATOR_HOST:"localhost:9099"},{MEMBER_OWNER_LINE_UID:OTHER}]){
  const f=fixture();Object.assign(f.env,change);await assert.rejects(approveTestOwner(f));assert.equal(f.writes(),0);
 }
 const f=fixture();f.db.projectId="member-3e17e";await assert.rejects(approveTestOwner(f));assert.equal(f.writes(),0);
});
test("missing, disabled, stale or mismatched browser identity cannot receive owner rights",async()=>{
 for(const change of [{uid:OTHER},{disabled:true},{metadata:{}},{metadata:{lastSignInTime:"2026-10-19T00:00:00Z"}},{metadata:{lastSignInTime:"2026-10-23T00:00:00Z"}}]){
  const f=fixture();Object.assign(f.account,change);await assert.rejects(approveTestOwner(f));assert.equal(f.writes(),0);
 }
});
test("conflicting or revoked ACL is preserved and never silently re-enabled",async()=>{
 for(const acl of [{role:"staff",enabled:true},{role:"admin",enabled:false}]){
  const f=fixture();f.values.set("memberStaffAccess/"+A,acl);await assert.rejects(approveTestOwner(f));assert.equal(f.writes(),0);assert.deepEqual(f.values.get("memberStaffAccess/"+A),acl);
 }
 const f=fixture();await approveTestOwner(f);f.values.set("memberStaffAccess/"+A,{role:"admin",enabled:false});const count=f.writes();
 await assert.rejects(approveTestOwner(f));assert.equal(f.writes(),count);assert.equal(f.values.get("memberStaffAccess/"+A).enabled,false);
});
test("unregistered, inactive or conflicting profiles cannot be overwritten",async()=>{
 for(const change of [{isActive:false},{memberId:"WRONG"},{userId:OTHER},{role:"staff"}]){
  const f=fixture();Object.assign(f.values.get("users/"+A),change);await assert.rejects(approveTestOwner(f));assert.equal(f.writes(),0);
 }
 const f=fixture();f.values.delete("users/"+A);await assert.rejects(approveTestOwner(f));assert.equal(f.writes(),0);
});
