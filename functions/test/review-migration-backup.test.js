"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{createHash,randomBytes}=require("node:crypto");
const safety=require("../data-safety"),{reviewMigrationBackup}=require("../review-migration-backup");
const A="U"+"a".repeat(32),U="U"+"b".repeat(32);
function fixture(){
 const records=[
 {path:"users/"+A,data:safety.encode({role:"admin",isActive:true,monthlyPoints:17,memberId:"PRIVATE-OWNER",phone:"PRIVATE-PHONE"})},
 {path:"users/"+U,data:safety.encode({role:"member",monthlyPoints:23,memberId:"PRIVATE-MEMBER",pointsMonth:"2026-07",unknown:{nested:"KEEP"}})},
 {path:"monthlyRewards/first",data:safety.encode({userId:U,monthKey:"2026-07",rewardType:"ranking_shirt",rank:1,status:"active"})},
 {path:"monthlyRewards/second",data:safety.encode({userId:U,monthKey:"2026-07",rewardType:"discount_10",status:"used",usedAt:"existing",isTest:true})}
 ];
 return {version:1,sourceProject:"member-3e17e",count:records.length,records,recordsSha256:createHash("sha256").update(JSON.stringify(records)).digest("hex")};
}
test("checkpoint review preserves source balances and IDs and redacts every identity",()=>{
 const backup=fixture(),before=JSON.stringify(backup),report=reviewMigrationBackup({backup,monthId:"2026-10",ownerUid:A});
 assert.equal(JSON.stringify(backup),before);assert.equal(report.totalMemberPoints,40);assert.equal(report.members,2);
 assert.equal(report.duplicateRewardGroups,1);assert.equal(report.additionalDuplicateRewards,1);assert.equal(report.trialRewards,1);assert.equal(report.trialRewardsAlreadyUsed,1);
 assert.equal(report.plans.members.ready,true);assert.equal(report.plans.rewards.ready,false);assert.equal(report.mappingReady,false);
 assert.equal(report.invariants.protectedFieldChanges,0);assert.equal(report.firestoreWrites,0);assert.equal(report.readyForCutover,false);assert.equal(report.executablePlanProduced,false);
 assert.equal(report.memberMonths["2026-07"],1);assert.equal(report.memberMonths.missing,1);
 for(const secret of [A,U,"PRIVATE-OWNER","PRIVATE-MEMBER","PRIVATE-PHONE","KEEP"])assert.equal(JSON.stringify(report).includes(secret),false);
});
test("offline review rejects trial source and tampered manifests",()=>{
 const backup=fixture();
 assert.throws(()=>reviewMigrationBackup({backup:{...backup,sourceProject:"g2-member-test"},monthId:"2026-10",ownerUid:A}));
 backup.records[0].data=safety.encode({monthlyPoints:999});assert.throws(()=>reviewMigrationBackup({backup,monthId:"2026-10",ownerUid:A}));
});
test("CLI reviews encrypted checkpoints with a separate binary key and no cloud credential",async()=>{
 const fs=require("node:fs/promises"),os=require("node:os"),path=require("node:path"),{main}=require("../data-safety-cli");
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),"g2-review-")),key=randomBytes(32),archive=path.join(directory,"backup.g2enc"),keyPath=path.join(directory,"backup.g2key");
 try{
  await fs.writeFile(archive,safety.seal(fixture(),key));await fs.writeFile(keyPath,key);
  const env={G2_BACKUP_KEY_FILE:keyPath,G2_MIGRATION_BALANCE_MONTH:"2026-10",MEMBER_OWNER_LINE_UID:A};
  const report=await main(["review-checkpoint",archive],env);assert.equal(report.members,2);assert.equal(report.firestoreWrites,0);
  assert.equal((await main(["inspect",archive],env)).count,4);
  await assert.rejects(main(["inspect",archive],{...env,G2_BACKUP_KEY_HEX:key.toString("hex")}),/Choose one/);
  await fs.writeFile(keyPath,"short");await assert.rejects(main(["inspect",archive],env),/32-byte/);
 }finally{
  if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()))throw Error("Unexpected temporary path");
  await fs.rm(directory,{recursive:true,force:true});
 }
});
