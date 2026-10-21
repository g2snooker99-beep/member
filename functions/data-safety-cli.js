"use strict";
// Operator CLI. Secrets stay in environment/private files, never command args.
const fs=require("node:fs/promises"),path=require("node:path");
const safety=require("./data-safety");
async function main(args=process.argv.slice(2),env=process.env){
  const [command,input,output,namespace]=args;
  if(!["export","inspect","restore-dry-run","restore-test","migration-plan"].includes(command))throw Error("Use export <encrypted-output>, inspect <backup>, restore-dry-run|restore-test <backup> <test-project> <namespace>, migration-plan <backup> <private-plan-output>");
  if(!/^[a-f0-9]{64}$/i.test(env.G2_BACKUP_KEY_HEX||""))throw Error("Separate backup encryption key required in G2_BACKUP_KEY_HEX");
  const key=Buffer.from(env.G2_BACKUP_KEY_HEX,"hex");
  if(command==="inspect"){
    const b=safety.unseal(await fs.readFile(input,"utf8"),key);
    return {sourceProject:b.sourceProject,count:b.count,counts:b.counts,recordsSha256:b.recordsSha256,capturedAt:b.capturedAt};
  }
  const admin=require("firebase-admin"),credentials=JSON.parse(await fs.readFile(env.G2_DATA_SERVICE_ACCOUNT_FILE,"utf8"));
  if(!["member-3e17e","g2-member-test"].includes(credentials.project_id))throw Error("Unexpected project credential");
  if(env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST)throw Error("This operator CLI is for explicitly selected cloud projects");
  const app=admin.initializeApp({credential:admin.credential.cert(credentials),projectId:credentials.project_id},"data-safety-cli"),db=app.firestore();
  try{
    if(command==="export"){
      if(env.G2_BACKUP_WRITERS_PAUSED!=="confirmed")throw Error("Pause all Member writers and confirm before exporting");
      const collections=(await db.listCollections()).map(c=>c.id);
      const b=await safety.exportData({root:db,sourceProject:credentials.project_id,collections,frozen:true});
      await fs.writeFile(path.resolve(input),safety.seal(b,key),{flag:"wx",mode:0o600});
      return {sourceProject:b.sourceProject,count:b.count,recordsSha256:b.recordsSha256,encrypted:true,firestoreWrites:0};
    }
    const b=safety.unseal(await fs.readFile(input,"utf8"),key);
    if(command==="migration-plan"){
      if(b.sourceProject!=="member-3e17e")throw Error("Production inventory backup required; never promote test backup");
      const rows=b.records.map(r=>({path:r.path,data:safety.decode(r.data,{Timestamp:admin.firestore.Timestamp,GeoPoint:admin.firestore.GeoPoint,db})}));
      const {planMigration,planRewardMigration}=require("./migration-plan");
      const plan=planMigration({members:rows.filter(r=>/^users\/[^/]+$/.test(r.path)).map(r=>({id:r.path.split("/")[1],data:r.data})),monthId:env.G2_MIGRATION_BALANCE_MONTH,ownerUid:env.MEMBER_OWNER_LINE_UID,approvedStaff:(env.G2_APPROVED_STAFF_UIDS||"").split(",").filter(Boolean)});
      plan.rewards=planRewardMigration(rows.filter(r=>/^monthlyRewards\/[^/]+$/.test(r.path)).map(r=>({id:r.path.split("/")[1],data:r.data})));
      plan.ready=plan.ready&&plan.rewards.ready;plan.sourceBackupSha256=b.recordsSha256;
      // Private plan includes member identities. Never commit or print it.
      await fs.writeFile(path.resolve(output),JSON.stringify(plan,null,2),{flag:"wx",mode:0o600});
      return {members:plan.members,ready:plan.ready,problems:plan.problems.length+plan.rewards.problems.length,firestoreWrites:0};
    }
    return safety.restoreCreateOnly({backup:b,db,targetProject:output,targetPrefix:namespace,Timestamp:admin.firestore.Timestamp,GeoPoint:admin.firestore.GeoPoint,dryRun:command!=="restore-test"});
  }finally{await app.delete();}
}
module.exports={main};
if(require.main===module)main().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error("Data-safety operation failed; no production restore is supported. Check private operator logs/configuration.");process.exitCode=1;});
