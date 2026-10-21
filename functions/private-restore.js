"use strict";
// Test-project-only private data operation. Disabled without every scoped secret.
const {timingSafeEqual}=require("node:crypto"),safety=require("./data-safety");
function buildPrivateRestore({db,FieldValue,FieldPath,Timestamp,GeoPoint,env}){
 const run=env.G2_TEST_PRIVATE_RESTORE_RUN_ID;
 if(!run)return null;
 if(env.G2_FIREBASE_PROJECT_ID!=="g2-member-test"||db.projectId!=="g2-member-test"||env.G2_MEMBER_ENABLED!=="false"||env.FIRESTORE_EMULATOR_HOST||!/^[-a-f0-9]{36}$/.test(run)||!/^[a-f0-9]{64}$/.test(env.G2_TEST_PRIVATE_RESTORE_KEY||"")||(env.G2_TEST_PRIVATE_RESTORE_TOKEN||"").length<40)throw Error("Explicit isolated restore configuration required");
 const secret="Bearer "+env.G2_TEST_PRIVATE_RESTORE_TOKEN,receipt=db.collection("privateRestoreRehearsals").doc(run);
 let state={state:"idle",runId:run,productionWrites:0},working=false;
 async function restore(envelope){
  try{
   const backup=safety.unseal(envelope,Buffer.from(env.G2_TEST_PRIVATE_RESTORE_KEY,"hex"));
   if(backup.sourceProject!=="member-3e17e")throw Error("Actual Member backup required");
   const archiveRecordsSha256=backup.recordsSha256;
   // Normalize cross-language number/GeoPoint representation and ordering
   // only after authenticating the exact original archive manifest.
   backup.records=backup.records.map(r=>({path:r.path,data:safety.encode(safety.decode(r.data,{Timestamp,GeoPoint,db}))})).sort((a,b)=>a.path.localeCompare(b.path,"en"));
   backup.recordsSha256=require("node:crypto").createHash("sha256").update(JSON.stringify(backup.records)).digest("hex");
   state={...state,state:"restoring",documents:backup.count,archiveRecordsSha256};
   await receipt.create({state:"running",sourceProject:backup.sourceProject,documents:backup.count,startedAt:FieldValue.serverTimestamp()});
   const options={backup,db,targetProject:"g2-member-test",targetPrefix:"restoreRehearsals/"+run,Timestamp,GeoPoint};
   await safety.restoreCreateOnly(options);await safety.restoreCreateOnly({...options,dryRun:false});
   state={...state,state:"verifying"};
   const collections=[...new Set(backup.records.map(r=>r.path.split("/")[0]))];
   const copy=await safety.exportData({root:db.doc("restoreRehearsals/"+run),sourceProject:"g2-member-test",collections,frozen:true});
   if(copy.recordsSha256!==backup.recordsSha256||copy.count!==backup.count)throw Error("Restored data mismatch");
   state={state:"passed",runId:run,documents:copy.count,archiveRecordsSha256,sourceNormalizedSha256:backup.recordsSha256,restoreSha256:copy.recordsSha256,productionWrites:0};
   await receipt.update({...state,completedAt:FieldValue.serverTimestamp()});
   console.log("G2_PRIVATE_RESTORE "+JSON.stringify(state));
  }catch(e){
   state={...state,state:"failed",errorCode:String(e.code||e.name||"unknown").slice(0,80),productionWrites:0};
   try{await receipt.set(state,{merge:true});}catch{}
   console.error("G2_PRIVATE_RESTORE "+JSON.stringify(state));
  }finally{working=false;}
 }
 async function handler(req,res){
  function send(code,data){res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data));}
  const actual=req.headers.authorization||"",a=Buffer.from(actual),b=Buffer.from(secret);
  if(req.headers.origin!==env.G2_MEMBER_API_ORIGIN||a.length!==b.length||!timingSafeEqual(a,b))return send(403,{error:"forbidden"});
  if(req.method==="GET")return send(200,state);
  if(req.method!=="POST")return send(405,{error:"method-not-allowed"});
  if(working)return send(202,state);
  if(state.state==="passed")return send(200,state);
  let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>10*1024*1024)return send(413,{error:"archive_too_large"});}
  try{const backup=safety.unseal(body,Buffer.from(env.G2_TEST_PRIVATE_RESTORE_KEY,"hex"));if(backup.sourceProject!=="member-3e17e")return send(400,{error:"wrong_source"});}
  catch{return send(400,{error:"invalid_encrypted_archive"});}
  working=true;state={...state,state:"accepted"};send(202,state);void restore(body);
 }
 return {handler};
}
module.exports={buildPrivateRestore};
