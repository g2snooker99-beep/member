/* All mutations go through authenticated server functions. No client roles/PIN. */
"use strict";
const $=id=>document.getElementById(id);
let db,call,uid,pending=null;
const status=s=>{$("status").textContent=s;};
function row(parent,value){const p=document.createElement("p");p.textContent=value;$(parent).append(p);}
async function refresh(){
  const s=await db.collection("users").doc(uid).get();
  $("registration").hidden=s.exists;$("card").hidden=!s.exists;
  if(!s.exists)return;
  const p=s.data();$("name").textContent=p.nickname;$("memberId").textContent=p.memberId;
  $("balance").textContent=`คะแนนเดือน ${p.pointsMonth||"รอตรวจสอบ"}: ${p.monthlyPoints||0}`;
  $("staff").hidden=!(p.isActive&&["staff","admin"].includes(p.role));$("admin").hidden=!(p.isActive&&p.role==="admin");
  $("qr").replaceChildren();new QRCode($("qr"),{text:uid,width:160,height:160});
  $("history").replaceChildren();const history=await db.collection("pointTransactions").where("userId","==",uid).orderBy("createdAt","desc").limit(30).get();
  history.forEach(d=>row("history",`${d.data().monthId||""} +${d.data().points} แต้ม`));
  $("rewards").replaceChildren();const rewards=await db.collection("monthlyRewards").where("userId","==",uid).limit(30).get();rewards.forEach(d=>row("rewards",`${d.data().monthKey} ${d.data().type} ${d.data().status}`));
}
async function action(fn){try{status("กำลังดำเนินการ…");await fn();status("สำเร็จ");}catch(e){status(e.message||"เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง");}}
$("register").onclick=()=>action(async()=>{await call("memberRegister",{nickname:$("nickname").value.trim(),phone:$("phone").value.trim()});await refresh();});
$("add").onclick=()=>action(async()=>{
  const data={userId:$("target").value.trim(),points:Number($("points").value)};
  const key=JSON.stringify(data);
  if(pending&&pending.key!==key)throw Error("มีรายการค้างส่ง กรุณาส่งรายการเดิมก่อนเปลี่ยนข้อมูล");
  if(!pending){pending={key,data:{...data,requestId:crypto.randomUUID()}};sessionStorage.setItem("g2PendingManual",JSON.stringify(pending));}
  await call("memberAddPoints",pending.data);pending=null;sessionStorage.removeItem("g2PendingManual");await refresh();
});
$("open").onclick=()=>action(()=>call("memberOpenMonth",{month:$("month").value}));
$("close").onclick=()=>action(()=>call("memberCloseMonth",{month:$("month").value}));
(async()=>{try{
  const c=window.G2_MEMBER_CONFIG;if(!c?.firebase||!c.liffId)throw Error("ยังไม่ได้ตั้งค่าระบบทดสอบ Firebase และ LINE");
  firebase.initializeApp(c.firebase);db=firebase.firestore();const functions=firebase.app().functions("asia-southeast1");call=async(n,d)=>(await functions.httpsCallable(n)(d)).data;
  await liff.init({liffId:c.liffId});if(!liff.isLoggedIn()){liff.login();return;}
  const idToken=liff.getIDToken();if(!idToken)throw Error("LINE ต้องเปิดสิทธิ์ openid");
  const login=await call("memberLineLogin",{idToken});await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
  uid=(await firebase.auth().signInWithCustomToken(login.customToken)).user.uid;
  const saved=sessionStorage.getItem("g2PendingManual");if(saved)pending=JSON.parse(saved);
  await refresh();const results=await db.collection("seasonResults").orderBy(firebase.firestore.FieldPath.documentId(),"desc").limit(6).get();
  results.forEach(d=>row("results",`${d.id}: ${(d.data().top3||[]).map(p=>`${p.rank}. ${p.nickname} ${p.points} แต้ม`).join(" / ")}`));status("เข้าสู่ระบบแล้ว");
}catch(e){status(e.message);}})();
