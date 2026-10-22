# G2 Member — สถานะงานล่าสุด 22 ตุลาคม 2569

โค้ดและการทดสอบ Staging รอบล่าสุดผ่านแล้ว ดู [รายงานครบ 8 ข้อ](STAGING_COMPLETION_2026-10-22_TH.md)

- Firebase/Auth/Rules/ธุรกรรม 60/60 และ Chromium UI 5/5 ผ่าน ไม่มี skipped
- Cloud rehearsal 11 กลุ่มตรวจผ่านบน g2-member-test; Winzy.A ยัง 1 แต้ม, productionWrites=0
- A ล็อกอินจริงและผู้ใช้ยืนยันเมนูพนักงาน/แอดมินครบแล้ว
- มีสรุป Top 3/รางวัลแบบอ่านอย่างเดียวก่อนปิดเดือน และ guard ห้ามใช้รางวัลทดลอง/ใช้แล้ว
- candidate ย้ายข้อมูลจริงรักษา 76 สมาชิก 241 คะแนน 737 ประวัติ และเก็บ 20 รางวัลหมดอายุเดิมโดยไม่แก้ไข; ยังรออนุมัตินโยบายก่อนสร้างแผนจริง
- 6 บัญชีค้างคะแนนเก่ารวม 134 แต้มยังไม่เปลี่ยนเดือน/คะแนน การเพิ่มข้ามรอบถูก block จนมีแนวทางที่อนุมัติ
- สำรองจริง/restore 962 เอกสารผ่านแล้ว แต่ที่เก็บ archive/กุญแจถาวรนอกเครื่องยังไม่สำเร็จ
- Production/main/Rules จริง/legacy writers ยังไม่ถูกเปลี่ยน ต้องมี freeze, fresh backup, reviewed hashes และอนุมัติเปิดจริงตาม [runbook](GO_LIVE_RUNBOOK_TH.md)

รายงานเก่าเป็นประวัติของแต่ละรอบ:
- REAL_BACKUP_RESTORE_2026-10-21_TH.md
- MIGRATION_CHECKPOINT_REVIEW_2026-10-22_TH.md
- OWNER_STAGING_ACCEPTANCE_2026-10-22_TH.md

การอนุมัติให้ทำ Staging ต่อและรอบสำรองที่ผ่านมา ไม่ใช่การอนุมัติเปิด Production
