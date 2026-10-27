/* Privileged menus and all writes require live server authority. */
"use strict";
const $=id=>document.getElementById(id);
let db,call,uid,pending=null,scanner=null,busy=false,currentView="home",currentActive=false,profileVersion=0;
let loadedViews={},loadingViews={},memberProfile=null,historyVersion=0,historyState=null;
let clubVersion=0,clubBoards=new Map(),clubStats=null,statsTask=null,linePhoto="",boardRowsShown=20,boardGeneration=0;
const status=s=>{$("status").textContent=s;};
const labels={top1:"เสื้อ Limited อันดับ 1",top2:"เสื้อ Limited อันดับ 2",top3:"เสื้อ Limited อันดับ 3",discount10:"ส่วนลด 10% ใช้ได้หนึ่งบิล"};
const monthAt=d=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit"}).format(d).slice(0,7);
function row(parent,value){const p=document.createElement("p");p.textContent=value;$(parent).append(p);return p;}

const views=["home","qr","rewards","history","board"];
function node(tag,text,className=""){const el=document.createElement(tag);el.textContent=text;el.className=className;return el;}
function monthLabel(value){
 if(!/^\d{4}-\d{2}$/.test(value||""))return "รอตรวจสอบรอบเดือน";
 const [y,m]=value.split("-").map(Number);if(m<1||m>12)return "รอตรวจสอบรอบเดือน";
 return new Date(Date.UTC(y,m-1,1)).toLocaleDateString("th-TH",{month:"long",year:"numeric",timeZone:"UTC"});
}
function stamp(value){
 const d=value&&typeof value.toDate==="function"?value.toDate():null;
 return d&&Number.isFinite(d.getTime())?d.toLocaleString("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"}):"ไม่ระบุเวลา";
}
function empty(parent,message){row(parent,message).className="empty-state";}
function setView(view,scroll=true){
 if(!views.includes(view))return;currentView=view;
 for(const item of views){$("view-"+item).hidden=item!==view;$("nav-"+item).setAttribute?.("aria-current",item===view?"page":"false");}
 if(scroll)window.scrollTo?.({top:0,behavior:"auto"});
}
async function navigate(view){
 if(busy||!currentActive)return;setView(view);status("กำลังโหลดข้อมูล…");
 try{await loadView(view);if(currentView===view)status("อัปเดตข้อมูลแล้ว");}
 catch(e){if(currentView===view)status((e.message||"โหลดข้อมูลไม่ได้")+" · กดเมนูเดิมเพื่อลองใหม่");}
}
for(const view of views)$("nav-"+view).onclick=()=>navigate(view);
$("showCard").onclick=()=>navigate("qr");$("showRewards").onclick=()=>navigate("rewards");
$("refresh").onclick=()=>action(async()=>{await refresh();return "อัปเดตคะแนนล่าสุดแล้ว";});
$("reload").onclick=()=>window.location.reload();
async function refresh(){
 $("staff").hidden=true;$("admin").hidden=true;
 const [session,s]=await Promise.all([call("memberSession",{}),db.collection("users").doc(uid).get()]);
 $("registration").hidden=session.registered;$("card").hidden=!session.registered;
 $("memberNav").hidden=!session.registered||!session.active;currentActive=!!session.active;
 profileVersion++;historyVersion++;clubVersion++;boardGeneration++;historyState=null;loadedViews={};loadingViews={};clubBoards=new Map();clubStats=null;statsTask=null;
 if(!session.registered)return;
 if(!s.exists)throw Error("ไม่พบข้อมูลสมาชิก กรุณาติดต่อแอดมิน");
 const p=s.data();memberProfile=p;const points=Number.isFinite(p.monthlyPoints)?p.monthlyPoints:0;
 $("name").textContent=p.nickname||"สมาชิก G2";$("memberId").textContent=p.memberId||"รอตรวจสอบรหัส";
 $("initials").textContent=Array.from(p.nickname||"G2").slice(0,1).join("");
 applyMemberPhoto(linePhoto||p.pictureUrl);
 $("monthlyPoints").textContent=String(points);$("pointsMonth").textContent="รอบเดือน "+monthLabel(p.pointsMonth);
 $("balance").textContent=`คะแนนเดือน ${p.pointsMonth||"รอตรวจสอบ"}: ${points}`;
 $("accountState").textContent=session.active?"ใช้งานอยู่":"บัญชีปิดใช้งาน";$("qrMemberId").textContent=p.memberId||"";
 $("progressCard").hidden=!session.active||p.role!=="member";$("pointsProgress").value=Math.max(0,Math.min(15,points));
 $("progressText").textContent=points>=15?"ถึง 15 แต้มแล้ว":"อีก "+Math.max(0,15-points)+" แต้ม";
 $("showCard").hidden=!session.active;$("showRewards").hidden=!session.active;
 for(const id of ["qr","history","rewards","leaderboard","results"])$(id).replaceChildren();
 if(!session.active){setView("home",false);row("history","บัญชีถูกปิดใช้งาน กรุณาติดต่อแอดมิน");return;}
 $("staff").hidden=!session.capabilities?.staff;$("admin").hidden=!session.capabilities?.admin;
 if(!$("historyMonth").value)$("historyMonth").value=monthAt(new Date());
 $("historyMonth").max=monthAt(new Date());
 if(!$("boardMonth").value)$("boardMonth").value=monthAt(new Date());$("boardMonth").max=monthAt(new Date());
 void loadHomeClub();
 setView(currentView,false);await loadView(currentView);
}
async function loadView(view){
 if(view==="home"||loadedViews[view])return;
 if(loadingViews[view])return loadingViews[view];
 const version=profileVersion,historyGeneration=historyVersion,boardRequest=boardGeneration;
 const task=(async()=>{
  if(view==="qr"){
   $("qr").replaceChildren();new QRCode($("qr"),{text:uid,width:224,height:224,colorDark:"#111915",colorLight:"#ffffff"});
  }else if(view==="history"){
   if(!$("historyMonths").hidden)await renderMonthlyHistory();else await loadHistory();
  }else if(view==="rewards"){
   $("rewards").replaceChildren();empty("rewards","กำลังตรวจสิทธิ์ของคุณ…");
   const docs=await db.collection("monthlyRewards").where("userId","==",uid).limit(100).get();
   if(version!==profileVersion)return;
   $("rewards").replaceChildren();const entries=[];docs.forEach(d=>entries.push({...d.data(),id:d.id}));
   entries.sort((a,b)=>String(b.monthKey||"").localeCompare(String(a.monthKey||"")));
   for(const r of entries){
    const [y,m]=(r.monthKey||"").split("-").map(Number);
    const validMonth=Number.isInteger(y)&&Number.isInteger(m)&&m>=1&&m<=12?monthAt(new Date(Date.UTC(y,m,1))):"";
    const usable=r.status==="available"&&validMonth===monthAt(new Date()),card=node("article","","surface reward-card");
    const state=r.status==="used"?"ใช้สิทธิ์แล้ว":usable?"พร้อมใช้":validMonth>monthAt(new Date())?"ใช้ได้เดือน "+monthLabel(validMonth):"หมดอายุ / รอตรวจสอบ";
    card.append(node("span",state,"badge"),node("h3",labels[r.type]||"สิทธิ์รอตรวจสอบ"),node("p","จากคะแนนรอบ "+monthLabel(r.monthKey),"muted"));
    if(usable&&labels[r.type]){
     const button=node("button","แสดง QR ใช้สิทธิ์","primary"),box=node("div","","reward-code");button.type="button";box.hidden=true;let generated=false;
     button.onclick=()=>{box.hidden=!box.hidden;button.textContent=box.hidden?"แสดง QR ใช้สิทธิ์":"ซ่อน QR สิทธิ์";if(!generated){new QRCode(box,{text:"g2reward:"+r.id,width:200,height:200,colorDark:"#111915",colorLight:"#ffffff"});generated=true;}};
     card.append(button,box);
    }
    $("rewards").append(card);
   }
   if(!entries.length)empty("rewards","ยังไม่มีสิทธิ์รางวัลที่ออกให้คุณ สิทธิ์ประจำเดือนจะแสดงที่นี่หลังสรุปรอบ");
  }else if(view==="board"){
   await loadBoardView();
  }
  if(version===profileVersion&&(view!=="history"||historyGeneration===historyVersion)&&(view!=="board"||boardRequest===boardGeneration))loadedViews[view]=true;
 })();
 loadingViews[view]=task;try{await task;}finally{if(version===profileVersion&&(view!=="history"||historyGeneration===historyVersion)&&(view!=="board"||boardRequest===boardGeneration))delete loadingViews[view];}
}

function validHistoryMonth(month){return /^\d{4}-(0[1-9]|1[0-2])$/.test(month||"")&&month<=monthAt(new Date());}
async function selectHistoryMonth(month){
 if(busy||!currentActive)return;
 if(!validHistoryMonth(month)){status("กรุณาเลือกเดือนปัจจุบันหรือเดือนที่ผ่านมา");return;}
 $("historyMonth").value=month;$("historyRange").value="month";$("historyMonthControls").hidden=false;historyVersion++;historyState=null;
 delete loadedViews.history;delete loadingViews.history;
 await navigate("history");
}
$("historyMonth").onchange=()=>selectHistoryMonth($("historyMonth").value);
$("historyCurrent").onclick=()=>selectHistoryMonth(monthAt(new Date()));
for(const [id,delta] of [["historyPrevious",-1],["historyNext",1]])$(id).onclick=()=>{
 const month=$("historyMonth").value;
 if(!validHistoryMonth(month))return;
 const [y,m]=month.split("-").map(Number);
 selectHistoryMonth(new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7));
};
$("historyMore").onclick=async()=>{
 if(busy||!currentActive||!historyState?.hasMore||historyState.loading)return;
 try{await loadHistory(true);status("โหลดรายการเพิ่มแล้ว");}
 catch(e){status((e.message||"โหลดไม่ได้")+" · กดโหลดรายการเพิ่มเพื่อลองใหม่");}
};
function renderHistorySummary(state){
 if(state.month==="all"){
  const total=clubStats?.points;
  $("historyTotal").textContent=Number.isFinite(total)?total+" แต้มจากประวัติทั้งหมด":state.hasMore?"กำลังแสดงบางรายการ":state.entries.reduce((n,t)=>n+(Number.isFinite(t.points)?t.points:0),0)+" แต้มจากรายการที่บันทึก";
  $("historySummaryNote").textContent="เฉพาะประวัติที่ระบบบันทึกไว้ ไม่รวมยอดยกมาที่ไม่มีรายการ";return;
 }
 const snapshot=state.summary;
 const points=snapshot?.exists?snapshot.data().points:memberProfile?.pointsMonth===state.month?memberProfile.monthlyPoints:null;
 const authoritative=Number.isFinite(points);
 const total=state.entries.reduce((n,t)=>n+(Number.isFinite(t.points)?t.points:0),0);
 $("historyTotal").textContent=authoritative?points+" แต้ม":state.hasMore?"กำลังแสดงบางรายการ":total+" แต้มจากรายการที่บันทึก";
 $("historySummaryNote").textContent=snapshot?.exists?"ยอดที่เก็บไว้เมื่อสรุปรอบเดือน":authoritative?"ยอดคะแนนสะสมของรอบนี้":state.summaryFailed?"อ่านยอดสรุปไม่ได้ · แสดงเฉพาะรายการที่อ่านได้":state.hasMore?"กดโหลดรายการเพิ่มเพื่อดูให้ครบ":"ไม่มีข้อมูลสรุปรอบ · ยอดนี้รวมเฉพาะประวัติรายการ ไม่รวมยอดยกมา";
}
async function loadHistory(more=false){
 const month=$("historyRange").value==="all"?"all":$("historyMonth").value;
 if(month!=="all"&&!validHistoryMonth(month))throw Error("กรุณาเลือกเดือนปัจจุบันหรือเดือนที่ผ่านมา");
 const generation=historyVersion,profile=profileVersion;
 const state=more?historyState:{month,entries:[],cursor:null,legacyCursor:null,primaryMore:true,legacyMore:month!=="all",hasMore:false,loading:false};
 if(!state||state.loading)return;
 state.loading=true;historyState=state;
 const live=()=>generation===historyVersion&&profile===profileVersion&&historyState===state;
 $("historyMore").hidden=true;
 $("historyNext").disabled=month>=monthAt(new Date());
 if(!more){
  $("history").replaceChildren();empty("history","กำลังโหลดประวัติคะแนน…");
  $("historyTotal").textContent="กำลังโหลด…";$("historySummaryNote").textContent=monthLabel(month);
 }
 try{
  // Equality-only query reuses automatic indexes; monthId follows the actual points round,
  // including backfills whose createdAt can be in another month.
  let query=db.collection("pointTransactions").where("userId","==",uid);
  if(month!=="all")query=query.where("monthId","==",month);query=query.limit(50);
  if(more&&state.cursor)query=query.startAfter(state.cursor);
  let legacy=null;
  if(month!=="all"){
   const [y,m]=month.split("-").map(Number);
   legacy=db.collection("pointTransactions").where("userId","==",uid)
    .where("createdAt",">=",new Date(Date.UTC(y,m-1,1)-7*3600000))
    .where("createdAt","<",new Date(Date.UTC(y,m,1)-7*3600000))
    .orderBy("createdAt","desc").limit(50);
   if(more&&state.legacyCursor)legacy=legacy.startAfter(state.legacyCursor);
  }
  const [docs,oldDocs,summary]=await Promise.all([
   more&&!state.primaryMore?Promise.resolve(null):query.get(),
   month==="all"||more&&!state.legacyMore?Promise.resolve(null):legacy.get(),
   month==="all"||more?Promise.resolve(null):db.collection("seasonResults").doc(month).collection("members").doc(uid).get().then(value=>({value}),()=>({failed:true}))
  ]);
  if(!live())return;
  if(summary){state.summary=summary.value;state.summaryFailed=summary.failed;}
  const page=[],oldPage=[];docs?.forEach(d=>page.push(d));oldDocs?.forEach(d=>oldPage.push(d));
  if(docs){state.cursor=page.at(-1)||state.cursor;state.primaryMore=page.length===50;}
  if(oldDocs){state.legacyCursor=oldPage.at(-1)||state.legacyCursor;state.legacyMore=oldPage.length===50;}
  state.hasMore=state.primaryMore||state.legacyMore;
  const entries=new Map(state.entries.map(t=>[t.id,t]));
  for(const d of page)entries.set(d.id,{...d.data(),id:d.id});
  for(const d of oldPage){
   const tx=d.data();
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(tx.monthId||"")&&(!tx.monthKey||tx.monthKey===month))
    entries.set(d.id,{...tx,id:d.id,monthId:month});
  }
  state.entries=[...entries.values()];
  state.entries.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)||String(a.id).localeCompare(String(b.id)));
  $("history").replaceChildren();
  let group=null;
  for(const tx of state.entries){
   if(month==="all"){const key=transactionMonth(tx);if(key!==group){$("history").append(node("h3",key?monthLabel(key):"ไม่ระบุเดือน","history-month-label"));group=key;}}
   const points=Number(tx.points),line=node("div","","list-row"),copy=node("div","","list-copy");
   copy.append(node("strong",tx.billId?"บิล #"+tx.billId:"รายการคะแนน"),node("small",stamp(tx.createdAt)+" · "+(transactionMonth(tx)?monthLabel(transactionMonth(tx)):"ไม่ระบุเดือน")));
   line.append(copy,node("span",Number.isFinite(points)?(points>0?"+":"")+points:"—","list-value"));$("history").append(line);
  }
  if(!state.entries.length)empty("history","ยังไม่มีรายการคะแนนในเดือนที่เลือก");
  $("historyCount").textContent="แสดง "+state.entries.length+" รายการ"+(state.hasMore?" · ยังมีรายการเพิ่มเติม":"");
  renderHistorySummary(state);
 }catch(e){
  if(live()&&!more){$("history").replaceChildren();empty("history","โหลดประวัติไม่ได้ กดเมนูประวัติเพื่อลองใหม่");$("historyTotal").textContent="โหลดไม่สำเร็จ";$("historyCount").textContent="";}
  throw e;
 }finally{
  state.loading=false;if(live())$("historyMore").hidden=!state.hasMore;
 }
}


function safePhoto(value){
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&(u.hostname==="line-scdn.net"||u.hostname.endsWith(".line-scdn.net"))&&u.href.length<=2048?u.href:"";}catch{return "";}
}
function applyMemberPhoto(value){
 const src=safePhoto(value),img=$("memberPhoto");img.hidden=true;$("initials").hidden=false;
 if(!src)return;
 img.onload=()=>{img.hidden=false;$("initials").hidden=true;};
 img.onerror=()=>{img.hidden=true;$("initials").hidden=false;};
 img.src=src;
}
async function readLinePhoto(){
 try{if(typeof liff.getProfile!=="function")return;const p=await liff.getProfile();if(p.userId!==uid)return;linePhoto=safePhoto(p.pictureUrl);if(linePhoto)applyMemberPhoto(linePhoto);}catch{/* Existing stored photo/initials remain usable without LINE profile permission. */}
}
function avatar(parent,p){
 const src=safePhoto(p.own?(linePhoto||memberProfile?.pictureUrl||p.pictureUrl):p.pictureUrl);
 const initials=node("span",Array.from(p.nickname||"G2").slice(0,1).join(""),"ranking-avatar");initials.setAttribute?.("aria-hidden","true");parent.append(initials);
 if(!src)return;
 const img=node("img","","ranking-avatar");img.alt="";img.referrerPolicy="no-referrer";img.hidden=true;
 img.onload=()=>{initials.hidden=true;img.hidden=false;};img.onerror=()=>{initials.hidden=false;img.hidden=true;};img.src=src;parent.append(img);
}
async function clubBoard(month){
 if(clubBoards.has(month))return clubBoards.get(month);
 const version=clubVersion,map=clubBoards;
 const task=call("memberClubData",{view:"board",month});
 map.set(month,task);
 try{const result=await task;if(version===clubVersion)map.set(month,Promise.resolve(result));return result;}
 catch(e){if(version===clubVersion)map.delete(month);throw e;}
}
async function getClubStats(){
 if(clubStats)return clubStats;if(statsTask)return statsTask;
 const version=clubVersion,task=call("memberClubData",{view:"stats"});statsTask=task;
 try{const value=await task;if(version===clubVersion)clubStats=value;return value;}
 finally{if(version===clubVersion)statsTask=null;}
}
function ownRankText(data){
 if(data.me)return "#"+data.me.rank+" จาก "+data.total+" คน";
 if(data.complete===false)return "ไม่มีอันดับเต็มของรอบนี้";
 return memberProfile?.role==="member"?"ยังไม่มีอันดับในรอบนี้":"บัญชีพนักงาน / ผู้ดูแลไม่ร่วมอันดับ";
}
function rankGap(other,me,before){
 if(!me)return "—";
 if(!other)return before?"คุณอยู่อันดับแรก":"ไม่มีอันดับถัดไป";
 const gap=Math.abs(other.points-me.points);
 if(!gap)return "แต้มเท่าอันดับ "+other.rank;
 return (before?"ตามอันดับ ":"นำอันดับ ")+other.rank+" อยู่ "+gap+" แต้ม";
}
function renderHomeRank(data){
 $("homeRank").textContent=ownRankText(data);
 $("homeRankScope").textContent=monthLabel(data.month)+" · สมาชิกที่มีสิทธิ์ร่วมอันดับ";
 $("gapBefore").textContent=rankGap(data.before,data.me,true);$("gapAfter").textContent=rankGap(data.after,data.me,false);
 $("rankTrack").replaceChildren();
 if(data.me)for(const p of [data.before,data.me,data.after].filter(Boolean)){
  const item=node("div","","track-node"+(p.own?" own":""));item.append(node("b",String(p.rank)),node("strong",String(p.points)+" แต้ม"),node("small",p.own?"คุณ":p.nickname));$("rankTrack").append(item);
 }
 $("homeRankNote").textContent=data.tieCount>1?"มีผู้ได้แต้มเท่ากัน · ลำดับใช้เกณฑ์วันสมัครเดียวกับการปิดรอบ":"คะแนนเท่ากันเรียงตามวันสมัคร แล้วใช้ลำดับรหัสภายใน";
}
async function loadHomeClub(){
 const version=clubVersion;
 $("homeRank").textContent="กำลังตรวจอันดับ…";$("allStatsNote").textContent="กำลังอ่านประวัติที่บันทึกในระบบ…";
 await Promise.allSettled([
  clubBoard(monthAt(new Date())).then(data=>{if(version===clubVersion)renderHomeRank(data);},()=>{
   if(version===clubVersion){$("homeRank").textContent="ยังโหลดอันดับไม่ได้";$("homeRankNote").textContent="กดอัปเดตเพื่อลองใหม่";}
  }),
  getClubStats().then(data=>{
   if(version!==clubVersion)return;
   $("allPoints").textContent=String(data.points);$("allBills").textContent=String(data.billCount);
   $("allStatsNote").textContent=data.count+" รายการ · เฉพาะข้อมูลที่บันทึกในระบบ ไม่รวมยอดยกมาที่ไม่มีประวัติ";
   if(historyState?.month==="all")renderHistorySummary(historyState);
  },()=>{if(version===clubVersion)$("allStatsNote").textContent="ยังอ่านสถิติไม่ได้ กดอัปเดตเพื่อลองใหม่";})
 ]);
}
$("refreshClub").onclick=async()=>{
 if(busy||!currentActive)return;
 clubVersion++;boardGeneration++;clubBoards=new Map();clubStats=null;statsTask=null;visibleBoard=null;
 delete loadedViews.board;delete loadingViews.board;await loadHomeClub();
};
$("showBoard").onclick=()=>{$("boardMonth").value=monthAt(new Date());return selectBoardMonth();};
$("boardMonth").onchange=()=>selectBoardMonth();
$("boardLoad").onclick=()=>selectBoardMonth();
async function selectBoardMonth(){
 const month=$("boardMonth").value;
 if(busy||!currentActive)return;
 if(!validHistoryMonth(month)){status("กรุณาเลือกเดือนปัจจุบันหรือเดือนที่ผ่านมา");return;}
 boardGeneration++;delete loadedViews.board;delete loadingViews.board;boardRowsShown=20;
 return navigate("board");
}
let visibleBoard=null;
async function loadBoardView(){
 const version=clubVersion,generation=boardGeneration,month=$("boardMonth").value||monthAt(new Date());
 $("leaderboard").replaceChildren();empty("leaderboard","กำลังโหลดอันดับสมาชิก…");$("boardMore").hidden=true;
 const data=await clubBoard(month);
 if(version!==clubVersion||generation!==boardGeneration)return;
 visibleBoard=data;boardRowsShown=20;renderBoardRows();
 // Top3 archives are optional; a failure must not hide the full selected ranking.
 try{
  const results=await db.collection("seasonResults").orderBy("monthId","desc").limit(24).get();
  if(version!==clubVersion||generation!==boardGeneration)return;
  $("results").replaceChildren();let count=0;
  results.forEach(d=>{count++;row("results",monthLabel(d.data().monthId||d.id)+": "+(d.data().top3||[]).map(p=>p.rank+". "+p.nickname+" "+p.points+" แต้ม").join(" / "));});
  if(!count)empty("results","ยังไม่มีผลสรุปรอบเดือนที่ผ่านมา");
 }catch{if(version===clubVersion&&generation===boardGeneration)empty("results","ยังโหลดผล Top 3 ไม่ได้");}
}
function renderBoardRows(){
 const data=visibleBoard;if(!data)return;
 $("boardOwn").textContent=ownRankText(data)+(data.me?" · "+data.me.points+" แต้ม":"");
 $("boardScope").textContent=monthLabel(data.month)+" · "+(data.archived?"ประวัติเมื่อปิดรอบ":"อันดับปัจจุบัน คะแนนอาจเปลี่ยนได้");
 $("boardNote").textContent=data.complete===false?"รอบเก่านี้มีเฉพาะผล Top 3 ไม่มีข้อมูลอันดับเต็ม จึงยังระบุอันดับของคุณไม่ได้":
 "คะแนนเท่ากันเรียงตามวันสมัคร แล้วใช้ลำดับรหัสภายใน เช่นเดียวกับการสรุปรางวัล"+(data.tieCount>1?" · คุณมีคะแนนเท่ากับสมาชิกอื่น":"");
 $("leaderboard").replaceChildren();
 for(const p of data.rows.slice(0,boardRowsShown)){
  const line=node("div","","ranking-row"+(p.own?" own":"")),person=node("div","","ranking-person");
  avatar(person,p);person.append(node("strong",p.nickname+(p.own?" (คุณ)":"")));
  const diff=data.me?p.points-data.me.points:null;
  line.append(node("span",String(p.rank),"rank-number"),person,node("span",String(p.points),"ranking-points"),node("span",diff===null||p.own?"—":diff===0?"เท่ากัน":(diff>0?"+":"−")+Math.abs(diff),"ranking-diff"+(diff>0?" higher":diff<0?" lower":"")));
  $("leaderboard").append(line);
 }
 if(!data.rows.length)empty("leaderboard","ยังไม่มีข้อมูลอันดับในรอบที่เลือก");
 $("boardCount").textContent="แสดง "+Math.min(boardRowsShown,data.rows.length)+" จาก "+data.rows.length+" คน"+(data.complete===false?" · เฉพาะ Top 3 ที่เก็บไว้":"");
 $("boardMore").hidden=boardRowsShown>=data.rows.length;
}
$("boardMore").onclick=()=>{if(!busy&&currentActive){boardRowsShown+=20;renderBoardRows();}};
function transactionMonth(tx){
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(tx.monthId||""))return tx.monthId;
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(tx.monthKey||""))return tx.monthKey;
 const d=tx.createdAt?.toDate?.();return d&&Number.isFinite(d.getTime())?monthAt(d):"";
}
async function setHistoryMode(mode){
 if(busy||!currentActive)return;
 $("historyMonths").hidden=mode!=="monthly";$("historyTransactionsPanel").hidden=mode==="monthly";
 $("historyMonthly").setAttribute?.("aria-pressed",mode==="monthly"?"true":"false");
 $("historyTransactions").setAttribute?.("aria-pressed",mode==="monthly"?"false":"true");
 historyVersion++;historyState=null;delete loadedViews.history;delete loadingViews.history;
 return navigate("history");
}
$("historyMonthly").onclick=()=>setHistoryMode("monthly");
$("historyTransactions").onclick=()=>setHistoryMode("transactions");
$("historyRange").onchange=()=>{
 $("historyMonthControls").hidden=$("historyRange").value==="all";
 return setHistoryMode("transactions");
};
$("showAllHistory").onclick=()=>{
 $("historyRange").value="all";$("historyMonthControls").hidden=true;
 return setHistoryMode("transactions");
};
async function renderMonthlyHistory(){
 const version=historyVersion,profile=profileVersion;
 $("historyMonths").replaceChildren();empty("historyMonths","กำลังสรุปประวัติรายเดือน…");
 const data=await getClubStats();if(version!==historyVersion||profile!==profileVersion)return;
 $("historyMonths").replaceChildren();
 for(const month of data.months){
  const card=node("article","","surface month-summary"),copy=node("div","");
  copy.append(node("h3",month.month?monthLabel(month.month):"ไม่ระบุเดือน"),node("p",month.billCount+" บิล · "+month.count+" รายการ","muted"));
  const score=node("div","");score.append(node("strong",String(month.points)+" แต้ม","list-value"));
  if(month.month){const button=node("button","ดูอันดับ ›","text-button");button.type="button";button.onclick=()=>{$("boardMonth").value=month.month;selectBoardMonth();};score.append(button);}
  card.append(copy,score);$("historyMonths").append(card);
 }
 if(!data.months.length)empty("historyMonths","ยังไม่มีประวัติแต้มที่บันทึกไว้");
 empty("historyMonths","สรุปจากรายการที่บันทึก อาจต่างจากยอดปิดรอบที่มียอดยกมา");
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
async function previewSelectedMonth(){
  const data=await call("memberPreviewMonth",{month:$("month").value});
  $("monthPreview").replaceChildren();
  row("monthPreview",`เดือน ${data.monthId} — ${data.state==="closed"?"ปิดรอบแล้ว":"สรุปเบื้องต้น คะแนนอาจเปลี่ยนก่อนปิดรอบ"}`);
  data.top3.forEach(p=>row("monthPreview",`${p.rank}. ${p.nickname} ${p.points} แต้ม`));
  row("monthPreview",`เสื้อ Limited ${data.shirtCount} สิทธิ์ / ส่วนลด 10% ${data.discountCount} สิทธิ์`);
  return data;
}
$("preview").onclick=()=>action(async()=>{await previewSelectedMonth();return "ตรวจสรุปแล้ว ยังไม่มีการปิดรอบหรือแก้คะแนน";});
$("close").onclick=()=>action(async()=>{
  const preview=await previewSelectedMonth();
  if(!preview.canClose)throw Error(preview.state==="closed"?"เดือนนี้ปิดรอบแล้ว":"ปิดได้เฉพาะเดือนที่จบแล้วและเปิดรับคะแนนไว้");
  if(!window.confirm(`ยืนยันปิดรอบ ${preview.monthId}? สรุปเบื้องต้น: เสื้อ ${preview.shirtCount} สิทธิ์ ส่วนลด ${preview.discountCount} สิทธิ์ ระบบจะเก็บประวัติและเริ่มคะแนนรอบใหม่`))return "ยกเลิกการปิดรอบ";
  await call("memberCloseMonth",{month:preview.monthId});await refresh();await previewSelectedMonth();return "ปิดรอบและเก็บประวัติสำเร็จ";
});
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
  void readLinePhoto();
  status(pending?"มีรายการเพิ่มแต้มค้าง กดส่งรายการค้างเดิม":"เข้าสู่ระบบแล้ว");
}catch(e){status(e.message);}})();
