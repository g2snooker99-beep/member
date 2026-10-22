# POS backup and restore — 22 ตุลาคม 2569

## ผลที่ผ่าน
- บัญชี Windows ของเจ้าของเก็บการเชื่อมต่อเข้ารหัสด้วย DPAPI และ ACL เฉพาะเจ้าของ/SYSTEM; credential ไม่อยู่ใน Git หรือแชต
- เชื่อมฐาน PostgreSQL จริงแบบอ่านอย่างเดียว ยืนยัน database postgres, timezone UTC, server 17.6, ไม่มีตาราง rehearsal ที่ใช้ตรวจ
- สำรอง public schema ครบ 27 ตารางด้วย pg_dump 17.11 ภายใต้ exported snapshot เดียวกับหลักฐาน fingerprint; 2,075 บิล
- ใช้ binary จาก EDB ที่ PostgreSQL แนะนำ ตรวจ SHA-256 ตรง checksum ทางการก่อนใช้
- Custom archive 582,093 bytes; SHA-256 cc2353b6f54e604ae0fbee2d2fae5b5d13df5437a84fba649609a402ba6925d4
- เข้ารหัส AES-256-GCM พร้อม AAD G2_POS_PG_DUMP_V1 และเก็บ key แยก
- Encrypted archive 776,221 bytes; SHA-256 988e1f4441dc544dcfce19a78163720daa9fe0fe389c988bb364c4ce6673ec0c
- ถอดรหัสและ pg_restore ลง PostgreSQL ใหม่ในเครื่องที่จำกัด ACL, bind เฉพาะ 127.0.0.1 และใช้ SCRAM authentication
- ก่อน restore ตรวจ data_directory ตรง cluster ทดสอบ; ไม่อนุญาต restore ไปฐานจริง
- จำนวนแถวและ fingerprint ทุกตารางทั้ง 27 ตรงต้นฉบับ snapshot รวมถึง bills 2,075 แถว
- ทดสอบกู้คืนผ่านเวลา 14:26:26 น. ประเทศไทย; ปิด local server หลังตรวจและลบไฟล์รหัสผ่านทดสอบชั่วคราวแล้ว
- Production SQL writes = 0; ไม่มีการเปลี่ยนคะแนน/ประวัติสมาชิก

## สิ่งที่ติดขัด
การตรวจอนุมัติอัตโนมัติปฏิเสธการอัปโหลด archive POS ไป Google Drive เพราะการอนุมัติปลายทางที่มีอยู่ยังไม่ชัดว่าครอบคลุมข้อมูล POS ซึ่งมีการขาย พนักงาน สิทธิ์ และรายการทำงาน/ค่าจ้างด้วย ไม่มีการลองอัปโหลดผ่านช่องทางอื่น และยังไม่ส่ง key ของ POS ไปที่เก็บภายนอก

ตรวจ metadata ของโฟลเดอร์สำรองเดิมแล้ว: shared=false และมีเฉพาะ owner permission แต่ต้องให้เจ้าของอนุมัติข้อมูล POS กับปลายทางและ key custody ให้ชัดก่อนส่ง ไม่ใส่ private folder/file IDs, connection strings, raw backup หรือ key ในเอกสารนี้

## สถานะ rollout
LIFF จริงและ Scopes ได้รับการยืนยันแล้ว; backend ใหม่ ACTIVE ครบ 10 ฟังก์ชันและปิด mutation gate อยู่ ยังไม่เปลี่ยน main/Hosting/Rules/indexes, ไม่พัก legacy writers และไม่ทำ migration/activation

ก่อนเปลี่ยน Rules ต้องยืนยันผู้ใช้ printJobs จริงเพื่อรักษางานพิมพ์ POS; secure Rules ที่เตรียมไว้ปิด collection ที่ไม่มี allow จึงห้ามอ้างว่าตรวจ printing compatibility ผ่านโดยไม่มีหลักฐาน

เมื่อจัดเก็บ POS backup นอกเครื่องและ readback ผ่าน จึงเดินขั้นตอน freeze Member writers, สำรอง Member ชุด frozen ใหม่และกู้คืนตรวจ hash, reviewed additive migration และ coordinated cutover ตามการอนุมัติ production เดิม
