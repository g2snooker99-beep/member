"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const admin=require("firebase-admin");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const {doc,getDoc,setDoc,updateDoc,collection,getDocs,query,where}=require("firebase/firestore");
const {buildService,monthAt}=require("../service");
const projectId="demo-g2-member";
const U="U"+"a".repeat(32),S="U"+"b".repeat(32),A="U"+"c".repeat(32),OTHER="U"+"d".repeat(32);
let env,db,service;
let clock=new Date("2026-10-21T04:00:00Z");
const valid={iss:"https://access.line.me",aud:"1234567890",sub:U,exp:9999999999};
let claims=valid,offline=false;
const requestId="12345678-1234-1234-1234-123456789012";
async function seed(){
  await env.clearFirestore();clock=new Date("2026-10-21T04:00:00Z");claims=valid;offline=false;
  for(const [uid,role] of [[U,"member"],[OTHER,"member"],[S,"staff"],[A,"admin"]])await db.collection("users").doc(uid).set({role,isActive:true,userId:uid,monthlyPoints:0,lifetimeHours:0,pointsMonth:"2026-10",nickname:role,memberId:uid});
  await db.collection("posAwardMonths").doc("2026-10").set({state:"open"});
  for(const [uid,role] of [[S,"staff"],[A,"admin"]])await db.collection("memberStaffAccess").doc(uid).set({role,enabled:true});
}
before(async()=>{
  assert.equal(process.env.GCLOUD_PROJECT,projectId);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST||"",/^(127\.0\.0\.1|localhost):/);
  env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync("../firestore.secure.rules","utf8")}});
  admin.initializeApp({projectId});db=admin.firestore();
  service=buildService({db,auth:{createCustomToken:async uid=>"test:"+uid},FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:"1234567890",ownerUid:A,now:()=>clock,verifyLine:async()=>{if(offline)throw Error("LINE unavailable");return claims;}});
});
after(async()=>{await env?.cleanup();await admin.app().delete();});
test("Render sandbox denies unapproved members even with valid staff authority",async()=>{
  await seed();
  const sandbox=buildService({db,auth:{},FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:"1234567890",ownerUid:A,sandboxOnly:true,now:()=>clock});
  const data={requestId,monthId:"2026-10",userId:U,points:1};
  await assert.rejects(sandbox.addPoints(S,data),{code:"permission-denied"});
  await db.collection("sandboxMembers").doc(U).set({dummyOnly:true,enabled:true});
  assert.equal((await sandbox.addPoints(S,data)).duplicate,false);
  await db.collection("sandboxMembers").doc(U).update({enabled:false});
  await assert.rejects(sandbox.addPoints(S,{...data,requestId:"22345678-1234-1234-1234-123456789012"}),{code:"permission-denied"});
});
test("LINE audience, issuer, expiry, forged subject, outage fail closed",async()=>{
  await seed();assert.equal((await service.exchange("a".repeat(30))).customToken,"test:"+U);
  for(const patch of [{aud:"wrong"},{iss:"wrong"},{exp:1},{sub:"fake"}]){claims={...valid,...patch};await assert.rejects(service.exchange("a".repeat(30)));}
  offline=true;await assert.rejects(service.exchange("a".repeat(30)));
});
test("rules block anonymous access, role escalation, all client point writes and PII reads",async()=>{
  await seed();const anon=env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon,"users",U)));await assertFails(getDocs(collection(anon,"users")));
  const member=env.authenticatedContext(U,{role:"admin"}).firestore();
  await assertSucceeds(getDoc(doc(member,"users",U)));await assertFails(getDoc(doc(member,"users",OTHER)));
  await assertFails(updateDoc(doc(member,"users",U),{role:"admin"}));
  await assertFails(setDoc(doc(member,"pointTransactions","forged"),{userId:U,points:100}));
  await assertFails(setDoc(doc(member,"users",U),{role:"member",monthlyPoints:0}));
  await assertFails(setDoc(doc(member,"posAwardMonths","2026-10"),{state:"open"}));
  await assertFails(setDoc(doc(member,"posPointAwards","forged"),{points:100}));
});
test("staff revocation immediately applies despite stale token role",async()=>{
  await seed();const staff=env.authenticatedContext(S,{role:"staff"}).firestore();
  await assertSucceeds(getDoc(doc(staff,"users",U)));
  await db.collection("users").doc(S).update({role:"member"});
  await assertFails(getDoc(doc(staff,"users",U)));
  await assert.rejects(service.addPoints(S,{requestId,monthId:"2026-10",userId:U,points:1}),{code:"permission-denied"});
});
test("registration ignores browser role and points",async()=>{
  await seed();const uid="U"+"e".repeat(32);
  await service.register(uid,{nickname:"Test",phone:"0800000000",role:"admin",monthlyPoints:999});
  const p=(await db.collection("users").doc(uid).get()).data();assert.equal(p.role,"member");assert.equal(p.monthlyPoints,0);
});
test("concurrent duplicate manual grant increments once and rejects conflicting replay",async()=>{
  await seed();const d={requestId,monthId:"2026-10",userId:U,points:3};
  await Promise.all([service.addPoints(S,d),service.addPoints(S,d)]);
  assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,3);
  await assert.rejects(service.addPoints(S,{...d,points:2}),{code:"already-exists"});
  assert.equal((await db.collection("pointTransactions").get()).size,1);
});
test("closed month denies manual points and cannot reopen",async()=>{
  await seed();await db.collection("posAwardMonths").doc("2026-10").update({state:"closed"});
  await assert.rejects(service.addPoints(S,{requestId,monthId:"2026-10",userId:U,points:1}),{code:"failed-precondition"});
  await assert.rejects(service.openMonth(A,"2026-10"),{code:"failed-precondition"});
  await assert.rejects(service.openMonth(S,"2026-10"),{code:"permission-denied"});
});
test("month close snapshots, reward, duplicate close, and new-month preservation",async()=>{
  await seed();await db.collection("users").doc(U).update({monthlyPoints:20});
  await db.collection("users").doc(OTHER).update({monthlyPoints:8,pointsMonth:"2026-11"});
  clock=new Date("2026-11-01T00:00:00Z");
  const result=await service.closeMonth(A,"2026-10");assert.equal(result.state,"closed");
  assert.equal(result.top3[0].points,20);assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,0);
  assert.equal((await db.collection("users").doc(OTHER).get()).data().monthlyPoints,8);
  assert.equal((await service.closeMonth(A,"2026-10")).duplicate,true);
  assert.equal((await db.collection("monthlyRewards").get()).size,1);
});
test("close can resume from closing state",async()=>{
  await seed();clock=new Date("2026-11-01T00:00:00Z");
  await db.collection("posAwardMonths").doc("2026-10").update({state:"closing"});
  assert.equal((await service.closeMonth(A,"2026-10")).state,"closed");
});
test("Bangkok month boundary",()=>{assert.equal(monthAt(new Date("2026-10-31T17:00:00Z")),"2026-11");});
test("only admin can assign/revoke staff; no self or admin escalation",async()=>{
  await seed();
  await assert.rejects(service.setStaff(S,{userId:OTHER,role:"staff",isActive:true}),{code:"permission-denied"});
  await assert.rejects(service.setStaff(A,{userId:OTHER,role:"admin",isActive:true}),{code:"invalid-argument"});
  await assert.rejects(service.setStaff(A,{userId:A,role:"staff",isActive:true}),{code:"invalid-argument"});
  await service.setStaff(A,{userId:S,role:"member",isActive:false});
  await assert.rejects(service.addPoints(S,{requestId,monthId:"2026-10",userId:U,points:1}),{code:"permission-denied"});
});
test("reward redemption next month only; duplicate cannot redeem twice",async()=>{
  await seed();const rewardId="2026-10_"+U+"_discount10";
  await db.collection("monthlyRewards").doc(rewardId).set({userId:U,monthKey:"2026-10",status:"available"});
  await assert.rejects(service.redeem(S,{rewardId}),{code:"failed-precondition"});
  clock=new Date("2026-11-01T00:00:00Z");
  assert.equal((await service.redeem(S,{rewardId})).duplicate,false);
  assert.equal((await service.redeem(S,{rewardId})).duplicate,true);
});
test("manual request cannot slide into a new month",async()=>{
  await seed();clock=new Date("2026-11-01T00:00:00Z");
  await assert.rejects(service.addPoints(S,{requestId,monthId:"2026-10",userId:U,points:1}),{code:"failed-precondition"});
  assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,0);
});
test("public leaderboard contains no phone or LINE UID and staff promotion removes entry",async()=>{
  await seed();await service.addPoints(S,{requestId,monthId:"2026-10",userId:U,points:1});
  const rows=await db.collection("publicLeaderboard").get();assert.equal(rows.size,1);
  assert.deepEqual(Object.keys(rows.docs[0].data()).sort(),["monthId","nickname","points"]);
  await service.setStaff(A,{userId:U,role:"staff",isActive:true});
  assert.equal((await db.collection("publicLeaderboard").get()).size,0);
});
test("Firebase Auth emulator accepts custom token with verified LINE uid",async()=>{
  assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST||"",/^(127\.0\.0\.1|localhost):/);
  const token=await admin.auth().createCustomToken(U);
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})
  });
  assert.equal(response.status,200);const result=await response.json();
  assert.ok(result.idToken);
  const decoded=await admin.auth().verifyIdToken(result.idToken);
  assert.equal(decoded.uid,U);
});
test("forged legacy staff/admin roles cannot enter the secure system",async()=>{
  await seed();
  const client=env.authenticatedContext(OTHER,{role:"admin"}).firestore();
  for(const role of ["staff","admin"]){
    await db.collection("users").doc(OTHER).update({role});
    await assert.rejects(service.addPoints(OTHER,{requestId,monthId:"2026-10",userId:U,points:1}),{code:"permission-denied"});
    await assertFails(getDoc(doc(client,"users",U)));
  }
  await assertFails(setDoc(doc(client,"memberStaffAccess",OTHER),{role:"admin",enabled:true}));
});
