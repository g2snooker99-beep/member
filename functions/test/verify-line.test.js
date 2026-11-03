"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {verifyLineToken}=require("../verify-line");
class AuthError extends Error{constructor(code,message){super(message);this.code=code;}}
const SECRET="DUMMY-ID-TOKEN-DO-NOT-LOG";
function options(status,body){
 const logs=[],requests=[];
 return {logs,requests,ErrorType:AuthError,log:value=>logs.push(value),fetchImpl:async(url,request)=>{
  requests.push({url,request});return {status,ok:status>=200&&status<300,json:async()=>body};
 }};
}
test("LINE verifier preserves claims from a successful signature verification",async()=>{
 const claims={iss:"https://access.line.me",aud:"2010084269",sub:"U"+"a".repeat(32),exp:9999999999},o=options(200,claims);
 assert.deepEqual(await verifyLineToken(SECRET,"2010084269",o),claims);
 assert.equal(o.requests[0].url,"https://api.line.me/oauth2/v2.1/verify");
 assert.equal(o.requests[0].request.body.get("id_token"),SECRET);assert.equal(o.logs.length,0);
});
test("LINE verifier distinguishes expired, rejected and channel mismatch without logging credentials",async()=>{
 for(const [description,code,message,reason] of [
  ["IdToken expired.","unauthenticated","LINE_SESSION_EXPIRED","expired"],
  ["Invalid IdToken Audience.","failed-precondition","LINE_CHANNEL_MISMATCH","audience"],
  ["Invalid IdToken.","unauthenticated","LINE_LOGIN_REJECTED","rejected"],
  ["upstream text "+SECRET,"unauthenticated","LINE_LOGIN_REJECTED","rejected"]
 ]){
  const o=options(400,{error_description:description});
  await assert.rejects(verifyLineToken(SECRET,"2010084269",o),{code,message});
  assert.deepEqual(o.logs,[{status:400,reason}]);assert.equal(JSON.stringify(o.logs).includes(SECRET),false);
 }
});
test("LINE verifier treats rate limits, upstream errors and network failures as temporary",async()=>{
 for(const status of [429,500,503]){
  const o=options(status,{error_description:SECRET});
  await assert.rejects(verifyLineToken(SECRET,"2010084269",o),{code:"unavailable",message:"LINE_VERIFY_UNAVAILABLE"});
  assert.equal(JSON.stringify(o.logs).includes(SECRET),false);
 }
 const logs=[];
 await assert.rejects(verifyLineToken(SECRET,"2010084269",{ErrorType:AuthError,log:l=>logs.push(l),fetchImpl:async()=>{throw Error(SECRET);}}),{code:"unavailable"});
 assert.deepEqual(logs,[{reason:"network"}]);
});
