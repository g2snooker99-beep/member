"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {backupRootAdapter}=require("../backup-root-adapter");
const {exportData}=require("../data-safety");
function fixture(prefix="") {
 const rows=new Map([["monthlyLeaderboards/2026-09",{month:"2026-09"}],["monthlyLeaderboards/2026-09/members/memberA",{points:9}],["monthlyLeaderboards/2026-09/members/memberB",{points:4}],["monthlyLeaderboards/empty/members/memberC/events/event1",{points:1}]]);
 const full=p=>prefix?prefix+"/"+p:p,relative=p=>prefix?p.slice(prefix.length+1):p;
 const all=[...rows.keys()];
 const doc=p=>({id:p.split("/").at(-1),path:p,get:async()=>snapshot(p),listCollections:async()=>[...new Set(all.filter(k=>k.startsWith(relative(p)+"/")).map(k=>k.slice(relative(p).length+1).split("/")[0]))].map(id=>collection(p+"/"+id))});
 const snapshot=p=>({ref:{path:p},exists:rows.has(relative(p)),data:()=>rows.get(relative(p))});
 const collection=p=>({id:p.split("/").at(-1),listDocuments:async()=>[...new Set(all.filter(k=>k.startsWith(relative(p)+"/")).map(k=>k.slice(relative(p).length+1).split("/")[0]))].map(id=>doc(p+"/"+id))});
 const db={collection,getAll:async(...refs)=>refs.map(r=>snapshot(r.path)).reverse()};
 return {db,root:{path:prefix,collection:name=>collection(full(name))},paths:all.sort((a,b)=>a.localeCompare(b,"en"))};
}
for(const prefix of ["","restoreRehearsals/493520e1-c9cb-47c3-a837-9954e7732e45"]){
 test("accelerated traversal preserves real nested paths and missing ancestors: "+(prefix||"source"),async()=>{
  const {db,root,paths}=fixture(prefix),options={sourceProject:"g2-member-test",collections:["monthlyLeaderboards"],frozen:true};
  const direct=await exportData({...options,root}),fast=await exportData({...options,root:await backupRootAdapter(db,prefix)});
  assert.deepEqual(fast.records.map(r=>r.path),paths);assert.deepEqual(fast.records,direct.records);assert.equal(fast.recordsSha256,direct.recordsSha256);assert.equal(fast.count,4);
 });
}
test("missing collection ID fails before producing an archive",async()=>{const root=await backupRootAdapter({collection:()=>({listDocuments:async()=>[]})});assert.throws(()=>root.collection("monthlyLeaderboards"),/collection ID/);});
test("missing batched snapshot fails instead of omitting data",async()=>{const {db}=fixture();db.getAll=async()=>[];const root=await backupRootAdapter(db);await assert.rejects(root.collection("monthlyLeaderboards").listDocuments(),/snapshot missing/);});
