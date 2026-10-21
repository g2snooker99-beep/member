"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {encode,decode,seal,unseal,restoreCreateOnly,migrationAudit}=require("../data-safety");
class Timestamp{constructor(seconds,nanoseconds){Object.assign(this,{seconds,nanoseconds});}toDate(){return new Date(this.seconds*1000);}}
class GeoPoint{constructor(latitude,longitude){Object.assign(this,{latitude,longitude});}}
const db={doc:path=>({path,firestore:true})};
test("encrypted backup preserves all typed values and rejects corruption/wrong key",()=>{
  const data={phone:"0812345678",nested:{points:37},array:[null,true,"ไทย",-0,NaN,Infinity],stamp:new Timestamp(1700000000,123456789),geo:new GeoPoint(13,100),bytes:Buffer.from([0,255]),ref:db.doc("users/original"),unknownField:"preserve"};
  const records=[{path:"users/original",data:encode(data)}],backup={count:1,records,recordsSha256:crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex")};
  const key=crypto.randomBytes(32),encrypted=seal(backup,key);assert.ok(!encrypted.includes(data.phone));
  const recovered=unseal(encrypted,key);assert.deepEqual(decode(recovered.records[0].data,{Timestamp,GeoPoint,db}),data);
  assert.throws(()=>unseal(encrypted,crypto.randomBytes(32)));
  const corrupt=JSON.parse(encrypted);corrupt.ciphertext="A"+corrupt.ciphertext.slice(1);assert.throws(()=>unseal(JSON.stringify(corrupt),key));
});
test("restore refuses production, path escapes and existing target; dry run has no writes",async()=>{
  const records=[{path:"users/a",data:encode({monthlyPoints:37})}],backup={count:1,records,recordsSha256:crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex")};
  let writes=0,exists=false;
  const fake={projectId:"g2-member-test",doc:()=>({get:async()=>({exists}),create:async()=>writes++})};
  const config={backup,db:fake,targetProject:"g2-member-test",targetPrefix:"restoreRehearsals/12345678-1234-1234-1234-123456789012",Timestamp,GeoPoint};
  assert.equal((await restoreCreateOnly(config)).dryRun,true);assert.equal(writes,0);
  await assert.rejects(restoreCreateOnly({...config,targetProject:"member-3e17e"}));
  await assert.rejects(restoreCreateOnly({...config,targetPrefix:"users/a"}));
  exists=true;await assert.rejects(restoreCreateOnly({...config,dryRun:false}));assert.equal(writes,0);
  exists=false;await restoreCreateOnly({...config,dryRun:false});assert.equal(writes,1);
});
test("migration audit detects unmapped nonzero balance, untrusted roles and trials without mutation",()=>{
  const records=[{path:"users/"+"U"+"a".repeat(32),data:{role:"admin",monthlyPoints:37,testRunId:"test",unknown:"keep"}}];
  const before=JSON.stringify(records),audit=migrationAudit(records);
  assert.equal(audit.missingMonth,1);assert.equal(audit.legacyAuthority,1);assert.equal(audit.trialMarkers,1);assert.equal(audit.releaseReady,false);assert.equal(audit.writesPerformed,0);assert.equal(JSON.stringify(records),before);
});
