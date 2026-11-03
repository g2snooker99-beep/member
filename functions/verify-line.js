"use strict";
// Classify LINE's verification result without logging tokens, bodies or customer identity.
async function verifyLineToken(idToken,clientId,{fetchImpl=fetch,ErrorType,log=()=>{}}={}){
 const fail=(code,message)=>{throw new ErrorType(code,message);};
 let response;
 try{
  response=await fetchImpl("https://api.line.me/oauth2/v2.1/verify",{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({id_token:idToken,client_id:clientId}),signal:AbortSignal.timeout(8000)
  });
 }catch{log({reason:"network"});return fail("unavailable","LINE_VERIFY_UNAVAILABLE");}
 let body;try{body=await response.json();}catch{log({status:response.status,reason:"invalid-response"});return fail("unavailable","LINE_VERIFY_UNAVAILABLE");}
 if(response.ok)return body;
 const reason=body?.error_description;
 if(response.status===429||response.status>=500){log({status:response.status,reason:"upstream"});return fail("unavailable","LINE_VERIFY_UNAVAILABLE");}
 if(reason==="Invalid IdToken Audience."){log({status:response.status,reason:"audience"});return fail("failed-precondition","LINE_CHANNEL_MISMATCH");}
 if(reason==="IdToken expired."){log({status:response.status,reason:"expired"});return fail("unauthenticated","LINE_SESSION_EXPIRED");}
 log({status:response.status,reason:"rejected"});
 return fail("unauthenticated","LINE_LOGIN_REJECTED");
}
module.exports={verifyLineToken};
