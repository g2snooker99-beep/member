# Production POS LIFF — 22 ตุลาคม 2569

- เจ้าของส่ง ID แบบคัดลอก: 2010084269-SfIzPWRK (S f I z P W R K; I ตัวใหญ่)
- Channel 2010084269; Size Full ตามรายการใน Console
- URL: https://liff.line.me/2010084269-SfIzPWRK
- ตรวจ HTTP สาธารณะของ URL นี้ได้ 200 และหน้า redirect ของ LINE ระบุ liffEndpointUrl ตรง https://g2snooker.onrender.com/api/member/join-page
- ไม่ได้เข้าถึง Console ที่ต้องล็อกอิน และหน้า redirect ไม่แสดง scopes จึงยังไม่รับรอง openid/profile จนกว่าจะเห็น configuration หรือผ่าน real LINE authorization
- ID แยกจาก signup และ Test LIFF ทั้งสองตัว
- ยังไม่ตั้งค่าบน production POS, ไม่เปิด enrollment/awards, ไม่เปลี่ยน main/Hosting/Rules และไม่แก้คะแนนจริง

ขั้นเตรียมถัดไป: ยืนยัน scopes, process clock และช่องทางสำรอง POS จริงก่อน freeze legacy Member writers; การมี LIFF ID ไม่ใช่การเปิดใช้ระบบแล้ว
