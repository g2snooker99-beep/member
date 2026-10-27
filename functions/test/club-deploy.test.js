"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process");
test("club rollout deploys only the read callable then Hosting; failed callable prevents Hosting",()=>{
 const script=path.resolve(__dirname,"../../scripts/deploy-sport-club.sh");
 for(const failFunction of [false,true]){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"g2-club-deploy-test-")),bin=path.join(root,"bin"),log=path.join(root,"calls.jsonl");
  fs.mkdirSync(bin);fs.mkdirSync(path.join(root,"functions"));
  try{
   const stub=String.raw`#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path"),name=path.basename(process.argv[1]),args=process.argv.slice(2);
fs.appendFileSync(process.env.G2_FAKE_LOG,JSON.stringify({name,args})+"\n");
if(name==="git")console.log("tested-sha");
if(name==="gcloud"&&args[0]==="auth")console.log("g2snooker99@gmail.com");
if(name==="gcloud"&&args[0]==="functions")console.log(JSON.stringify({serviceConfig:{serviceAccountEmail:"g2-member-api@member-3e17e.iam.gserviceaccount.com",environmentVariables:{MEMBER_LINE_CHANNEL_ID:"2010084269",MEMBER_OWNER_LINE_UID:"U"+"a".repeat(32),PRIVATE_NOT_COPIED:"secret"}}}));
if(name==="firebase"&&process.env.G2_FAIL_FUNCTION==="true"&&args.includes("functions:secure-member:memberClubData"))process.exit(13);
`;
   for(const name of ["git","gcloud","npm","firebase"]){const file=path.join(bin,name);fs.writeFileSync(file,stub);fs.chmodSync(file,0o755);}
   const result=spawnSync("bash",[script,"tested-sha"],{cwd:root,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,G2_FAKE_LOG:log,G2_FAIL_FUNCTION:String(failFunction)},encoding:"utf8"});
   assert.equal(result.status,failFunction?13:0,result.stdout+result.stderr);
   const calls=fs.readFileSync(log,"utf8").trim().split("\n").map(JSON.parse);
   const deploys=calls.filter(x=>x.name==="firebase");
   assert.equal(deploys.length,failFunction?1:2);
   assert.deepEqual(deploys[0].args,["deploy","--only","functions:secure-member:memberClubData","--project","member-3e17e","--non-interactive"]);
   if(!failFunction)assert.deepEqual(deploys[1].args,["deploy","--only","hosting","--project","member-3e17e","--non-interactive"]);
   const params=fs.readFileSync(path.join(root,"functions/.env.member-3e17e"),"utf8");
   assert.match(params,/MEMBER_MUTATIONS_ENABLED=false/);assert.equal(params.includes("PRIVATE_NOT_COPIED"),false);
   assert.equal((result.stdout+result.stderr).includes("secret"),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 }
});
