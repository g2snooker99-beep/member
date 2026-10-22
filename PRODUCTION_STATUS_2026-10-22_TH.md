# สถานะเปิดใช้งาน G2 Member — 22 ตุลาคม 2026

สถานะล่าสุดอยู่ใน `PRODUCTION_STATUS_2026-10-22.json` รายงาน release candidate ก่อนหน้านี้เป็น checkpoint ในอดีต ไม่ใช่หลักฐานว่าเปิด production แล้ว

## สิ่งที่ทำจริง

- ผู้ใช้อนุมัติ production rollout แล้ว ระบบสมาชิกอยู่หน้า maintenance; POS ยังใช้ main เดิม
- Deploy secure backend 10 functions โดยปิด mutation gates และ deploy Rules ปฏิเสธ client writes แล้ว
- ปิด invoker ของ legacy writers 13 ตัวและพัก scheduler 3 ตัว
- เพิ่มเฉพาะ pointsMonth ของสมาชิกยอดศูนย์ 32 คน, ACL เจ้าของ A และ public projections 36 รายการ คะแนนและประวัติไม่ได้รีเซ็ต
- สำรอง POS 27 ตาราง/2,075 บิล กู้คืน PostgreSQL จริงผ่าน เก็บสำรองเข้ารหัสนอกเครื่องพร้อมกุญแจแยกและอ่านกลับตรวจ decrypt ผ่านแล้ว

## ข้อผิดพลาดของ operator และการแก้ไข

Adapter เร่งการอ่านสำรองที่เพิ่มระหว่าง cutover ไม่ส่งต่อ collection.id ทำให้เส้นทางลูกอันดับย้อนหลัง 91 รายการกลายเป็น undefined การเทียบ backup กับ restore อย่างเดียวจึงให้ผลตรงกันทั้งที่เส้นทางไม่ตรง source จริง การ apply แผนเพิ่ม metadata สำเร็จแล้ว แต่ post-verify หยุดเมื่อค้นเส้นทางที่ผิดไม่พบ ไม่ได้ลบข้อมูลต้นทาง

แก้ adapter ให้รักษา ID และจับคู่ 91 รายการกับเส้นทางจริงโดย typed-data equality ที่ตรงเพียงแห่งเดียว ตรวจ original documents จริงครบ 962 รายการตรงกับข้อมูลเดิมและ metadata 32 รายการที่อนุมัติแล้ว สร้างสำรอง corrected ชุดใหม่ กู้คืนใน test namespace ใหม่จริงครบ 962 รายการ hash ตรงกัน เพิ่ม regression tests 4 รายการ ครอบคลุม nested collection, missing ancestor, reversed getAll ordering, restore prefix และกรณีข้อมูล traversal ไม่ครบ ชุดเก่าคงไว้เพื่อตรวจสอบและทำเครื่องหมายไม่ผ่าน path fidelity ห้ามใช้อ้างอิงเปิดระบบ

แผน corrected มีการเปลี่ยนแปลงรายการเดิมทุกประการ แต่ผูก hash สำรองที่ถูกต้อง ยังไม่ apply provenance correction; จะเพิ่มหลักฐานอ้างอิงของรายการที่เสร็จแล้วแบบ append-only หลังตรวจ receipt และข้อมูลปัจจุบันซ้ำ โดยไม่เขียน metadata หรือคะแนนซ้ำและไม่ลบ receipt เดิม

## ผลตรวจ production แบบอ่านอย่างเดียว

- สมาชิก 76 คน รวมคะแนน 241 แต้ม; เก็บประวัติ 737 และรางวัลเก่า 20 รายการ
- ตรวจ owner A มี staff/admin; บัญชี legacy privilege อีก 6 บัญชีไม่ได้รับสิทธิ์ trusted ACL
- Preview คืน Top 3 ได้ เดือน 2026-10 ยัง unopened และปิดเดือนปัจจุบันไม่ได้
- ตรวจ receipt metadata เดิม 32 และ projections เดิม 36 กับข้อมูลจริงผ่าน
- เรียก mutation endpoints จริง 6 ตัวด้วย empty request ได้ FAILED_PRECONDITION ทั้งหมด ไม่มีการให้แต้ม/แลกรางวัลทดลองใน production
- ยังไม่ได้สังเกต production LINE browser login จริง และยังไม่ได้ activate

## จุดที่ยังติดและขั้นต่อไป

Automatic approval review ปฏิเสธการอัปโหลดสำรองสมาชิก corrected เพราะตีความอนุมัติล่าสุดเป็น POS-only จึงไม่ลองส่งออกผ่านช่องทางอื่น ต้องให้ผู้ใช้อนุมัติชัดเจนสำหรับสำรองข้อมูลสมาชิกเข้ารหัสไปยังโฟลเดอร์ Drive ส่วนตัวเดิม และเก็บกุญแจแยกก่อนทำ offsite readback/decrypt จากนั้นแก้ provenance, deploy POS พร้อม gates ปิด, prepare additive schema/immutable manifest, frontend/indexes, authenticated canary และเปิด gates ตามอนุมัติ production ที่มีอยู่แล้ว ไม่ต้องขออนุมัติ production ทั่วไปซ้ำ

## Rollback

ปิด mutation/enrollment/award gates ก่อน เก็บ queues, receipts, สมาชิกและประวัติทั้งหมด ใช้ secure compatible build หรือ maintenance ห้ามกลับไป public-write Rules หรือเปิด legacy writers อัตโนมัติ ห้าม restore backup ทับ production ที่มีธุรกรรมใหม่
