"use strict";
// Real Chromium UI acceptance with deterministic transport/SDK fixtures.
// Auth, Rules and transactions are tested separately against Firebase emulators/cloud.
const {test,before,after}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function ui(capabilities={staff:true,admin:true},options={}){
 const context=await browser.newContext(),page=await context.newPage();
 const html=fs.readFileSync(path.join(__dirname,"../../secure-public/index.html"),"utf8").replace(/<script[\s\S]*?<\/script>/g,"").replace("</html>",'<script src="/app.js"></script></html>');
 const code=fs.readFileSync(path.join(__dirname,"../../secure-public/app.js"),"utf8");
 const css=fs.readFileSync(path.join(__dirname,"../../secure-public/member.css"),"utf8");
 const banner=fs.readFileSync(path.join(__dirname,"../../secure-public/club-banner.svg"),"utf8");
 await context.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="profile.line-scdn.net")return route.fulfill({status:200,contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII=","base64")});
  if(url.origin!=="https://g2-member-test-api.onrender.com")return route.abort();
  return route.fulfill({status:200,contentType:url.pathname==="/app.js"?"application/javascript":url.pathname==="/member.css"?"text/css":url.pathname==="/club-banner.svg"?"image/svg+xml":"text/html",body:url.pathname==="/app.js"?code:url.pathname==="/member.css"?css:url.pathname==="/club-banner.svg"?banner:html});
 });
 await page.addInitScript(({capabilities,options})=>{
  const uid="U"+"a".repeat(32);
  window.fixture={calls:[],failManual:false,deny:false,redeemed:false,closed:false,reads:[],qrs:[]};
  window.G2_MEMBER_CONFIG={firebase:{projectId:"g2-member-test"},liffId:"TEST",backendUrl:location.origin};
  window.liff={init:async()=>{},isLoggedIn:()=>true,getIDToken:()=>"test-only-line-token",getProfile:async()=>{if(options.failLinePhoto)throw Error("profile not permitted");return {userId:options.wrongPhotoUser?"U"+"b".repeat(32):uid,pictureUrl:options.linePhoto||""};}};
  window.QRCode=function(el,config){window.fixture.qrs.push(config);const canvas=document.createElement("canvas");canvas.width=config.width;canvas.height=config.height;el.append(canvas);};
  window.Html5QrcodeScanner=function(){};
  const q=(name,filters=[],cap=Infinity,cursor=null)=>({
   where(field,op,value){return q(name,[...filters,{field,op,value}],cap,cursor);},
   orderBy(){return this;},
   limit(n){return q(name,filters,n,cursor);},
   startAfter(doc){return q(name,filters,cap,doc.id);},
   get:async()=>{
    fixture.reads.push(name);(fixture.queries??=[]).push({name,filters,cursor,cap});
    if(name==="pointTransactions"&&options.delayHistory&&filters.some(f=>f.field==="monthId"))await new Promise(resolve=>{fixture.releaseHistory=resolve;});
    let entries=name==="monthlyRewards"?(options.rewards||[]):name==="pointTransactions"?(options.history||[]):[];
    entries=entries.map((d,i)=>({id:d.id||String(i).padStart(3,"0"),...d}));
    for(const {field,op,value} of filters)entries=entries.filter(d=>field==="userId"?(d.userId||uid)===value:field==="createdAt"?(d.createdAtMillis!==undefined&&(op===">="?d.createdAtMillis>=Number(value):d.createdAtMillis<Number(value))):d[field]===value);
    entries.sort((a,b)=>a.id.localeCompare(b.id));
    if(cursor!==null)entries=entries.filter(d=>d.id>cursor);
    entries=entries.slice(0,cap);
    return {forEach(fn){entries.forEach(d=>fn({id:d.id,data:()=>({...d,createdAt:d.createdAtMillis?{toMillis:()=>d.createdAtMillis,toDate:()=>new Date(d.createdAtMillis)}:null})}));}};
   },
   doc:id=>({
    collection:sub=>q(name+"/"+id+"/"+sub),
    get:async()=>{
     fixture.reads.push(name);
     if(name.startsWith("seasonResults/")){
      if(options.failSnapshot)throw Error("summary unavailable");
      const value=options.snapshots?.[name.split("/")[1]];
      return {exists:value!==undefined,data:()=>({points:value})};
     }
     return {exists:true,data:()=>({nickname:options.nickname||"TEST",role:options.profileRole||"admin",memberId:"G2-TEST",pictureUrl:options.storedPhoto||"",monthlyPoints:options.points??0,pointsMonth:options.pointsMonth||"2026-10"})};
    }
   })
  });
  const auth=()=>({currentUser:{getIdToken:async()=>"test-token"},setPersistence:async()=>{},signInWithCustomToken:async()=>({user:{uid}})});auth.Auth={Persistence:{SESSION:"session"}};
  window.firebase={initializeApp(){},firestore:()=>({collection:q}),auth};
  window.fetch=async(url,request)=>{
   const name=url.split("/").at(-1),data=JSON.parse(request.body),f=window.fixture;f.calls.push({name,data});
   if(f.deny&&name!=="memberLineLogin")return {ok:false,json:async()=>({error:"permission-denied",message:"Access revoked"})};
   if(name==="memberAddPoints"){await new Promise(r=>setTimeout(r,30));if(f.failManual)return {ok:false,json:async()=>({error:"unavailable",message:"Temporary outage"})};}
   let result={};

   if(name==="memberClubData"){
    if(options.failClub)return {ok:false,json:async()=>({error:"unavailable",message:"Club temporarily unavailable"})};
    if(options.delayClub)await new Promise(resolve=>{(fixture.releaseClub??={})[data.view+":"+data.month]=resolve;});
    if(data.view==="board"){
     const rows=options.boards?.[data.month]||options.board||[];
     const me=rows.find(p=>p.own)||null;
     result={month:data.month,archived:data.month!=="2026-10",complete:options.archiveComplete!==false,total:rows.length,rows,me,before:me?rows.find(p=>p.rank===me.rank-1)||null:null,after:me?rows.find(p=>p.rank===me.rank+1)||null:null,tieCount:me?rows.filter(p=>p.points===me.points).length:0};
    }else{
     const entries=(options.history||[]).filter(t=>!t.userId||t.userId===uid),months={};
     for(const tx of entries){const key=tx.monthId||tx.monthKey||"";const m=months[key]??={month:key,points:0,count:0,bills:[]};m.points+=tx.points;m.count++;if(tx.billId!==undefined)m.bills.push(tx.billId);}
     result={points:entries.reduce((n,t)=>n+t.points,0),count:entries.length,billCount:new Set(entries.filter(t=>t.billId!==undefined).map(t=>t.billId)).size,months:Object.values(months).sort((a,b)=>b.month.localeCompare(a.month)).map(m=>({...m,billCount:new Set(m.bills).size})),basis:"recorded-transactions"};
    }
   }
   if(name==="memberLineLogin")result={customToken:"test"};
   if(name==="memberSession")result={registered:true,active:true,capabilities};
   if(name==="memberPreviewMonth")result={monthId:data.month,state:f.closed?"closed":"open",top3:[{rank:1,nickname:"<img src=x onerror=alert(1)>",points:30}],shirtCount:1,discountCount:2,canClose:!f.closed};
   if(name==="memberCloseMonth"){f.closed=true;result={state:"closed"};}
   if(name==="memberRedeemReward"){result={duplicate:f.redeemed,type:"discount10",billRef:data.billRef};f.redeemed=true;}
   return {ok:true,json:async()=>({data:result})};
  };
 },{capabilities,options});
 await page.goto("https://g2-member-test-api.onrender.com/");
 await page.locator("#status").filter({hasText:"เข้าสู่ระบบแล้ว"}).waitFor();
 return {page,close:()=>context.close()};
}
test("Chromium: forged profile role cannot reveal staff or admin controls",async()=>{
 const h=await ui({staff:false,admin:false});try{assert.equal(await h.page.locator("#staff").isVisible(),false);assert.equal(await h.page.locator("#admin").isVisible(),false);}finally{await h.close();}
});
test("Chromium: read-only month summary, safe text, cancel and confirmed close",async()=>{
 const h=await ui();try{
  await h.page.locator("#month").fill("2026-09");await h.page.locator("#preview").click();
  await h.page.locator("#status").filter({hasText:"ตรวจสรุปแล้ว"}).waitFor();
  assert.equal(await h.page.locator("#monthPreview img").count(),0);
  assert.match(await h.page.locator("#monthPreview").innerText(),/<img src=x/);
  assert.equal(await h.page.evaluate(()=>fixture.calls.filter(x=>x.name==="memberCloseMonth").length),0);
  h.page.once("dialog",d=>d.dismiss());await h.page.locator("#close").click();
  await h.page.locator("#status").filter({hasText:"ยกเลิก"}).waitFor();
  assert.equal(await h.page.evaluate(()=>fixture.calls.filter(x=>x.name==="memberCloseMonth").length),0);
  h.page.once("dialog",d=>d.accept());await h.page.locator("#close").click();
  await h.page.locator("#status").filter({hasText:"ปิดรอบและเก็บประวัติสำเร็จ"}).waitFor();
  assert.equal(await h.page.evaluate(()=>fixture.calls.filter(x=>x.name==="memberCloseMonth").length),1);
  assert.match(await h.page.locator("#monthPreview").innerText(),/ปิดรอบแล้ว/);
 }finally{await h.close();}
});
test("Chromium: manual outage and reload retain exactly the same request UUID",async()=>{
 const h=await ui();try{
  await h.page.locator("#target").fill("U"+"b".repeat(32));await h.page.locator("#points").selectOption("2");
  await h.page.evaluate(()=>{fixture.failManual=true;document.getElementById("add").click();document.getElementById("add").click();});
  await h.page.locator("#status").filter({hasText:"Temporary outage"}).waitFor();
  const first=await h.page.evaluate(()=>fixture.calls.filter(x=>x.name==="memberAddPoints"));assert.equal(first.length,1);
  await h.page.reload();await h.page.locator("#status").filter({hasText:"มีรายการเพิ่มแต้มค้าง"}).waitFor();
  await h.page.locator("#retry").click();await h.page.locator("#status").filter({hasText:"บันทึกแต้มสำเร็จ"}).waitFor();
  const retry=await h.page.evaluate(()=>fixture.calls.find(x=>x.name==="memberAddPoints"));assert.equal(retry.data.requestId,first[0].data.requestId);
  assert.equal(await h.page.evaluate(()=>sessionStorage.getItem("g2PendingManual")),null);
 }finally{await h.close();}
});
test("Chromium: revoked server access immediately hides privileged sections",async()=>{
 const h=await ui();try{
  await h.page.locator("#month").fill("2026-09");await h.page.evaluate(()=>{fixture.deny=true;});await h.page.locator("#preview").click();
  await h.page.locator("#status").filter({hasText:"Access revoked"}).waitFor();assert.equal(await h.page.locator("#staff").isVisible(),false);assert.equal(await h.page.locator("#admin").isVisible(),false);
 }finally{await h.close();}
});
test("Chromium: duplicate reward warns staff against a second discount or shirt",async()=>{
 const h=await ui();try{
  await h.page.locator("#rewardId").fill("TEST-ONLY");await h.page.locator("#billRef").fill("TEST-BILL");
  await h.page.locator("#redeem").click();await h.page.locator("#status").filter({hasText:"บันทึกใช้ส่วนลดแล้ว"}).waitFor();
  await h.page.locator("#redeem").click();await h.page.locator("#status").filter({hasText:"ห้ามส่งมอบเสื้อหรือให้ส่วนลดซ้ำ"}).waitFor();
 }finally{await h.close();}
});

test("Chromium: customer home loads points before details; layouts fit 320/390/768px",async()=>{
 const h=await ui({staff:false,admin:false},{profileRole:"member",points:12,nickname:"สมาชิกชื่อยาวสำหรับทดสอบการแสดงผลบนมือถือ"});
 try{
  assert.equal(await h.page.locator("#monthlyPoints").innerText(),"12");
  assert.deepEqual(await h.page.evaluate(()=>fixture.reads),["users"]);
  assert.equal(await h.page.evaluate(()=>fixture.qrs.length),0);
  for(const width of [320,390,768]){
   await h.page.setViewportSize({width,height:844});
   assert.equal(await h.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"overflow at "+width);
   assert.equal(await h.page.locator("#memberNav button").count(),5);
   assert.ok(await h.page.locator("#showCard").isVisible());
   for(const button of await h.page.locator("#memberNav button").all()){const b=await button.boundingBox();assert.ok(b.height>=44);}
  }
  await h.page.setViewportSize({width:390,height:844});
  const artifacts=path.join(__dirname,"artifacts");fs.mkdirSync(artifacts,{recursive:true});
  await h.page.screenshot({path:path.join(artifacts,"customer-home-390.png"),fullPage:true});
  await h.page.locator("#nav-qr").click();
  await h.page.locator("#view-qr").waitFor({state:"visible"});
  const qr=await h.page.evaluate(()=>fixture.qrs[0]);assert.equal(qr.text,"U"+"a".repeat(32));assert.equal(qr.width,224);
  assert.equal(await h.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await h.close();}
});
test("Chromium: slow history does not block returning home or expose privileged menus",async()=>{
 const h=await ui({staff:false,admin:false},{profileRole:"member",points:12,delayHistory:true});
 try{
  await h.page.locator("#nav-history").click();
  await h.page.waitForFunction(()=>typeof fixture.releaseHistory==="function");
  assert.equal(await h.page.locator("#history").innerText(),"กำลังโหลดประวัติคะแนน…");
  await h.page.locator("#nav-home").click();
  assert.ok(await h.page.locator("#monthlyPoints").isVisible());
  await h.page.evaluate(()=>fixture.releaseHistory());
  await h.page.locator("#history").filter({hasText:"ยังไม่มีรายการคะแนนในเดือนที่เลือก"}).waitFor({state:"attached"});
  assert.ok(await h.page.locator("#view-home").isVisible());
  assert.equal(await h.page.locator("#staff").isVisible(),false);
  assert.equal(await h.page.locator("#admin").isVisible(),false);
 }finally{await h.close();}
});
test("Chromium: reward QR is generated only on demand and used rewards have no QR button",async()=>{
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"numeric"}).formatToParts(new Date());
 const y=Number(parts.find(p=>p.type==="year").value),m=Number(parts.find(p=>p.type==="month").value);
 const previous=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
 const h=await ui({staff:false,admin:false},{profileRole:"member",rewards:[{id:"available-test",monthKey:previous,type:"discount10",status:"available"},{id:"used-test",monthKey:previous,type:"discount10",status:"used"}]});
 try{
  await h.page.locator("#nav-rewards").click();
  await h.page.locator("#rewards .reward-card").first().waitFor();
  assert.equal(await h.page.locator("#rewards .reward-card").count(),2);
  assert.equal(await h.page.locator("#rewards button").count(),1);
  assert.equal(await h.page.evaluate(()=>fixture.qrs.length),0);
  await h.page.locator("#rewards button").click();
  assert.equal(await h.page.evaluate(()=>fixture.qrs[0].text),"g2reward:available-test");
  assert.equal(await h.page.evaluate(()=>fixture.calls.some(x=>x.name==="memberRedeemReward")),false);
 }finally{await h.close();}
});

test("Chromium: previous month shows own snapshot and all pages beyond thirty; backfill follows monthId",async()=>{
 const history=Array.from({length:61},(_,i)=>({id:String(i).padStart(3,"0"),points:1,monthId:"2026-09",billId:100+i,createdAtMillis:Date.UTC(2026,9,2)}));
 history.push({id:"legacy-september",points:4,createdAtMillis:Date.UTC(2026,8,2)},{id:"other-month",points:999,monthId:"2026-10",createdAtMillis:Date.UTC(2026,8,2)},{id:"other-user",points:999,monthId:"2026-09",userId:"U"+"b".repeat(32)});
 const h=await ui({staff:false,admin:false},{profileRole:"member",points:12,history,snapshots:{"2026-09":72}});
 try{
  await h.page.locator("#nav-history").click();
  await h.page.locator("#historyMonth").fill("2026-09");
  await h.page.locator("#historyMonth").dispatchEvent("change");
  await h.page.locator("#historyTotal").filter({hasText:"72 แต้ม"}).waitFor();
  assert.equal(await h.page.locator("#history .list-row").count(),51);
  await h.page.locator("#historyMore").click();
  await h.page.locator("#historyCount").filter({hasText:"62 รายการ"}).waitFor();
  assert.equal(await h.page.locator("#history .list-row").count(),62);
  assert.equal(await h.page.locator("#historyMore").isVisible(),false);
  assert.equal(await h.page.locator("#monthlyPoints").textContent(),"12");
  assert.ok(await h.page.locator("#historySummaryNote").innerText().then(x=>x.includes("สรุปรอบเดือน")));
  assert.equal(await h.page.evaluate(()=>fixture.calls.some(x=>!["memberLineLogin","memberSession","memberClubData"].includes(x.name))),false);
  const queries=await h.page.evaluate(()=>fixture.queries.filter(q=>q.name==="pointTransactions"&&q.filters.some(f=>f.field==="monthId"&&f.value==="2026-09")));
  assert.ok(queries.length>=2);assert.ok(queries.every(q=>q.filters.some(f=>f.field==="userId"&&f.value==="U"+"a".repeat(32))));
  assert.equal(queries.at(-1).cursor,"049");
 }finally{await h.close();}
});
test("Chromium: missing monthly summary is explicit and summary failure still allows history",async()=>{
 for(const failSnapshot of [false,true]){
  const h=await ui({staff:false,admin:false},{profileRole:"member",failSnapshot,history:[{monthId:"2026-09",points:3}]});
  try{
   await h.page.locator("#nav-history").click();await h.page.locator("#historyMonth").fill("2026-09");await h.page.locator("#historyMonth").dispatchEvent("change");
   await h.page.locator("#historyTotal").filter({hasText:"3 แต้มจากรายการที่บันทึก"}).waitFor();
   assert.match(await h.page.locator("#historySummaryNote").innerText(),failSnapshot?/อ่านยอดสรุปไม่ได้/:/ไม่รวมยอดยกมา/);
   await h.page.locator("#historyPrevious").click();
   await h.page.waitForFunction(()=>document.getElementById("historyMonth").value==="2026-08");
   await h.page.locator("#history").filter({hasText:"ยังไม่มีรายการคะแนนในเดือนที่เลือก"}).waitFor();
  }finally{await h.close();}
 }
});
test("Chromium: changing month ignores a stale in-flight history response",async()=>{
 const h=await ui({staff:false,admin:false},{profileRole:"member",delayHistory:true,history:[{monthId:"2026-09",points:9},{monthId:"2026-10",points:10}],snapshots:{"2026-09":9}});
 try{
  await h.page.locator("#nav-history").click();await h.page.waitForFunction(()=>typeof fixture.releaseHistory==="function");
  await h.page.evaluate(()=>{fixture.releaseOld=fixture.releaseHistory;});
  await h.page.locator("#historyMonth").fill("2026-09");await h.page.locator("#historyMonth").dispatchEvent("change");
  await h.page.waitForFunction(()=>fixture.releaseHistory!==fixture.releaseOld);
  await h.page.evaluate(()=>fixture.releaseHistory());
  await h.page.locator("#historyTotal").filter({hasText:"9 แต้ม"}).waitFor();
  await h.page.evaluate(()=>fixture.releaseOld());
  await h.page.locator("#nav-home").click();await h.page.locator("#nav-history").click();
  assert.equal(await h.page.locator("#history .list-value").innerText(),"+9");
  assert.equal(await h.page.locator("#historyMonth").inputValue(),"2026-09");
 }finally{await h.close();}
});

function clubRows(n=6){
 const points=[36,31,27,24,22,20];
 return Array.from({length:n},(_,i)=>({rank:i+1,nickname:i===3?"TEST":"สมาชิก "+(i+1),points:points[i]??Math.max(0,19-i),own:i===3,pictureUrl:i===0?"javascript:alert(1)":""}));
}
test("Chromium: sport club shows profile photo, correct own rank and gaps; all ranking pages and ties",async()=>{
 const rows=clubRows(125);
 const h=await ui({staff:false,admin:false},{profileRole:"member",points:24,linePhoto:"https://profile.line-scdn.net/test-only.png",board:rows});
 try{
  await h.page.locator("#homeRank").filter({hasText:"#4 จาก 125 คน"}).waitFor();
  await h.page.locator("#memberPhoto").waitFor({state:"visible"});
  assert.match(await h.page.locator("#gapBefore").innerText(),/ตามอันดับ 3 อยู่ 3 แต้ม/);
  assert.match(await h.page.locator("#gapAfter").innerText(),/นำอันดับ 5 อยู่ 2 แต้ม/);
  await h.page.locator("#showBoard").click();
  await h.page.locator("#leaderboard .ranking-row").first().waitFor();
  assert.equal(await h.page.locator("#leaderboard .ranking-row").count(),20);
  assert.equal(await h.page.locator("#leaderboard .own").count(),1);
  assert.match(await h.page.locator("#leaderboard .own").innerText(),/TEST.*คุณ/s);
  assert.equal(await h.page.locator('#leaderboard img[src^="javascript"]').count(),0);
  for(let i=0;i<6;i++)await h.page.locator("#boardMore").click();
  assert.equal(await h.page.locator("#leaderboard .ranking-row").count(),125);
  assert.equal(await h.page.locator("#boardMore").isVisible(),false);
  const artifacts=path.join(__dirname,"artifacts");
  await h.page.setViewportSize({width:390,height:844});
  await h.page.screenshot({path:path.join(artifacts,"sport-ranking-390.png"),fullPage:true});
  await h.page.locator("#nav-home").click();
  await h.page.screenshot({path:path.join(artifacts,"sport-home-390.png"),fullPage:true});
  for(const width of [320,390,768]){
   await h.page.setViewportSize({width,height:844});
   assert.equal(await h.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"home overflow "+width);
   await h.page.locator("#nav-board").click();
   assert.equal(await h.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"board overflow "+width);
   await h.page.locator("#nav-home").click();
  }
 }finally{await h.close();}
 const tied=clubRows();tied[2].points=24;tied[4].points=24;
 const tie=await ui({staff:false,admin:false},{profileRole:"member",board:tied});
 try{
  await tie.page.locator("#homeRank").filter({hasText:"#4"}).waitFor();
  assert.match(await tie.page.locator("#gapBefore").innerText(),/แต้มเท่า/);
  assert.match(await tie.page.locator("#gapAfter").innerText(),/แต้มเท่า/);
 }finally{await tie.close();}
});
test("Chromium: all-month history includes undated legacy, unique bill stats and monthly summaries",async()=>{
 const history=[{id:"a",points:4,billId:1,monthId:"2026-10",createdAtMillis:Date.UTC(2026,9,20)},{id:"b",points:2,billId:1,monthId:"2026-10",createdAtMillis:Date.UTC(2026,9,19)},{id:"c",points:3,billId:2,monthId:"2026-09",createdAtMillis:Date.UTC(2026,8,20)},{id:"d",points:-1}];
 const h=await ui({staff:false,admin:false},{profileRole:"member",history,board:clubRows()});
 try{
  await h.page.locator("#allPoints").filter({hasText:"8"}).waitFor();
  assert.equal(await h.page.locator("#allBills").innerText(),"2");
  await h.page.locator("#showAllHistory").click();
  await h.page.locator("#historyCount").filter({hasText:"4 รายการ"}).waitFor();
  assert.equal(await h.page.locator("#history .list-row").count(),4);
  assert.match(await h.page.locator("#historyTotal").innerText(),/8 แต้มจากประวัติทั้งหมด/);
  assert.ok(await h.page.locator("#history").innerText().then(s=>s.includes("ไม่ระบุเดือน")));
  assert.equal(await h.page.locator("#historyMonthControls").isVisible(),false);
  await h.page.setViewportSize({width:390,height:844});
  await h.page.screenshot({path:path.join(__dirname,"artifacts/sport-history-390.png"),fullPage:true});
  await h.page.locator("#historyMonthly").click();
  await h.page.locator("#historyMonths .month-summary").first().waitFor();
  assert.equal(await h.page.locator("#historyMonths .month-summary").count(),3);
  assert.match(await h.page.locator("#historyMonths .month-summary").first().innerText(),/1 บิล.*2 รายการ.*6 แต้ม/s);
  assert.equal(await h.page.evaluate(()=>fixture.calls.some(x=>!["memberLineLogin","memberSession","memberClubData"].includes(x.name))),false);
 }finally{await h.close();}
});
test("Chromium: failed club reads and LINE profile permission keep points and initials usable",async()=>{
 const h=await ui({staff:false,admin:false},{profileRole:"member",points:12,failClub:true,failLinePhoto:true});
 try{
  await h.page.locator("#homeRank").filter({hasText:"ยังโหลดอันดับไม่ได้"}).waitFor();
  assert.equal(await h.page.locator("#monthlyPoints").innerText(),"12");
  assert.equal(await h.page.locator("#memberPhoto").isVisible(),false);
  assert.ok(await h.page.locator("#initials").isVisible());
  await h.page.locator("#showCard").click();assert.ok(await h.page.locator("#qr").isVisible());
 }finally{await h.close();}
 const wrong=await ui({staff:false,admin:false},{profileRole:"member",wrongPhotoUser:true,linePhoto:"https://profile.line-scdn.net/wrong.png",storedPhoto:"https://example.com/bad.jpg"});
 try{assert.equal(await wrong.page.locator("#memberPhoto").getAttribute("src"),null);}finally{await wrong.close();}
});
