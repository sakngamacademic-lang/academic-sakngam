# Backend Audit — Supabase Hosted Staging (15 พ.ย. 2569)

โครงการ `ifwercnzbnkpadikqigj` · Vercel Preview เท่านั้น · ตรวจแบบอ่านอย่างเดียว

## Roadmap (ปรับล่าสุด)
1. **Backend Audit ทุกโมดูล** (เอกสารนี้) → แก้ช่องว่าง
2. **Phase R2** (หลัง audit ผ่าน และก่อนเปิดระบบเอกสารจริง) — เตรียมโค้ดล่วงหน้าได้โดยไม่ต้องรอ Credentials
   1. Private bucket `sakngam-academic-documents` (ห้าม Public)
   2. R2 Access Key/Secret เก็บใน Supabase Edge Function Secrets เท่านั้น (ห้ามอยู่ใน Frontend)
   3. Upload/Download ผ่าน Edge Functions · Signed URL อายุจำกัด (≤ 5 นาที)
   4. ตรวจ RLS และสิทธิ์ข้ามโรงเรียน · ตรวจ SHA256 กับไฟล์จริง
   5. ทดสอบ PDF / Word / Excel
   - ทุกโมดูลใช้ Storage กลางเดียว (`files` + adapter ใน `docs/architecture/STORAGE.md`) ไม่สร้างระบบเก็บไฟล์แยก
3. Workflow และฟีเจอร์ส่วนที่เหลือ

## ผลตรวจ DB (Hosted)
- ตารางใน `public` 49 ตาราง: **เปิด RLS ครบทุกตาราง** และมี policy ทุกตาราง · `anon` ไม่มีสิทธิ์ตารางใด
- Constraint ที่ยังไม่ validate: `user_roles_scope_check` (NOT VALID ตามออกแบบใน migration `20261114000200` — บังคับกับแถวใหม่)
- ฟังก์ชัน `public` ที่ `anon` เรียกได้: `rls_auto_enable` (event trigger ของ Hosted เอง เรียกตรงไม่ได้) — ความเสี่ยงต่ำ
- RPC สำหรับ `authenticated` 50 ตัว (assignment, course_grades, curriculum_*, …) · ตัวใหม่ `curriculum_import_batch_revalidate`, `curriculum_import_error_summary` ติดตั้งแล้ว
- ข้อมูลจริงบน Hosted: schools 1, profiles 2, teachers 1, tasks 1, curriculum (ย้ายแล้ว) · นักเรียน/ห้องเรียน/ปีการศึกษา/ภาคเรียน/ระดับชั้น/กลุ่มสาระ/ตอนนี้ว่าง = Empty State ไม่มีข้อมูลปลอม

## ผลตรวจโค้ด (ทุกหน้า)
| โมดูล | แหล่งข้อมูล | สถานะ |
|---|---|---|
| ข้อมูลพื้นฐาน (ปี/ภาค/ชั้น/ห้อง/กลุ่มสาระ) | Supabase (`master-data/api`) | จริง |
| ครู/บุคลากร | Supabase (`teachers`) + RPC ผูกบัญชี | จริง |
| **นักเรียน** | เดิมเป็น ComingSoon → **เพิ่มหน้าทะเบียนนักเรียน** (`students`, `classroom_students`) | จริง (รอบนี้) |
| ภาระงาน/ตรวจรับ/เอกสารครู | Supabase (`tasks`, `documents`, RPC assignment_*) | จริง |
| หลักสูตร/รายวิชา/นำเข้า/ตรวจ/ข้อขัดแย้ง/กฎ | Supabase + RPC curriculum_* | จริง |
| คะแนน/เวลาเรียน/ผลการเรียน | Supabase (`assessment_*`, `attendance_records`, `course_grades`) + RPC | จริง |
| แดชบอร์ดฝ่ายวิชาการ/ครู | Hook ของโมดูลข้างต้น (ไม่มีข้อมูลในโค้ด) | จริง |
| ติดตาม 0/ร/มส, นำเข้า Excel, รายงาน ปพ., ตั้งค่า, แจ้งเตือน, ห้องที่ปรึกษา | หน้า “อยู่ระหว่างการพัฒนา” (ComingSoon) | ไม่มีข้อมูลปลอม |
- ค้นหา mock/sample/ชื่อบุคคลฝังในโค้ด: ไม่พบ (`daysFromToday` ใน `demo-utils.ts` เป็นโค้ดที่ไม่ถูกใช้)

## ข้อค้นพบด้านบัญชี (ต้องให้เจ้าของโปรเจกต์ดำเนินการ)
- เวลา 08:47 UTC ของ 15 พ.ย. บัญชี `sakngamacademic@gmail.com` ถูก **ลบแล้วสร้างใหม่** ใน Auth (id เดิม `a4a143a0…` → ใหม่ `773c125f…`)
  ทำให้ profile และบทบาท `academic_head` ถูกลบตามไปด้วย (audit_logs: DELETE profiles/user_roles) — บัญชีใหม่ไม่มี profile/บทบาท
  ผลกระทบ: ยังไม่มีผู้อนุมัติ (Two-person) ที่ใช้งานได้ · ต้อง bootstrap บทบาทใหม่ผ่าน SQL (`private.bootstrap_school_role`) ซึ่งทำได้อีกครั้ง
  เพราะโรงเรียนนี้ไม่มี academic_head/system_admin ที่ active แล้ว
