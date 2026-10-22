# อนุมัติเปิด Production — 22 ตุลาคม 2569

ผู้ใช้ตอบ **“อนุมัติ ทำให้เสร็จเลย”** ต่อขั้นตอนหยุดเขียนข้อมูลสมาชิกชั่วคราว สำรองล่าสุด และปล่อยระบบจริงตามชุดที่เตรียมไว้

ถือว่าได้รับอนุมัติ Production แล้ว ไม่ขออนุมัติขอบเขตเดิมซ้ำ การอนุมัตินี้ไม่ทำให้ข้าม preflight, frozen backup, IAM, writer freeze หรือ canary

ข้อกำหนดเดิมยังคงครบ:
- ไม่ลบ/reset คะแนนจริงหรือประวัติ และไม่แจกคะแนนทดลอง
- เก็บ 20 รางวัลเก่าที่หมดอายุไว้โดยไม่แก้ไขทุกฟิลด์
- เก็บ 134 คะแนนเก่าของ 6 บัญชีและเดือนเดิม พักการเพิ่มข้ามรอบ
- รักษางานขาย/พิมพ์บิล คิวแต้ม และ receipts
- ไม่เพิ่มแผน/ค่าใช้จ่ายโดยพลการ
- ถ้า preflight ไม่ผ่าน จะไม่เริ่มหยุด writers หรือปล่อยระบบบางส่วนที่เข้ากันไม่ได้

## ตรวจแล้วก่อนเริ่ม

- Render Production ยัง branch main, service srv-d76kd0nfte5s73em4r00 และ updatedAt 2026-10-16T16:37:08.676732Z
- Member feature ahead main 40 commits, behind 0; base 2a99878e68e80b82eefa3f11ab9f82fa28725e01
- POS feature ahead main 215 commits, behind 0; base a592ed96d476688a725f3830ab516e141ae93cec
- ยังไม่ขยับ main หรือเขียน Firebase จริง เพราะต้องยืนยันช่องทางจัดการ Firebase ก่อน
- Render connector อ่าน/ตั้งค่าบริการได้ แต่ไม่ใช่สิทธิ์ deploy Firebase/Rules/IAM
- Browser inventory ของงานนี้ว่าง ไม่มี session Firebase Console ที่ควบคุมได้
- npx ดาวน์โหลดแพ็กเกจผ่าน npm registry ไม่สำเร็จ จึงดาวน์โหลด CLI v15.34.0 จาก official Firebase GitHub release และตรวจ digest จาก release metadata ตรงแล้ว
- ซ่อม Windows standalone CLI extraction สำเร็จแล้ว และเรียก CLI v15.34.0 ผ่าน Node ได้
- login:list ยืนยัน No authorized accounts; projects:list --non-interactive ยืนยัน Failed to authenticate
- เปิด PowerShell สำหรับ Firebase login ให้ผู้ใช้เลือกบัญชี Google ที่ดูแล member-3e17e โดยเจ้าของดำเนินการเข้าสู่ระบบเอง ไม่ขอให้ส่งรหัสผ่าน/token/authorization code มาในแชต
- ยังไม่เริ่มหยุด writers เพื่อไม่ให้ร้านค้างระหว่างรอการยืนยันบัญชี
- ไม่มีการอ่านหรือส่งออก private keys/tokens ของ Production เพื่อหลบข้อจำกัดการเข้าถึง

## ขั้นตอนถัดไปเมื่อยืนยันการเข้าถึงแล้ว

ตรวจ project member-3e17e/default database + IAM/Functions/Scheduler/LINE/config จริง  
หยุดเฉพาะ legacy Member writers -> fresh frozen backup -> restore/hash/private plan review  
ใช้ dedicated identities -> additive migration -> coordinated secure backend/frontend/Rules/indexes  
canary แบบอ่านอย่างเดียว -> เปิด enrollment/mutation/awards ตามผลตรวจ -> ตรวจ outbox/receipts  
หากล้มเหลว ปิด gates และรักษาคิว/ข้อมูลไว้ตาม GO_LIVE_RUNBOOK_TH.md
