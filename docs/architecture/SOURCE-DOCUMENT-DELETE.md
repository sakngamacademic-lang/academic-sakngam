# ลบ / เก็บเข้าคลัง รายการทะเบียนเอกสารต้นทาง

## ทำแล้ว (UI เท่านั้น ยังไม่ลบหรือแก้ข้อมูลจริง)
- **ปุ่ม “ลบ”:** อยู่ท้ายแถวในตารางทะเบียนเอกสารต้นทาง (หน้า แหล่งข้อมูล & นำเข้า) เป็นปุ่มสีแดงแบบ outline
  - แสดงเฉพาะผู้มีความสามารถ `curriculum.manage` (academic_head) ซึ่งตรงกับ RLS เดิม (`is_curriculum_admin`)
- **Dialog ยืนยัน:** แสดงรหัสและชื่อเอกสาร แล้วตรวจการอ้างอิงแบบอ่านอย่างเดียว (HEAD count) ครบ 24 FK ที่ชี้มายัง `source_documents` (`src/features/curriculum/source-delete.ts`)
  - FK ทั้ง 24 รายการ (ตรวจจาก Staging catalog) เป็น `ON DELETE RESTRICT`
  - **มีการอ้างอิง** → เสนอ “เก็บเข้าคลัง/เลิกใช้งาน” เท่านั้น ไม่มีปุ่มลบถาวร
  - **ตรวจไม่ครบ** (อ่านตารางไม่ได้ หรือไม่ได้จำนวนกลับมา) → สรุปไม่ได้และไม่ลบ
  - **ไม่มีการอ้างอิง** → เสนอ “ลบรายการทะเบียน” โดยไม่ลบไฟล์ใน Storage
- **SRC-01-P1…P6:** ไม่ถูกลบตาม SRC-01 แต่ละรายการตรวจการอ้างอิงของตัวเอง และ SRC-01 ที่มีเอกสารย่อยจะเข้ากลุ่ม “มีการอ้างอิง”
- **ปุ่มดำเนินการปิดไว้** (`BACKEND_READY = false`) เพราะยังไม่มี backend ที่ปลอดภัย

## Backend (เตรียมแล้ว · ยังไม่รันบน Staging)
- **Migration:** `supabase/migrations/20261206000100_source_document_archive_delete.sql` (forward-only)
- **pgTAP:** `supabase/tests/database/036_source_document_archive_delete.test.sql` (26 ข้อ)
  - ผ่านบนฐานทดสอบ local เมื่อ 19 พ.ย. 2569 และชุดทดสอบเดิมทั้ง 35 ไฟล์ยังผ่าน

| ส่วน | รายละเอียด |
|---|---|
| สถานะ | เพิ่ม `archived` แยกจาก `superseded` และเพิ่มคอลัมน์ `archived_at / archived_by / archive_reason` (มี check ว่าต้องครบเมื่อ archived) · คอลัมน์ใหม่ไม่ grant ให้ client |
| ตรวจการอ้างอิง | `private.source_document_references(id)` อ่าน FK ทุกตัวที่ชี้มาจาก catalog (ตารางในอนาคตถูกตรวจอัตโนมัติ) · security definer จึงนับครบโดยไม่ขึ้นกับ RLS |
| `source_document_reference_summary(id)` | สรุปการอ้างอิงให้หน้าเว็บ (ผู้ดูแลหลักสูตร) |
| `source_document_archive(id, reason)` | ล็อกแถว → ตั้ง `archived` → ไม่แตะแถวอ้างอิงใด ๆ · ซ้ำ = ปฏิเสธ |
| `source_document_delete(id, reason)` | ล็อกแถว (`FOR UPDATE`) → ตรวจการอ้างอิงซ้ำในธุรกรรมเดียวกัน → มีการอ้างอิง/ตรวจไม่สำเร็จ = **ปฏิเสธ** · ไม่มี = ลบเฉพาะแถวทะเบียน (FK RESTRICT ป้องกันอีกชั้น) · ไม่แตะ `files`/Storage |
| Audit | `audit_logs` (trigger เดิม) เก็บข้อมูลก่อน/หลัง · `source_document_events` (append-only, ไม่มี FK) เก็บ ผู้กระทำ / เวลา / รหัส / ชื่อ / เหตุผล / ผล (`archived`, `archive_rejected`, `deleted`, `delete_rejected`) รวมกรณีถูกปฏิเสธ (RPC คืนผลแทน raise เพื่อให้บันทึกคงอยู่) |
| สิทธิ์ | `private.require_curriculum_admin()` (มนุษย์ + academic_head) · ไม่มี DELETE/UPDATE status ตรงบนตาราง · บันทึกเหตุการณ์อ่านได้เฉพาะผู้ดูแลหลักสูตร/system_admin |
| การทำงานพร้อมกัน | การล็อก `FOR UPDATE` ทำให้ธุรกรรมอื่นที่จะเพิ่มแถวอ้างอิง (FK ต้องใช้ `FOR KEY SHARE`) ต้องรอจนลบเสร็จ แล้วจะล้มด้วย FK — ไม่มีช่องว่างระหว่างตรวจกับลบ |

**ขั้นตอนเมื่อได้รับอนุมัติให้รัน:**
1. ผู้ใช้รันไฟล์ migration ใน SQL Editor ของ Staging
2. ตรวจผล
3. บันทึกประวัติ `supabase_migrations.schema_migrations` หลังรันจริงเท่านั้น
4. เปลี่ยน `BACKEND_READY` เป็น `true` และให้ Dialog เรียก RPC แทนการนับฝั่ง client

## ข้อเสนอเดิม (ก่อนเตรียม SQL)
ปัจจุบัน `source_documents` **ไม่มีสิทธิ์ DELETE** (ไม่มี grant และไม่มี policy) และคอลัมน์ `status` (`registered|reviewed|superseded`) **แก้จากหน้าเว็บไม่ได้** (ไม่อยู่ใน column grant)
1. RPC `source_document_archive(p_id uuid, p_reason text)`
   - security definer + `require_human` + `is_curriculum_admin()`
   - ตั้ง `status = 'superseded'` (หรือเพิ่มค่า `archived` ใน check) พร้อมเหตุผล
   - ไม่แตะแถวที่อ้างอิงอยู่ และไม่ลบไฟล์
2. RPC `source_document_delete(p_id uuid, p_reason text)`
   - ตรวจซ้ำฝั่งฐานข้อมูลว่าไม่มีแถวใดอ้างอิง (24 FK + `document_analysis_*` ที่เกี่ยวข้อง) ถ้ามีให้ปฏิเสธพร้อมรายการ
   - ลบเฉพาะแถวทะเบียน ส่วน `files` และวัตถุใน R2 ไม่ลบ และไม่ cascade
   - ปฏิเสธเมื่อมีเอกสารย่อย (`parent_id`) ชี้มา
3. Audit:
   - บันทึก ผู้กระทำ / เวลา / รหัสเอกสาร / ผล (`archived`, `deleted` หรือ `rejected` พร้อมเหตุ)
   - ใช้ `private.audit_row_change()` เดิม และบันทึกกรณีถูกปฏิเสธด้วย
4. การลบไฟล์จริงใน Storage เป็นงานแยก ทำโดยผู้ดูแลระบบหลังตรวจว่าไม่มีรายการทะเบียนใดใช้ไฟล์นั้น
5. ทดสอบ pgTAP:
   - academic_head เท่านั้น
   - เอกสารที่ถูกอ้างอิงลบไม่ได้
   - SRC-01 ที่มีเอกสารย่อยลบไม่ได้
   - archive ไม่ทำให้แถวอ้างอิงหาย
   - ไม่แตะ `files`
