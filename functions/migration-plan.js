"use strict";
// Produces a reviewable additive plan. Never connects to or writes production.
const {createHash}=require("node:crypto"),{encode}=require("./data-safety");
const hash=v=>createHash("sha256").update(JSON.stringify(encode(v))).digest("hex");
function planMigration({members,monthId,ownerUid,approvedStaff=[]}){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId||"")||!/^U[0-9a-f]{32}$/i.test(ownerUid||""))throw Error("Owner and explicit balance month required");
  const problems=[],updates=[],authority=[],seen=new Set();
  for(const {id,data:p} of members){
    if(seen.has(id)){problems.push({id,reason:"duplicate_identity"});continue;}seen.add(id);
    if(!/^U[0-9a-f]{32}$/i.test(id)||p.userId&&p.userId!==id){problems.push({id,reason:"identity_requires_manual_mapping"});continue;}
    if(!Number.isSafeInteger(p.monthlyPoints)||p.monthlyPoints<0){problems.push({id,reason:"balance_requires_owner_review"});continue;}
    const patch={};
    if(!p.userId)patch.userId=id;
    if(!p.memberId)patch.memberId="G2-"+id.slice(1).toUpperCase();
    if(!p.pointsMonth)patch.pointsMonth=monthId;
    else if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.pointsMonth)){problems.push({id,reason:"invalid_existing_points_month"});continue;}
    if(p.isActive===undefined)patch.isActive=true;
    if(!p.role)patch.role="member";
    if(!p.nickname&&typeof p.displayName==="string")patch.nickname=p.displayName.slice(0,60);
    if(p.lifetimeHours===undefined)patch.lifetimeHours=0;
    // Never reset or import a balance, copy a trial, or replace an existing ID.
    if(p.testRun||p.testRunId||p.dummyOnly||p.isTest===true){problems.push({id,reason:"trial_data_must_not_promote"});continue;}
    if(Object.keys(patch).length)updates.push({path:"users/"+id,beforeSha256:hash(p),patch});
    if(id===ownerUid){if(p.role!=="admin"||p.isActive===false)problems.push({id,reason:"owner_profile_requires_separate_approval"});else authority.push({userId:id,role:"admin",enabled:true});}
    else if(approvedStaff.includes(id)){if(p.role!=="staff"||p.isActive===false)problems.push({id,reason:"staff_profile_requires_separate_approval"});else authority.push({userId:id,role:"staff",enabled:true});}
  }
  if(!seen.has(ownerUid))problems.push({id:ownerUid,reason:"owner_missing"});
  for(const id of approvedStaff)if(!seen.has(id))problems.push({id,reason:"staff_missing"});
  const projections=members.flatMap(({id,data:p})=>{
    const update=updates.find(x=>x.path==="users/"+id),current={...p,...(update?.patch||{})};
    return current.role==="member"&&current.isActive===true&&current.pointsMonth===monthId?[{userId:id,userSha256:hash(current),nickname:current.nickname||"",points:current.monthlyPoints,monthId}]:[];
  });
  const payload={projections,sourceProject:"member-3e17e",targetProject:"member-3e17e",mode:"in_place_additive_only",monthId,ownerUid,members:seen.size,updates,authority,problems,writesPerformed:0};
  return {...payload,ready:problems.length===0,planSha256:createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
function planRewardMigration(rewards){
  const problems=[],updates=[],seen=new Map();
  for(const {id,data:p} of rewards){
    if(p.isTest===true||p.dummyOnly||p.testRun||p.testRunId){problems.push({id,reason:"trial_reward_must_remain_unchanged"});continue;}
    const type=p.type||({ranking_shirt:[1,2,3].includes(p.rank)?"top"+p.rank:null,discount_10:"discount10"}[p.rewardType]);
    if(!["top1","top2","top3","discount10"].includes(type)||!/^U[0-9a-f]{32}$/i.test(p.userId||"")||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.monthKey||"")){
      problems.push({id,reason:"legacy_reward_requires_manual_mapping"});continue;
    }
    const semantic=p.monthKey+"_"+p.userId;
    if(seen.has(semantic)){problems.push({id,other:seen.get(semantic),reason:"duplicate_monthly_entitlement"});continue;}seen.set(semantic,id);
    if(!["available","active","used","expired"].includes(p.status)){problems.push({id,reason:"unknown_reward_status"});continue;}
    const patch={};if(!p.type)patch.type=type;
    if(!p.benefit)patch.benefit=type==="discount10"?"discount_10_percent":"limited_shirt";
    if(p.status==="active")patch.status=p.usedAt?"used":"available";
    if(p.status==="available"&&p.usedAt)patch.status="used";
    if(Object.keys(patch).length)updates.push({path:"monthlyRewards/"+id,beforeSha256:hash(p),patch});
  }
  return {mode:"preserve_existing_entitlement_ids",updates,problems,ready:problems.length===0,writesPerformed:0};
}

function planHistoryMigration({history,members}){
  const memberIds=new Map(),uids=new Set(members.map(m=>m.id)),updates=[],problems=[];
  for(const m of members)if(m.data.memberId){if(memberIds.has(m.data.memberId))memberIds.set(m.data.memberId,null);else memberIds.set(m.data.memberId,m.id);}
  for(const {id,data:p} of history){
    const candidate=p.userId||p.lineUserId||p.uid||memberIds.get(p.memberId),patch={};
    if(!candidate||!uids.has(candidate)){problems.push({id,reason:"history_identity_requires_manual_mapping"});continue;}
    if(!p.userId)patch.userId=candidate;
    if(!p.createdAt){if(p.timestamp&&typeof p.timestamp.toMillis==="function")patch.createdAt=p.timestamp;else{problems.push({id,reason:"history_timestamp_requires_manual_mapping"});continue;}}
    if(p.points===undefined){if(Number.isSafeInteger(p.point))patch.points=p.point;else{problems.push({id,reason:"history_points_requires_manual_mapping"});continue;}}
    if(Object.keys(patch).length)updates.push({path:"pointTransactions/"+id,beforeSha256:hash(p),patch});
  }
  return {mode:"add_history_query_fields_only",updates,problems,ready:problems.length===0,writesPerformed:0};
}
module.exports={planMigration,planRewardMigration,planHistoryMigration};
