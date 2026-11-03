"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {monthsAt,runMonthCycle}=require("../month-cycle");
test("month-cycle uses Bangkok month at midnight, year and leap boundaries",()=>{
 assert.deepEqual(monthsAt(new Date("2026-10-31T16:59:59.999Z")),{current:"2026-10",previous:"2026-09"});
 assert.deepEqual(monthsAt(new Date("2026-10-31T17:00:00Z")),{current:"2026-11",previous:"2026-10"});
 assert.deepEqual(monthsAt(new Date("2026-12-31T17:00:00Z")),{current:"2027-01",previous:"2026-12"});
 assert.deepEqual(monthsAt(new Date("2028-02-29T17:00:00Z")),{current:"2028-03",previous:"2028-02"});
});
test("disabled month-cycle does not read or mutate anything",async()=>{
 assert.deepEqual(await runMonthCycle({enabled:"false"}),{state:"disabled"});
});
test("scheduled month-cycle keeps same job, Thai timezone and hourly recovery schedule",()=>{
 const job=require("../index").memberScheduledClose;
 assert.equal(job.__endpoint.scheduleTrigger.schedule,"5 * * * *");
 assert.equal(job.__endpoint.scheduleTrigger.timeZone,"Asia/Bangkok");
 assert.equal(job.__endpoint.concurrency,1);
 assert.equal(job.__endpoint.maxInstances,1);
});
