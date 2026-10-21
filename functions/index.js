"use strict";
const admin=require("firebase-admin");
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {defineString}=require("firebase-functions/params");
const {buildService}=require("./service");
admin.initializeApp();
const channel=defineString("MEMBER_LINE_CHANNEL_ID");
async function verifyLine(idToken,clientId){
  const r=await fetch("https://api.line.me/oauth2/v2.1/verify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({id_token:idToken,client_id:clientId}),signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new HttpsError("unauthenticated","LINE rejected login");return r.json();
}
function callable(fn){return onCall({region:"asia-southeast1",timeoutSeconds:540,maxInstances:5},async r=>{
  try{return await fn(buildService({db:admin.firestore(),auth:admin.auth(),FieldValue:admin.firestore.FieldValue,FieldPath:admin.firestore.FieldPath,channelId:channel.value(),verifyLine}),r.auth?.uid,r.data||{});}
  catch(e){if(e instanceof HttpsError)throw e;const known=["unauthenticated","invalid-argument","permission-denied","failed-precondition","already-exists"].includes(e.code);throw new HttpsError(known?e.code:"unavailable",known?e.message:"Service unavailable; retry safely");}
});}
exports.memberLineLogin=callable((s,u,d)=>s.exchange(d.idToken));
exports.memberRegister=callable((s,u,d)=>s.register(u,d));
exports.memberAddPoints=callable((s,u,d)=>s.addPoints(u,d));
exports.memberOpenMonth=callable((s,u,d)=>s.openMonth(u,d.month));
exports.memberCloseMonth=callable((s,u,d)=>s.closeMonth(u,d.month));
