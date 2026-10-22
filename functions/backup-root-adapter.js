"use strict";
// Read-only accelerated traversal for operator backups. Keep collection IDs and
// map snapshots by path: getAll order must not determine document ownership.
async function backupRootAdapter(db,prefix="") {
 function collection(col) {
  if(typeof col.id!=="string"||!col.id||col.id.includes("/"))throw Error("Backup collection ID missing or invalid");
  return {id:col.id,async listDocuments(){
   const refs=await col.listDocuments(),snapshots=new Map(),children=new Map();
   for(let n=0;n<refs.length;n+=100)for(const s of await db.getAll(...refs.slice(n,n+100)))snapshots.set(s.ref.path,s);
   let index=0;
   await Promise.all(Array.from({length:Math.min(16,refs.length)},async()=>{while(index<refs.length){const ref=refs[index++];children.set(ref.path,await ref.listCollections());}}));
   return refs.map(ref=>{
    if(!snapshots.has(ref.path))throw Error("Backup document snapshot missing");
    return {id:ref.id,get:async()=>snapshots.get(ref.path),listCollections:async()=>children.get(ref.path).map(collection)};
   });
  }};
 }
 return {path:prefix,collection:name=>collection(db.collection(prefix?prefix+"/"+name:name))};
}
module.exports={backupRootAdapter};
