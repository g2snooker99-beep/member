"use strict";
// Explicit, reviewable candidate policy: preserve every expired legacy document.
// No new entitlement, normalization, deletion, deduplication or score write.
const {createHash}=require("node:crypto"),{encode}=require("./data-safety");
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const digest=p=>createHash("sha256").update(JSON.stringify(encode(p))).digest("hex");
function expiredBefore(p,asOfMonth){
 if(!MONTH.test(asOfMonth||"")||!MONTH.test(p.monthKey||""))return false;
 const [y,m]=p.monthKey.split("-").map(Number);
 return new Date(Date.UTC(y,m,1)).toISOString().slice(0,7)<asOfMonth;
}
function planExpiredRewardHistory(rewards,asOfMonth){
 if(!MONTH.test(asOfMonth||""))throw Error("Explicit historical cutoff month required");
 const preserved=[],problems=[],seen=new Set();
 for(const {id,data} of rewards){
  if(typeof id!=="string"||!id||id.includes("/")||seen.has(id))throw Error("Unique reward identities required");
  seen.add(id);
  if(!expiredBefore(data,asOfMonth)){problems.push({id,reason:"reward_not_expired_before_cutoff"});continue;}
  preserved.push({path:"monthlyRewards/"+id,beforeSha256:digest(data)});
 }
 return {mode:"preserve_expired_history",asOfMonth,preserved,updates:[],problems,ready:problems.length===0,writesPerformed:0,requiresReviewedProductionApproval:true};
}
async function verifyPreservedRewardHistory({db,plan,now=new Date()}){
 if(plan?.mode!=="preserve_expired_history")return 0;
 const current=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit"}).format(now).slice(0,7);
 if(!MONTH.test(plan.asOfMonth||"")||plan.asOfMonth>current||!Array.isArray(plan.preserved)||plan.updates?.length)throw Error("Historical rewards must remain unchanged");
 const seen=new Set();
 for(const item of plan.preserved){
  if(!/^monthlyRewards\/[^/]+$/.test(item.path)||seen.has(item.path)||!/^[a-f0-9]{64}$/.test(item.beforeSha256||""))throw Error("Invalid preserved reward identity");
  seen.add(item.path);
  const doc=await db.doc(item.path).get();
  if(!doc.exists||digest(doc.data())!==item.beforeSha256||!expiredBefore(doc.data(),plan.asOfMonth))throw Error("Historical reward changed or is not expired");
 }
 return seen.size;
}
module.exports={planExpiredRewardHistory,verifyPreservedRewardHistory};
