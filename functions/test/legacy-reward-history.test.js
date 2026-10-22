"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{createHash}=require("node:crypto");
const {planRewardMigration}=require("../migration-plan"),{verifyPreservedRewardHistory}=require("../legacy-reward-history");
const {applyReviewedPlan,planDigest}=require("../apply-reviewed-migration"),{encode}=require("../data-safety");
const U="U"+"a".repeat(32),sha=p=>createHash("sha256").update(JSON.stringify(encode(p))).digest("hex");
function source(){return [
 {id:"old-used",data:{userId:U,monthKey:"2026-07",rewardType:"discount_10",status:"active",usedAt:"delivered",unknown:{keep:true}}},
 {id:"old-duplicate",data:{userId:U,monthKey:"2026-07",rewardType:"discount_10",status:"active"}},
 {id:"trial",data:{userId:U,monthKey:"2026-08",status:"active",isTest:true}}
];}
test("explicit historical candidate keeps expired duplicates, used and trial rewards byte-for-byte",async()=>{
 const rewards=source(),before=JSON.stringify(rewards),plan=planRewardMigration(rewards,{policy:"preserve_expired_history",asOfMonth:"2026-10"});
 assert.equal(plan.ready,true);assert.equal(plan.preserved.length,3);assert.equal(plan.updates.length,0);
 assert.equal(plan.requiresReviewedProductionApproval,true);assert.equal(planRewardMigration(rewards).ready,false);
 const db={doc:path=>({get:async()=>({exists:true,data:()=>rewards.find(r=>path==="monthlyRewards/"+r.id).data})})};
 assert.equal(await verifyPreservedRewardHistory({db,plan,now:new Date("2026-10-22T00:00:00Z")}),3);
 assert.equal(JSON.stringify(rewards),before);
});
test("historical policy refuses current, future, invalid and unknown cutoff policies",()=>{
 for(const monthKey of ["2026-09","2026-10","2027-01","bad"]){
  const plan=planRewardMigration([{id:"r",data:{monthKey}}],{policy:"preserve_expired_history",asOfMonth:"2026-10"});
  assert.equal(plan.ready,false);assert.equal(plan.preserved.length,0);assert.equal(plan.updates.length,0);
 }
 assert.throws(()=>planRewardMigration(source(),{policy:"deduplicate"}),/Unknown/);
 assert.throws(()=>planRewardMigration(source(),{policy:"preserve_expired_history"}),/cutoff/);
});
test("historical preflight rejects changed data, future cutoff, duplicate paths and reward updates",async()=>{
 const reward=source()[0],plan=planRewardMigration([reward],{policy:"preserve_expired_history",asOfMonth:"2026-10"});
 const db={doc:()=>({get:async()=>({exists:true,data:()=>({...reward.data,status:"available"})})})};
 await assert.rejects(verifyPreservedRewardHistory({db,plan,now:new Date("2026-10-22")}),/changed/);
 await assert.rejects(verifyPreservedRewardHistory({db,plan:{...plan,asOfMonth:"2027-01"},now:new Date("2026-10-22")}),/unchanged/);
 await assert.rejects(verifyPreservedRewardHistory({db,plan:{...plan,updates:[{patch:{status:"available"}}]}}),/unchanged/);
 const unchanged={doc:()=>({get:async()=>({exists:true,data:()=>reward.data})})};
 await assert.rejects(verifyPreservedRewardHistory({db:unchanged,plan:{...plan,preserved:[...plan.preserved,...plan.preserved]}}),/identity/);
});
test("historical policy is included in approved hash and cannot bypass production approval",async()=>{
 const plan={ready:true,updates:[],authority:[],sourceBackupSha256:"backup",rewards:planRewardMigration(source(),{policy:"preserve_expired_history",asOfMonth:"2026-10"})};
 plan.planSha256=planDigest(plan);assert.notEqual(planDigest({...plan,rewards:{...plan.rewards,asOfMonth:"2026-11"}}),plan.planSha256);
 await assert.rejects(applyReviewedPlan({db:{projectId:"member-3e17e"},plan,approvedPlanSha256:plan.planSha256,backupManifestSha256:"backup",writersPaused:true}),/Explicit production approval/);
});
test("historical preservation is verified before any additive member writes",async()=>{
 const reward=source()[0],plan={ready:true,updates:[{path:"users/"+U,beforeSha256:sha({monthlyPoints:7}),patch:{pointsMonth:"2026-10"}}],authority:[],sourceBackupSha256:"backup",rewards:planRewardMigration([reward],{policy:"preserve_expired_history",asOfMonth:"2026-10"})};
 plan.planSha256=planDigest(plan);let writes=0;
 const db={projectId:"g2-member-test",testMigrationNamespace:"fixture",doc:()=>({get:async()=>({exists:false})}),runTransaction:async()=>writes++};
 await assert.rejects(applyReviewedPlan({db,plan,approvedPlanSha256:plan.planSha256,backupManifestSha256:"backup",writersPaused:true}),/changed/);
 assert.equal(writes,0);
});
