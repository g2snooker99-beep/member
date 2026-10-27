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
 await context.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=="https://g2-member-test-api.onrender.com")return route.abort();
  return route.fulfill({status:200,contentType:url.pathname==="/app.js"?"application/javascript":url.pathname==="/member.css"?"text/css":"text/html",body:url.pathname==="/app.js"?code:url.pathname==="/member.css"?css:html});
 });
 await page.addInitScript(({capabilities,options})=>{
  const uid="U"+"a".repeat(32);
  window.fixture={calls:[],failManual:false,deny:false,redeemed:false,closed:false,reads:[],qrs:[]};
  window.G2_MEMBER_CONFIG={firebase:{projectId:"g2-member-test"},liffId:"TEST",backendUrl:location.origin};
  window.liff={init:async()=>{},isLoggedIn:()=>true,getIDToken:()=>"test-only-line-token"};
  window.QRCode=function(el,config){window.fixture.qrs.push(config);const canvas=document.createElement("canvas");canvas.width=config.width;canvas.height=config.height;el.append(canvas);};
  window.Html5QrcodeScanner=function(){};
  const q=name=>({where(){return this;},orderBy(){return this;},limit(){return this;},
   get:async()=>{
    fixture.reads.push(name);
    if(name==="pointTransactions"&&options.delayHistory)await new Promise(resolve=>{fixture.releaseHistory=resolve;});
    const entries=name==="monthlyRewards"?(options.rewards||[]):name==="pointTransactions"?(options.history||[]):[];
    return {forEach(fn){entries.forEach((d,i)=>fn({id:d.id||String(i),data:()=>d}));}};
   },
   doc:()=>({get:async()=>{fixture.reads.push("users");return {exists:true,data:()=>({nickname:options.nickname||"TEST",role:options.profileRole||"admin",memberId:"G2-TEST",monthlyPoints:options.points??0,pointsMonth:"2026-10"})};}})
  });
  const auth=()=>({currentUser:{getIdToken:async()=>"test-token"},setPersistence:async()=>{},signInWithCustomToken:async()=>({user:{uid}})});auth.Auth={Persistence:{SESSION:"session"}};
  window.firebase={initializeApp(){},firestore:()=>({collection:q}),auth};
  window.fetch=async(url,request)=>{
   const name=url.split("/").at(-1),data=JSON.parse(request.body),f=window.fixture;f.calls.push({name,data});
   if(f.deny&&name!=="memberLineLogin")return {ok:false,json:async()=>({error:"permission-denied",message:"Access revoked"})};
   if(name==="memberAddPoints"){await new Promise(r=>setTimeout(r,30));if(f.failManual)return {ok:false,json:async()=>({error:"unavailable",message:"Temporary outage"})};}
   let result={};
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
  await h.page.locator("#history").filter({hasText:"ยังไม่มีรายการคะแนน"}).waitFor({state:"attached"});
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
