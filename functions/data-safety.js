"use strict";
// Offline toolkit. No default credentials, production writes, or overwrites.
const {createCipheriv,createDecipheriv,randomBytes,createHash}=require("node:crypto");
const sha=s=>createHash("sha256").update(s).digest("hex");
function encode(v,referencePrefix=""){
  if(v===null)return ["null"];
  if(typeof v==="string"||typeof v==="boolean")return [typeof v,v];
  if(typeof v==="number")return ["number",Object.is(v,-0)?"-0":String(v)];
  if(Buffer.isBuffer(v)||v instanceof Uint8Array)return ["bytes",Buffer.from(v).toString("base64")];
  if(v&&Number.isInteger(v.seconds)&&Number.isInteger(v.nanoseconds)&&typeof v.toDate==="function")return ["timestamp",v.seconds,v.nanoseconds];
  if(v&&typeof v.latitude==="number"&&typeof v.longitude==="number")return ["geopoint",v.latitude,v.longitude];
  if(v&&typeof v.path==="string"&&v.firestore){
    if(referencePrefix&&!v.path.startsWith(referencePrefix+"/"))return ["external-scope-reference",v.path];
    return ["reference",referencePrefix?v.path.slice(referencePrefix.length+1):v.path];
  }
  if(Array.isArray(v))return ["array",v.map(x=>encode(x,referencePrefix))];
  if(v&&Object.getPrototypeOf(v)===Object.prototype)return ["map",Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,encode(x,referencePrefix)])];
  throw Error("Unsupported Firestore value; backup aborted");
}
function validPath(p,document=true){
  if(typeof p!=="string"||!p||p.startsWith("/")||p.endsWith("/")||p.includes("//")||p.split("/").some(x=>x==="."||x==="..")||p.split("/").length%2!==(document?0:1))throw Error("Invalid relative Firestore path");
  return p;
}
function decode(v,{Timestamp,GeoPoint,db}){
  if(!Array.isArray(v))throw Error("Invalid typed value");
  const [t,x,y]=v;
  if(t==="null")return null;
  if(t==="string"||t==="boolean")return x;
  if(t==="number")return x==="-0"?-0:Number(x);
  if(t==="bytes")return Buffer.from(x,"base64");
  if(t==="timestamp")return new Timestamp(x,y);
  if(t==="geopoint")return new GeoPoint(Number(x),Number(y));
  if(t==="reference")return db.doc(validPath(x));
  if(t==="array")return x.map(a=>decode(a,{Timestamp,GeoPoint,db}));
  if(t==="map")return Object.fromEntries(x.map(([k,a])=>[k,decode(a,{Timestamp,GeoPoint,db})]));
  throw Error("Unknown backup type");
}
function seal(backup,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error("Separate 32-byte backup key required");
  const body=JSON.stringify(backup),nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,nonce);
  cipher.setAAD(Buffer.from("G2_MEMBER_BACKUP_V1"));
  return JSON.stringify({format:"G2_MEMBER_BACKUP_V1",nonce:nonce.toString("base64"),tag:null,...(()=>{const encrypted=Buffer.concat([cipher.update(body,"utf8"),cipher.final()]);return {tag:cipher.getAuthTag().toString("base64"),ciphertext:encrypted.toString("base64")};})()});
}
function unseal(envelope,key){
  const e=JSON.parse(envelope);if(e.format!=="G2_MEMBER_BACKUP_V1")throw Error("Unknown backup format");
  const cipher=createDecipheriv("aes-256-gcm",key,Buffer.from(e.nonce,"base64"));cipher.setAAD(Buffer.from(e.format));cipher.setAuthTag(Buffer.from(e.tag,"base64"));
  const backup=JSON.parse(Buffer.concat([cipher.update(Buffer.from(e.ciphertext,"base64")),cipher.final()]).toString("utf8"));
  if(sha(JSON.stringify(backup.records))!==backup.recordsSha256||backup.count!==backup.records.length)throw Error("Backup manifest mismatch");
  const paths=new Set();for(const r of backup.records){validPath(r.path);if(paths.has(r.path))throw Error("Duplicate backup path");paths.add(r.path);}
  return backup;
}
async function exportData({root,sourceProject,collections,frozen=false}){
  if(!["g2-member-test","member-3e17e","demo-g2-member"].includes(sourceProject)||!frozen)throw Error("Explicit source and paused writers required for consistent export");
  const records=[],counts={};
  async function visit(col,relative){
    // listDocuments also discovers missing ancestor documents with subcollections.
    for(const ref of await col.listDocuments()){
      const path=relative+"/"+ref.id,s=await ref.get();
      if(s.exists){records.push({path,data:encode(s.data(),root.path||"")});counts[path.split("/")[0]]=(counts[path.split("/")[0]]||0)+1;}
      for(const child of await ref.listCollections())await visit(child,path+"/"+child.id);
    }
  }
  for(const name of collections){if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(name))throw Error("Invalid collection");await visit(root.collection(name),name);}
  records.sort((a,b)=>a.path.localeCompare(b.path,"en"));
  return {version:1,sourceProject,capturedAt:new Date().toISOString(),consistentWithPausedWriters:true,count:records.length,counts,records,recordsSha256:sha(JSON.stringify(records))};
}
async function restoreCreateOnly({backup,db,targetProject,targetPrefix,Timestamp,GeoPoint,dryRun=true}){
  // Production promotion is a separate approved migration; test data is never promoted.
  if(!["g2-member-test","demo-g2-member"].includes(targetProject)||db.projectId!==targetProject||!/^restoreRehearsals\/[a-f0-9-]{36}$/.test(targetPrefix||""))throw Error("Restore allowed only in a fresh test namespace");
  if(sha(JSON.stringify(backup.records))!==backup.recordsSha256||backup.count!==backup.records.length)throw Error("Backup manifest mismatch");
  const decoded=[],paths=new Set();
  const mapped={doc:p=>db.doc(targetPrefix+"/"+p)};
  for(const r of backup.records){validPath(r.path);if(paths.has(r.path))throw Error("Duplicate path");paths.add(r.path);decoded.push({ref:db.doc(targetPrefix+"/"+r.path),data:decode(r.data,{Timestamp,GeoPoint,db:mapped})});}
  for(const r of decoded)if((await r.ref.get()).exists)throw Error("Restore target collision; no overwrite permitted");
  if(dryRun)return {dryRun:true,count:decoded.length,recordsSha256:backup.recordsSha256};
  // Each create has a precondition. Partial failures preserve completed records;
  // use a new empty namespace on retry; never delete or merge a partial restore.
  for(const r of decoded)await r.ref.create(r.data);
  return {dryRun:false,count:decoded.length,recordsSha256:backup.recordsSha256};
}
function migrationAudit(records){
  const findings={members:0,missingMonth:0,invalidBalance:0,legacyAuthority:0,invalidIdentity:0,trialMarkers:0,collections:{}};
  const manifest=[];
  for(const r of records){
    findings.collections[r.path.split("/")[0]]=(findings.collections[r.path.split("/")[0]]||0)+1;
    if(r.path.split("/").length===2&&r.path.startsWith("users/")){
      const p=r.data;findings.members++;
      if(!/^U[0-9a-f]{32}$/i.test(r.path.slice(6)))findings.invalidIdentity++;
      if(!Number.isSafeInteger(p.monthlyPoints)||p.monthlyPoints<0)findings.invalidBalance++;
      if(p.monthlyPoints!==0&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.pointsMonth||""))findings.missingMonth++;
      if(["staff","admin"].includes(p.role))findings.legacyAuthority++;
      if(p.testRunId||p.testRun||p.dummyOnly===true)findings.trialMarkers++;
      manifest.push({path:r.path,sha256:sha(JSON.stringify(encode(p)))});
    }
  }
  return {...findings,memberManifestSha256:sha(JSON.stringify(manifest.sort((a,b)=>a.path.localeCompare(b.path,"en")))),writesPerformed:0,releaseReady:findings.missingMonth===0&&findings.invalidBalance===0&&findings.invalidIdentity===0&&findings.trialMarkers===0};
}
module.exports={encode,decode,seal,unseal,exportData,restoreCreateOnly,migrationAudit};
