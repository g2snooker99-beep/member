"use strict";
const admin=require("firebase-admin");
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {defineString}=require("firebase-functions/params");
const {onSchedule}=require("firebase-functions/v2/scheduler");
const {buildService}=require("./service");
// Production codebase uses a dedicated identity; never the legacy Editor identity.
const runtimeServiceAccount="g2-member-api@member-3e17e.iam.gserviceaccount.com";
admin.initializeApp();
const channel=defineString("MEMBER_LINE_CHANNEL_ID");
const owner=defineString("MEMBER_OWNER_LINE_UID");
const mutationGate=defineString("MEMBER_MUTATIONS_ENABLED",{default:"false"});
const closeAdmin=defineString("MEMBER_MONTH_CLOSE_ADMIN_UID",{default:""});
async function verifyLine(idToken,clientId){
  const r=await fetch("https://api.line.me/oauth2/v2.1/verify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({id_token:idToken,client_id:clientId}),signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new HttpsError("unauthenticated","LINE rejected login");return r.json();
}
function callable(fn,write=true){return onCall({serviceAccount:runtimeServiceAccount,region:"asia-southeast1",timeoutSeconds:540,maxInstances:5},async r=>{
  try{if(write)require("./release-controls").requireMutationGate(mutationGate.value());return await fn(buildService({db:admin.firestore(),auth:admin.auth(),FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:channel.value(),ownerUid:owner.value(),verifyLine}),r.auth?.uid,r.data||{});}
  catch(e){if(e instanceof HttpsError)throw e;const known=["unauthenticated","invalid-argument","permission-denied","failed-precondition","already-exists"].includes(e.code);throw new HttpsError(known?e.code:"unavailable",known?e.message:"Service unavailable; retry safely");}
});}
exports.memberLineLogin=callable((s,u,d)=>s.exchange(d.idToken),false);
exports.memberRegister=callable((s,u,d)=>s.register(u,d));
exports.memberSession=callable((s,u)=>s.session(u),false);
exports.memberClubData=callable((s,u,d)=>s.clubData(u,d),false);
exports.memberAddPoints=callable((s,u,d)=>s.addPoints(u,d));
exports.memberOpenMonth=callable((s,u,d)=>s.openMonth(u,d.month));
exports.memberPreviewMonth=callable((s,u,d)=>s.previewMonth(u,d.month),false);
exports.memberCloseMonth=callable((s,u,d)=>s.closeMonth(u,d.month));
exports.memberRedeemReward=callable((s,u,d)=>s.redeem(u,d));
exports.memberSetStaff=callable((s,u,d)=>s.setStaff(u,d));
// Keep the existing scheduled resource: close + open, checked hourly for recovery.
exports.memberScheduledClose=onSchedule({
 serviceAccount:runtimeServiceAccount,region:"asia-southeast1",
 schedule:"5 * * * *",timeZone:"Asia/Bangkok",timeoutSeconds:540,
 maxInstances:1,concurrency:1,retryCount:3,minBackoffSeconds:60,maxBackoffSeconds:300
},async()=>{
 const {runMonthCycle}=require("./month-cycle");
 const s=buildService({db:admin.firestore(),auth:admin.auth(),FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:channel.value(),ownerUid:owner.value(),verifyLine});
 try{
  const result=await runMonthCycle({db:admin.firestore(),service:s,ownerUid:closeAdmin.value(),enabled:mutationGate.value()});
  require("firebase-functions/logger").info("member_month_cycle",{state:result.state,month:result.month||"",previous:result.previous||""});
  return result;
 }catch(e){
  require("firebase-functions/logger").error("member_month_cycle_failed",{code:e.code||"unavailable",message:e.message});
  throw e;
 }
});
