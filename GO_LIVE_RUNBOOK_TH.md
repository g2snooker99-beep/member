# G2 Member — ขั้นตอนเปิดใช้และย้อนกลับ (รอเจ้าของอนุมัติ)

## ขอบเขตและหลักฐาน

- สมาชิกจริงอยู่ที่ `member-3e17e` เช่นเดิม ไม่คัดลอกฐานทดสอบเข้ามา
- ตรวจอ่านสองครั้งพบสมาชิก 76 คน รวม 241 แต้ม, ประวัติ 737 รายการ และรางวัล 20 สิทธิ์ (ใช้แล้ว 2, ยัง active 18)
- fingerprint สมาชิกตรงกันทั้งสองครั้ง: `292e7d764ab8720ec6ee09b8c45625d0efc9de00c2925bd959fdd7ec25a077a9`
- ไม่มีการเขียนข้อมูลจริงในขั้นเตรียมระบบนี้ ไม่ได้เปลี่ยน Production/main หรือ Rules จริง
- Winzy.A ใน `g2-member-test` คง 1 แต้ม ผล POS/LINE/QR/การคิดแต้มที่ผ่านแล้วใช้หลักฐานเดิม

## สิ่งที่โค้ดเตรียมไว้

1. เมนูพนักงาน/แอดมินอิงสิทธิ์ที่เซิร์ฟเวอร์อ่านสดจาก `memberStaffAccess` ไม่เชื่อ role ในเบราว์เซอร์หรือ role เดิม
2. เพิ่มแต้ม 1–3 แต้มต่อคำขอ พร้อม UUID เดิมสำหรับ retry; คำขอที่สำเร็จแล้วตรวจพบซ้ำได้แม้เปลี่ยนเดือน
3. ปิดเฉพาะเดือนที่จบแล้ว ล็อกการเพิ่มแต้มก่อน snapshot; ทำต่อหลังค้างได้และไม่ลบแต้มเดือนใหม่หรือ lifetimeHours
4. Top 3 เรียงคะแนนมากก่อน, คะแนนเท่ากันดูเวลาสมัครก่อน, ใช้ UID เป็นลำดับสุดท้าย; บัญชีไม่ active ไม่เข้ารับรางวัล
5. Top 3 ได้เสื้อ Limited; ผู้ที่ไม่ติด Top 3 และได้อย่างน้อย 15 แต้มได้ส่วนลด 10% ใช้เดือนถัดไปหนึ่งครั้ง
6. ใช้รางวัลใน transaction เดียวกับ receipt; ส่วนลดต้องระบุเลขบิล และหนึ่งบิลใช้สิทธิ์ส่วนลดซ้อนกันไม่ได้
7. รหัสบิลเป็นหลักฐานผูกสิทธิ์ที่พนักงานกรอก ไม่ใช่การลดราคาที่ POS อัตโนมัติ การส่งมอบเสื้อ/คิดส่วนลดต้องปฏิบัติตามผลยืนยันของระบบ
8. ข้อมูลสำรองเข้ารหัส AES-256-GCM มี checksum/จำนวนเอกสารและชนิดข้อมูล Firestore; กู้คืนลงพื้นที่ทดสอบว่างเท่านั้น ไม่มี overwrite
9. แผนย้ายเพิ่มฟิลด์ที่ขาด รักษา UID/memberId/คะแนน/ประวัติ/ฟิลด์เดิม แปลงรางวัล legacy โดยไม่คืนสิทธิ์ที่ใช้ไปแล้ว และสร้าง public leaderboard จากยอดเดิม
10. การย้ายจริงต้องระบุ hash ของแผนและ backup ที่ตรวจแล้ว พร้อม approval และหยุดผู้เขียนข้อมูล; มี receipt ต่อรายการเพื่อทำต่อได้
11. `MEMBER_MUTATIONS_ENABLED` ของ Cloud Functions ค่าเริ่มต้น false รวมถึง scheduled month close; `G2_MEMBER_ENABLED` ของ POS ยังคง false
12. Staging มี loop ตรวจ outbox/reconcile ทุก 20 วินาทีแบบจำกัดจำนวน; lease อยู่ใน PostgreSQL ไม่อยู่ในหน่วยความจำ

## ก่อนขออนุมัติเปิดจริง

- ตรวจ CI ของ commit ที่จะปล่อย และหลักฐาน cloud rehearsal ล่าสุดให้ผ่าน
- เจ้าของยืนยัน LINE UID ของผู้ดูแลด้วยการล็อกอินจริง ห้ามอนุมัติจาก users.role เดิมล้วน ๆ
- รับรองรายชื่อผู้มีอำนาจเดิม 7 บัญชีใหม่ทีละคน; ไม่ยก role ทั้งหมดเข้า ACL
- ยืนยัน backend สำหรับระบบจริง: Cloud Functions codebase `secure-member` มีโค้ดพร้อม แต่ต้องตรวจสิทธิ์การ deploy/แผน Firebase ที่รองรับก่อน อาจต้องอนุมัติการเปลี่ยนแผนและค่าใช้จ่าย
- ยืนยัน worker จริงที่ทำงานต่อเนื่องและฐานข้อมูล POS จริง ห้ามเปลี่ยน host/database ของ staging ให้ชี้ production เพื่อหลบ guard
- ต้องเตรียม release wiring สำหรับ POS จริงจากเวอร์ชัน Staging ที่ตรวจแล้ว; การตั้ง `G2_MEMBER_ENABLED=true` ใน staging เดิมจะถูกปฏิเสธโดยตั้งใจ
- เลือกที่เก็บ backup ส่วนตัวนอก Render และที่เก็บกุญแจแยกต่างหาก พร้อมผู้รับผิดชอบและระยะเก็บ
- ทดสอบเมนูพนักงาน/แอดมินด้วย LINE ของผู้มีสิทธิ์จริงก่อนเปิดให้ร้านใช้ หลักฐานอัตโนมัติปัจจุบันครอบคลุม DOM controller, HTTP/Auth และ Firestore; ไม่ใช่การรับรอง camera/browser ของแอดมินจริง

## ลำดับดำเนินการหลังได้รับอนุมัติเท่านั้น

1. กำหนดเวลา maintenance และจด commit, config, Rules, indexes, IAM, รายการ Functions/Scheduler และยอด baseline ล่าสุด
2. คง POS awards และ MEMBER_MUTATIONS_ENABLED=false หยุด writer ของ Member รุ่นเก่าและงานปิดเดือน โดยไม่แตะงานพิมพ์บิลที่ไม่เกี่ยวข้อง
3. สำรวจ Functions จริงทั้ง 22 รายการ ระบุ/หยุดตัวที่เขียนคะแนนและรางวัล เช่น monthlyAwards, archiveAndResetMonthlyPoints, HTTP/test/reset/reward/migrate/repair endpoints; Rules ปิดช่องทาง Admin SDK เหล่านี้ไม่ได้ ห้ามลบ Functions ทั้งหมดแบบเหมารวม
4. สำรองข้อมูลสมาชิก/ประวัติ/รางวัล/ผลเดือน/receipts/ACL และ collections legacy ที่เกี่ยวข้อง รวม Rules/config/IAM ปัจจุบันไว้ด้วย ห้ามเก็บ raw backup หรือ private plan ใน GitHub หรือแชต
5. ตรวจ checksum, จำนวนเอกสาร,ยอดแต้มรวม และทดสอบกู้คืน backup จริงลง namespace ทดสอบใหม่ เก็บหลักฐานเปรียบเทียบ ก่อนดำเนินการย้าย
6. สร้าง private migration plan จาก backup ของ member-3e17e เท่านั้น ตรวจ problems ทุกข้อและยืนยันเดือนของยอดเดิม ไม่คำนวณยอดจริงใหม่จากประวัติและไม่ import preview/test points
7. เจ้าของอนุมัติ hash ของแผนและ backup จากนั้นใช้ apply-reviewed-plan ภายใต้ credential เฉพาะงานย้าย โค้ดไม่อนุญาต patch monthlyPoints หรือเปลี่ยน memberId ที่มีอยู่
8. ปล่อย backend/frontend/Rules/indexes ที่เข้ากันเป็นชุด โดยคง mutation gate ปิด; config หน้าเว็บใช้ Firebase จริงและ LINE channel เดิมเพื่อรักษา UID
9. เปรียบเทียบสมาชิก 76 ราย/ยอด baseline ล่าสุดแบบราย UID และตรวจรางวัลใช้แล้ว ไม่ใช้เพียงยอดรวม 241 เป็นหลักฐานว่าทุกบัญชีตรง
10. เปิด month gate ผ่านผู้ดูแลที่ยืนยันแล้วหลังตรวจยอด/ประวัติ; ไม่สั่ง closeMonth ของสมาชิกจริงเป็น canary
11. หลังอนุมัติ activation อีกครั้งจึงเปิด manual/reward writes และ production queue consumer ตาม release wiring ที่ผ่าน review แล้ว ค่อยเปิด POS award producer สำหรับบิลใหม่หลังเวลาตัดระบบ
12. ตรวจ outbox age/retry/blocked, duplicate conflicts, error rate, readiness และตัวอย่าง receipt; ห้ามนำบิลทดลอง B261021015307 หรือ preview drafts มาแจกจริง

## เครื่องมือข้อมูล

ตั้ง credential file และ encryption key ใน environment ส่วนตัว ไม่ใส่ key ลง command line หรือ repository:
- `G2_DATA_SERVICE_ACCOUNT_FILE`: ไฟล์ credential ที่ตรง project และงานอ่าน/ย้าย
- `G2_BACKUP_KEY_HEX`: กุญแจ 32 ไบต์ (64 hex) เก็บแยกจาก archive
- `G2_BACKUP_WRITERS_PAUSED=confirmed`: ใช้ได้หลังหยุดผู้เขียนข้อมูลจริงแล้วเท่านั้น
- `MEMBER_OWNER_LINE_UID`, `G2_APPROVED_STAFF_UIDS`, `G2_MIGRATION_BALANCE_MONTH`: ค่าที่เจ้าของตรวจแล้ว

เรียกจาก functions directory:
```text
node data-safety-cli.js export <private-encrypted-backup-file>
node data-safety-cli.js inspect <private-encrypted-backup-file>
node data-safety-cli.js restore-dry-run <backup-file> g2-member-test restoreRehearsals/<new-uuid>
node data-safety-cli.js restore-test <backup-file> g2-member-test restoreRehearsals/<new-uuid>
node data-safety-cli.js migration-plan <production-backup-file> <private-plan-file>
```

เฉพาะหลังอนุมัติจริง: `apply-reviewed-plan <private-plan-file>` ต้องมี `G2_APPROVED_PRODUCTION_PLAN_SHA`, `G2_APPROVED_BACKUP_SHA`, `G2_PRODUCTION_MIGRATION_APPROVED=true` และ freeze confirmation ตรงกัน โหมดเริ่มต้นปฏิเสธการย้ายจริง การ restore ไม่รองรับเขียนทับ production

## เมื่อเกิดปัญหา

1. ปิด MEMBER_MUTATIONS_ENABLED และหยุด producer/consumer ของ production ก่อน เก็บคิวและ receipts ทั้งหมดไว้ บิลขายยังต้องเก็บตามระบบ POS
2. เก็บ deploy ID/config/logs และเวลาเกิดเหตุ ตรวจ PostgreSQL outbox เทียบ Firestore receipt ด้วย immutable bill/member key
3. หลังเขียน remote สำเร็จแต่ไม่ได้ acknowledgement ให้ retry/reconcile key เดิม ห้ามสร้างรายการใหม่หรือลบ receipt
4. กลับไปใช้ backend/frontend รุ่น secure ที่เข้ากันได้ หรือแสดง maintenance; ห้าม rollback ไป Rules ที่เปิดเขียนสาธารณะ หรือเปิด legacy reset/reward endpoints คืน
5. การย้ายมีแต่เพิ่มฟิลด์และ receipts จึงไม่ต้องลบฟิลด์ใหม่เพื่อ rollback; คะแนนเดิมไม่ถูก reset โดยงานย้าย
6. กู้คืน backup ลงพื้นที่แยกและตรวจสอบก่อน หากต้องซ่อมข้อมูลจริงต้องอนุมัติรายการซ่อมพร้อม precondition รายเอกสาร ห้าม restore ทั้งฐานทับยอดที่เกิดหลัง backup
7. ปัญหาคิวข้ามเดือนที่ไม่มี receipt ให้หยุดรอตรวจ ไม่ปล่อยแต้มเข้าเดือนใหม่เอง ไม่ทิ้งคิวเงียบ ๆ
8. เปิด producer/consumer กลับหลังตรวจครบและเจ้าของอนุมัติ โดยกำหนด backlog ที่จะส่งอย่างชัดเจน

## สิ่งที่ยังต้องอนุมัติ

- UID ผู้ดูแลและรายชื่อพนักงานที่รับรองใหม่
- ที่เก็บ backup/กุญแจ, ช่วงหยุดเขียน และ hash ของ migration plan/backup
- การจัดการ legacy writers และ backend/worker จริง รวมค่าใช้จ่ายที่เกี่ยวข้อง
- ชุด deploy ที่ระบุ commit แน่นอนและการเปิด production mutation/award gates
