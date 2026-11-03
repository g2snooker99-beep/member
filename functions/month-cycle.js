"use strict";
const {monthAt}=require("./service");
function monthsAt(date){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw Error("Invalid rollover clock");
 const current=monthAt(date),[year,month]=current.split("-").map(Number);
 return {current,previous:new Date(Date.UTC(year,month-2,15)).toISOString().slice(0,7)};
}
function fail(message){throw Object.assign(Error(message),{code:"failed-precondition"});}
async function runMonthCycle({db,service,ownerUid,enabled,now=()=>new Date()}){
 if(enabled!=="true")return {state:"disabled"};
 const {current,previous}=monthsAt(now());
 await service.identity(ownerUid,["admin"]);
 const gates=db.collection("posAwardMonths"),oldRef=gates.doc(previous),nextRef=gates.doc(current);
 const [old,next]=await Promise.all([oldRef.get(),nextRef.get()]);
 if(!old.exists||!["open","closing","closed"].includes(old.data().state))fail("Previous award month requires review");
 if(next.exists&&next.data().state!=="open")fail("Current award month is locked; automatic reopen refused");
 // Reuse the existing snapshot/reward transaction flow; a failed close never opens a new month.
 if(old.data().state!=="closed")await service.closeMonth(ownerUid,previous);
 const [closed,archive]=await Promise.all([oldRef.get(),db.collection("seasonResults").doc(previous).get()]);
 if(!closed.exists||closed.data().state!=="closed"||!archive.exists||archive.data().monthId!==previous)fail("Completed previous archive required before opening month");
 if(monthsAt(now()).current!==current)fail("Bangkok month changed during rollover; retry with current clock");
 await service.identity(ownerUid,["admin"]);
 // Repeated hourly checks perform no writes after the month is already open.
 if(next.exists)return {state:"ready",month:current,previous};
 await service.openMonth(ownerUid,current);
 return {state:"opened",month:current,previous};
}
module.exports={monthsAt,runMonthCycle};
