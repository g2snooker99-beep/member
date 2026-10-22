"use strict";
// Operator-only test-owner binding. No HTTP endpoint, token minting, or production access.
const assert=require("node:assert/strict"),{createHash}=require("node:crypto");
async function approveTestOwner({db,auth,FieldValue,env,now=()=>new Date()}){
 const uid=env.G2_TEST_OWNER_UID,run=env.G2_TEST_OWNER_APPROVAL_RUN_ID,mode=env.G2_TEST_OWNER_APPROVAL_MODE||"inspect";
 assert.equal(env.G2_FIREBASE_PROJECT_ID,"g2-member-test");assert.equal(db.projectId||db.project,"g2-member-test");
 assert.equal(env.G2_MEMBER_ENABLED,"false");assert.equal(env.G2_MEMBER_API_ORIGIN,"https://g2-member-test-api.onrender.com");
 assert.ok(!env.FIRESTORE_EMULATOR_HOST&&!env.FIREBASE_AUTH_EMULATOR_HOST);
 assert.match(uid||"",/^U[0-9a-f]{32}$/);assert.match(run||"",/^[a-f0-9-]{36}$/);
 assert.ok(["inspect","apply"].includes(mode));
 const pinned=env.MEMBER_OWNER_LINE_UID===uid;
 if(mode==="apply")assert.ok(pinned,"Pinned owner must match the approved account");
 const account=await auth.getUser(uid),last=Date.parse(account.metadata?.lastSignInTime||"");
 assert.equal(account.uid,uid);assert.equal(account.disabled,false);
 assert.ok(Number.isFinite(last)&&last<=now().getTime()+300000&&last>=now().getTime()-86400000,"Recent real browser sign-in required");
 const userRef=db.collection("users").doc(uid),aclRef=db.collection("memberStaffAccess").doc(uid),receiptRef=db.collection("testOwnerApprovals").doc(run);
 const validate=s=>{assert.ok(s.exists,"Registered test owner required");const p=s.data();assert.equal(p.userId,uid);assert.equal(p.memberId,"G2-"+uid.slice(1).toUpperCase());assert.equal(p.isActive,true);assert.ok(["member","admin"].includes(p.role));assert.ok(Number.isSafeInteger(p.monthlyPoints)&&p.monthlyPoints>=0);return p;};
 if(mode==="inspect"){
  const [s,acl]=await Promise.all([userRef.get(),aclRef.get()]),p=validate(s);
  return {state:"inspected",projectId:"g2-member-test",registered:true,recentBrowserSignIn:true,pinnedOwnerMatches:pinned,profileRole:p.role,adminReady:pinned&&p.role==="admin"&&acl.exists&&acl.data().role==="admin"&&acl.data().enabled===true,points:p.monthlyPoints,productionWrites:0};
 }
 return db.runTransaction(async tx=>{
  const [s,acl,receipt]=await Promise.all([tx.get(userRef),tx.get(aclRef),tx.get(receiptRef)]),p=validate(s);
  if(receipt.exists){
   assert.equal(receipt.data().userId,uid);assert.equal(p.role,"admin");assert.ok(acl.exists&&acl.data().role==="admin"&&acl.data().enabled===true,"Revoked owner access requires separate approval");
   return {state:"already_completed",projectId:"g2-member-test",adminReady:true,points:p.monthlyPoints,pointsWritten:0,productionWrites:0};
  }
  if(acl.exists)assert.ok(acl.data().role==="admin"&&acl.data().enabled===true,"Existing access requires separate review");
  if(p.role!=="admin")tx.update(userRef,{role:"admin",updatedAt:FieldValue.serverTimestamp()});
  if(!acl.exists)tx.create(aclRef,{role:"admin",enabled:true,userId:uid,approvedBy:"operator-test-owner",approvalId:run,updatedAt:FieldValue.serverTimestamp()});
  tx.delete(db.collection("publicLeaderboard").doc(createHash("sha256").update(uid).digest("hex")));
  tx.create(receiptRef,{userId:uid,state:"approved",projectId:"g2-member-test",memberId:p.memberId,pointsBefore:p.monthlyPoints,pointsWritten:0,approvedAt:FieldValue.serverTimestamp()});
  tx.create(db.collection("memberAudit").doc("test_owner_"+run),{actor:"operator-test-owner",target:uid,action:"approveTestOwner",role:"admin",approvalId:run,createdAt:FieldValue.serverTimestamp()});
  return {state:"approved",projectId:"g2-member-test",adminReady:true,points:p.monthlyPoints,pointsWritten:0,productionWrites:0};
 });
}
module.exports={approveTestOwner};
