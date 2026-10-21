/* Privileged menus and all writes require live server authority. */
"use strict";
const $=id=>document.getElementById(id);
let db,call,uid,pending=null,scanner=null,busy=false;
const status=s=>{$("status").textContent=s;};
const labels={top1:"เสื้อ Limited อันดับ 1",top2:"เสื้อ Limited อันดับ 2",top3:"เสื้อ Limited อันดับ 3",discount10:"ส่วนลด 10% ใช้ได้หนึ่งบิล"};
const monthAt=d=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit"}).format(d).slice(0,7);
function row(parent,value){const p=document.createElement("p");p.textContent=value;$(parent).append(p);}
async function refresh(){
  $("staff").hidden=true;$("admin").hidden=true;
  const session=await call("memberSession",{}),s=await db.collection("users").doc(uid).get();
  $("registration").hidden=session.registered;$("card").hidden=!session.registered;
  if(!session.registered)return;
  if(!s.exists)throw Error("ไม่พบข้อมูลสมาชิก กรุณาติดต่อแอดมิน");
  const p=s.data();$("name").textContent=p.nickname;$("memberId").textContent=p.memberId;
  $("balance").textContent=`คะแนนเดือน ${p.pointsMonth||"รอตรวจสอบ"}: ${p.monthlyPoints??0}`;
  $("qr").replaceChildren();$("history").replaceChildren();$("rewards").replaceChildren();
  if(!session.active){row("history","บัญชีถูกปิดใช้งาน กรุณาติดต่อแอดมิน");return;}
  $("staff").hidden=!session.capabilities.staff;$("admin").hidden=!session.capabilities.admin;
  new QRCode($("qr"),{text:uid,width:160,height:160});
  const history=await db.collection("pointTransactions").where("userId","==",uid).orderBy("createdAt","desc").limit(30).get();
  history.forEach(d=>row("history",`${d.data().monthId||""} +${d.data().points} แต้ม`));
  const rewards=await db.collection("monthlyRewards").where("userId","==",uid).limit(100).get();
  rewards.forEach(d=>{
    const r=d.data(),[y,m]=(r.monthKey||"").split("-").map(Number),validMonth=Number.isInteger(y)&&Number.isInteger(m)?monthAt(new Date(Date.UTC(y,m,1))):"";
    const usable=r.status==="available"&&validMonth===monthAt(new Date());
    row("rewards",`${r.monthKey} ${labels[r.type]||"สิทธิ์รอตรวจสอบ"} — ${r.status==="used"?"ใช้แล้ว":usable?"พร้อมใช้":validMonth>monthAt(new Date())?"ใช้ได้เดือน "+validMonth:"หมดอายุ"}`);
    if(usable&&labels[r.type]){const qr=document.createElement("div");$("rewards").append(qr);new QRCode(qr,{text:"g2reward:"+d.id,width:160,height:160});}
  });
}
async function action(fn){
  if(busy)return;busy=true;
  const buttons=Array.from(document.querySelectorAll("button"));buttons.forEach(b=>b.disabled=true);
  try{status("กำลังดำเนินการ…");const message=await fn();status(typeof message==="string"?message:"สำเร็จ");}
  catch(e){if(e.code==="permission-denied"||e.code==="unauthenticated"){$("staff").hidden=true;$("admin").hidden=true;}status(e.message||"เชื่อมต่อไม่ได้ กรุณาลองรายการเดิมอีกครั้ง");}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);}
}
$("scan").onclick=()=>action(async()=>{
  if(scanner)await scanner.clear();
  scanner=new Html5QrcodeScanner("reader",{fps:10,qrbox:220},false);
  scanner.render(async value=>{
    if(/^U[0-9a-f]{32}$/i.test(value))$("target").value=value;
    else if(value.startsWith("g2reward:")){$("rewardId").value=value.slice(9);$("billRef").value="";}
    else {status("QR ไม่ใช่บัตรสมาชิกหรือสิทธิ์รางวัล G2");return;}
    await scanner.clear();scanner=null;status("สแกนสำเร็จ ตรวจสอบรายการก่อนบันทึก");
  },()=>{});return "กำลังสแกน QR";
});
$("register").onclick=()=>action(async()=>{await call("memberRegister",{nickname:$("nickname").value.trim(),phone:$("phone").value.trim()});await refresh();});
$("add").onclick=()=>action(async()=>{
  const data={userId:$("target").value.trim(),points:Number($("points").value),monthId:monthAt(new Date())},key=JSON.stringify(data);
  if(pending&&pending.key!==key)throw Error("มีรายการค้างอยู่ กด 'ส่งรายการค้างเดิม' ก่อนทำรายการใหม่");
  if(!pending){pending={key,data:{...data,requestId:crypto.randomUUID()}};sessionStorage.setItem("g2PendingManual",JSON.stringify(pending));}
  return sendPending();
});
async function sendPending(){
  if(!pending)throw Error("ไม่มีรายการค้าง");
  let result;
  try{result=await call("memberAddPoints",pending.data);}
  catch(e){if(e.code==="failed-precondition"&&e.message==="Manual request month expired; no points recorded"){pending=null;sessionStorage.removeItem("g2PendingManual");throw Error("รายการเก่าหมดอายุและยังไม่ได้เพิ่มแต้ม สามารถทำรายการใหม่ได้");}throw e;}
  pending=null;sessionStorage.removeItem("g2PendingManual");await refresh();
  return result.duplicate?"รายการนี้บันทึกแล้ว ไม่เพิ่มแต้มซ้ำ":"บันทึกแต้มสำเร็จ";
}
$("retry").onclick=()=>action(sendPending);
$("open").onclick=()=>action(()=>call("memberOpenMonth",{month:$("month").value}));
$("close").onclick=()=>action(async()=>{await call("memberCloseMonth",{month:$("month").value});await refresh();return "ปิดรอบและเก็บประวัติสำเร็จ";});
$("redeem").onclick=()=>action(async()=>{
  const result=await call("memberRedeemReward",{rewardId:$("rewardId").value.trim(),billRef:$("billRef").value.trim()});
  await refresh();return result.duplicate?"สิทธิ์นี้ใช้แล้ว ห้ามส่งมอบเสื้อหรือให้ส่วนลดซ้ำ":result.type==="discount10"?"บันทึกใช้ส่วนลดแล้ว สำหรับบิล "+result.billRef+" เท่านั้น":"บันทึกส่งมอบเสื้อ Limited แล้ว";
});
$("setStaff").onclick=()=>action(async()=>{await call("memberSetStaff",{userId:$("staffId").value.trim(),role:$("staffRole").value,isActive:$("staffActive").checked});await refresh();});
(async()=>{try{
  const c=window.G2_MEMBER_CONFIG;if(!c?.firebase||!c.liffId)throw Error("ยังไม่ได้ตั้งค่า Firebase และ LINE");
  firebase.initializeApp(c.firebase);db=firebase.firestore();
  if(c.backendUrl){
    if(c.firebase.projectId!=="g2-member-test"||c.backendUrl!==location.origin)throw Error("Invalid test backend");
    call=async(n,d)=>{const headers={"Content-Type":"application/json"};const user=firebase.auth().currentUser;if(user)headers.Authorization="Bearer "+await user.getIdToken();const response=await fetch(c.backendUrl+"/api/"+n,{method:"POST",headers,body:JSON.stringify(d)});const result=await response.json();if(!response.ok){const e=Error(result.message||result.error);e.code=result.error;throw e;}return result.data;};
  }else{const functions=firebase.app().functions("asia-southeast1");call=async(n,d)=>{try{return (await functions.httpsCallable(n)(d)).data;}catch(e){e.code=e.code?.replace(/^functions\//,"");throw e;}};}
  await liff.init({liffId:c.liffId});if(!liff.isLoggedIn()){liff.login();return;}
  const idToken=liff.getIDToken();if(!idToken)throw Error("LINE ต้องเปิดสิทธิ์ openid");
  const login=await call("memberLineLogin",{idToken});await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
  uid=(await firebase.auth().signInWithCustomToken(login.customToken)).user.uid;
  const saved=sessionStorage.getItem("g2PendingManual");
  if(saved){try{const p=JSON.parse(saved);if(!p?.data?.requestId||!p.key)throw Error("Invalid pending record");pending=p;}catch{throw Error("ข้อมูลรายการค้างไม่สมบูรณ์ กรุณาให้แอดมินตรวจประวัติก่อนทำรายการใหม่");}}
  await refresh();
  const board=await db.collection("publicLeaderboard").where("monthId","==",monthAt(new Date())).orderBy("points","desc").limit(100).get();let rank=0;board.forEach(d=>row("leaderboard",`${++rank}. ${d.data().nickname} ${d.data().points} แต้ม`));
  const results=await db.collection("seasonResults").orderBy("monthId","desc").limit(6).get();
  results.forEach(d=>row("results",`${d.id}: ${(d.data().top3||[]).map(p=>`${p.rank}. ${p.nickname} ${p.points} แต้ม`).join(" / ")}`));status(pending?"มีรายการเพิ่มแต้มค้าง กดส่งรายการค้างเดิม":"เข้าสู่ระบบแล้ว");
}catch(e){status(e.message);}})();
