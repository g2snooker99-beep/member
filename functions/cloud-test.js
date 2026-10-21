"use strict";
// Explicit opt-in cloud smoke test. Writes ONLY fixed dummy accounts in the
// owner-created g2-member-test project. No production credentials or LINE calls.
const assert=require("node:assert/strict");
const {randomUUID,createHash}=require("node:crypto");
const admin=require("firebase-admin");
const {buildService,monthAt}=require("./service");
async function run(){
  if(!process.argv.includes("--run")||process.env.GOOGLE_CLOUD_PROJECT!=="g2-member-test"||process.env.FIRESTORE_EMULATOR_HOST)
    throw Error("Explicit --run and GOOGLE_CLOUD_PROJECT=g2-member-test required; cloud test only");
  admin.initializeApp({projectId:"g2-member-test"});const db=admin.firestore();
  assert.equal(db.projectId||db.project,"g2-member-test");
  let clock=new Date();const month=monthAt(clock),runId=randomUUID();
  const dummy=kind=>"U"+createHash("sha256").update(runId+kind).digest("hex").slice(0,32);
  const U=dummy("member"),S=dummy("staff"),A=dummy("owner"),F=dummy("forged");
  const service=buildService({db,auth:{createCustomToken:()=>{throw Error("No real identity signing in smoke test");}},FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,ownerUid:A,channelId:"1234567890",verifyLine:()=>{throw Error("No LINE traffic");},now:()=>clock});
  for(const [uid,role] of [[U,"member"],[S,"staff"],[A,"admin"],[F,"admin"]])
    await db.collection("users").doc(uid).set({userId:uid,role,isActive:true,nickname:"G2 CLOUD TEST ONLY",phone:"0800000000",memberId:"TEST-"+uid.slice(1,5),monthlyPoints:0,lifetimeHours:0,pointsMonth:month});
  for(const [uid,role] of [[S,"staff"],[A,"admin"]])await db.collection("memberStaffAccess").doc(uid).set({role,enabled:true});
  await db.collection("posAwardMonths").doc(month).set({state:"open",testRun:runId});
  const d={requestId:runId,monthId:month,userId:U,points:3};
  await Promise.all([service.addPoints(S,d),service.addPoints(S,d)]);
  assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,3);
  assert.equal((await service.addPoints(S,d)).duplicate,true);
  await assert.rejects(service.addPoints(F,{...d,requestId:randomUUID()}),{code:"permission-denied"});
  await service.setStaff(A,{userId:S,role:"member",isActive:false});
  await assert.rejects(service.addPoints(S,{...d,requestId:randomUUID()}),{code:"permission-denied"});
  const [year,m]=month.split("-").map(Number);clock=new Date(Date.UTC(year,m,2));
  assert.equal((await service.closeMonth(A,month)).state,"closed");
  assert.equal((await service.closeMonth(A,month)).duplicate,true);
  assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,0);
  const response=await fetch("https://firestore.googleapis.com/v1/projects/g2-member-test/databases/(default)/documents/users/"+U);
  assert.equal(response.status,403);
  const summary={state:"passed",projectId:"g2-member-test",runId,dummyOnly:true,checks:["concurrent_duplicate","lost_ack_retry","forged_legacy_role","staff_revocation","monthly_close","repeated_close","anonymous_read_denied"],createdAt:admin.firestore.FieldValue.serverTimestamp()};
  await db.collection("cloudTestRuns").doc(runId).set(summary);
  console.log(JSON.stringify({...summary,createdAt:undefined}));await admin.app().delete();
}
if(require.main===module)run().catch(e=>{console.error(e.code||e.name,e.message);process.exitCode=1;});
