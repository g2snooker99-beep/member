# ผลตรวจ G2 Snooker Member ใน Staging — 22 ตุลาคม 2569

สถานะ: **งานโค้ดและการทดสอบ Staging รอบนี้ผ่าน / ยังไม่อนุญาตเปิด Production**  
ไม่มีการลบหรือ reset คะแนนจริง ไม่มีการนำแต้มทดลองไปแจกจริง และไม่ได้ deploy/merge main

## ผลตามขอบเขต 8 ข้อ

| งาน | ผลและหลักฐาน |
|---|---|
| 1. หน้าพนักงาน / เพิ่มแต้ม / สิทธิ์ | ผ่าน transaction, UUID retry, HTTP Auth, ถอน ACL มีผลทันที; Chromium ทดสอบเน็ตหลุด/reload แล้วใช้ UUID เดิม; A ล็อกอินจริงและยืนยันเมนูครบ |
| 2. แอดมิน / Top 3 / ปิดเดือน | ผ่านลำดับคะแนนและ tie ตามเวลาสมัคร/UID, ตัด staff/admin และ inactive, ปิดซ้ำไม่แจกซ้ำ, ทำต่อจาก closing ได้, แต้มเดือนใหม่และ lifetimeHours ไม่ถูกลบ; เพิ่มสรุปเดือนแบบอ่านอย่างเดียวก่อนกดปิด |
| 3. เสื้อ Limited / ส่วนลด 10% | ผ่าน concurrent redemption ให้สำเร็จครั้งเดียว, ส่วนลดต้องมีบิล, บิลเดียวใช้ส่วนลดซ้อนไม่ได้, ต่างบิล retry ถูกปฏิเสธ, เดือนผิดถูกปฏิเสธ; เพิ่ม guard ข้อมูลทดลองและ usedAt ที่สถานะขัดแย้ง |
| 4. Firestore Rules | ผ่าน create/update/delete bypass ทุก client role รวม admin, forged token role/legacy role, private receipts/ACL/history ownership; Rules จริงยังรอ release ที่อนุมัติ และ Rules ไม่หยุด legacy Admin SDK writers ให้เอง |
| 5. สำรอง / กู้คืน | สำรองจริงเดิม 962 เอกสารและ restore namespace ทดสอบ hash ตรงกัน; รอบนี้ typed fixture 30 เอกสาร hash ตรงกันและป้องกัน overwrite; จุดเก็บถาวรนอกเครื่องยังเป็น release gate |
| 6. เตรียมย้าย member-3e17e | เพิ่มตัวเลือกเก็บรางวัลหมดอายุเดิมแบบไม่เปลี่ยนข้อมูล; ตรวจสำเนาจริง 76 สมาชิก/241 แต้ม/737 ประวัติ/20 รางวัล ผ่าน mapping แบบ candidate; ไม่สร้าง executable production plan จาก checkpoint และไม่มี production write |
| 7. แต้มค้าง / ส่งซ้ำ / restart | ใช้หลักฐาน PG outbox/lost acknowledgement/restart ที่ผ่านเดิม; รอบนี้ทดสอบ manual retry ข้ามเดือน/reload และ deploy/restart test backend; Winzy.A คง 1 แต้ม ไม่สร้างบิล POS เพิ่ม |
| 8. เปิดใช้ / rollback | อัปเดต GO_LIVE_RUNBOOK_TH.md ระบุ freeze, fresh backup/hash, legacy writers, gates และ rollback; คง queue/receipts ไม่ restore ทับคะแนนหลัง backup |

## โค้ดและการทดสอบจริง

- [Commit ที่ deploy Staging](https://github.com/g2snooker99-beep/member/commit/c3e71c88fad822cdbc6a5c11a7da370ea4b31396)
- [CI ล่าสุด](https://github.com/g2snooker99-beep/member/actions/runs/39709537392)
- Node 22 + Firestore/Auth emulator: **60/60 ผ่าน, fail 0, skipped 0**
- Real Chromium: **5/5 ผ่าน, fail 0, skipped 0**
- Chromium ใช้ deterministic SDK/HTTP fixtures สำหรับ UI ไม่อ้างว่าเป็น LINE OAuth จริง; ใช้การล็อกอิน A และการยืนยันเมนูของผู้ใช้เป็นหลักฐาน identity แยก
- Local focused suite: 24/24 ผ่าน ก่อน CI; syntax check ทุกไฟล์ผ่าน
- Cloud rehearsal บน g2-member-test: **11 กลุ่มตรวจผ่าน** เมื่อ 09:10:12 น. กรุงเทพฯ
- receipt: releaseRehearsals/eb610745-2a3a-4452-a9f7-806a99fe11d4
- Deploy ทดสอบ: dep-dbcn0dmi0phs73fcdvbg
- fixture restore hash: 8f63d8554dc0ba17c2d3ba4bb8f0324e6fe868066c0b45d39b14865a76ef88bb (source/restore ตรงกัน)
- Winzy.A = 1; productionWrites = 0
- หลัง deploy: GET / และ /app.js = 200, preview code ใหม่ถูกเสิร์ฟ; /health = 200, project g2-member-test, awardsEnabled=false; private restore = 404
- Cleanup deploy: dep-dbcn1aavcj2c73f73bp0 live เมื่อ 09:11:36 น. กรุงเทพฯ; ล้าง release/rehearsal/browser approval flags แล้ว หลัง restart ไม่พบการเรียก rehearsal ซ้ำหรือ error ใน app logs ที่ตรวจ; ตรวจ GET / และ /health = 200, month preview ไม่มี token = 401, private restore = 404

## สำเนาจริงและเดือนคะแนนเดิม

| เดือนคะแนน | สมาชิก | คะแนนรวม | บัญชีมีคะแนน |
|---|---:|---:|---:|
| 2026-07 | 9 | 10 | 1 |
| 2026-08 | 20 | 0 | 0 |
| 2026-09 | 5 | 124 | 5 |
| 2026-10 | 10 | 107 | 10 |
| ไม่มีเดือน | 32 | 0 | 0 |
| รวม | 76 | 241 | 16 |

32 บัญชีที่ยังไม่มีเดือนมี 0 คะแนน จึงไม่มีคะแนนไม่ทราบเดือนที่ต้องย้ายแบบเดา  
มี 6 บัญชีค้างเดือนกรกฎาคม/กันยายนรวม 134 แต้ม ยังคงคะแนนและเดือนเดิมทั้งหมด  
การเพิ่มแต้มเดือนใหม่ให้บัญชีที่ยอดเก่าไม่เป็นศูนย์จะถูก block ตาม guard เดิม ห้ามเงียบ ๆ ยกยอดเข้ารอบใหม่/reset/ปิดย้อนหลังเพื่อให้ผ่าน ต้องมีนโยบายที่เจ้าของอนุมัติแยก

## แผนรางวัลเก่าที่เสนอให้อนุมัติ

รางวัลเก่า 20 รายการ (กรกฎาคม 13 / สิงหาคม 7) พ้นเดือนใช้สิทธิ์แล้วทั้งหมด  
พบซ้ำ 3 กลุ่ม/เกิน 4 เอกสาร และมีเครื่องหมายทดลอง 3 รายการ (ใช้แล้ว 2) จึงไม่ normalize หรือเลือกสิทธิ์ที่ชนะให้เอง

ตัวเลือก preserve_expired_history จะ:
- เก็บ 20 เอกสารเดิมทุกฟิลด์และ ID ไว้เป็นประวัติ ไม่ลบ ไม่รวม ไม่คืนสิทธิ์ used ไม่เปลี่ยนเป็น available
- สร้าง reward updates = 0; เปรียบเทียบ before hash ก่อน additive migration
- ปฏิเสธ cutoff ในอนาคต, สิทธิ์ที่เดือนใช้ยังไม่ผ่าน, แผนที่แอบแก้รางวัล หรือ source ที่เปลี่ยนหลัง backup
- ไม่เปิดตัวเลือกโดยปริยาย และยังต้องได้รับอนุมัติ production plan/backup hash กับ writer freeze
- ตรวจ checkpoint แบบอ่านอย่างเดียวได้ mappingReady=true, protectedFieldChanges=0, balancesReset=0, importedTestScores=0
- readyForCutover=false เพราะ checkpoint ไม่ใช่ fresh frozen backup

ดูผลออฟไลน์แบบไม่ระบุตัวสมาชิกใน STAGING_MIGRATION_CANDIDATE_2026-10-22.json  
ค่า ownerLoginVerified=false ในผลออฟไลน์หมายถึงเครื่องมือออฟไลน์ตรวจ login ไม่ได้; หลักฐาน A จริงอยู่ใน OWNER_STAGING_ACCEPTANCE_2026-10-22_TH.md

## สิ่งที่ต้องตัดสินใจ/อนุมัติก่อนเปิดจริง

1. ยืนยันนโยบายรางวัลเก่า: เก็บทั้ง 20 รายการแบบไม่แก้ไขตาม candidate ข้างต้น
2. ยืนยันแนวทาง 134 แต้มเก่าของ 6 บัญชี: ค่าเริ่มต้นคือคงเดิมและพักการเพิ่มข้ามรอบเฉพาะบัญชีเหล่านี้ จนมีรายการจัดการที่ตรวจแล้ว; งานนี้ไม่ reset หรือย้ายเดือนไปเอง
3. ยืนยันที่เก็บ archive ส่วนตัวและกุญแจแยก พร้อมผู้รับผิดชอบ/ระยะเก็บ แล้วทดสอบกู้คืนจากจุดเก็บนั้นจริง การอัปโหลดถาวรผ่านช่องทางเดิมยังไม่สำเร็จ ห้ามอ้างว่ามี offsite copy แล้ว
4. อนุมัติช่วง maintenance, ผู้เขียนข้อมูล legacy ที่ต้องหยุด, backend Cloud Functions secure-member/dedicated IAM และ worker ของ POS จริงตาม release wiring; ไม่เพิ่ม billing/plan โดยพลการ
5. รายชื่อสิทธิ์เริ่มต้นที่เสนอ: owner A คนเดียว ไม่ import legacy privileged users 7 บัญชีโดยอัตโนมัติ; เพิ่มพนักงานภายหลังผ่าน A ตามรายชื่อที่รับรอง
6. หลังเงื่อนไขข้างต้นครบ: fresh frozen backup -> restore verification -> private plan/hash review -> ระบุ commit ทั้ง Member/POS -> ขออนุมัติ deploy/main และเปิด mutation/award gates เป็นขั้นตอนสุดท้าย

ไม่มีการขอให้ผู้ใช้ทดสอบ POS/QR/การคำนวณแต้มที่ผ่านแล้วซ้ำ และไม่จำเป็นต้องให้ผู้ใช้เพิ่มแต้มจริงหรือปิดเดือนจริงเพื่อจบการทดสอบ Staging นี้

## การย้อนกลับ

ปิด mutation/award producer และ consumer ก่อน เก็บ queue/receipts ทั้งหมดไว้ ใช้ retry/reconcile key เดิม  
ถอยไป secure build ที่เข้ากันหรือ maintenance ไม่คืน Rules/legacy writers ที่ไม่ปลอดภัย  
กู้ backup ลงพื้นที่แยกและตรวจรายเอกสารก่อนซ่อมจริง ไม่ restore ทั้งฐานทับธุรกรรมหลัง backup  
รายละเอียดลำดับและข้ออนุมัติใน GO_LIVE_RUNBOOK_TH.md

Production Render ยัง branch main และ updatedAt 2026-10-16T16:37:08.676732Z เมื่ออ่านตรวจรอบนี้
