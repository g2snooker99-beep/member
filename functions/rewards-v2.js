"use strict";
const {randomBytes}=require("node:crypto");
const {monthAt}=require("./service");
const ID=/^[a-f0-9]{32}$/;
const TOKEN=/^[a-f0-9]{48}$/;
const pools=["monthly","carry"];
function fail(code,message){throw Object.assign(Error(message),{code});}
function bad(message){fail("invalid-argument",message);}
const within=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const data=s=>s.exists?s.data():{};
const count=(s,key)=>{const n=data(s)[key]??0;if(!within(n,0,Number.MAX_SAFE_INTEGER))fail("failed-precondition","ยอดข้อมูลไม่ถูกต้อง");return n;};
function rewardInput(d){
 const name=typeof d.name==="string"?d.name.trim():"";
 if(!name||name.length>80||!pools.includes(d.pool)||!within(d.cost,1,100000)||!within(d.quota,1,100000)||
 !within(d.perMember,1,d.quota)||typeof d.active!=="boolean")bad("ตรวจชื่อรางวัล แต้ม โควตา และสิทธิ์ต่อคน");
 return {name,pool:d.pool,cost:d.cost,quota:d.quota,perMember:d.perMember,active:d.active};
}
function buildRewards({db,FieldValue,identity,now}){
 const doc=(collection,key)=>db.collection(collection).doc(key);
 const catalog=db.collection("rewardCatalog");
 const wallet=(uid,pool,month)=>doc("rewardWallets",uid+"_"+(pool==="carry"?"carry":month));
 const stock=(id,month)=>doc("rewardQuota",id+"_"+month);
 const limit=(id,month,uid)=>doc("rewardMemberQuota",id+"_"+month+"_"+uid);
 const ticket=token=>doc("rewardTickets",token);
 const stamp=()=>FieldValue.serverTimestamp();
 const idOf=d=>{if(!ID.test(d.rewardId||""))bad("รหัสรางวัลไม่ถูกต้อง");return d.rewardId;};
 const tokenOf=d=>{if(!TOKEN.test(d.token||""))bad("QR ไม่ถูกต้อง");return d.token;};
 const time=()=>now().getTime();
 const present=(r,id,used,personal,balance)=>({id,name:r.name,pool:r.pool,cost:r.cost,quota:r.quota,perMember:r.perMember,
   remaining:Math.max(0,r.quota-used),personalRemaining:Math.max(0,r.perMember-personal),canRedeem:r.active&&used<r.quota&&personal<r.perMember&&balance>=r.cost});
 function check(r,used,personal,balance){
  if(!r.active)fail("failed-precondition","รางวัลนี้ปิดอยู่");
  if(used>=r.quota)fail("failed-precondition","สิทธิ์เดือนนี้เต็มแล้ว");
  if(personal>=r.perMember)fail("failed-precondition","คุณใช้สิทธิ์รางวัลนี้ครบแล้ว");
  if(balance<r.cost)fail("failed-precondition","แต้มไม่พอ");
 }
 async function list(uid,d){
  const manage=d.manage===true;
  await identity(uid,manage?["admin"]:["member"]);
  const month=monthAt(now());
  const q=manage?catalog:catalog.where("active","==",true);
  const [rows,m,c]=await Promise.all([q.limit(201).get(),wallet(uid,"monthly",month).get(),wallet(uid,"carry",month).get()]);
  if(rows.size>200)fail("failed-precondition","รายการรางวัลเกินขีดจำกัด");
  const balances={monthly:count(m,"balance"),carry:count(c,"balance")};
  const rewards=await Promise.all(rows.docs.map(async row=>{
   const r=row.data();
   const [a,b]=await Promise.all([stock(row.id,month).get(),limit(row.id,month,uid).get()]);
   return {...present(r,row.id,count(a,"used"),count(b,"used"),balances[r.pool]),active:r.active};
  }));
  return {month,balances,rewards:rewards.sort((a,b)=>a.cost-b.cost||a.name.localeCompare(b.name,"th"))};
 }
 async function save(uid,d){
  const r=rewardInput(d),id=d.rewardId?idOf(d):randomBytes(16).toString("hex"),ref=catalog.doc(id);
  return db.runTransaction(async tx=>{
   await identity(uid,["admin"],tx);
   const old=await tx.get(ref);
   if(d.rewardId&&!old.exists)bad("ไม่พบรางวัล");
   const revision=count(old,"revision")+1;
   tx.set(ref,{...r,revision,updatedAt:stamp(),updatedBy:uid});
   return {id};
  });
 }
 async function issue(uid,d){
  const id=idOf(d),token=randomBytes(24).toString("hex");
  return db.runTransaction(async tx=>{
   const date=now(),month=monthAt(date),expiresAtMs=date.getTime()+5*60*1000;
   await identity(uid,["member"],tx);
   const r=data(await tx.get(catalog.doc(id)));
   if(!pools.includes(r.pool))fail("failed-precondition","ไม่พบรางวัล");
   const [a,b,w]=await Promise.all([tx.get(stock(id,month)),tx.get(limit(id,month,uid)),tx.get(wallet(uid,r.pool,month))]);
   const balance=count(w,"balance");
   check(r,count(a,"used"),count(b,"used"),balance);
   tx.create(ticket(token),{uid,rewardId:id,month,expiresAtMs,revision:r.revision,pool:r.pool,cost:r.cost,name:r.name,status:"pending",createdAt:stamp()});
   return {token,expiresAtMs,cost:r.cost,name:r.name,pool:r.pool,remaining:balance-r.cost};
  });
 }
 async function redeem(uid,d){
  const token=tokenOf(d),ref=ticket(token),confirm=d.confirm===true;
  return db.runTransaction(async tx=>{
   await identity(uid,["staff","admin"],tx);
   const t=data(await tx.get(ref));
   if(t.status==="used")return {name:t.name,cost:t.cost,alreadyUsed:true};
   if(t.status!=="pending"||t.month!==monthAt(now())||time()>=t.expiresAtMs)fail("failed-precondition","QR หมดอายุ กรุณาให้สมาชิกเปิดใหม่");
   const member=await identity(t.uid,["member"],tx);
   const r=data(await tx.get(catalog.doc(t.rewardId)));
   if(r.revision!==t.revision||r.pool!==t.pool||r.cost!==t.cost)fail("failed-precondition","รางวัลมีการเปลี่ยนแปลง กรุณาเปิด QR ใหม่");
   const a=stock(t.rewardId,t.month),b=limit(t.rewardId,t.month,t.uid),w=wallet(t.uid,t.pool,t.month);
   const [sa,sb,sw]=await Promise.all([tx.get(a),tx.get(b),tx.get(w)]);
   const used=count(sa,"used"),personal=count(sb,"used"),balance=count(sw,"balance");
   check(r,used,personal,balance);
   if(confirm){
    tx.update(w,{balance:balance-t.cost,updatedAt:stamp()});
    tx.set(a,{used:used+1,updatedAt:stamp()});
    tx.set(b,{used:personal+1,updatedAt:stamp()});
    tx.update(ref,{status:"used",usedBy:uid,usedAt:stamp()});
   }
   return {name:t.name,cost:t.cost,pool:t.pool,memberName:String(member.data().nickname||"").slice(0,60),remaining:balance-t.cost,confirmed:confirm};
  });
 }
 return {list,save,issue,redeem};
}
module.exports={buildRewards,rewardInput};
