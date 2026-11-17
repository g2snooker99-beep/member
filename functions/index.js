"use strict";
const admin=require("firebase-admin");
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {defineString,defineSecret}=require("firebase-functions/params");
const {onSchedule}=require("firebase-functions/v2/scheduler");
const {buildService}=require("./service");
// Production codebase uses a dedicated identity; never the legacy Editor identity.
const runtimeServiceAccount="g2-member-api@member-3e17e.iam.gserviceaccount.com";
admin.initializeApp();
const channel=defineString("MEMBER_LINE_CHANNEL_ID");
const owner=defineString("MEMBER_OWNER_LINE_UID");
const mutationGate=defineString("MEMBER_MUTATIONS_ENABLED",{default:"false"});
const rewardsStartAt=defineString("MEMBER_REWARDS_V2_START_AT",{default:""});
const rewardStockSecret=defineSecret("G2_REWARD_STOCK_SECRET");
const closeAdmin=defineString("MEMBER_MONTH_CLOSE_ADMIN_UID",{default:""});
async function verifyLine(idToken,clientId){
 return require("./verify-line").verifyLineToken(idToken,clientId,{
  ErrorType:HttpsError,log:details=>require("firebase-functions/logger").warn("member_line_verification",details)
 });
}
function callable(fn,write=true,secrets=[]){return onCall({secrets,serviceAccount:runtimeServiceAccount,region:"asia-southeast1",timeoutSeconds:540,maxInstances:5},async r=>{
  try{if(write)require("./release-controls").requireMutationGate(mutationGate.value());return await fn(buildService({db:admin.firestore(),auth:admin.auth(),FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:channel.value(),ownerUid:owner.value(),verifyLine,rewardsFirstMonth:legacyRewardsEnd()}),r.auth?.uid,r.data||{});}
  catch(e){if(e instanceof HttpsError)throw e;const known=["unauthenticated","invalid-argument","permission-denied","failed-precondition","already-exists"].includes(e.code);throw new HttpsError(known?e.code:"unavailable",known?e.message:"Service unavailable; retry safely");}
});}
const rewardsEnabled=defineString("MEMBER_REWARDS_V2_ENABLED",{default:"false"});
function rewardsStart(){
 const raw=rewardsStartAt.value();
 return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(raw)?Date.parse(raw):NaN;
}
function legacyRewardsEnd(){
 const start=rewardsStart();
 if(!Number.isFinite(start))return "";
 const raw=rewardsStartAt.value();
 if(raw.endsWith("-01T00:00:00+07:00"))return raw.slice(0,7);
 const [y,m]=raw.slice(0,7).split("-").map(Number);
 return new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);
}
function rewardsAvailable(){
 return rewardsEnabled.value()==="true"&&Date.now()>=rewardsStart();
}
function rewardsCall(method,write){
 const bindStock=["list","save","redeem"].includes(method);
 return callable((s,u,d)=>{
  if(!rewardsAvailable()){
   if(method==="list")return {enabled:false};
   throw new HttpsError("failed-precondition","ระบบแลกรางวัลยังไม่เปิด");
  }
  return require("./rewards-v2").buildRewards({db:admin.firestore(),FieldValue:admin.firestore.FieldValue,identity:s.identity,now:()=>new Date(),inventory:bindStock?require("./reward-stock").stockBridge(rewardStockSecret.value()):null})[method](u,d);
 },write,bindStock?[rewardStockSecret]:[]);
}
exports.memberRewardCatalog=rewardsCall("list",false);
exports.memberRewardSave=rewardsCall("save",true);
exports.memberRewardTicket=rewardsCall("issue",true);
exports.memberRewardConfirm=rewardsCall("redeem",true);
exports.memberLineLogin=callable((s,u,d)=>s.exchange(d.idToken),false);
exports.memberRegister=callable((s,u,d)=>s.register(u,d));
exports.memberSession=callable(async(s,u)=>({...await s.session(u),rewardsV2:rewardsAvailable()}),false);
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
 const s=buildService({db:admin.firestore(),auth:admin.auth(),FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:channel.value(),ownerUid:owner.value(),verifyLine,rewardsFirstMonth:legacyRewardsEnd()});
 try{
  const result=await runMonthCycle({db:admin.firestore(),service:s,ownerUid:closeAdmin.value(),enabled:mutationGate.value()});
  require("firebase-functions/logger").info("member_month_cycle",{state:result.state,month:result.month||"",previous:result.previous||""});
  return result;
 }catch(e){
  require("firebase-functions/logger").error("member_month_cycle_failed",{code:e.code||"unavailable",message:e.message});
  throw e;
 }
});
