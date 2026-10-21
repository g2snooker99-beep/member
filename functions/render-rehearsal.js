"use strict";
// One explicit, restart-safe rehearsal. No public test/admin bypass endpoint.
const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {buildService,monthAt}=require("./service");
async function runRehearsal({db,auth,FieldValue,FieldPath,env,port}){
  const runId=env.G2_TEST_REHEARSAL_RUN_ID;
  assert.equal(env.G2_FIREBASE_PROJECT_ID,"g2-member-test");
  assert.equal(db.projectId||db.project,"g2-member-test");
  assert.equal(env.G2_MEMBER_ENABLED,"false");
  assert.match(runId||"",/^[a-f0-9-]{36}$/);
  assert.ok(!env.FIRESTORE_EMULATOR_HOST&&!env.FIREBASE_AUTH_EMULATOR_HOST);
  const receipt=db.collection("renderRehearsals").doc(runId);
  // Provision a different zero-balance fixture for the actual POS pipeline;
  // a completed manual rehearsal is not repeated on a later deployment.
  const posUid="U"+createHash("sha256").update(runId+"posMember").digest("hex").slice(0,32);
  await db.runTransaction(async tx=>{
    const ref=db.collection("users").doc(posUid),old=await tx.get(ref);
    if(old.exists){assert.equal(old.data().testRunId,runId);return;}
    tx.create(ref,{userId:posUid,memberId:"TEST-POS-"+posUid.slice(1),nickname:"POS DUMMY ONLY",phone:"0800000000",role:"member",isActive:true,monthlyPoints:0,lifetimeHours:0,pointsMonth:monthAt(new Date()),testRunId:runId,createdAt:FieldValue.serverTimestamp()});
    tx.create(db.collection("sandboxMembers").doc(posUid),{dummyOnly:true,enabled:true,testRunId:runId});
  });
  if((await receipt.get()).data()?.state==="passed")return {state:"passed",runId,alreadyCompleted:true};
  const stamp=()=>FieldValue.serverTimestamp(),checks=[];
  const uid=kind=>"U"+createHash("sha256").update(runId+kind).digest("hex").slice(0,32);
  const U=uid("member"),S=uid("staff"),F=uid("forged"),month=monthAt(new Date());
  const requestId=i=>{const h=createHash("sha256").update(runId+"award"+i).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
  await receipt.set({state:"running",projectId:"g2-member-test",dummyOnly:true,startedAt:stamp(),checks,memberUid:U},{merge:true});
  try{
    for(const [id,role] of [[U,"member"],[S,"staff"],[F,"admin"]])await db.runTransaction(async tx=>{
      const ref=db.collection("users").doc(id),old=await tx.get(ref);
      if(old.exists){assert.equal(old.data().testRunId,runId);return;}
      tx.create(ref,{userId:id,memberId:"TEST-"+id.slice(1),nickname:"RENDER DUMMY ONLY",phone:"0800000000",role,isActive:true,monthlyPoints:0,lifetimeHours:0,pointsMonth:month,testRunId:runId,createdAt:stamp()});
    });
    await db.collection("sandboxMembers").doc(U).set({dummyOnly:true,enabled:true,testRunId:runId});
    await db.collection("memberStaffAccess").doc(S).set({role:"staff",enabled:true,testRunId:runId});
    // An old cloud smoke test closed the current test month using a fake clock.
    // Restore ONLY a demonstrably test-created gate; never reopen normal data.
    await db.runTransaction(async tx=>{
      const gate=db.collection("posAwardMonths").doc(month),s=await tx.get(gate);
      if(s.exists&&s.data().state!=="open"){
        assert.ok(s.data().testRun||s.data().testRunId,"Refusing to reopen non-test month");
        tx.set(receipt.collection("backups").doc("monthGate"),s.data());
      }
      if(!s.exists||s.data().state!=="open")tx.set(gate,{state:"open",testRunId:runId,openedAt:stamp()});
    });
    const raw=await fetch("http://127.0.0.1:"+port+"/config.js").then(r=>r.text());
    const config=JSON.parse(raw.replace(/^window.G2_MEMBER_CONFIG=/,"").replace(/;\s*$/,""));
    assert.equal(config.firebase.projectId,"g2-member-test");
    async function signIn(id){
      const customToken=await auth.createCustomToken(id);
      const r=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key="+config.firebase.apiKey,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:customToken,returnSecureToken:true}),signal:AbortSignal.timeout(15000)});
      assert.equal(r.status,200,"Firebase custom-token sign-in failed");const data=await r.json();
      assert.equal((await auth.verifyIdToken(data.idToken,true)).uid,id);return data.idToken;
    }
    const token=await signIn(S),forgedToken=await signIn(F);
    checks.push("real_firebase_custom_token_signin");
    async function post(name,data,idToken=token){
      const r=await fetch("http://127.0.0.1:"+port+"/api/"+name,{method:"POST",headers:{Origin:env.G2_MEMBER_API_ORIGIN,"Content-Type":"application/json",Authorization:"Bearer "+idToken},body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
      return {status:r.status,body:await r.json()};
    }
    assert.equal((await post("memberOpenMonth",{month},forgedToken)).status,403);checks.push("forged_admin_denied");
    const batches=Array.from({length:13},(_,i)=>({requestId:requestId(i),monthId:month,userId:U,points:i===12?1:3}));
    for(const d of batches){const results=await Promise.all([post("memberAddPoints",d),post("memberAddPoints",d)]);for(const r of results)assert.equal(r.status,200);}
    assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,37);
    for(const d of batches)assert.equal((await post("memberAddPoints",d)).body.data.duplicate,true);
    assert.equal((await db.collection("users").doc(U).get()).data().monthlyPoints,37);
    checks.push("real_http_37_points_replayed_stays_37");
    await db.collection("memberStaffAccess").doc(S).update({enabled:false});
    assert.equal((await post("memberAddPoints",{...batches[0],requestId:requestId(99)})).status,403);checks.push("staff_revocation_immediate");
    const userToken=await signIn(U);
    const denied=await fetch("https://firestore.googleapis.com/v1/projects/g2-member-test/databases/(default)/documents/users/"+U+"?updateMask.fieldPaths=monthlyPoints",{method:"PATCH",headers:{Authorization:"Bearer "+userToken,"Content-Type":"application/json"},body:JSON.stringify({fields:{monthlyPoints:{integerValue:"999"}}})});
    assert.equal(denied.status,403);checks.push("real_rules_block_client_points");
    // Month-close rehearsal is isolated from all root balances/month gates.
    const scoped={collection:n=>db.collection("renderRehearsals").doc(runId).collection(n),runTransaction:fn=>db.runTransaction(fn)};
    const [y,m]=month.split("-").map(Number),previous=new Date(Date.UTC(y,m-2,15)).toISOString().slice(0,7),A=uid("scopedOwner");
    await scoped.collection("users").doc(A).set({role:"admin",isActive:true});
    await scoped.collection("memberStaffAccess").doc(A).set({role:"admin",enabled:true});
    const monthly=scoped.collection("users").doc(U),old=await monthly.get();
    if(!old.exists)await monthly.set({role:"member",isActive:true,nickname:"MONTH DUMMY ONLY",memberId:"TEST-MONTH",monthlyPoints:37,lifetimeHours:12,pointsMonth:previous});
    const gate=scoped.collection("posAwardMonths").doc(previous);if(!(await gate.get()).exists)await gate.set({state:"open"});
    const s=buildService({db:scoped,auth,FieldValue,FieldPath,ownerUid:A,now:()=>new Date()});
    assert.equal((await s.closeMonth(A,previous)).state,"closed");
    assert.equal((await s.closeMonth(A,previous)).duplicate,true);
    assert.equal((await monthly.get()).data().monthlyPoints,0);assert.equal((await monthly.get()).data().lifetimeHours,12);
    await assert.rejects(s.addPoints(A,{requestId:requestId(98),monthId:previous,userId:U,points:1}));
    const oldClock=buildService({db:scoped,auth,FieldValue,FieldPath,ownerUid:A,now:()=>new Date(previous+"-15T00:00:00Z")});
    await assert.rejects(oldClock.openMonth(A,previous));
    await assert.rejects(oldClock.addPoints(A,{requestId:requestId(97),monthId:previous,userId:U,points:1}));
    checks.push("real_firestore_month_close_reset_repeat_and_lock");
    const summary={state:"passed",runId,projectId:"g2-member-test",dummyOnly:true,checks,pointsAfterReplay:37,manualBatches:13,lineLoginTested:false,posCheckoutTested:false,completedAt:stamp()};
    await receipt.set(summary,{merge:true});return {...summary,completedAt:undefined};
  }catch(e){await receipt.set({state:"failed",checks,errorCode:String(e.code||e.name||"unknown").slice(0,80),failedAt:stamp()},{merge:true});throw e;}
}
module.exports={runRehearsal};
