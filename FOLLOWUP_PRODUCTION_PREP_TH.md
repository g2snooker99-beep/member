# งานต่อเนื่อง: Production wiring และ private backup — 21 ตุลาคม 2026

> อัปเดตล่าสุดหลังผู้ใช้อนุมัติ: สำรองข้อมูลจริงและกู้คืนใน Firebase ทดสอบผ่านครบ 962 เอกสาร (สมาชิก 76 คน, คะแนนรวม 241, ประวัติ 737) แฮชข้อมูลตรงกัน; ไม่เขียน Production; ล้างค่าลับและตรวจ endpoint ทั้งสองเป็น 404 แล้ว รายละเอียดและข้อจำกัดการเก็บไฟล์ถาวรอยู่ใน [REAL_BACKUP_RESTORE_2026-10-21_TH.md](REAL_BACKUP_RESTORE_2026-10-21_TH.md) ข้อความเรื่องรออนุมัติสำรองด้านล่างเป็นสถานะก่อนการอนุมัติครั้งล่าสุด ไม่ใช่สถานะปัจจุบัน ยังไม่อนุมัติเปิด Production/main


## ทำแล้วและทดสอบแล้ว

- เตรียม production runtime แยกจาก staging (ยังไม่เปิดจริง) สำหรับ /api/member
- บังคับ approved commit, project/origin, database จริงและ release manifest, backup/migration hash, dedicated credential และ owner ACL
- แยก enrollment/award activation; canary แบบอ่านอย่างเดียวไม่มี delivery loop และไม่รับ QR/join/remove writes
- แยก session signing salt ตาม production/release พร้อมตรวจสิทธิ์พนักงานปัจจุบันและจำกัด PIN login
- เลือก production LIFF จากค่าที่เซิร์ฟเวอร์ส่ง ห้าม fallback ไป LIFF ทดสอบ
- เช็คบิลสำเร็จแล้วจึงเข้าคิว ไม่เรียก Firebase ในธุรกรรมรับเงิน
- ตรวจ paid source ซ้ำก่อนส่งแต้ม; บิลยกเลิก/แก้ข้อมูล/ผู้เข้าร่วมไม่ตรงถูกพักตรวจ ไม่แก้คะแนนคืนอัตโนมัติ
- เพิ่ม launch cutoff กันการ backfill บิลก่อนเริ่มใช้งาน
- เตรียม schema แบบเพิ่มอย่างเดียว ไม่มี DDL อัตโนมัติขณะเริ่ม POS
- แยก service identity ของ Member Functions จาก legacy Editor identities พร้อม IAM plan
- CI ทดสอบ production guards, canary, session, cutoff, paid-source และ manifest กับ PostgreSQL แยก
- อ่านบิล Staging เดิม 2 บิล: sourceChecks=2, receiptChecks=2, cutoffChecks=2; ไม่สร้างบิลหรือแต้มเพิ่ม
- อ่านโปรไฟล์ A ตรงกับข้อมูลผู้ดูแลที่เคยระบุ แต่ไม่เพิ่ม ACL หรืออ้างว่าได้ล็อกอิน LINE ของ A จริง
- Preflight receipt: f3e65ac2-308b-4a52-846d-fc3df3c4a751 (passed), productionWrites=0
- Winzy.A ยัง 1 แต้มหลัง Member test backend restart; คิวมี 2 delivered ไม่มี pending

## สำรองจริงและตรวจแผนล่าสุด

รอบสำรองที่ผู้ใช้อนุมัติผ่านแล้ว: 962 เอกสาร สมาชิก 76 คน คะแนนรวม 241 แต้ม ประวัติ 737 รายการ ทดสอบกู้คืนและแฮชตรงกัน ล้างค่าลับและปิด endpoint แล้ว ดู REAL_BACKUP_RESTORE_2026-10-21_TH.md

ผลตรวจสำเนาจริงวันที่ 22 ตุลาคมพบสิทธิ์เก่าซ้ำ 3 กลุ่ม (4 รายการเกิน) และสิทธิ์ทดลอง 3 รายการ (ใช้แล้ว 2) จึงยังไม่ให้แผนย้ายผ่าน โค้ดใหม่ปฏิเสธการเปิดใช้สิทธิ์ทดลองทั้งขั้นสร้างแผนและขั้น transaction ดู MIGRATION_CHECKPOINT_REVIEW_2026-10-22_TH.md

การบันทึกไฟล์สำรอง/กุญแจถาวรผ่านช่องทาง Library รอบก่อนยังไม่สำเร็จ ไฟล์สองไฟล์ยังอยู่แยกกันในโฟลเดอร์งานส่วนตัว ต้องเก็บให้เรียบร้อยก่อน cutover

## ยังถือข้อห้ามเดิมครบ

Production/main ไม่ถูก deploy; member-3e17e ไม่มีการเขียนจากงานนี้;
ไม่ลบ/reset คะแนนจริง และไม่เอา preview/คะแนนทดลองไปแจกจริง


## ผลทดสอบที่ตรวจแล้วก่อนหยุดรออนุมัติ

- Member: 40/40 ผ่าน ไม่มี skipped รวม private restore guards และ SDK function declaration load — https://github.com/g2snooker99-beep/member/actions/runs/39609555932
- รอบแรกพบ transient emulator transaction invalid/closed; รันซ้ำเฉพาะ job ที่ล้มเหลวแล้วผ่านครบ
- POS: Python พบ 272 tests ผ่าน 225 / skipped ตาม job 47; JavaScript 12/12 ผ่าน
- PostgreSQL integration ผ่าน 41 tests และ Firestore+PostgreSQL ผ่านอีก 6 tests — https://github.com/g2snooker99-beep/g2snooker/actions/runs/39609227352
- Runtime entry/code prepared on feature branches; production service updatedAt ยังคง 16 ตุลาคม 2026
- อ่าน Winzy.A หลัง Member test API restart พบ 1 แต้ม; คิว Staging 2 delivered ไม่มี pending
- รายการทดสอบข้างต้นเป็น baseline ก่อนรอบสำรองจริงที่ผ่านแล้ว ดูรายงานวันที่ 21 และ 22 ตุลาคมสำหรับสถานะปัจจุบัน
