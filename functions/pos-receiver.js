"use strict";
const {createHmac,timingSafeEqual,createHash}=require("node:crypto");
const {monthAt}=require("./service");
function fail(code,message){throw Object.assign(Error(message),{code});}
function verifySignature({key,path,body,timestamp,signature,now=Date.now()}){
  if(typeof key!=="string"||key.length<40||!/^\d{10}$/.test(timestamp||"")||Math.abs(now-Number(timestamp)*1000)>60000||! /^[a-f0-9]{64}$/.test(signature||""))return false;
  const expected=createHmac("sha256",key).update(timestamp+"\n"+path+"\n"+body).digest("hex");
  return timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
function buildPosReceiver({db,FieldValue,now=()=>new Date()}){
  const stamp=()=>FieldValue.serverTimestamp();
  function identity(i){
    if(!i||!Number.isSafeInteger(i.bill_id)||i.bill_id<=0||!/^U[a-f0-9]{32}$/i.test(i.line_user_id||"")||!/^\d{4}-(0[1-9]|1[0-2])$/.test(i.month_id||"")||!Number.isSafeInteger(i.points)||i.points<=0||i.points>504||!Number.isSafeInteger(i.eligible_hours)||i.eligible_hours<1||i.eligible_hours>168)fail("invalid-argument","Invalid trusted award identity");
    if(typeof i.bill_no!=="string"||!i.bill_no||i.bill_no.length>100||i.bill_no==="B261021015307")fail("permission-denied","Excluded or invalid bill");
    return "pos_"+i.bill_id+"_"+i.line_user_id;
  }
  function matches(p,i){return p.billId===i.bill_id&&p.userId===i.line_user_id&&p.monthId===i.month_id&&p.points===i.points&&p.eligibleHours===i.eligible_hours;}
  async function member(uid){
    if(!/^U[a-f0-9]{32}$/i.test(uid||""))fail("invalid-argument","Invalid member");
    const [a,u]=await Promise.all([db.collection("sandboxMembers").doc(uid).get(),db.collection("users").doc(uid).get()]);
    if(!a.exists||a.data().dummyOnly!==true||a.data().enabled!==true||!u.exists||u.data().role!=="member"||u.data().isActive!==true)return null;
    return {userId:uid,role:"member",isActive:true,nickname:String(u.data().nickname||"").slice(0,60),memberId:String(u.data().memberId||"").slice(0,64),monthlyPoints:u.data().monthlyPoints||0,lifetimeHours:u.data().lifetimeHours||0,pointsMonth:u.data().pointsMonth||""};
  }
  async function month(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||""))fail("invalid-argument","Invalid month");const s=await db.collection("posAwardMonths").doc(month).get();return s.exists?s.data().state:null;}
  async function receipt(i){const key=identity(i),s=await db.collection("posPointAwards").doc(key).get();if(!s.exists)return false;if(!matches(s.data(),i))fail("already-exists","Conflicting paid award");return true;}
  async function apply(i){
    const key=identity(i),paid=new Date(i.checkout_at);
    if(typeof i.checkout_at!=="string"||!/(Z|[+-]\d\d:\d\d)$/.test(i.checkout_at)||!Number.isFinite(paid.getTime())||paid>now()||monthAt(paid)!==i.month_id||monthAt(now())!==i.month_id)fail("failed-precondition","Checkout month is locked or invalid");
    return db.runTransaction(async tx=>{
      const gate=db.collection("posAwardMonths").doc(i.month_id),ledger=db.collection("posPointAwards").doc(key),user=db.collection("users").doc(i.line_user_id),history=db.collection("pointTransactions").doc(key),dummy=db.collection("sandboxMembers").doc(i.line_user_id);
      const [g,r,u,h,d]=await Promise.all([tx.get(gate),tx.get(ledger),tx.get(user),tx.get(history),tx.get(dummy)]);
      if(!g.exists||g.data().state!=="open")fail("failed-precondition","Award month closed");
      if(!d.exists||d.data().dummyOnly!==true||d.data().enabled!==true)fail("permission-denied","Approved dummy member required");
      if(r.exists){if(!matches(r.data(),i))fail("already-exists","Conflicting paid award");return false;}
      if(h.exists)fail("failed-precondition","Orphaned history");
      if(!u.exists||u.data().role!=="member"||u.data().isActive!==true)fail("permission-denied","Active member required");
      const p=u.data(),points=p.pointsMonth===i.month_id?(p.monthlyPoints??0):0,hours=p.lifetimeHours??0;
      if((p.pointsMonth!==i.month_id&&(p.monthlyPoints??0)!==0)||!Number.isFinite(points)||points<0||!Number.isFinite(hours)||hours<0)fail("failed-precondition","Balance requires migration");
      tx.update(user,{monthlyPoints:points+i.points,pointsMonth:i.month_id,lifetimeHours:hours+i.eligible_hours,updatedAt:stamp()});
      tx.set(db.collection("publicLeaderboard").doc(createHash("sha256").update(i.line_user_id).digest("hex")),{nickname:String(p.nickname||"").slice(0,60),points:points+i.points,monthId:i.month_id});
      tx.create(history,{userId:i.line_user_id,memberId:p.memberId||"",staffId:"pos-auto",points:i.points,eligibleHours:i.eligible_hours,type:"add",source:"pos",billId:i.bill_id,monthId:i.month_id,createdAt:stamp(),timestamp:stamp()});
      tx.create(ledger,{billId:i.bill_id,userId:i.line_user_id,monthId:i.month_id,points:i.points,eligibleHours:i.eligible_hours,createdAt:stamp()});return true;
    });
  }
  return {member,month,receipt,apply};
}
module.exports={verifySignature,buildPosReceiver};
