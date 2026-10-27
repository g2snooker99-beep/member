"use strict";
// Read-only member club projections. No points, permissions or reward writes.
const {monthAt}=require("./service");
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
function fail(code,message){throw Object.assign(Error(message),{code});}
function photo(value){
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&u.port===""&&(u.hostname==="line-scdn.net"||u.hostname.endsWith(".line-scdn.net"))&&u.href.length<=2048?u.href:"";}catch{return "";}
}
async function readPages(source,FieldPath,visit){
 let cursor=null,total=0;
 for(;;){
  let q=source.orderBy(FieldPath.documentId()).limit(200);if(cursor)q=q.startAfter(cursor);
  const page=await q.get();if(page.empty)return;
  total+=page.size;if(total>20000)fail("failed-precondition","History is too large; please contact the club");
  page.docs.forEach(visit);cursor=page.docs.at(-1);
 }
}
function txMonth(tx){
 if(MONTH.test(tx.monthId||""))return tx.monthId;
 if(MONTH.test(tx.monthKey||""))return tx.monthKey;
 const d=tx.createdAt?.toDate?.();return d&&Number.isFinite(d.getTime())?monthAt(d):"";
}
async function clubData({db,FieldPath,identity,now},uid,d){
 await identity(uid,["member","staff","admin"]);
 if(d.view==="stats"){
  // Always scoped to authenticated uid; caller-supplied user IDs are ignored.
  let points=0,count=0,undated=0;const bills=new Set(),months=new Map();
  await readPages(db.collection("pointTransactions").where("userId","==",uid),FieldPath,row=>{
   const tx=row.data();if(!Number.isSafeInteger(tx.points))fail("failed-precondition","Invalid history points");
   points+=tx.points;count++;if(!Number.isSafeInteger(points))fail("failed-precondition","Invalid history total");
   const month=txMonth(tx);if(!month)undated++;
   if(tx.billId!==undefined&&tx.billId!==null&&String(tx.billId)!=="")bills.add(String(tx.billId));
   const group=months.get(month)||{month,points:0,count:0,bills:new Set()};
   group.points+=tx.points;group.count++;
   if(tx.billId!==undefined&&tx.billId!==null&&String(tx.billId)!=="")group.bills.add(String(tx.billId));
   months.set(month,group);
  });
  await identity(uid,["member","staff","admin"]);
  return {points,count,billCount:bills.size,undated,months:[...months.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(m=>({month:m.month,points:m.points,count:m.count,billCount:m.bills.size})),basis:"recorded-transactions"};
 }
 if(d.view!=="board"||!MONTH.test(d.month||"")||d.month>monthAt(now()))fail("invalid-argument","Choose current or past Bangkok month");
 const month=d.month,current=monthAt(now()),gate=db.collection("posAwardMonths").doc(month);
 const [g,result]=await Promise.all([gate.get(),db.collection("seasonResults").doc(month).get()]);
 const state=g.exists?g.data().state:"unopened";
 if(state==="closing")fail("failed-precondition","Month close is in progress; try again shortly");
 const archived=state==="closed"||month<current;
 const source=archived?db.collection("seasonResults").doc(month).collection("members"):db.collection("users");
 const entries=[];
 await readPages(source,FieldPath,row=>{
  const p=row.data();
  if(archived?p.eligible!==true:p.role!=="member"||p.isActive!==true)return;
  const points=archived?p.points:p.pointsMonth===month?p.monthlyPoints:0;
  if(!Number.isSafeInteger(points)||points<0)fail("failed-precondition","Invalid member balance");
  if(!archived&&!p.pointsMonth&&p.monthlyPoints>0)fail("failed-precondition","Legacy balance needs migration");
  entries.push({uid:row.id,nickname:String(p.nickname||"สมาชิก").slice(0,60),points,pictureUrl:photo(p.pictureUrl),joinedAtMillis:archived?p.joinedAtMillis||0:p.createdAt?.toMillis?.()||0});
 });
 // Same tie break as rankMember / month close. Tie points are still explicitly identified.
 entries.sort((a,b)=>b.points-a.points||a.joinedAtMillis-b.joinedAtMillis||a.uid.localeCompare(b.uid,"en"));
 await identity(uid,["member","staff","admin"]);
 const after=await gate.get();if((after.exists?after.data().state:"unopened")!==state)fail("failed-precondition","Month state changed; refresh");
 const rows=entries.map((p,i)=>({rank:i+1,nickname:p.nickname,points:p.points,pictureUrl:p.pictureUrl,own:p.uid===uid}));
 const me=rows.find(p=>p.own)||null;
 // Old archives may retain only Top3; never pretend those are a full ranking.
 if(archived&&!entries.length){
  const top3=(result.exists&&Array.isArray(result.data().top3)?result.data().top3:[]).slice(0,3).map((p,i)=>({rank:Number.isSafeInteger(p.rank)?p.rank:i+1,nickname:String(p.nickname||"สมาชิก").slice(0,60),points:Number.isSafeInteger(p.points)?p.points:0,pictureUrl:"",own:false}));
  return {month,archived:true,complete:false,total:null,me:null,rows:top3,before:null,after:null,tieCount:0};
 }
 return {month,archived,complete:true,total:rows.length,rows,me,
  before:me&&me.rank>1?rows[me.rank-2]:null,after:me&&me.rank<rows.length?rows[me.rank]:null,
  tieCount:me?rows.filter(p=>p.points===me.points).length:0};
}
module.exports={clubData,photo,txMonth};
