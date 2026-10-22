# G2 Member — ขั้นตอนเปิดใช้และย้อนกลับ (รอเจ้าของอนุมัติ)

## ขอบเขตและหลักฐาน

- สมาชิกจริงอยู่ที่ `member-3e17e` เช่นเดิม ไม่คัดลอกฐานทดสอบเข้ามา
- ตรวจอ่านสองครั้งพบสมาชิก 76 คน รวม 241 แต้ม, ประวัติ 737 รายการ และรางวัลเก่า 20 รายการ (สถานะ used 2, active 18; ทั้งหมดพ้นเดือนใช้สิทธิ์แล้ว ไม่ใช่สิทธิ์พร้อมใช้ในเดือนตุลาคม)
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
- เจ้าของ A ล็อกอิน LINE จริงใน Staging แล้ว backend ยืนยัน staff/admin และผู้ใช้ยืนยันเมนูครบ 22 ตุลาคม ดู OWNER_STAGING_ACCEPTANCE_2026-10-22_TH.md; ก่อน production ต้องตรวจ UID/channel เดิมและ ACL ของ release จริงอีกครั้ง
- รับรองรายชื่อผู้มีอำนาจเดิม 7 บัญชีใหม่ทีละคน; ไม่ยก role ทั้งหมดเข้า ACL
- ยืนยัน backend สำหรับระบบจริง: Cloud Functions codebase `secure-member` มีโค้ดพร้อม แต่ต้องตรวจสิทธิ์การ deploy/แผน Firebase ที่รองรับก่อน อาจต้องอนุมัติการเปลี่ยนแผนและค่าใช้จ่าย
- ยืนยัน worker จริงที่ทำงานต่อเนื่องและฐานข้อมูล POS จริง ห้ามเปลี่ยน host/database ของ staging ให้ชี้ production เพื่อหลบ guard
- เตรียม release wiring แยกสำหรับ POS จริงแล้ว ดู member_integration/LIVE_RUNTIME_RELEASE.md ใน repo POS; ต้อง review commit/config ที่จะเปิดใช้หลังอนุมัติ; การตั้ง `G2_MEMBER_ENABLED=true` ใน staging เดิมจะถูกปฏิเสธโดยตั้งใจ
- เลือกที่เก็บ backup ส่วนตัวนอก Render และที่เก็บกุญแจแยกต่างหาก พร้อมผู้รับผิดชอบและระยะเก็บ
- A ยืนยันเมนูครบแล้ว; ตรวจผล Chromium UI, HTTP/Auth, Firestore และ cloud rehearsal ของ commit ที่จะปล่อยให้ผ่าน หลักฐาน Chromium ใช้ transport/SDK fixtures จึงไม่แทน LINE authorization จริง ซึ่งใช้หลักฐานการล็อกอิน A แยกกัน; การสแกนจริงใช้หลักฐาน POS/QR ที่ผ่านเดิม

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


## สถานะ checkpoint และการตรวจสำเนาจริงล่าสุด

ผู้ใช้อนุมัติรอบสำรองแล้ว สำรองและกู้คืนสำเร็จครบ 962 เอกสาร ดู [หลักฐานสำรอง/กู้คืน](REAL_BACKUP_RESTORE_2026-10-21_TH.md) ค่าลับบน Render ถูกล้างและตรวจ endpoint เป็น 404 แล้ว การอนุมัตินี้ไม่รวม Production/main

ผลตรวจแผนกับสำเนาจริงวันที่ 22 ตุลาคมพบสิทธิ์เก่าซ้ำ 3 กลุ่ม (4 รายการเกิน) และสิทธิ์ทดลอง 3 รายการ (ใช้แล้ว 2) แผนย้ายยังถูกปิดกั้น รายละเอียดใน [รายงานตรวจแผน](MIGRATION_CHECKPOINT_REVIEW_2026-10-22_TH.md) ไม่แก้หรือลบข้อมูลเดิม และไม่คืนสิทธิ์ used

ตรวจออฟไลน์ด้วยไฟล์กุญแจ binary 32 ไบต์ผ่าน G2_BACKUP_KEY_FILE แทนการพิมพ์กุญแจใน command line; กำหนดเดือนยอดเดิมและ owner UID ที่ทราบแล้วใน environment ส่วนตัว:
```text
node data-safety-cli.js review-checkpoint <encrypted-backup-file>
```
เครื่องมือนี้ไม่เชื่อม Firebase ไม่แสดงข้อมูลระบุตัวสมาชิก ไม่สร้างแผน executable และไม่อนุมัติ cutover แม้ mapping ผ่าน ต้องใช้ fresh frozen backup และ review แผนจริงตามลำดับข้างต้น


## แผนเก็บรางวัลเก่าที่หมดอายุแบบไม่แก้ไข (เตรียมแล้ว ยังรออนุมัติใช้จริง)

- ตัวเลือก `G2_LEGACY_REWARD_POLICY=preserve_expired_history` ใช้ได้เฉพาะรางวัลที่เดือนใช้สิทธิ์ผ่านไปแล้วก่อน `G2_MIGRATION_BALANCE_MONTH` อย่างเคร่งครัด
- เก็บทั้ง 20 เอกสารเดิมตาม ID/ชนิดข้อมูล/สถานะ/usedAt/ข้อมูลทดลอง/ข้อมูลซ้ำครบทุกฟิลด์ ไม่ลบ ไม่รวม ไม่เปลี่ยนเป็น available ไม่สร้างสิทธิ์แทน
- แผนมีรายการ path + before hash; apply ตรวจว่าเอกสารประวัติยังเหมือนเดิมก่อน additive member writes และปฏิเสธนโยบายที่แอบแก้รางวัลหรือใช้ cutoff ในอนาคต
- ตัวเลือกไม่เปิดโดยปริยาย โหมด strict เดิมยังปิดกั้นข้อมูลซ้ำ/ทดลอง แผนจริงยังต้อง hash approval, frozen backup, production approval และการหยุด writers ทุกข้อ
- ทดสอบกับสำเนาจริงได้ mappingReady=true, preservedHistoricalRewards=20, reward updates=0, score changes=0, readyForCutover=false
- คะแนนสมาชิกยังคงเดือนเดิมทุกบัญชี: ไม่เปลี่ยนทุกคนเป็นเดือนปัจจุบัน ก่อนเปิดเพิ่มแต้มจริงต้อง review ยอดเก่ารายเดือนและกำหนดการจัดการเดือนที่ยังไม่ปิดแยกต่างหาก ห้ามใช้การ migration เพื่อ reset หรือยกยอดเข้ารอบใหม่โดยเงียบ
- ผู้ดูแลตรวจสรุปเดือนผ่าน `memberPreviewMonth` ได้แบบอ่านอย่างเดียว ดู Top 3/จำนวนเสื้อ/ส่วนลดก่อนเลือกปิดรอบ; preview ของเดือนที่ยังเปิดเป็นข้อมูลเบื้องต้น คะแนนอาจเปลี่ยนได้ก่อนปิดรอบจริง

## การตรวจและเก็บสำรองก่อนเปิดร้านใช้

- หลักฐาน restore 962 เอกสาร hash ตรงกันผ่านแล้ว ไฟล์ backup เข้ารหัสและกุญแจแยกยังอยู่ในเครื่องผู้ใช้ การเก็บสำเนาถาวรนอกเครื่องผ่านช่องทางที่เลือกยังไม่สำเร็จ จึงเป็น release gate ที่ยังปิดไม่ได้
- ก่อน cutover ต้องเลือกพื้นที่ส่วนตัวสำหรับ archive และที่เก็บกุญแจแยก พร้อมผู้รับผิดชอบ ระยะเก็บ และรอบสำรอง; ห้ามใช้ Render filesystem เป็นที่เก็บถาวร
- หลังเลือกที่เก็บ: ทดสอบดาวน์โหลด archive/กุญแจจากจุดเก็บจริง กู้คืนลง namespace ใหม่ และเทียบจำนวน/hash อีกครั้ง ก่อนรับรอง disaster recovery
- ไม่ restore backup ทั้งฐานทับคะแนนที่เกิดหลัง backup; การซ่อม Production ต้องมีรายการและ precondition ที่อนุมัติแยก
