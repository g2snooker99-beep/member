"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {randomBytes}=require("node:crypto");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {buildRewards,rewardInput}=require("../rewards-v2");

test("quota and per-member limits must be positive integers and consistent",()=>{
 const config={name:"น้ำดื่ม",pool:"monthly",cost:5,quota:10,perMember:1,active:true};
 assert.equal(rewardInput(config).cost,5);
 assert.throws(()=>rewardInput({...config,perMember:11}),{code:"invalid-argument"});
 assert.throws(()=>rewardInput({...config,cost:"5"}),{code:"invalid-argument"});
});

test("last monthly reward is atomic and cannot debit another wallet or replay",{
 skip:!/^((localhost|127[.]0[.]0[.]1):[0-9]+)$/.test(process.env.FIRESTORE_EMULATOR_HOST||"")
},async()=>{
 const key=()=>randomBytes(16).toString("hex");
 const owner="U"+key(),staff="U"+key(),a="U"+key(),b="U"+key();
 const app=initializeApp({projectId:"demo-g2-member"},key());
 const db=getFirestore(app);
 let date=new Date("2026-11-30T16:56:00Z");
 const roles={[owner]:"admin",[staff]:"staff",[a]:"member",[b]:"member"};
 const api=buildRewards({db,FieldValue,now:()=>date,identity:async(uid,allowed,tx)=>{
  if(!allowed.includes(roles[uid]))throw Object.assign(Error("denied"),{code:"permission-denied"});
  const ref=db.collection("users").doc(uid);return tx?tx.get(ref):ref.get();
 }});
 const w=(uid,k)=>db.collection("rewardWallets").doc(uid+"_"+k);
 const config={name:"น้ำ",pool:"monthly",cost:5,quota:1,perMember:1,active:true};
 try{
  await Promise.all([a,b].flatMap(uid=>[db.collection("users").doc(uid).set({nickname:"ทดสอบ"}),w(uid,"2026-11").set({balance:5}),w(uid,"carry").set({balance:10})]));
  await assert.rejects(api.save(staff,config),{code:"permission-denied"});
  const {id}=await api.save(owner,config);
  const [one,two]=await Promise.all([a,b].map(uid=>api.issue(uid,{rewardId:id})));
  await assert.rejects(api.redeem(a,{token:one.token,confirm:true}),{code:"permission-denied"});
  assert.equal((await api.redeem(staff,{token:one.token})).confirmed,false);
  const results=await Promise.allSettled([one,two].map(t=>api.redeem(staff,{token:t.token,confirm:true})));
  const index=results.findIndex(r=>r.status==="fulfilled");
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.match(results[1-index].reason.message,/สิทธิ์เดือนนี้เต็ม/);
  assert.equal((await api.redeem(staff,{token:[one,two][index].token,confirm:true})).alreadyUsed,true);
  const balances=await Promise.all([a,b].map(async uid=>[(await w(uid,"2026-11").get()).data().balance,(await w(uid,"carry").get()).data().balance]));
  assert.deepEqual(balances[index],[0,10]);assert.deepEqual(balances[1-index],[5,10]);
  date=new Date("2026-11-30T17:00:00Z");
  await assert.rejects(api.redeem(staff,{token:[one,two][1-index].token,confirm:true}),/QR หมดอายุ/);
  const newMonth=await api.list(a,{});
  assert.deepEqual(newMonth.balances,{monthly:0,carry:10});
  assert.equal(newMonth.rewards.find(r=>r.id===id).remaining,1);
 }finally{await deleteApp(app);}
});
