# Production backend preparation — 22 ตุลาคม 2569

## ดำเนินการแล้ว
- เจ้าของเชื่อม Billing แล้ว ตรวจ Cloud Billing API ได้ billingEnabled=true และอ่าน Scheduler ได้ 4 งาน legacy
- สร้าง g2-member-api และ g2-pos-award-writer ตามแผน IAM; runtime มี Datastore User/Auth Admin และลงนามตัวเองได้ POS writer มีเฉพาะ Datastore User ไม่สร้าง private key
- ติดตั้ง dependency สำเร็จและปล่อยเฉพาะ functions codebase secure-member จาก tested code c3e71c88fad822cdbc6a5c11a7da370ea4b31396
- Firebase CLI deploy ตอบ success และตรวจ remote ซ้ำพบ ACTIVE ครบ 10 ฟังก์ชัน ใช้ runtime identity ใหม่และ MEMBER_MUTATIONS_ENABLED=false ทุกตัว
- ตรวจ HTTP จริง: session และ preview ที่ระบุเดือนถูกต้องโดยไม่มี Auth ตอบ 401; mutation 6 endpoints ตอบ FAILED_PRECONDITION / release hold ไม่มีการเพิ่มแต้ม/แลกรางวัล
- ตรวจข้อมูลผ่าน Firestore SDK แบบอ่านอย่างเดียว: สมาชิก 76, 241 แต้ม, ประวัติ 737, monthlyRewards 20; ยอดข้ามรอบ 6 บัญชี/134 แต้มคงเดิม
- ตรวจ LINE signup เดิมจากเว็บที่เผยแพร่อยู่: 2010084269-aui1GaWz; Firebase Web App ตรง member-3e17e
- เก็บ source เดิมทั้ง 22 ฟังก์ชันไว้ตรวจสอบในเครื่อง ไม่ใส่ source/config ที่อาจมี secret ลง Git

## ขอบเขตที่ยังไม่ทำ
- ยังไม่เปลี่ยน main ของทั้งสอง repo, Hosting, Rules หรือ indexes
- ยังไม่พัก legacy writers/Scheduler และยังไม่สลับหน้าเว็บจริง
- ยังไม่สร้าง frozen backup ใหม่/ย้ายข้อมูล/เปิดการแก้ไขข้อมูล
- ไม่มีการเขียนเอกสารสมาชิก คะแนน ประวัติ รางวัลหรือ ACL จริงในรอบนี้ การเปลี่ยน Production ที่ทำคือ IAM และ backend ที่ปิด mutation gate เท่านั้น
- แผน rollout เดิมที่ยังระบุรออนุมัติเป็นเอกสารย้อนหลัง การอนุมัติ production เดิมยังมีผล

## สิ่งที่ต้องได้รับจากระบบจริงก่อน cutover
Render connector แสดงเฉพาะ PostgreSQL staging และไม่มีเครื่องมือรัน Shell/อ่านค่าระบบ POS จริง; computer-use inventory ไม่มี browser surface ให้ใช้ต่อ ต้องตรวจใน Shell ของ service g2snooker จริงด้วย PRODUCTION_POS_READONLY_PREFLIGHT.sh (อ่านอย่างเดียว ไม่พิมพ์ URL/รหัสผ่าน) เพื่อยืนยันฐานจริง/timezone/จำนวนบิลและหลีกเลี่ยง staging ห้ามเปลี่ยนฐาน staging ให้ชี้ production

ต้องกำหนด LIFF สำหรับผูกโต๊ะ Production โดยใช้ channel 2010084269 และ endpoint https://g2snooker.onrender.com/api/member/join-page แยกจาก signup และสอง Test LIFF เดิม ขณะนี้ยังไม่พบค่าจริงที่ยืนยันแล้ว ห้ามเดา ID หรือใช้ Test LIFF แทน

เมื่อข้อมูลครบให้ยืนยัน POS backup/config ก่อนเริ่ม maintenance แล้วหยุด Member writers, frozen backup+restore+hash, private additive migration, coordinated frontend/Rules/indexes, canary และ activation ตามขอบเขตที่อนุมัติไว้ ไม่ต้องทดสอบ POS/QR/คิดแต้มที่ผ่านแล้วซ้ำ
