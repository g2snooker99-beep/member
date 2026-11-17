"use strict";
function stockBridge(secret){
 if(!/^[a-f0-9]{64}$/.test(secret||""))return null;
 const url="https://g2snooker.onrender.com/api/member/reward-stock";
 async function send(d){
  const response=await fetch(url,{method:"POST",redirect:"error",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json"},body:JSON.stringify(d),signal:AbortSignal.timeout(8000)});
  const value=await response.json();
  if(response.status===409&&value.error==="stock_unavailable")throw Object.assign(Error("สินค้าไม่พอหรือหมดสต๊อก ยังไม่ได้หักแต้ม"),{code:"failed-precondition"});
  if(!response.ok)throw Error("stock bridge temporarily unavailable");
  return value;
 }
 return {catalog:async()=>(await send({operation:"catalog"})).items,
  reserve:(token,productId,qty)=>send({operation:"reserve",token,productId,qty}),
  sync:token=>send({operation:"sync",token})};
}
module.exports={stockBridge};
