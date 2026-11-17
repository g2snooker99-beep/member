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
function rewardImage(value){
 if(value==="")return "";
 if(typeof value!=="string"||value.length>32791||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value))bad("รูปสินค้าไม่ถูกต้องหรือใหญ่เกินไป");
 const encoded=value.slice(23),bytes=Buffer.from(encoded,"base64");
 if(bytes.length<10||bytes.length>24576||bytes.toString("base64")!==encoded||
 bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9)bad("รูปสินค้าไม่ถูกต้องหรือใหญ่เกินไป");
 return value;
}
function rewardInput(d){
 const name=typeof d.name==="string"?d.name.trim():"";
 if(!name||name.length>80||!pools.includes(d.pool)||!within(d.cost,1,100000)||!within(d.quota,1,100000)||
 !within(d.perMember,1,d.quota)||typeof d.active!=="boolean")bad("ตรวจชื่อรางวัล แต้ม โควตา และสิทธิ์ต่อคน");
 const productId=d.productId??0,inventoryQty=d.inventoryQty??0;
 if(!within(productId,0,2147483647)||(productId?!within(inventoryQty,1,100):inventoryQty!==0))bad("ตรวจสินค้าและจำนวนตัดสต๊อก");
 return {name,pool:d.pool,cost:d.cost,quota:d.quota,perMember:d.perMember,active:d.active,productId,inventoryQty,...(d.image===undefined?{}:{image:rewardImage(d.image)})};
}
function buildRewards({db,FieldValue,identity,now,inventory}){
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
  const sort=(a,b)=>a.cost-b.cost||a.name.localeCompare(b.name,"th");
  if(manage){
   const [rows,products]=await Promise.all([catalog.limit(201).get(),inventory?inventory.catalog():[]]);
   if(rows.size>200)fail("failed-precondition","รายการรางวัลเกินขีดจำกัด");
   const rewards=rows.docs.map(row=>{
    const r=row.data();
    return {id:row.id,name:r.name,pool:r.pool,cost:r.cost,quota:r.quota,perMember:r.perMember,active:r.active,
      productId:r.productId||0,inventoryQty:r.inventoryQty||0,image:r.image||""};
   });
   return {month,products,rewards:rewards.sort(sort)};
  }
  const q=catalog.where("active","==",true);
  const [rows,m,c]=await Promise.all([q.limit(201).get(),wallet(uid,"monthly",month).get(),wallet(uid,"carry",month).get()]);
  if(rows.size>200)fail("failed-precondition","รายการรางวัลเกินขีดจำกัด");
  const balances={monthly:count(m,"balance"),carry:count(c,"balance")};
  const rewards=await Promise.all(rows.docs.map(async row=>{
   const r=row.data();
   const [a,b]=await Promise.all([stock(row.id,month).get(),limit(row.id,month,uid).get()]);
   return {...present(r,row.id,count(a,"used"),count(b,"used"),balances[r.pool]),active:r.active,image:r.image||""};
  }));
  return {month,balances,products:[],rewards:rewards.sort(sort)};
 }
 async function save(uid,d){
  const r=rewardInput(d),id=d.rewardId?idOf(d):randomBytes(16).toString("hex"),ref=catalog.doc(id);
  if(r.productId){
   await identity(uid,["admin"]);
   if(!inventory||(await inventory.catalog()).every(p=>p.id!==r.productId))bad("ไม่พบสินค้าในสต๊อก POS");
  }
  return db.runTransaction(async tx=>{
   await identity(uid,["admin"],tx);
   const old=await tx.get(ref);
   if(d.rewardId&&!old.exists)bad("ไม่พบรางวัล");
   const revision=count(old,"revision")+1;
   tx.set(ref,{...r,image:r.image??data(old).image??"",revision,updatedAt:stamp(),updatedBy:uid});
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
   const [a,b,w]=await tx.getAll(stock(id,month),limit(id,month,uid),wallet(uid,r.pool,month));
   const balance=count(w,"balance");
   check(r,count(a,"used"),count(b,"used"),balance);
   tx.create(ticket(token),{uid,rewardId:id,month,expiresAtMs,revision:r.revision,pool:r.pool,cost:r.cost,name:r.name,productId:r.productId||0,inventoryQty:r.inventoryQty||0,status:"pending",createdAt:stamp()});
   return {token,expiresAtMs,cost:r.cost,name:r.name,pool:r.pool,remaining:balance-r.cost};
  });
 }
 async function applyTicket(uid,token,confirm,reservation){
  const ref=ticket(token);
  return db.runTransaction(async tx=>{
   await identity(uid,["staff","admin"],tx);
   const t=data(await tx.get(ref));
   if(t.status==="used")return {name:t.name,cost:t.cost,alreadyUsed:true};
   if(t.status!=="pending"||t.month!==monthAt(now())||time()>=t.expiresAtMs)fail("failed-precondition","QR หมดอายุ กรุณาให้สมาชิกเปิดใหม่");
   const member=await identity(t.uid,["member"],tx);
   const r=data(await tx.get(catalog.doc(t.rewardId)));
   if(r.revision!==t.revision||r.pool!==t.pool||r.cost!==t.cost)fail("failed-precondition","รางวัลมีการเปลี่ยนแปลง กรุณาเปิด QR ใหม่");
   const a=stock(t.rewardId,t.month),b=limit(t.rewardId,t.month,t.uid),w=wallet(t.uid,t.pool,t.month);
   const [sa,sb,sw]=await tx.getAll(a,b,w);
   const used=count(sa,"used"),personal=count(sb,"used"),balance=count(sw,"balance");
   check(r,used,personal,balance);
   if(confirm){
    if(t.productId&&(reservation?.productId!==t.productId||reservation?.inventoryQty!==t.inventoryQty))fail("failed-precondition","ยังไม่ได้ตัดสต๊อกสินค้า");
    tx.update(w,{balance:balance-t.cost,updatedAt:stamp()});
    tx.set(a,{used:used+1,updatedAt:stamp()});
    tx.set(b,{used:personal+1,updatedAt:stamp()});
    tx.update(ref,{status:"used",usedBy:uid,usedAt:stamp()});
   }
   return {name:t.name,cost:t.cost,pool:t.pool,memberName:String(member.data().nickname||"").slice(0,60),remaining:balance-t.cost,confirmed:confirm,productId:t.productId||0,inventoryQty:t.inventoryQty||0};
  });
 }
 async function redeem(uid,d){
  const token=tokenOf(d);
  if(d.confirm!==true)return applyTicket(uid,token,false);
  const preview=await applyTicket(uid,token,false);
  if(preview.alreadyUsed)return preview;
  if(!preview.productId)return applyTicket(uid,token,true);
  if(!inventory)fail("failed-precondition","ยังไม่ได้เชื่อมสต๊อก POS");
  await inventory.reserve(token,preview.productId,preview.inventoryQty);
  try{
   const done=await applyTicket(uid,token,true,preview);
   await inventory.sync(token).catch(()=>{}); // stock already deducted; mark POS receipt if reachable
   return done;
  }catch(e){
   // A connection failure can hide a successful Firebase commit. Never restore
   // stock until the ticket has an explicit terminal state.
   if(["failed-precondition","permission-denied","unauthenticated"].includes(e.code)){
    await db.runTransaction(async tx=>{
     const ref=ticket(token),t=data(await tx.get(ref));
     if(t.status==="pending")tx.update(ref,{status:"cancelled",cancelledAt:stamp()});
    }).catch(()=>{});
    await inventory.sync(token).catch(()=>{});
   }
   throw e;
  }
 }
 return {list,save,issue,redeem};
}
module.exports={buildRewards,rewardInput};
