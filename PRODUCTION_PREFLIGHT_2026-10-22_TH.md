# Production preflight — 22 ตุลาคม 2569

- Firebase CLI login สำเร็จ บัญชีที่ลงชื่อเข้าใช้เป็น Owner ของ member-3e17e และอ่านโปรเจกต์จริงได้
- ตรวจพบฐาน (default), Firestore Standard, nam5 และ Web App เดิม
- สำรวจ Cloud Functions เดิม 22 รายการ สำเร็จ ใช้บัญชี runtime เดิมร่วมกัน ยังไม่ได้แก้ไข
- Cloud Billing API ตอบ billingEnabled=false
- Cloud Scheduler API ตอบ HTTP 403: requires billing to be enabled จึงยังสำรวจ/หยุด scheduled writers เพื่อยืนยัน frozen backup ไม่ได้
- ยังไม่มี dedicated runtime g2-member-api หรือ g2-pos-award-writer ตามแผน IAM
- Production deployment authorization เดิมยังมีผล แต่ไม่ครอบคลุมการเปลี่ยนแผนหรือค่าใช้จ่าย
- ไม่มีการเปลี่ยน Production/main, Rules, IAM, Billing, คะแนน, ประวัติ หรือการหยุด legacy writers ในรอบนี้
- ยังไม่สร้าง fresh frozen backup และยังไม่ทำ migration/deploy/activation ห้ามนำ checkpoint เดิมไปอ้างว่า frozen
- ผล Staging ที่ผ่านแล้วและสำรองเดิมยังใช้เป็นหลักฐานเดิม ไม่ทดสอบ POS/QR/คะแนนซ้ำ

## ขั้นตอนที่ต้องดำเนินการก่อน cutover

เจ้าของต้องตัดสินใจเรื่องเปิด Cloud Billing/Blaze ซึ่งคิดค่าบริการตามการใช้งาน และผูกบัญชีชำระเงินที่เหมาะสมด้วยตนเองก่อน หลังเปิดแล้วตรวจ billingEnabled และ Scheduler ซ้ำ จากนั้นตรวจแหล่งเขียนข้อมูลทั้งหมดก่อนหยุด writer, สำรองใหม่, กู้คืนตรวจ hash, ย้ายแบบเพิ่มข้อมูล, deploy โดยปิด writes, canary และเปิดใช้ตามลำดับที่อนุมัติไว้

อ้างอิง: https://firebase.google.com/docs/functions/get-started
