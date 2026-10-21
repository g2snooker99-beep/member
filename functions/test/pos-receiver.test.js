"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{createHmac}=require("node:crypto"),http=require("node:http");
const {verifySignature}=require("../pos-receiver"),{createHandler}=require("../render-http");
test("POS signature binds timestamp, exact body and action; stale/forged calls denied",()=>{
  const key="test-only-key-".repeat(5),timestamp="1792558800",path="/internal/pos/apply",body='{"item":{"points":37}}';
  const signature=createHmac("sha256",key).update(timestamp+"\n"+path+"\n"+body).digest("hex"),args={key,timestamp,path,body,signature,now:Number(timestamp)*1000};
  assert.equal(verifySignature(args),true);
  for(const patch of [{key:"wrong"},{body:body.replace("37","74")},{path:"/internal/pos/member"},{now:args.now+61000},{signature:"a".repeat(64)}])assert.equal(verifySignature({...args,...patch}),false);
});
test("internal receiver requires valid server HMAC, not browser staff tokens",async()=>{
  const key="test-only-key-".repeat(5),timestamp=String(Math.floor(Date.now()/1000)),path="/internal/pos/month",body='{"month":"2026-10"}';
  const server=http.createServer(createHandler({service:null,auth:null,origin:"https://g2-member-test-api.onrender.com",posKey:key,posReceiver:{month:async m=>{assert.equal(m,"2026-10");return "open";}}}));
  await new Promise(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+server.address().port+path;
  try{
    assert.equal((await fetch(url,{method:"POST",body})).status,401);
    const signature=createHmac("sha256",key).update(timestamp+"\n"+path+"\n"+body).digest("hex");
    const r=await fetch(url,{method:"POST",body,headers:{"X-G2-Timestamp":timestamp,"X-G2-Signature":signature}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{data:"open"});
  }finally{await new Promise(r=>server.close(r));}
});
