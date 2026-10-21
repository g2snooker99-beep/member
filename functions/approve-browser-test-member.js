"use strict";
// Operator-only, one-shot admission of a registered browser rehearsal profile.
// Never mounted as an HTTP endpoint; never writes balances or staff access.
const assert=require("node:assert/strict");
async function approveBrowserTestMember({db,auth,FieldValue,env}){
  const uid=env.G2_TEST_BROWSER_MEMBER_UID,approvalId=env.G2_TEST_BROWSER_APPROVAL_ID;
  assert.equal(env.G2_FIREBASE_PROJECT_ID,"g2-member-test");
  assert.equal(db.projectId||db.project,"g2-member-test");
  assert.equal(env.G2_MEMBER_ENABLED,"false");
  assert.ok(!env.FIRESTORE_EMULATOR_HOST&&!env.FIREBASE_AUTH_EMULATOR_HOST);
  assert.match(uid||"",/^U[0-9a-f]{32}$/);
  assert.match(approvalId||"",/^[a-f0-9-]{36}$/);
  const account=await auth.getUser(uid);
  assert.equal(account.uid,uid);assert.equal(account.disabled,false);
  assert.ok(account.metadata?.lastSignInTime,"A real custom-token browser sign-in is required");
  const receipt=db.collection("browserTestApprovals").doc(approvalId);
  return db.runTransaction(async tx=>{
    const prior=await tx.get(receipt);
    if(prior.exists){assert.equal(prior.data().userId,uid);return {state:"already_completed",approvalId,projectId:"g2-member-test"};}
    const user=await tx.get(db.collection("users").doc(uid));
    const grant=db.collection("sandboxMembers").doc(uid),existing=await tx.get(grant);
    assert.ok(user.exists,"Registered test profile required");const p=user.data();
    assert.equal(p.userId,uid);assert.equal(p.memberId,"G2-"+uid.slice(1).toUpperCase());
    assert.equal(p.role,"member");assert.equal(p.isActive,true);
    assert.equal(p.monthlyPoints,0);assert.equal(p.lifetimeHours,0);
    assert.equal(existing.exists,false,"Existing admission must be reviewed separately");
    tx.create(grant,{dummyOnly:true,enabled:true,operatorApprovedBrowserTest:true,approvalId,approvedAt:FieldValue.serverTimestamp()});
    tx.create(receipt,{userId:uid,projectId:"g2-member-test",state:"approved",pointsWritten:0,staffAccessGranted:false,approvedAt:FieldValue.serverTimestamp()});
    return {state:"approved",approvalId,projectId:"g2-member-test",pointsWritten:0,staffAccessGranted:false};
  });
}
module.exports={approveBrowserTestMember};

