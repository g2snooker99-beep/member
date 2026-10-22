"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{planMigration}=require("../migration-plan");
const A="U"+"a".repeat(32),U="U"+"b".repeat(32);
test("in-place migration preserves scores, UID, membership ID and unknown fields; legacy staff not trusted",()=>{
  const members=[{id:A,data:{role:"admin",monthlyPoints:17,memberId:"EXISTING",unknown:{x:1}}},{id:U,data:{role:"staff",monthlyPoints:23,isActive:false,memberId:"LEGACY-ID",pointsMonth:"2026-10"}}];
  const before=JSON.stringify(members),plan=planMigration({members,monthId:"2026-10",ownerUid:A});
  assert.equal(plan.ready,true);assert.equal(plan.members,2);assert.equal(plan.authority.length,1);assert.equal(JSON.stringify(members),before);
  for(const update of plan.updates){assert.equal(update.patch.monthlyPoints,undefined);assert.equal(update.patch.memberId,undefined);assert.equal(update.patch.unknown,undefined);assert.equal(update.patch.isActive,update.path.endsWith(U)?undefined:true);}
});
test("migration blocks trial records, bad balances, mismatched identity and missing owner",()=>{
  const plan=planMigration({members:[{id:U,data:{monthlyPoints:37,testRunId:"TEST"}},{id:"bad",data:{monthlyPoints:0}},{id:A,data:{monthlyPoints:-1}}],monthId:"2026-10",ownerUid:A});
  assert.equal(plan.ready,false);assert.equal(plan.problems.length,3);assert.equal(plan.updates.length,0);assert.equal(plan.writesPerformed,0);
  assert.throws(()=>planMigration({members:[],monthId:"2026-13",ownerUid:A}));
});
test("legacy reward mapping preserves IDs, used state and unknown fields; duplicates block release",()=>{
  const {planRewardMigration}=require("../migration-plan");
  const rewards=[{id:"legacy-shirt",data:{userId:U,monthKey:"2026-10",rewardType:"ranking_shirt",rank:2,status:"active",usedAt:null,unknown:17}},{id:"legacy-used",data:{userId:A,monthKey:"2026-10",rewardType:"discount_10",status:"active",usedAt:"already-delivered"}}];
  const before=JSON.stringify(rewards),plan=planRewardMigration(rewards);
  assert.equal(plan.ready,true);assert.equal(plan.updates[0].path,"monthlyRewards/legacy-shirt");assert.equal(plan.updates[0].patch.type,"top2");assert.equal(plan.updates[1].patch.status,"used");assert.equal(JSON.stringify(rewards),before);
  assert.equal(planRewardMigration([...rewards,{id:"duplicate",data:rewards[0].data}]).ready,false);
});

test("history projection preserves old document identity, points and timestamp",()=>{
 const {planHistoryMigration}=require("../migration-plan");
 class Timestamp{constructor(){this.seconds=1;this.nanoseconds=0;}toMillis(){return 1000;}toDate(){return new Date(1000);}}
 const stamp=new Timestamp(),history=[{id:"old-event",data:{memberId:"OLD-ID",timestamp:stamp,point:7,unknown:"keep"}}];
 const result=planHistoryMigration({members:[{id:U,data:{memberId:"OLD-ID"}}],history});
 assert.equal(result.ready,true);assert.equal(result.updates[0].path,"pointTransactions/old-event");
 assert.deepEqual(result.updates[0].patch,{userId:U,createdAt:stamp,points:7});assert.equal(history[0].data.unknown,"keep");
 assert.equal(planHistoryMigration({members:[],history}).ready,false);
});

test("migration application fails closed without approval, backup and a matching full plan hash",async()=>{
 const {applyReviewedPlan,planDigest}=require("../apply-reviewed-migration");
 const plan={ready:true,updates:[],authority:[],sourceBackupSha256:"backup"};
 plan.planSha256=planDigest(plan);
 await assert.rejects(applyReviewedPlan({db:{projectId:"member-3e17e"},plan,approvedPlanSha256:plan.planSha256,backupManifestSha256:"backup",writersPaused:true}));
 const changed={...plan,rewards:{updates:[{path:"monthlyRewards/a",patch:{status:"available"}}]}};
 assert.notEqual(planDigest(changed),plan.planSha256);
 await assert.rejects(applyReviewedPlan({db:{projectId:"member-3e17e"},plan:changed,approvedPlanSha256:plan.planSha256,backupManifestSha256:"backup",writersPaused:true,productionApproval:true}));
});

test("trial member and reward markers never become migration updates",()=>{
 const {planRewardMigration}=require("../migration-plan");
 const members=[{id:A,data:{role:"admin",monthlyPoints:0,isTest:true}}];
 assert.equal(planMigration({members,monthId:"2026-10",ownerUid:A}).ready,false);
 for(const marker of [{isTest:true},{dummyOnly:true},{testRunId:"trial"},{testRun:"trial"}]){
  for(const status of ["active","used"]){
   const source=[{id:"trial",data:{userId:U,monthKey:"2026-07",rewardType:"discount_10",status,...marker}}];
   const before=JSON.stringify(source),plan=planRewardMigration(source);
   assert.equal(plan.ready,false);assert.equal(plan.updates.length,0);
   assert.equal(plan.problems[0].reason,"trial_reward_must_remain_unchanged");assert.equal(JSON.stringify(source),before);
  }
 }
});
test("approved custom plans still cannot activate a stored trial reward",async()=>{
 const {applyReviewedPlan,planDigest}=require("../apply-reviewed-migration"),{encode}=require("../data-safety"),{createHash}=require("node:crypto");
 const source={userId:U,monthKey:"2026-07",rewardType:"discount_10",status:"active",isTest:true};
 const beforeSha256=createHash("sha256").update(JSON.stringify(encode(source))).digest("hex");
 const plan={ready:true,updates:[],authority:[],projections:[],rewards:{updates:[{path:"monthlyRewards/trial",beforeSha256,patch:{type:"discount10",status:"available"}}]},sourceBackupSha256:"backup"};
 plan.planSha256=planDigest(plan);let writes=0;
 const db={projectId:"g2-member-test",testMigrationNamespace:true,doc:p=>({path:p}),collection:c=>({doc:id=>({collection:x=>({doc:id=>({path:"receipt"})})})}),runTransaction:async fn=>fn({get:async ref=>({exists:ref.path!=="receipt",data:()=>source}),update:()=>writes++,create:()=>writes++})};
 await assert.rejects(applyReviewedPlan({db,plan,approvedPlanSha256:plan.planSha256,backupManifestSha256:"backup",writersPaused:true}),/Trial records/);
 assert.equal(writes,0);assert.equal(source.status,"active");
});
