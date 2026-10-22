"use strict";
// Offline review only. No Firebase SDK, credentials, connections or executable plan output.
const {createHash}=require("node:crypto"),safety=require("./data-safety");
const {planMigration,planRewardMigration,planHistoryMigration}=require("./migration-plan");
class Timestamp{
 constructor(seconds,nanoseconds){this.seconds=seconds;this.nanoseconds=nanoseconds;}
 toDate(){return new Date(this.toMillis());}
 toMillis(){return this.seconds*1000+this.nanoseconds/1e6;}
}
class GeoPoint{constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude;}}
const sha=s=>createHash("sha256").update(s).digest("hex");
const trial=p=>p.isTest===true||!!(p.dummyOnly||p.testRun||p.testRunId);
function reviewMigrationBackup({backup,monthId,ownerUid,approvedStaff=[],rewardPolicy}){
 if(backup.sourceProject!=="member-3e17e"||backup.count!==backup.records?.length||sha(JSON.stringify(backup.records))!==backup.recordsSha256)throw Error("Verified real-source backup required");
 const original=JSON.stringify(backup),seen=new Set();
 const db={doc:p=>({path:p,firestore:{}})};
 const rows=backup.records.map(r=>{
  if(typeof r.path!=="string"||r.path.split("/").length%2||r.path.split("/").some(x=>!x||x==="."||x==="..")||seen.has(r.path))throw Error("Unique relative document paths required");
  seen.add(r.path);return {path:r.path,data:safety.decode(r.data,{Timestamp,GeoPoint,db})};
 });
 const select=collection=>rows.filter(r=>r.path.startsWith(collection+"/")&&r.path.split("/").length===2).map(r=>({id:r.path.split("/")[1],data:r.data}));
 const members=select("users"),rewards=select("monthlyRewards"),history=select("pointTransactions");
 const memberPlan=planMigration({members,monthId,ownerUid,approvedStaff}),rewardPlan=planRewardMigration(rewards,rewardPolicy?{policy:rewardPolicy,asOfMonth:monthId}:{}),historyPlan=planHistoryMigration({members,history});
 const describe=plan=>({ready:plan.ready,updates:plan.updates.length,problemCounts:plan.problems.reduce((a,p)=>(a[p.reason]=(a[p.reason]||0)+1,a),{})});
 let protectedFieldChanges=0;
 for(const update of memberPlan.updates){
  const before=members.find(m=>update.path==="users/"+m.id).data,after={...before,...update.patch};
  if(Object.hasOwn(update.patch,"monthlyPoints"))protectedFieldChanges++;
  for(const [k,v] of Object.entries(before)){
   // Empty legacy metadata may be filled; existing balances/IDs/other data stay unchanged.
   if(["userId","memberId","nickname","pointsMonth","isActive","role","lifetimeHours"].includes(k)&&(v===undefined||v===null||v===""))continue;
   if(JSON.stringify(safety.encode(v))!==JSON.stringify(safety.encode(after[k])))protectedFieldChanges++;
  }
 }
 const groups=new Map();
 for(const r of rewards){const k=r.data.monthKey+"_"+r.data.userId;groups.set(k,(groups.get(k)||0)+1);}
 const duplicateGroups=[...groups.values()].filter(n=>n>1);
 const sourceUnchanged=JSON.stringify(backup)===original;
 if(!sourceUnchanged||protectedFieldChanges)throw Error("Source preservation failed");
 return {
  mode:"offline_review_only",sourceProject:backup.sourceProject,sourceRecordsSha256:backup.recordsSha256,documents:backup.count,
  members:members.length,totalMemberPoints:members.reduce((s,m)=>s+m.data.monthlyPoints,0),history:history.length,rewards:rewards.length,
  memberMonths:members.reduce((a,m)=>{const month=m.data.pointsMonth||"missing";a[month]=(a[month]||0)+1;return a;},{}),
  rewardMonths:rewards.reduce((a,r)=>(a[r.data.monthKey]=(a[r.data.monthKey]||0)+1,a),{}),
  duplicateRewardGroups:duplicateGroups.length,additionalDuplicateRewards:duplicateGroups.reduce((s,n)=>s+n-1,0),
  trialRewards:rewards.filter(r=>trial(r.data)).length,trialRewardsAlreadyUsed:rewards.filter(r=>trial(r.data)&&(r.data.status==="used"||r.data.usedAt)).length,
  rewardPolicy:rewardPolicy||"strict_mapping",preservedHistoricalRewards:rewardPlan.preserved?.length||0,
  plans:{members:describe(memberPlan),rewards:describe(rewardPlan),history:describe(historyPlan)},
  mappingReady:memberPlan.ready&&rewardPlan.ready&&historyPlan.ready,
  writersPaused:backup.consistentWithPausedWriters===true,readyForCutover:false,ownerLoginVerified:false,
  invariants:{sourceUnchanged,protectedFieldChanges,balancesReset:0,importedTestScores:0},
  firestoreWrites:0,executablePlanProduced:false
 };
}
module.exports={reviewMigrationBackup};
