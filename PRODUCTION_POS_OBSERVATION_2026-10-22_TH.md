# Production POS observation — 22 ตุลาคม 2569

เจ้าของรันคำสั่งอ่านอย่างเดียวใน Shell ของ g2snooker จริงและส่งภาพผลลัพธ์แล้ว:

- database: postgres
- database timezone: UTC
- sandbox rehearsal table: false
- bills: 2075
- runtime TZ environment: null
- G2_MEMBER_LIFF_ID: null
- deployed main: a592ed96d476688a725f3830ab516e141ae93cec
- writes: 0

ผลนี้ยืนยันว่าเชื่อม PostgreSQL จริงได้และไม่มีตาราง rehearsal ที่ใช้ตรวจนี้ ไม่ใช่หลักฐานว่าตรวจทุกตารางหรือมี POS backup แล้ว ห้ามเปลี่ยน DB timezone หรือ TZ ของ POS เพื่อแก้ค่า null โดยไม่ตรวจผลต่อเวลาบิล โค้ด main ที่ pin ไว้ใช้ datetime.now() บันทึกเวลา และแยกเพิ่ม 7 ชั่วโมงเพื่อแสดงเวลาไทย จึงเตรียม UTC เป็นค่าต้นทางของ adapter ได้หลังยืนยัน process clock อีกครั้ง

สิ่งที่ยังขาดคือ LIFF สำหรับผูกโต๊ะ Production ที่แยกจาก signup 2010084269-aui1GaWz และ Test LIFF ทั้งสองตัว ต้องสร้างใน channel 2010084269 โดย endpoint https://g2snooker.onrender.com/api/member/join-page, Size Full, scopes openid/profile แล้วนำ LIFF ID จริงมาตั้งค่าระบบ ไม่เดาหรือใช้ Test ID แทน

ยังไม่ freeze legacy writers, ไม่ migration, ไม่เปลี่ยน main/Hosting/Rules, ไม่เปิด mutation/awards
