# ยืนยันบัญชีเจ้าของร้านใน Staging — 22 ตุลาคม 2026

## ผลจริง

- ผู้ใช้ล็อกอิน LINE และสมัครบัญชี A ใน Member Staging แล้ว รหัสสมาชิกที่แสดงตรงกับ UID เจ้าของที่ทราบอยู่เดิม
- ตรวจจาก Firebase Authentication ฝั่งเซิร์ฟเวอร์พบ registered=true และ recentBrowserSignIn=true
- ก่อนผูกสิทธิ์: profileRole=member, pinnedOwnerMatches=false, capabilities staff=false/admin=false
- เปลี่ยนค่าตรึงเจ้าของเฉพาะ Member Staging ให้ตรงกับ A แล้วผูก role และ server-owned ACL ผ่าน transaction
- หลังผูกสิทธิ์: service.session ตรวจจริงได้ capabilities staff=true/admin=true
- แต้มก่อน/หลัง 0; pointsWritten=0, productionWrites=0
- รหัสสมาชิกทดสอบ, lifetimeHours และฟิลด์เดิมไม่ถูกเขียนทับ ไม่มีการสร้าง custom token/claims ในงานผูกสิทธิ์
- ไม่ได้เพิ่มสิทธิ์ให้พนักงานคนอื่น
- ผู้ใช้ยืนยันวันที่ 22 ตุลาคมว่าเมนู เพิ่มแต้มสมาชิก / จัดการรอบเดือน / สิทธิ์พนักงาน ขึ้นครบแล้ว การเพิ่มแต้ม/ปิดเดือน/แลกรางวัลทดสอบอัตโนมัติด้วยข้อมูลจำลองแยก ไม่บังคับให้ผู้ใช้ทำรายการจริงซ้ำ

## หลักฐาน

- [CI](https://github.com/g2snooker99-beep/member/actions/runs/39706728562): **51/51 ผ่าน ไม่มี skipped**, Node 22 พร้อม Firestore/Auth emulator
- [โค้ดที่ตรวจและ deploy](https://github.com/g2snooker99-beep/member/commit/c4417e174e76188eaed9fe6f33c4ffab42e459fb)
- ตรวจแบบอ่านอย่างเดียว: 2026-10-22T01:40:25.075086631Z
- ผูกสิทธิ์สำเร็จและตรวจ session: 2026-10-22T01:41:54.941908532Z (08:41:54 น. กรุงเทพฯ)
- Deploy ที่ผูกสิทธิ์: dep-dbcmjdbrjlhs73e0o0d0
- Run receipt ในฐานทดสอบ: testOwnerApprovals/63e33167-0095-46e6-8eef-4190cb78c3e0

## ขอบเขต

เครื่องมือ approve-test-owner.js ไม่ถูกเปิดเป็น HTTP endpoint ต้องมี operator configuration และปฏิเสธ production project/origin, emulator, บัญชีที่ไม่ได้ล็อกอินล่าสุด, โปรไฟล์/ACL ที่ขัดแย้ง และสิทธิ์ที่เคยถูกถอน การ replay receipt ไม่คืนสิทธิ์ที่ถูกถอนให้เอง

ล้าง G2_TEST_OWNER_UID, G2_TEST_OWNER_APPROVAL_RUN_ID และ G2_TEST_OWNER_APPROVAL_MODE แล้ว คง MEMBER_OWNER_LINE_UID ไว้เป็น owner pin ที่ backend ใช้งาน Deploy ปิดงาน dep-dbcmk5g473hc739iau20 live เมื่อ 2026-10-22T01:43:43.513054Z (08:43:43 น. กรุงเทพฯ) หลัง restart ไม่พบการรัน binder ซ้ำหรือ error ใน app logs ที่ตรวจ

ตรวจหลังปิดงาน: GET / = 200, GET /health = 200 (projectId=g2-member-test, awardsEnabled=false, backendReady=true, posBackendReady=true), GET /internal/private-restore = 404

Production/main และคะแนนสมาชิกจริงไม่ถูกเปลี่ยน การย้ายจริงยังติดรายการสิทธิ์เก่าซ้ำ/ทดลอง และการจัดเก็บไฟล์สำรองถาวรตาม MIGRATION_CHECKPOINT_REVIEW_2026-10-22_TH.md

## ขั้นตอนของผู้ใช้

รีเฟรชหน้า https://g2-member-test-api.onrender.com/ หนึ่งครั้งด้วย LINE บัญชี A เดิม ควรเห็น เพิ่มแต้มสมาชิก, จัดการรอบเดือน และ สิทธิ์พนักงาน ไม่ต้องสมัครใหม่
