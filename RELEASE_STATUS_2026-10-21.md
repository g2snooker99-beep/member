> อัปเดตต่อเนื่อง: ดู [ผล Production wiring และขั้นสำรองที่รออนุมัติ](FOLLOWUP_PRODUCTION_PREP_TH.md) — โค้ด wiring เตรียมและทดสอบแล้ว แต่ยังไม่เปิดใช้งานจริง

> อัปเดตล่าสุดหลังผู้ใช้อนุมัติ: สำรองข้อมูลจริงและกู้คืนใน Firebase ทดสอบผ่านครบ 962 เอกสาร (สมาชิก 76 คน, คะแนนรวม 241, ประวัติ 737) แฮชข้อมูลตรงกัน; ไม่เขียน Production; ล้างค่าลับและตรวจ endpoint ทั้งสองเป็น 404 แล้ว รายละเอียดและข้อจำกัดการเก็บไฟล์ถาวรอยู่ใน [REAL_BACKUP_RESTORE_2026-10-21_TH.md](REAL_BACKUP_RESTORE_2026-10-21_TH.md) ข้อความเรื่องรออนุมัติสำรองด้านล่างเป็นสถานะก่อนการอนุมัติครั้งล่าสุด ไม่ใช่สถานะปัจจุบัน ยังไม่อนุมัติเปิด Production/main


# G2 Member — ผลทดสอบ Staging 21 ตุลาคม 2026

สถานะ: โค้ดส่วนสมาชิกและเครื่องมือย้ายข้อมูลอยู่ใน feature branches เท่านั้น ยังไม่ใช่การอนุมัติเปิด Production

## ยอดที่รักษาไว้

- Winzy.A บน Firebase ทดสอบ: 1 แต้ม ตามการทดสอบ LINE/QR/checkout ที่ผ่านแล้ว
- member-3e17e ตรวจอ่านอย่างเดียวสองครั้ง: สมาชิก 76 คน, คะแนนรวม 241, ประวัติ 737 รายการ
- รางวัลเดิม 20 สิทธิ์: active 18 / ใช้แล้ว 2; ทุกสิทธิ์ใช้ schema legacy จึงเตรียมตัวแปลงที่เก็บ ID และสถานะใช้แล้วไว้
- fingerprint สมาชิกก่อน/หลังการสำรวจตรงกัน ไม่มีการเขียนข้อมูลจริงหรือแจกแต้มทดลองเข้าระบบจริง

## สิ่งที่ลงมือแก้และทดสอบ

| งาน | ผลและขอบเขต |
|---|---|
| พนักงาน/เพิ่มแต้ม/สิทธิ์ | live server ACL, ปฏิเสธ role ปลอม, ถอนสิทธิ์ทันที, duplicate UUID, retry ข้ามเดือน, DOM controller/menu/busy/offline tests |
| แอดมิน/Top 3/ปิดเดือน | ปิดเดือนเฉพาะ fixture แยก, ทำต่อจาก snapshot ที่ค้าง, ไม่ลบแต้มเดือนใหม่/lifetimeHours, ไม่รวม inactive, คงกติกาคะแนนเสมอดูเวลาสมัคร |
| เสื้อ Limited / ลด 10% | ใช้พร้อมกันสำเร็จครั้งเดียว, มี audit receipt, ลด 10% ต้องมีบิล, ไม่ซ้อนสิทธิ์ในบิลเดียว, ปฏิเสธบิลใหม่หลังใช้แล้วและสิทธิ์หมดอายุ |
| Security Rules | ทดสอบ Auth/Firestore emulator จริง; ปฏิเสธ client create/update/delete สำหรับคะแนน/บทบาท/รางวัล/receipts; Rules จริงยังรออนุมัติ |
| สำรอง/กู้คืน | AES-256-GCM, manifest/checksum, typed Timestamp/bytes/GeoPoint/reference, restore ลง namespace ทดสอบว่าง, hash ตรง, กัน tamper และ overwrite |
| เตรียมย้ายข้อมูล | เครื่องมืออ่าน backup จริง, สร้าง private plan, ย้ายแบบเพิ่มฟิลด์, ตรวจ hash+approval+freeze, มี receipt รองรับ retry, ไม่ patch monthlyPoints |
| คิว/ส่งซ้ำ/Render restart | ทดสอบโปรเซสจริงคนละ boot: outbox ค้างอยู่ใน PostgreSQL, ส่งซ้ำแล้วคง 1 แต้ม; เพิ่ม bounded reconcile/delivery loop ทุก 20 วินาที |
| เปิดจริง/rollback | ดู GO_LIVE_RUNBOOK_TH.md; gates แยกการ deploy กับ activation, ห้าม rollback กลับ Rules สาธารณะ |

ข้อจำกัดของหลักฐาน UI: ทดสอบ DOM/controller และ HTTP/Auth/Firestore จริง ไม่มีการอ้างว่าได้กดเมนูแอดมินบน LINE ของเจ้าของจริงผ่าน browser automation การล็อกอิน/QR/checkout ของ Winzy.A ใช้ผลที่ผู้ใช้ทดสอบผ่านแล้ว ไม่ย้อนทดสอบซ้ำ

ส่วนลด 10% ที่ทดสอบเป็นการใช้สิทธิ์ผูกเลขบิลผ่านหน้าพนักงาน ยังไม่ได้เปลี่ยนการลดราคาที่ POS ให้ทำอัตโนมัติ

## หลักฐาน CI และ cloud

- Member: 38/38 ผ่าน ไม่มี skipped — [Actions](https://github.com/g2snooker99-beep/member/actions/runs/39575205735)
- POS helper CI: พบ 253 Python tests, ผ่าน 211/skip ตาม job 42; JavaScript 11/11 ผ่าน — [Actions](https://github.com/g2snooker99-beep/g2snooker/actions/runs/39575339945)
- Job PostgreSQL/Firestore integration ผ่าน รวม reconciliation/concurrent claims/outage/lost acknowledgement
- Restart receipt: 0ea62f7b-f21d-452c-bbc7-e489f8e84fc2, before/after points=1, คนละ server boot
- Read-only inventory receipt: 9146d40e-5c48-4e42-84aa-7ca97ea2b8aa
- คิว Staging สุดท้าย 2 รายการ delivered ไม่มี pending; บิลทดลอง B261021015307 ยังถูกกันไว้
- ตัวส่งคิว started 09:15:06 UTC บน g2-member-test เท่านั้น
- Runtime code Member: 77075d73b4e711126a127019604678bdf9d00fe5; POS: 308ec395731f8b9cbf58f6604bb786f315340634
- Cloud rehearsal ล่าสุดผ่าน 8 checks เมื่อ 09:17:34 UTC: e435c845-4a6a-4d4b-99c9-d76fb4ccf85b
- สำรอง/กู้คืน fixture 29 เอกสาร hash ตรงกัน: 556b2120602fc3717e7e51ff29148d76bea1d55a78a7a1ef00bf6be4f146ae85
- ซ้อม migration จริงบน Firestore Staging: คะแนนเดิม 17/23 แต้มไม่เปลี่ยน, memberId เดิมคงอยู่, timestamp/history เดิมครบ, รางวัลที่ใช้แล้วไม่ถูกเปิดคืน และ retry ไม่ย้ายซ้ำ
- Owner HTTP session/close-month retry/set-staff ผ่านด้วย Firebase ID token จริงของ fixture แยก ไม่ใช่ LINE owner ของร้านจริง

## ยังไม่ผ่านเงื่อนไขเปิดจริง

1. ต้องยืนยัน LINE UID ผู้ดูแลและรับรองบัญชีสิทธิ์เดิม 7 บัญชีใหม่
2. ต้องสำรองข้อมูลจริงไว้ปลายทางส่วนตัวที่เลือก พร้อมกุญแจแยก และทดสอบ restore ของ backup จริงก่อน migration
3. Production Rules ยังเป็นเวอร์ชันเดิมที่เคยพบช่องโหว่ และยังมี legacy Admin SDK writers; ต้องอนุมัติเปลี่ยนพร้อม frontend/backend ห้ามปล่อย Rules เดี่ยว ๆ
4. production POS wiring/worker เตรียมและทดสอบแล้วตามรายงานต่อเนื่อง แต่ต้องตั้งค่า production runtime/credential/manifest หลังอนุมัติ; Render POS จริงปัจจุบันเป็น Starter แต่ staging integration ถูก guard ไม่ให้เปิดด้วยการสลับตัวแปรอย่างเดียว
5. จึงยังไม่ควรอนุมัติเปิดจริงเพียงเพราะ CI ผ่าน ต้องตรวจ release checklist และ commit ชุดสุดท้ายก่อน

ไม่เคย Deploy Production/main, เปลี่ยน Rules จริง, reset/ลบแต้มสมาชิกจริง หรือย้ายคะแนนทดลองเข้าระบบจริงในงานนี้
