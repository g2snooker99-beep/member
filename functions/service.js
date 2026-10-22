"use strict";
const {createHash}=require("node:crypto");
const UID=/^U[0-9a-f]{32}$/i, MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const monthAt=d=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit"}).format(d).slice(0,7);
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function buildService({db,auth,FieldValue,FieldPath,channelId,ownerUid,verifyLine,sandboxOnly=false,now=()=>new Date()}){
  const stamp=()=>FieldValue.serverTimestamp();
  async function identity(uid,roles,tx){
    if(!UID.test(uid||""))fail("unauthenticated","LINE sign-in required");
    const ref=db.collection("users").doc(uid),s=tx?await tx.get(ref):await ref.get();
    if(!s.exists||s.data().isActive!==true||!roles.includes(s.data().role))fail("permission-denied","Active authorized account required");
    if(["staff","admin"].includes(s.data().role)){
      // Legacy users.role was publicly writable: it is not trusted authority.
      const acl=db.collection("memberStaffAccess").doc(uid),access=tx?await tx.get(acl):await acl.get();
      if(!access.exists||access.data().enabled!==true||access.data().role!==s.data().role)fail("permission-denied","Server-approved staff access required");
      if(s.data().role==="admin"&&uid!==ownerUid)fail("permission-denied","Pinned owner identity required");
    }
    return s;
  }
  async function exchange(idToken){
    if(!/^\d{5,20}$/.test(channelId||""))fail("failed-precondition","LINE channel missing");
    if(typeof idToken!=="string"||idToken.length<20||idToken.length>8192)fail("invalid-argument","Invalid token");
    const c=await verifyLine(idToken,channelId);
    if(c.iss!=="https://access.line.me"||String(c.aud)!==channelId||!UID.test(c.sub||"")||!Number.isFinite(c.exp)||c.exp*1000<=now().getTime())fail("unauthenticated","Invalid LINE identity");
    const old=await db.collection("users").doc(c.sub).get();
    if(old.exists&&old.data().isActive!==true)fail("permission-denied","Account inactive");
    // Roles are never taken from the browser or stored in long-lived claims.
    return {customToken:await auth.createCustomToken(c.sub)};
  }
  async function register(uid,d){
    if(!UID.test(uid||""))fail("unauthenticated","LINE sign-in required");
    if(typeof d.nickname!=="string"||!d.nickname.trim()||d.nickname.length>60||!/^0\d{8,9}$/.test(d.phone||""))fail("invalid-argument","Invalid profile");
    return db.runTransaction(async tx=>{
      const ref=db.collection("users").doc(uid),s=await tx.get(ref);
      if(s.exists)return {memberId:s.data().memberId,existing:true};
      const memberId="G2-"+uid.slice(1).toUpperCase();
      tx.create(ref,{userId:uid,memberId,nickname:d.nickname.trim(),phone:d.phone,role:"member",isActive:true,monthlyPoints:0,lifetimeHours:0,pointsMonth:monthAt(now()),createdAt:stamp(),updatedAt:stamp()});
      return {memberId};
    });
  }
  async function session(uid){
    if(!UID.test(uid||""))fail("unauthenticated","LINE sign-in required");
    const user=await db.collection("users").doc(uid).get();
    if(!user.exists)return {registered:false,capabilities:{staff:false,admin:false}};
    let staff=false,admin=false;
    try{const s=await identity(uid,["staff","admin"]);staff=true;admin=s.data().role==="admin";}catch(e){if(e.code!=="permission-denied")throw e;}
    return {registered:true,active:user.data().isActive===true,capabilities:{staff,admin}};
  }
  async function addPoints(uid,d){
    if(!MONTH.test(d.monthId||""))fail("invalid-argument","Invalid request month");
    if(!UID.test(d.userId||"")||!/^[a-f0-9-]{36}$/i.test(d.requestId||"")||!Number.isInteger(d.points)||d.points<1||d.points>3)fail("invalid-argument","Member, UUID and 1–3 points required");
    const month=d.monthId,fingerprint=createHash("sha256").update(JSON.stringify([uid,d.userId,d.points,month])).digest("hex");
    const receipt=db.collection("pointTransactions").doc("manual_"+d.requestId),ref=db.collection("users").doc(d.userId),gate=db.collection("posAwardMonths").doc(month);
    return db.runTransaction(async tx=>{
      await identity(uid,["staff","admin"],tx);
      if(sandboxOnly){const test=await tx.get(db.collection("sandboxMembers").doc(d.userId));if(!test.exists||test.data().dummyOnly!==true||test.data().enabled!==true)fail("permission-denied","Approved dummy members only");}
      const [r,m,g]=await Promise.all([tx.get(receipt),tx.get(ref),tx.get(gate)]);
      if(r.exists){if(r.data().fingerprint!==fingerprint)fail("already-exists","Conflicting retry");return {duplicate:true};}
      if(month!==monthAt(now()))fail("failed-precondition","Manual request month expired; no points recorded");
      if(!g.exists||g.data().state!=="open")fail("failed-precondition","Month is not open");
      if(!m.exists||m.data().role!=="member"||m.data().isActive!==true)fail("permission-denied","Active member required");
      const p=m.data();
      if(p.pointsMonth!==month&&p.monthlyPoints!==0)fail("failed-precondition","Previous balance needs close/migration");
      const points=p.pointsMonth===month?p.monthlyPoints:0;
      if(!Number.isSafeInteger(points)||points<0||!Number.isSafeInteger(points+d.points))fail("failed-precondition","Invalid balance");
      tx.update(ref,{monthlyPoints:points+d.points,pointsMonth:month,updatedAt:stamp()});
      tx.set(db.collection("publicLeaderboard").doc(createHash("sha256").update(d.userId).digest("hex")),{nickname:p.nickname||"",points:points+d.points,monthId:month});
      tx.create(receipt,{userId:d.userId,staffId:uid,points:d.points,monthId:month,type:"add",source:"manual",fingerprint,createdAt:stamp(),timestamp:stamp()});
      return {duplicate:false};
    });
  }
  async function openMonth(uid,month){
    if(!MONTH.test(month||"")||month!==monthAt(now()))fail("invalid-argument","Current Bangkok month only");
    return db.runTransaction(async tx=>{
      await identity(uid,["admin"],tx);
      const ref=db.collection("posAwardMonths").doc(month),s=await tx.get(ref);
      if(s.exists&&s.data().state!=="open")fail("failed-precondition","Cannot reopen closed month");
      if(!s.exists)tx.create(ref,{state:"open",openedBy:uid,openedAt:stamp()});
      return {state:"open"};
    });
  }

  function rankMember(top3,p){
    if(p.eligible!==true||p.points<=0)return;
    top3.push({...p});top3.sort((a,b)=>b.points-a.points||(a.joinedAtMillis||0)-(b.joinedAtMillis||0)||a.userId.localeCompare(b.userId,"en"));top3.splice(3);
  }
  async function previewMonth(uid,month){
    if(!MONTH.test(month||"")||month>monthAt(now()))fail("invalid-argument","Current or completed Bangkok month only");
    await identity(uid,["admin"]);
    const gate=await db.collection("posAwardMonths").doc(month).get(),state=gate.exists?gate.data().state:"unopened";
    if(!["unopened","open","closed"].includes(state))fail("failed-precondition","Month close is in progress; resume the existing close");
    const source=state==="closed"?db.collection("seasonResults").doc(month).collection("members"):db.collection("users");
    let cursor=null,memberCount=0,eligibleMembers=0,totalPoints=0,atLeast15=0;const top3=[];
    for(;;){
      let q=source.orderBy(FieldPath.documentId()).limit(100);if(cursor)q=q.startAfter(cursor);
      const page=await q.get();if(page.empty)break;
      for(const row of page.docs){
        const p=row.data();if(state!=="closed"&&p.role!=="member")continue;
        if(state!=="closed"&&!p.pointsMonth&&p.monthlyPoints>0)fail("failed-precondition","Legacy balance needs migration");
        const points=state==="closed"?p.points:p.pointsMonth===month?p.monthlyPoints:0;
        if(!Number.isSafeInteger(points)||points<0)fail("failed-precondition","Invalid balance");
        memberCount++;totalPoints+=points;if(!Number.isSafeInteger(totalPoints))fail("failed-precondition","Invalid total balance");
        const eligible=state==="closed"?p.eligible===true:p.isActive===true;
        if(eligible){eligibleMembers++;if(points>=15)atLeast15++;}
        rankMember(top3,{userId:row.id,nickname:p.nickname||"",points,eligible,joinedAtMillis:state==="closed"?p.joinedAtMillis||0:p.createdAt?.toMillis?.()||0});
      }
      cursor=page.docs.at(-1);
    }
    // Recheck authority and the gate after paging; previews never freeze or reset scores.
    await identity(uid,["admin"]);
    const after=await db.collection("posAwardMonths").doc(month).get();
    if((after.exists?after.data().state:"unopened")!==state)fail("failed-precondition","Month state changed; refresh preview");
    return {monthId:month,state,provisional:state!=="closed",memberCount,eligibleMembers,totalPoints,
      top3:top3.map(({nickname,points},i)=>({rank:i+1,nickname,points})),shirtCount:top3.length,
      discountCount:atLeast15-top3.filter(p=>p.points>=15).length,canClose:state==="open"&&month<monthAt(now())};
  }
  async function closeMonth(uid,month){
    if(!MONTH.test(month||"")||month>=monthAt(now()))fail("invalid-argument","Completed Bangkok month only");
    const gate=db.collection("posAwardMonths").doc(month),result=db.collection("seasonResults").doc(month),snapshots=result.collection("members");
    const start=await db.runTransaction(async tx=>{
      await identity(uid,["admin"],tx);const s=await tx.get(gate);
      if(!s.exists)fail("failed-precondition","Migrate/open month first");
      if(s.data().state==="closed")return false;
      if(!["open","closing"].includes(s.data().state))fail("failed-precondition","Invalid gate");
      tx.update(gate,{state:"closing",closingAt:stamp(),closedBy:uid});return true;
    });
    if(!start)return {state:"closed",duplicate:true};
    // Read/write the same gate as POS/manual grants. Deterministic snapshots
    // let a timed-out close resume without erasing a new month's points.
    let cursor=null;
    for(;;){
      let q=db.collection("users").orderBy(FieldPath.documentId()).limit(100);if(cursor)q=q.startAfter(cursor);
      const page=await q.get();if(page.empty)break;
      for(const row of page.docs)await db.runTransaction(async tx=>{
        await identity(uid,["admin"],tx);
        const target=snapshots.doc(row.id),[g,u,s]=await Promise.all([tx.get(gate),tx.get(row.ref),tx.get(target)]);
        if(g.data().state!=="closing")fail("failed-precondition","Close not active");
        if(s.exists||!u.exists||u.data().role!=="member")return;
        const p=u.data();if(!p.pointsMonth&&p.monthlyPoints>0)fail("failed-precondition","Legacy balance needs migration");
        const points=p.pointsMonth===month?p.monthlyPoints:0;if(!Number.isSafeInteger(points)||points<0)fail("failed-precondition","Invalid balance");
        tx.create(target,{userId:row.id,nickname:p.nickname||"",memberId:p.memberId||"",points,eligible:p.isActive===true,joinedAtMillis:p.createdAt?.toMillis?.()||0});
        if(p.pointsMonth===month)tx.update(row.ref,{monthlyPoints:0,updatedAt:stamp()});
      });
      cursor=page.docs.at(-1);
    }
    // Preserve the legacy tie rule (earlier registration), then UID as the
    // deterministic final tie break. Read every tied row across page boundaries.
    const top3=[];cursor=null;
    let finished=false;
    while(!finished){
      let q=snapshots.orderBy("points","desc").orderBy(FieldPath.documentId()).limit(100);if(cursor)q=q.startAfter(cursor);
      const page=await q.get();if(page.empty)break;
      for(const row of page.docs){
        const p=row.data();if(top3.length===3&&p.points<top3[2].points){finished=true;break;}
        rankMember(top3,p);
      }
      if(page.docs.at(-1).data().points<=0)break;cursor=page.docs.at(-1);
    }
    top3.forEach((p,i)=>p.rank=i+1);
    cursor=null;
    for(;;){
      let q=snapshots.orderBy(FieldPath.documentId()).limit(100);if(cursor)q=q.startAfter(cursor);
      const page=await q.get();if(page.empty)break;
      for(const row of page.docs){
        const p=row.data(),top=top3.find(x=>x.userId===p.userId);
        if(p.eligible!==true||(!top&&p.points<15))continue;
        const type=top?"top"+top.rank:"discount10",reward=db.collection("monthlyRewards").doc(month+"_"+p.userId+"_"+type);
        await db.runTransaction(async tx=>{
          await identity(uid,["admin"],tx);const [g,r]=await Promise.all([tx.get(gate),tx.get(reward)]);
          if(g.data().state!=="closing")fail("failed-precondition","Close not active");
          if(!r.exists)tx.create(reward,{userId:p.userId,monthKey:month,type,benefit:top?"limited_shirt":"discount_10_percent",status:"available",createdAt:stamp()});
        });
      }cursor=page.docs.at(-1);
    }
    return db.runTransaction(async tx=>{
      await identity(uid,["admin"],tx);const g=await tx.get(gate);
      if(g.data().state==="closed")return {state:"closed",duplicate:true};
      if(g.data().state!=="closing")fail("failed-precondition","Invalid gate");
      tx.set(result,{monthId:month,top3:top3.map(({nickname,points,rank})=>({nickname,points,rank})),closedAt:stamp()});tx.update(gate,{state:"closed",closedAt:stamp()});return {state:"closed",top3};
    });
  }
  async function redeem(uid,d){
    if(typeof d.rewardId!=="string"||!d.rewardId||d.rewardId.length>150||d.rewardId.includes("/"))fail("invalid-argument","Invalid reward");
    const billRef=typeof d.billRef==="string"?d.billRef.trim().toUpperCase():"";
    if(billRef&&!/^[A-Z0-9_-]{1,80}$/.test(billRef))fail("invalid-argument","Invalid bill reference");
    const ref=db.collection("monthlyRewards").doc(d.rewardId);
    return db.runTransaction(async tx=>{
      await identity(uid,["staff","admin"],tx);const r=await tx.get(ref);
      if(!r.exists)fail("invalid-argument","Reward missing");
      const reward=r.data();
      if(reward.isTest===true||reward.dummyOnly||reward.testRun||reward.testRunId)fail("failed-precondition","Trial rewards cannot be redeemed");
      if(reward.status!=="used"&&reward.usedAt)fail("failed-precondition","Previously used reward requires review");
      if(!["top1","top2","top3","discount10"].includes(reward.type)||!UID.test(reward.userId||""))fail("failed-precondition","Invalid reward type or member");
      if(reward.type==="discount10"&&!billRef)fail("invalid-argument","Bill reference required for discount");
      if(reward.status==="used"){
        if((reward.billRef||"")!==billRef)fail("already-exists","Reward already used with another bill/reference");
        return {duplicate:true,status:"used",billRef:reward.billRef||"",type:reward.type};
      }
      const member=await tx.get(db.collection("users").doc(reward.userId));
      if(!member.exists||member.data().isActive!==true||member.data().role!=="member")fail("permission-denied","Active member required");
      if(sandboxOnly){const s=await tx.get(db.collection("sandboxMembers").doc(reward.userId));if(!s.exists||s.data().dummyOnly!==true||s.data().enabled!==true)fail("permission-denied","Approved dummy members only");}
      if(!MONTH.test(reward.monthKey||""))fail("failed-precondition","Invalid reward month");
      const [year,month]=reward.monthKey.split("-").map(Number),next=new Date(Date.UTC(year,month,1));
      if(reward.status!=="available"||monthAt(next)!==monthAt(now()))fail("failed-precondition","Reward expired or not active");
      const audit=db.collection("rewardRedemptions").doc(d.rewardId);
      const bill=reward.type==="discount10"?db.collection("rewardBillClaims").doc(createHash("sha256").update(billRef).digest("hex")):null;
      const [prior,claimed]=await Promise.all([tx.get(audit),bill?tx.get(bill):Promise.resolve(null)]);
      if(prior.exists||claimed?.exists)fail("already-exists","Reward or bill already redeemed");
      tx.update(ref,{status:"used",usedAt:stamp(),usedBy:uid,billRef});
      const receipt={rewardId:d.rewardId,userId:reward.userId,type:reward.type,billRef,usedBy:uid,usedAt:stamp()};
      tx.create(audit,receipt);if(bill)tx.create(bill,receipt);
      return {duplicate:false,status:"used",billRef,type:reward.type};
    });
  }
  async function setStaff(uid,d){
    if(!UID.test(d.userId||"")||!["member","staff"].includes(d.role)||typeof d.isActive!=="boolean"||uid===d.userId)fail("invalid-argument","Another member/staff account required");
    return db.runTransaction(async tx=>{
      await identity(uid,["admin"],tx);const ref=db.collection("users").doc(d.userId),old=await tx.get(ref);
      if(!old.exists||old.data().role==="admin")fail("permission-denied","Administrator accounts require separate recovery process");
      tx.update(ref,{role:d.role,isActive:d.isActive,updatedAt:stamp()});
      tx.set(db.collection("memberStaffAccess").doc(d.userId),{role:d.role,enabled:d.role==="staff"&&d.isActive,approvedBy:uid,updatedAt:stamp()});
      if(d.role!=="member"||!d.isActive)tx.delete(db.collection("publicLeaderboard").doc(createHash("sha256").update(d.userId).digest("hex")));
      tx.create(db.collection("memberAudit").doc(),{actor:uid,target:d.userId,action:"setStaff",role:d.role,isActive:d.isActive,createdAt:stamp()});
      return {updated:true};
    });
  }
  return {exchange,register,session,addPoints,openMonth,previewMonth,closeMonth,redeem,setStaff,identity};
}
module.exports={buildService,monthAt};
