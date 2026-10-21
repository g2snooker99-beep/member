"use strict";
const {encode}=require("./data-safety"),{createHash}=require("node:crypto");
const digest=value=>createHash("sha256").update(JSON.stringify(encode(value))).digest("hex");
function planDigest(plan){const {planSha256,...body}=plan;return digest(body);}
async function applyReviewedPlan({db,plan,approvedPlanSha256,backupManifestSha256,FieldValue,productionApproval=false,writersPaused=false}){
 if(!writersPaused||!plan.ready||planDigest(plan)!==approvedPlanSha256||plan.planSha256!==approvedPlanSha256||!backupManifestSha256||plan.sourceBackupSha256!==backupManifestSha256)throw Error("Reviewed plan, verified backup and paused writers required");
 if(db.projectId==="member-3e17e"){if(!productionApproval)throw Error("Explicit production approval required");}
 else if(!["g2-member-test","demo-g2-member"].includes(db.projectId)||!db.testMigrationNamespace)throw Error("Isolated migration fixture required");
 const items=[...plan.updates,...(plan.rewards?.updates||[]),...(plan.history?.updates||[])];
 let applied=0,duplicates=0;
 for(const item of items){
  if(!/^(users|monthlyRewards|pointTransactions)\/[^/]+$/.test(item.path))throw Error("Unsupported migration path");
  const collection=item.path.split("/")[0],allowed={users:["userId","memberId","nickname","pointsMonth","isActive","role","lifetimeHours"],monthlyRewards:["type","benefit","status"],pointTransactions:["userId","createdAt","points"]}[collection];
  if(Object.keys(item.patch).some(k=>!allowed.includes(k))||collection==="users"&&("monthlyPoints" in item.patch||item.patch.role&&item.patch.role!=="member"))throw Error("Protected balance or authority change refused");
  const ref=db.doc(item.path),receipt=db.collection("migrationRuns").doc(plan.planSha256).collection("items").doc(createHash("sha256").update(item.path).digest("hex"));
  const result=await db.runTransaction(async tx=>{
   const [old,r]=await Promise.all([tx.get(ref),tx.get(receipt)]);
   if(r.exists)return "duplicate";
   if(!old.exists||digest(old.data())!==item.beforeSha256)throw Error("Source changed since backup; regenerate plan");
   if(collection==="users")for(const key of Object.keys(item.patch))if(old.data()[key]!==undefined&&old.data()[key]!==null&&old.data()[key]!=="")throw Error("Existing member field overwrite refused");
   tx.update(ref,item.patch);tx.create(receipt,{path:item.path,planSha256:plan.planSha256,beforeSha256:item.beforeSha256,appliedAt:FieldValue.serverTimestamp()});return "applied";
  });
  if(result==="applied")applied++;else duplicates++;
 }
 // Legacy roles alone never create trusted privileges. This exact approved
 // authority manifest is independently pinned to the owner and existing role.
 for(const access of plan.authority){
  if(!["staff","admin"].includes(access.role)||access.enabled!==true||access.role==="admin"&&access.userId!==plan.ownerUid)throw Error("Invalid approved authority");
  await db.runTransaction(async tx=>{
   const ref=db.collection("memberStaffAccess").doc(access.userId),u=await tx.get(db.collection("users").doc(access.userId)),old=await tx.get(ref);
   if(!u.exists||u.data().role!==access.role||u.data().isActive!==true)throw Error("Approved staff profile mismatch");
   if(old.exists){if(old.data().role!==access.role||old.data().enabled!==true)throw Error("Existing ACL requires separate review");return;}
   tx.create(ref,{...access,approvedBy:plan.ownerUid,migrationPlanSha256:plan.planSha256,updatedAt:FieldValue.serverTimestamp()});
  });
 }

 for(const projection of plan.projections||[]){
  const ref=db.collection("publicLeaderboard").doc(createHash("sha256").update(projection.userId).digest("hex"));
  const receipt=db.collection("migrationRuns").doc(plan.planSha256).collection("items").doc("board_"+ref.id);
  await db.runTransaction(async tx=>{
   const [u,r]=await Promise.all([tx.get(db.collection("users").doc(projection.userId)),tx.get(receipt)]);
   if(r.exists)return;
   if(!u.exists||digest(u.data())!==projection.userSha256)throw Error("Member changed before public projection");
   tx.set(ref,{nickname:projection.nickname,points:projection.points,monthId:projection.monthId});
   tx.create(receipt,{action:"publicProjection",appliedAt:FieldValue.serverTimestamp()});
  });
 }
 return {applied,duplicates,balancesReset:0,importedTestScores:0};
}
module.exports={applyReviewedPlan,planDigest};
