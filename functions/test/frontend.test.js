"use strict";
// DOM/controller unit tests; these do not claim camera or LINE browser acceptance.
const {test}=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path");
const publicDir=path.join(__dirname,"../../secure-public"),html=fs.readFileSync(path.join(publicDir,"index.html"),"utf8"),code=fs.readFileSync(path.join(publicDir,"app.js"),"utf8");
async function harness({profileRole="staff",capabilities={staff:true,admin:false},redeemDuplicate=false,confirmClose=true}={}){
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{hidden:true,value:"",textContent:"",disabled:false,children:[],append(x){this.children.push(x);},replaceChildren(){this.children=[];}}]));
  const uid="U"+"a".repeat(32),calls=[],storage=new Map();let failManual=false;
  const rows=[];const empty={forEach:fn=>rows.forEach(fn)};
  function query(){return {where(){return this;},orderBy(){return this;},limit(){return this;},get:async()=>empty,doc:()=>({get:async()=>({exists:true,data:()=>({nickname:"TEST",memberId:"TEST",role:profileRole,isActive:true,monthlyPoints:1,pointsMonth:"2026-10"})})})};}
  const context={document:{getElementById:id=>{assert.ok(elements.has(id),"Missing HTML control "+id);return elements.get(id);},createElement:()=>({textContent:""}),querySelectorAll:()=>[...elements.values()]},crypto,Intl,Date,location:{origin:"https://g2-member-test-api.onrender.com"},window:{G2_MEMBER_CONFIG:{firebase:{projectId:"g2-member-test"},liffId:"TEST",backendUrl:"https://g2-member-test-api.onrender.com"},confirm:()=>confirmClose},QRCode:function(){},Html5QrcodeScanner:function(){},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},liff:{init:async()=>{},isLoggedIn:()=>true,getIDToken:()=>"verified-test-only"},fetch:async(url,request)=>{
    const name=url.split("/").at(-1),data=JSON.parse(request.body);calls.push({name,data});
    if(name==="memberAddPoints"&&failManual)return {ok:false,json:async()=>({error:"unavailable",message:"temporary outage"})};
    const result=name==="memberClubData"?(data.view==="stats"?{points:0,billCount:0,count:0,months:[]}:{month:data.month,total:0,rows:[],me:null,complete:true,before:null,after:null,tieCount:0}):name==="memberLineLogin"?{customToken:"test"}:name==="memberSession"?{registered:true,active:true,capabilities}:name==="memberPreviewMonth"?{monthId:data.month,state:"open",top3:[{rank:1,nickname:"<script>unsafe</script>",points:30}],shirtCount:1,discountCount:2,canClose:true}:name==="memberRedeemReward"?{duplicate:redeemDuplicate,type:"discount10",billRef:data.billRef}:{duplicate:false};
    return {ok:true,json:async()=>({data:result})};
  }};
  const auth=()=>({currentUser:{getIdToken:async()=>"test-token"},setPersistence:async()=>{},signInWithCustomToken:async()=>({user:{uid}})});auth.Auth={Persistence:{SESSION:"session"}};
  context.firebase={initializeApp:()=>{},firestore:()=>({collection:query}),auth};vm.createContext(context);vm.runInContext(code,context);
  for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
  assert.equal(elements.get("status").textContent,"เข้าสู่ระบบแล้ว");
  return {elements,calls,storage,fail:()=>{failManual=true;},recover:()=>{failManual=false;}};
}
test("forged profile admin does not expose staff/admin menus without server capabilities",async()=>{
  const h=await harness({profileRole:"admin",capabilities:{staff:false,admin:false}});
  assert.equal(h.elements.get("staff").hidden,true);assert.equal(h.elements.get("admin").hidden,true);
});
test("staff manual pending request survives outage; retry uses same UUID and busy blocks double click",async()=>{
  const h=await harness();h.elements.get("target").value="U"+"b".repeat(32);h.elements.get("points").value="2";
  h.fail();await Promise.all([h.elements.get("add").onclick(),h.elements.get("add").onclick()]);
  const first=h.calls.filter(x=>x.name==="memberAddPoints");assert.equal(first.length,1);assert.ok(h.storage.has("g2PendingManual"));
  h.recover();await h.elements.get("retry").onclick();
  const sent=h.calls.filter(x=>x.name==="memberAddPoints");assert.equal(sent.length,2);assert.equal(sent[0].data.requestId,sent[1].data.requestId);assert.equal(h.storage.has("g2PendingManual"),false);
});
test("reward controller forwards bill reference and warns against duplicate fulfillment",async()=>{
  const h=await harness({redeemDuplicate:true});h.elements.get("rewardId").value="TEST";h.elements.get("billRef").value="B-1";
  await h.elements.get("redeem").onclick();const sent=h.calls.find(x=>x.name==="memberRedeemReward");assert.equal(sent.data.billRef,"B-1");assert.match(h.elements.get("status").textContent,/ห้ามส่งมอบเสื้อหรือให้ส่วนลดซ้ำ/);
});

test("admin reviews month without writes and cancellation never calls close",async()=>{
 const h=await harness({capabilities:{staff:true,admin:true},confirmClose:false});
 h.elements.get("month").value="2026-09";
 await h.elements.get("preview").onclick();
 assert.deepEqual(h.calls.slice(-1).map(x=>x.name),["memberPreviewMonth"]);
 assert.equal(h.calls.some(x=>x.name==="memberCloseMonth"),false);
 assert.match(h.elements.get("monthPreview").children[1].textContent,/<script>unsafe<\/script>/);
 await h.elements.get("close").onclick();
 assert.equal(h.calls.some(x=>x.name==="memberCloseMonth"),false);
 assert.match(h.elements.get("status").textContent,/ยกเลิก/);
});
test("confirmed close uses selected month and refreshes read-only summary",async()=>{
 const h=await harness({capabilities:{staff:true,admin:true}});
 h.elements.get("month").value="2026-09";await h.elements.get("close").onclick();
 const close=h.calls.filter(x=>x.name==="memberCloseMonth");assert.equal(close.length,1);assert.equal(close[0].data.month,"2026-09");
 assert.equal(h.calls.filter(x=>x.name==="memberPreviewMonth").length,2);
});
test("staff controller preserves explicit activation and never requests an admin grant",async()=>{
 const h=await harness({capabilities:{staff:true,admin:true}});
 h.elements.get("staffId").value="U"+"b".repeat(32);h.elements.get("staffRole").value="staff";h.elements.get("staffActive").checked=false;
 await h.elements.get("setStaff").onclick();
 const request=h.calls.find(x=>x.name==="memberSetStaff");assert.deepEqual(JSON.parse(JSON.stringify(request.data)),{userId:"U"+"b".repeat(32),role:"staff",isActive:false});
});
