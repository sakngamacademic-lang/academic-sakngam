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

## อัปเดต (บัญชี academic_head กลับมาแล้ว)
- Hosted: `academic_head` (sakngamacademic) และ `academic_staff` (namemini7) มีบทบาทและ profile ครบ · migration ล่าสุดบน Hosted `20261123000100`
- เพิ่ม `SetupChecklist` (หน้าแดชบอร์ดฝ่ายวิชาการ/หลักสูตร): แสดงลำดับตั้งค่ากลุ่มสาระ → ระดับชั้น → ปี → ภาคเรียน → ห้อง จากข้อมูลจริง (ปุ่มเพิ่มกลุ่มสาระ/ระดับชั้นมาตรฐานมีอยู่แล้วในหน้าข้อมูลพื้นฐาน)
- เพิ่ม migration `20261124000100_curriculum_import_approve_clean.sql` (**ยังไม่ apply บน Hosted**): `curriculum_import_rows_approve_clean`
  ให้คนกดอนุมัติกลุ่มแถว needs_review ที่ไม่มี error/warning (≤500/ครั้ง, ตรวจซ้ำด้วย validator, บันทึกผู้ตัดสิน) · อนุมัติ “ชุด” ยังต้องหัวหน้าที่ไม่ใช่ผู้สร้าง
- หน้าตรวจ: ปุ่ม “อนุมัติแถวที่ไม่มีข้อสังเกต” (มีกล่องยืนยัน), “ตรวจซ้ำทั้งชุด”, แผงข้อผิดพลาดแยก dependency/ต้องตัดสินใจ
- R2: โค้ด adapter/Edge Functions/เอกสาร (`STORAGE.md` §3) เตรียมไว้แล้ว รอ Phase R2 และ Credentials

## Unified Curriculum Review (หน้าเดียว) — migration `20261125000100` (ยังไม่ apply บน Hosted)
- หน้า “ตรวจหลักสูตร (หน้าเดียว)” (`/office/curriculum/workbench`): ลำดับ ข้อมูลโรงเรียน → แผน → รายวิชา → โครงสร้าง → กิจกรรม → ผลการเรียนรู้ (ล็อกจนกว่าชุดก่อนหน้าจะถูกบันทึก)
- ชั้นของแถว: ผ่าน / คำเตือน / ข้อขัดแย้ง / ผิดพลาด — อนุมัติกลุ่ม (ผ่าน: `approve_clean`, คำเตือน: `approve_warnings` ต้องมีหมายเหตุ), แก้ค่าเป็นกลุ่ม (`bulk_set` เฉพาะ 4 ช่อง ไม่แก้ `raw`, ไม่อนุมัติ)
- trigger `import_rows_block_unsafe_approve`: แถว error/conflict อนุมัติไม่ได้ทุกเส้นทาง · อนุมัติชุดเป็นหัวหน้า ≠ ผู้สร้างเหมือนเดิม แต่ไม่ต้องตัดสินแถว error/conflict (ไม่ถูกบันทึก)
- IS1/IS2: ใช้ `subject_category='is'` เดิม (ไม่ต้องสังกัดกลุ่มสาระ) — ไม่แก้ validator
- pgTAP `021` (14) ผ่าน · `011`, `018`, `020` ไม่ regress

## Master Curriculum Registry — migration `20261126000100` (ยังไม่ apply บน Hosted)
- Schema Mapping: ใช้ `subjects` (ทะเบียนรายวิชา) / `subject_offerings` (การจัดวิชา แผน×ชั้น×ภาคเรียน) / `study_programs` / `curriculum_versions` เดิม
  เพิ่มเฉพาะ: หมวด `dual_study`/`specific`, คอลัมน์ `is_active` `change_note` `carried_from_id`, ตาราง `curriculum_match_proposals` (ข้อเสนอ AI/กฎ + ความมั่นใจ + หลักฐาน)
- ฟังก์ชัน: `curriculum_registry_build` (สร้างทะเบียนจากหลักฐานตามลำดับ dependency; ไม่แก้ `import_rows`), `curriculum_registry_propose`, `curriculum_proposals_decide`,
  `curriculum_subject_set_active` (ยกเลิก/คืนพร้อมเหตุผล), `curriculum_version_clone` (แก้ให้รองรับ IS/ทวิศึกษา/สืบทอด), `curriculum_compare_versions`
- หน้า `/office/curriculum/registry` · pgTAP `022` (18) ผ่าน · ประวัติเปลี่ยนแปลง = `audit_logs` เดิม
