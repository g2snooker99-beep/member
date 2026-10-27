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
test("POS receiver atomically grants 37 once, blocks old trial and closed month",async()=>{
  await seed();await db.collection("sandboxMembers").doc(U).set({dummyOnly:true,enabled:true});
  const receiver=require("../pos-receiver").buildPosReceiver({db,FieldValue:admin.firestore.FieldValue,now:()=>clock});
  const item={bill_id:987654321,line_user_id:U,month_id:"2026-10",points:37,eligible_hours:18,bill_no:"NEW-DUMMY-PAID-987654321",checkout_at:clock.toISOString()};
  await Promise.all([receiver.apply(item),receiver.apply(item)]);
  assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,37);
  assert.equal(await receiver.receipt(item),true);
  await assert.rejects(receiver.apply({...item,points:38}),{code:"already-exists"});
  await assert.rejects(receiver.apply({...item,bill_no:"B261021015307"}),{code:"permission-denied"});
  await db.collection("posAwardMonths").doc("2026-10").update({state:"closed"});
  assert.equal(await receiver.receipt(item),true);
  await assert.rejects(receiver.apply({...item,bill_id:987654322}),{code:"failed-precondition"});
  assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,37);
});
test("Render HTTP custom login to real Auth/Firestore emulators, duplicate grant and revoked staff",async()=>{
  await seed();
  const {createHandler}=require("../render-http"),http=require("node:http");
  const realService=buildService({db,auth:admin.auth(),FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:"1234567890",ownerUid:A,sandboxOnly:true,now:()=>clock,verifyLine:async()=>({...valid,sub:S})});
  const origin="https://g2-member-test-api.onrender.com";
  const server=http.createServer(createHandler({service:realService,auth:admin.auth(),origin}));
  await new Promise(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+server.address().port;
  const post=(name,data,token)=>fetch(url+"/api/"+name,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(data)});
  try{
    const login=await post("memberLineLogin",{idToken:"a".repeat(30)});assert.equal(login.status,200);
    const customToken=(await login.json()).data.customToken;
    const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:customToken,returnSecureToken:true})});
    assert.equal(response.status,200);const token=(await response.json()).idToken;
    const data={requestId,monthId:"2026-10",userId:U,points:2};
    assert.equal((await post("memberAddPoints",data,token)).status,403);
    await db.collection("sandboxMembers").doc(U).set({dummyOnly:true,enabled:true});
    const first=await post("memberAddPoints",data,token);assert.equal(first.status,200);
    assert.equal((await (await post("memberAddPoints",data,token)).json()).data.duplicate,true);
    assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,2);
    await db.collection("memberStaffAccess").doc(S).update({enabled:false});
    assert.equal((await post("memberAddPoints",{...data,requestId:"22345678-1234-1234-1234-123456789012"},token)).status,403);
  }finally{await new Promise(r=>server.close(r));}
});
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
  await db.collection("monthlyRewards").doc(rewardId).set({userId:U,monthKey:"2026-10",type:"discount10",status:"available"});
  await assert.rejects(service.redeem(S,{rewardId,billRef:"TEST-BILL-1"}),{code:"failed-precondition"});
  clock=new Date("2026-11-01T00:00:00Z");
  assert.equal((await service.redeem(S,{rewardId,billRef:"TEST-BILL-1"})).duplicate,false);
  assert.equal((await service.redeem(S,{rewardId,billRef:"TEST-BILL-1"})).duplicate,true);
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
test("release scenarios: Top3, resumed close, rewards and encrypted restore",async()=>{
  await seed();const {randomUUID}=require("node:crypto"),runId=randomUUID(),root=db.collection("releaseRehearsals").doc(runId);
  const scoped={collection:n=>root.collection(n),runTransaction:fn=>db.runTransaction(fn)};
  const result=await require("../release-scenarios").releaseScenarios({db:scoped,root,physicalDb:db,FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,Timestamp:admin.firestore.Timestamp,GeoPoint:admin.firestore.GeoPoint,runId});
  assert.equal(result.checks.length,9);assert.equal(result.backupSha256,result.restoreSha256);
});
test("rules deny reward forgery, consumed reward changes, deletions and private receipts",async()=>{
  await seed();const client=env.authenticatedContext(U,{role:"admin"}).firestore(),staff=env.authenticatedContext(S).firestore();
  await db.collection("monthlyRewards").doc("own").set({userId:U,status:"used"});
  await assertSucceeds(getDoc(doc(client,"monthlyRewards","own")));
  for(const path of ["monthlyRewards/own","rewardRedemptions/own","rewardBillClaims/own","memberAudit/own","sandboxMembers/own","posPointAwards/own","memberStaffAccess/"+U]){
    await assertFails(setDoc(doc(client,path),{userId:U,status:"available",role:"admin",enabled:true}));
    await assertFails(setDoc(doc(staff,path),{userId:U,status:"available",role:"admin",enabled:true}));
  }
  await assertFails(getDoc(doc(client,"users",OTHER)));
  await db.collection("users").doc(S).update({isActive:false});
  await assertFails(getDoc(doc(staff,"users",U)));
});

test("rules reject create-update-delete bypasses for every client role and private collection",async()=>{
 await seed();
 const {deleteDoc}=require("firebase/firestore");
 const clients=[env.unauthenticatedContext().firestore(),env.authenticatedContext(U,{role:"admin"}).firestore(),env.authenticatedContext(S).firestore(),env.authenticatedContext(A).firestore()];
 const paths=["users/"+U,"memberStaffAccess/"+S,"monthlyRewards/protected","pointTransactions/protected","seasonResults/2026-09","publicLeaderboard/protected","rewardRedemptions/protected","rewardBillClaims/protected","migrationRuns/protected","testOwnerApprovals/protected","releaseRehearsals/protected"];
 for(const path of paths)await db.doc(path).set({userId:U,role:"member",monthlyPoints:7,status:"used"});
 for(const client of clients){
  for(const path of paths){
   await assertFails(updateDoc(doc(client,path),{role:"admin",monthlyPoints:999,status:"available"}));
   await assertFails(deleteDoc(doc(client,path)));
  }
  await assertFails(setDoc(doc(client,"users","new-client-created"),{role:"member",monthlyPoints:0,isActive:true}));
 }
 const member=clients[1];
 for(const path of ["rewardRedemptions/protected","rewardBillClaims/protected","migrationRuns/protected","testOwnerApprovals/protected","releaseRehearsals/protected"])await assertFails(getDoc(doc(member,path)));
});

test("monthly history rules allow own paged month and archive only; deny other and inactive members",async()=>{
 await seed();
 const {limit,startAfter}=require("firebase/firestore");
 await db.collection("pointTransactions").doc("own-old").set({userId:U,monthId:"2026-09",points:7});
 await db.collection("pointTransactions").doc("own-new").set({userId:U,monthId:"2026-10",points:2});
 await db.collection("pointTransactions").doc("other-old").set({userId:OTHER,monthId:"2026-09",points:99});
 await db.doc("seasonResults/2026-09/members/"+U).set({points:17,userId:U});
 await db.doc("seasonResults/2026-09/members/"+OTHER).set({points:99,userId:OTHER});
 const client=env.authenticatedContext(U).firestore();
 const own=query(collection(client,"pointTransactions"),where("userId","==",U),where("monthId","==","2026-09"),limit(50));
 await db.collection("pointTransactions").doc("legacy").set({userId:U,points:4,createdAt:admin.firestore.Timestamp.fromDate(new Date("2026-09-01T00:00:00Z"))});
 const legacy=query(collection(client,"pointTransactions"),where("userId","==",U),where("createdAt",">=",new Date("2026-08-31T17:00:00Z")),where("createdAt","<",new Date("2026-09-30T17:00:00Z")),require("firebase/firestore").orderBy("createdAt","desc"),limit(50));
 assert.equal((await assertSucceeds(getDocs(legacy))).size,1);
 const rows=await assertSucceeds(getDocs(own));assert.equal(rows.size,1);assert.equal(rows.docs[0].data().points,7);
 assert.equal((await assertSucceeds(getDocs(query(own,startAfter(rows.docs[0]))))).size,0);
 assert.equal((await assertSucceeds(getDoc(doc(client,"seasonResults/2026-09/members/"+U)))).data().points,17);
 await assertSucceeds(getDoc(doc(client,"seasonResults/2026-08/members/"+U)));
 await assertFails(getDoc(doc(client,"seasonResults/2026-09/members/"+OTHER)));
 await assertFails(getDocs(query(collection(client,"pointTransactions"),where("monthId","==","2026-09"))));
 await assertFails(getDocs(query(collection(client,"pointTransactions"),where("userId","==",OTHER),where("monthId","==","2026-09"))));
 await db.collection("users").doc(U).update({isActive:false});
 await assertFails(getDocs(own));await assertFails(getDoc(doc(client,"seasonResults/2026-09/members/"+U)));
});

test("club board reads every page, matches month-close tie break, excludes staff/inactive and redacts identity",async()=>{
 await seed();
 const batch=db.batch();
 for(let i=0;i<205;i++)batch.set(db.collection("users").doc("U"+i.toString(16).padStart(32,"0")),{role:"member",isActive:true,nickname:"Member "+i,monthlyPoints:1,pointsMonth:"2026-10",createdAt:admin.firestore.Timestamp.fromMillis(100+i)});
 await batch.commit();
 await db.collection("users").doc(U).update({monthlyPoints:24,createdAt:admin.firestore.Timestamp.fromMillis(2000),phone:"PRIVATE",pictureUrl:"https://profile.line-scdn.net/safe.png"});
 await db.collection("users").doc(OTHER).update({monthlyPoints:24,createdAt:admin.firestore.Timestamp.fromMillis(1000),pictureUrl:"javascript:alert(1)"});
 await db.collection("users").doc(S).update({monthlyPoints:999});
 await db.collection("users").doc("inactive").set({role:"member",isActive:false,monthlyPoints:999,pointsMonth:"2026-10"});
 const before=(await db.collection("users").doc(U).get()).data();
 const result=await service.clubData(U,{view:"board",month:"2026-10"});
 assert.equal(result.rows.length,207);assert.equal(result.total,207);
 assert.equal(result.me.rank,2);assert.equal(result.before.points,24);assert.equal(result.tieCount,2);
 assert.equal(result.rows[0].pictureUrl,"");assert.equal(result.me.pictureUrl,"https://profile.line-scdn.net/safe.png");
 for(const row of result.rows)assert.deepEqual(Object.keys(row).sort(),["nickname","own","pictureUrl","points","rank"]);
 assert.equal(JSON.stringify(result).includes(U),false);assert.equal(JSON.stringify(result).includes("PRIVATE"),false);
 assert.deepEqual((await db.collection("users").doc(U).get()).data(),before);
 assert.equal((await db.collection("pointTransactions").get()).size,0);
 await assert.rejects(service.clubData(null,{view:"board",month:"2026-10"}),{code:"unauthenticated"});
 await db.collection("users").doc(U).update({isActive:false});
 await assert.rejects(service.clubData(U,{view:"board",month:"2026-10"}),{code:"permission-denied"});
});
test("club historical full ranking and Top3-only archives never invent an own rank",async()=>{
 await seed();
 await db.collection("posAwardMonths").doc("2026-09").set({state:"closed"});
 await db.doc("seasonResults/2026-09/members/"+U).set({points:10,eligible:true,nickname:"Me",joinedAtMillis:2});
 await db.doc("seasonResults/2026-09/members/"+OTHER).set({points:12,eligible:true,nickname:"Other",joinedAtMillis:1});
 const old=await service.clubData(U,{view:"board",month:"2026-09"});
 assert.equal(old.archived,true);assert.equal(old.me.rank,2);assert.equal(old.before.points,12);assert.equal(old.total,2);
 await db.doc("seasonResults/2026-08").set({top3:[{rank:1,nickname:"Legacy",points:50}]});
 const legacy=await service.clubData(U,{view:"board",month:"2026-08"});
 assert.equal(legacy.complete,false);assert.equal(legacy.me,null);assert.equal(legacy.total,null);assert.equal(legacy.rows.length,1);
 await db.collection("posAwardMonths").doc("2026-09").update({state:"closing"});
 await assert.rejects(service.clubData(U,{view:"board",month:"2026-09"}),{code:"failed-precondition"});
 await assert.rejects(service.clubData(U,{view:"board",month:"2026-11"}),{code:"invalid-argument"});
});
test("club stats are scoped to caller, count unique bills, include legacy/undated and never mutate",async()=>{
 await seed();
 const rows=[
  {userId:U,points:4,billId:1,monthId:"2026-10"},
  {userId:U,points:2,billId:1,monthId:"2026-10"},
  {userId:U,points:3,billId:2,createdAt:admin.firestore.Timestamp.fromDate(new Date("2026-08-31T17:00:00Z"))},
  {userId:U,points:-1},
  {userId:OTHER,points:900,billId:3,monthId:"2026-09"}
 ];
 for(let i=0;i<rows.length;i++)await db.collection("pointTransactions").doc("tx"+i).set(rows[i]);
 const result=await service.clubData(U,{view:"stats",userId:OTHER});
 assert.equal(result.points,8);assert.equal(result.count,4);assert.equal(result.billCount,2);assert.equal(result.undated,1);
 assert.deepEqual(result.months.map(m=>[m.month,m.points,m.billCount]),[["2026-10",6,1],["2026-09",3,1],["",-1,0]]);
 assert.equal((await db.collection("pointTransactions").get()).size,5);
 assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,0);
 const forged=OTHER;await db.collection("users").doc(forged).update({role:"admin"});
 await assert.rejects(service.clubData(forged,{view:"stats"}),{code:"permission-denied"});
});
test("club read rechecks revoked membership before returning data",async()=>{
 await seed();const {clubData}=require("../club-read");let calls=0;
 await assert.rejects(clubData({db,FieldPath:admin.firestore.FieldPath,now:()=>clock,identity:async(uid,roles)=>{
  calls++;if(calls===2)await db.collection("users").doc(U).update({isActive:false});
  return service.identity(uid,roles);
 }},U,{view:"board",month:"2026-10"}),{code:"permission-denied"});
 assert.equal(calls,2);
});
