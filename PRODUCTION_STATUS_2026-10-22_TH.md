# G2 Member เปิด production — 22 ตุลาคม 2026

สถานะนี้แทนที่ checkpoint และรายงาน hold ก่อนหน้า รายละเอียดเครื่องอ่านได้อยู่ใน `PRODUCTION_STATUS_2026-10-22.json`

ระบบสมาชิกจริงและ POS เปิดแล้ว ตามการอนุมัติของเจ้าของ โดย POS deploy `dep-dbd371dg1s2s73f0uhrg` ขึ้น live เวลา 23:03 น. ประเทศไทย และ public config ตรวจได้ว่า enrollment/awards เป็น true ระบบใช้ Member project `member-3e17e` และ POS commit `c327b3050dea0e3c84ff49a1f77395c09389290f`

## ผลที่ทำและตรวจแล้ว

- Deploy secure backend, frontend และ Rules จริง; indexes จำเป็นทั้ง 3 ชุด READY ระบบ signing ของ runtime และ IAMCredentials API พร้อม
- หน้า Member และ POS ตอบ 200; protected health ปฏิเสธผู้ไม่ล็อกอินด้วย 403
- Mutation endpoints จริง 6 ตัวผ่านสวิตช์ hold แล้วและปฏิเสธ empty/unauthenticated requests ตามการตรวจข้อมูลและสิทธิ์ เพิ่ม negative test คำขอรูปแบบถูกต้องแบบไม่ล็อกอินสำหรับเพิ่มแต้ม/ตั้งสิทธิ์พนักงาน/แลกรางวัล ได้ UNAUTHENTICATED ทั้ง 3 ตัว ไม่มีการทดสอบแจกแต้มจริง
- เปิดรอบ 2026-10 เวลา 15:47 น. โดยไม่รีเซ็ตคะแนนเดิม
- สร้างตารางคิวและ immutable release manifest แบบ additive; ไม่ส่งบิลเก่าเข้าคิว
- หลัง Render รีสตาร์ต worker บันทึก started เวลา 23:03:21 น. สำหรับ member-3e17e รอบทำงาน 20 วินาที
- CI Member รวมการแก้ backup ผ่าน: https://github.com/g2snooker99-beep/member/actions/runs/39811168179
- CI POS ผ่าน: https://github.com/g2snooker99-beep/g2snooker/actions/runs/39618196222

## ข้อมูลเดิมและสำรอง

ตรวจ frozen source จริงครบ 962 เอกสารก่อนเปิดเวลา 15:37 น.: สมาชิก 76 คน รวม 241 แต้ม ประวัติ 737 รายการ รางวัลเก่า 20 รายการ คงเดิม ยอด live หลังเปิดอาจเปลี่ยนตามธุรกรรมจริง

เพิ่มเฉพาะ month metadata ของยอดศูนย์ 32 คน, ACL เจ้าของ A และ public projections 36 รายการ ไม่มีการ reset คะแนนหรือนำคะแนนทดลองมาสู่ production

พบและแก้ข้อผิดพลาด operator backup adapter ที่ละ collection.id ทำให้เส้นทาง nested 91 รายการผิด จับคู่เส้นทางจริงอย่างเป็นเอกลักษณ์ด้วย typed data และตรวจ source ครบทุกเอกสาร สร้าง archive corrected และกู้คืนจริงใน test namespace ใหม่ครบ 962 เอกสาร ตรวจ hash ตรง เพิ่ม regression tests 4 รายการผ่าน ชุดผิดเก็บไว้เป็นประวัติพร้อมถอนสถานะ restoreVerified

สำรอง corrected เข้ารหัสเก็บใน Drive ส่วนตัว และกุญแจเก็บแยก อ่านกลับจากทั้งสองที่ ถอดรหัสและตรวจ checksum ผ่านแล้ว

แก้ provenance แบบ append-only 68 receipts โดยตรวจเอกสารและ receipts เดิมก่อน ไม่ลบ receipts เดิม ไม่เขียนสมาชิกซ้ำ replay ได้ applied=0/duplicates=32 และรางวัลเก่าคงเดิม 20 รายการ

POS สำรอง 27 ตาราง/2,075 บิล ณ เวลาสำรอง กู้คืน PostgreSQL จริงทุกตารางพร้อมเทียบ hash ผ่าน เก็บเข้ารหัสนอกเครื่องและกุญแจแยก ตรวจอ่านกลับและ decrypt ผ่านแล้ว

## เงื่อนไขที่ยังคงไว้

- 6 บัญชียอดเดือนเก่า รวม 134 แต้ม ยังเก็บเดิมและพักการรับแต้มข้ามเดือนตามนโยบายที่อนุมัติ ไม่ย้ายเดือนหรือล้างคะแนนอัตโนมัติ
- สิทธิ์ trusted admin เริ่มเฉพาะ A ไม่ให้สิทธิ์จาก legacy role โดยอัตโนมัติ
- เสื้อ Limited, ส่วนลด 10%, duplicate reward, การปิดเดือน, retry/idempotency และ restart scenarios ผ่าน Staging แล้ว ไม่สร้างธุรกรรมทดลองเหล่านี้ซ้ำใน production
- ยังไม่ได้สังเกตการล็อกอิน LINE จริงของเจ้าของใน production ขั้นยืนยันหน้าจอ: เปิด https://liff.line.me/2010084269-aui1GaWz ด้วย LINE เดิมของ A และดูบัตร G2-501279 กับเมนูเพิ่มแต้ม/รอบเดือน/สิทธิ์พนักงาน
- การทดสอบสร้าง runtime service-account key ชั่วคราวถูก automatic review ปฏิเสธ จึงไม่สร้าง key เพิ่ม ใช้การตรวจ infrastructure/IAM/Rules และ existing POS employee health แทน ไม่อ้างว่าได้ผ่าน signed owner Firebase browser canary
- Scheduled close ตั้งไว้ 00:05 วันที่ 1 ตามเวลาไทย ยังไม่ได้รอให้เกิดเหตุการณ์ในอนาคต A ต้องเปิดรอบเดือนปัจจุบันใหม่ผ่านหน้าแอดมิน

## ย้อนกลับเมื่อมีปัญหา

1. Render production: merge `G2_MEMBER_ENABLED=false` และ `G2_MEMBER_ENROLLMENT_ENABLED=false` รอ deploy แล้วตรวจ public config ห้าม replace env ทั้งชุด
2. Firebase production: ตั้ง parameter `MEMBER_MUTATIONS_ENABLED=false` และ deploy เฉพาะ secure-member codebase ใช้ maintenance frontend หากจำเป็น
3. คงคิว, leases, receipts, คะแนน และประวัติทั้งหมดไว้ ตรวจ ledger ก่อน retry รายการเดิม
4. ห้ามนำ public-write Rules/legacy point writers กลับมา ห้าม restore สำรองทั้งชุดทับธุรกรรมใหม่ กู้คืนทดสอบใน namespace แยกเท่านั้น การซ่อม production ต้องพิจารณาเป็นรายเอกสาร
