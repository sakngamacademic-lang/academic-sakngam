# แผนนำ Migration ขึ้น Hosted Supabase Staging (รออนุมัติ — ยังไม่ดำเนินการ)

> สถานะ: **แผน + dry run ฝั่ง repo ผ่านแล้ว** · Hosted `ifwernczbnkpadikqigj` ยังไม่มี migration ใด · ยังไม่ apply (รออนุมัติ)
> ใช้เฉพาะข้อมูลทดสอบ (`*.test`, ชื่อสมมติ) · ไม่มีข้อมูลนักเรียน/บุคลากรจริง

## 1. Migration ที่จะนำขึ้น (forward-only, เรียงตามเวลา) — ครบ 21 ไฟล์ (อัปเดต 13 พ.ย. 2569)

สถานะ Hosted `ifwernczbnkpadikqigj` (ผลตรวจของผู้ใช้): ไม่มี schema `supabase_migrations` และไม่มี `public.get_my_access()` → **ยังไม่มี migration ใดถูกติดตั้ง** ทั้ง 21 ไฟล์จะเป็น pending
(`supabase db push` สร้างตาราง `supabase_migrations.schema_migrations` เองระหว่าง push — **ห้ามสร้างด้วยมือ**)

| # | ไฟล์ | เนื้อหา | ผลกระทบต่อข้อมูลเดิมบน Hosted |
|---|---|---|---|
| 1 | `20261112000100_foundation` | default privileges, schema `private`, enum `app_role` | สร้างใหม่เท่านั้น |
| 2 | `20261112000200_core_identity` | `schools`, `profiles`, `user_roles`, trigger `on_auth_user_created` / `on_auth_user_email_changed` บน `auth.users` | **ไม่ backfill** — บัญชี Auth ที่มีอยู่แล้วจะยังไม่มีแถว `profiles` (ดูข้อ 5) · ไม่แก้/ลบ `auth.users` |
| 3 | `20261112000300_audit_logs` | `audit_logs` (append-only) + trigger | สร้างใหม่ |
| 4 | `20261112000400_rls_policies` | helper functions + RLS core | สร้างใหม่ |
| 5 | `20261113000100_get_my_access` | RPC สิทธิ์ผู้ใช้ (แก้อาการค้าง "กำลังตรวจสอบสิทธิ์") | สร้างใหม่ |
| 6 | `20261114000100_master_data_tables` | ปีการศึกษา ภาคเรียน ระดับชั้น ห้องเรียน กลุ่มสาระ | สร้างใหม่ |
| 7 | `20261114000200_learning_area_scope` | scope หัวหน้ากลุ่มสาระ (เปลี่ยน unique ของ `user_roles`) | drop/สร้าง constraint บนตารางที่สร้างในข้อ 2 (ยังว่าง) |
| 8 | `20261114000300_master_data_rls` | RLS + RPC master data | สร้างใหม่ |
| 9 | `20261115000100_teacher_registry` | ทะเบียนครู + RPC ผูกบัญชี | สร้างใหม่ |
| 10 | `20261116000100_document_storage` | documents / files / file_events + RPC จัดเก็บเอกสาร | สร้างใหม่ (ไม่แตะ schema `storage`) |
| 11 | `20261117000100_task_assignment` | tasks / task_assignments / assignment_events + RPC | ผ่อน not null ของ `documents.owner_teacher_id` (ตารางข้อ 10) |
| 12 | `20261118000100_curriculum_schema` | ตารางหลักสูตร 20 ตาราง + guard triggers | แทน check constraint ของ `documents` (เพิ่มชนิด `curriculum_source`) |
| 13 | `20261118000200_curriculum_security` | RLS หลักสูตร + RPC version/cohort/mapping | แทน constraint ขนาดไฟล์ของ `files` (สูงสุด 100MB สำหรับเอกสารหลักสูตร) |
| 14 | `20261118000300_curriculum_import` | Import Engine (staging → review → approve → commit) | สร้างใหม่ |
| 15 | `20261118000400_curriculum_import_pdf_rows` | แถวรายหน้าจาก PDF | `create or replace` ฟังก์ชันจากข้อ 14 |
| 16 | `20261118000500_curriculum_is_subjects` | รายวิชา IS ไม่สังกัดกลุ่มสาระ แยก ม.ต้น/ม.ปลาย | ผ่อน not null + แทน unique ของ `subjects` (ตารางข้อ 12, ยังว่าง) |
| 17 | `20261118000600_conflict_register` | ทะเบียนข้อขัดแย้ง (needs_decision) | แทน status check ของ `source_conflicts` |
| 18 | `20261118000700_curriculum_review_queue` | ตรวจความสัมพันธ์ข้ามชุดนำเข้า (อ่านอย่างเดียว) | สร้างใหม่ |
| 19 | `20261118000800_curriculum_rules` | เกณฑ์ Compliance + สรุปโครงสร้าง | สร้างใหม่ |
| 20 | `20261118000900_course_sections` | กลุ่มเรียน + ภาระงานครู | เพิ่ม unique (id, version) บนตารางข้อ 12 |
| 21 | `20261119000100_bootstrap_school_role` | bootstrap บทบาทแรก (postgres เท่านั้น) | สร้างฟังก์ชันเท่านั้น ไม่รันเอง |

ตรวจแล้ว (13 พ.ย. 2569)
- ทั้ง 21 ไฟล์อยู่ใน Git (`git ls-files`) และลำดับเวลาไม่ซ้ำ
- **ติดตั้งจากฐานข้อมูลว่างบน stack แยก** (Supabase local ชุดที่ 2, ไม่ใช้ seed): ผ่านครบ 21 ไฟล์ตามลำดับ → dependency ถูกต้อง
- schema `public`/`private` + grants (ตาราง/คอลัมน์/ฟังก์ชัน) ของฐานข้อมูลที่ติดตั้งใหม่ **ตรงกับ local ทุกบรรทัด**
- pgTAP บนฐานข้อมูลที่ติดตั้งใหม่: **397/397** (ไม่พึ่ง seed)
- ไม่มีคำสั่งระดับบนสุดที่ลบ/ล้าง/เขียนทับข้อมูล (`drop table`, `truncate`, `delete`, `update`) — `update/delete` อยู่ในตัวฟังก์ชันเท่านั้น · `drop` มีเฉพาะ constraint ที่ถูกแทนทันที · ไม่ใช้ extension เพิ่ม · อ้าง `auth.users` (trigger) แต่ไม่แก้ข้อมูลใน `auth`
- PostgreSQL local 17.11 (`major_version = 17`) — **Hosted ยังไม่ได้ยืนยันเวอร์ชัน** (ต้อง ≥ 15 สำหรับ `on delete set null (column)` ในข้อ 9; ฟังก์ชัน `hashtextextended` ต้อง ≥ 11)

## 2. ขั้นตอน (ทำเมื่อได้รับอนุมัติแต่ละขั้น)

1. **ตรวจ Project** — ยืนยัน project ref ว่าเป็น Staging (ไม่ใช่ Production), region, PostgreSQL 17
2. **ตั้งค่า Auth บน Dashboard** — ปิด *Allow new users to sign up*, ตั้ง Site URL ของ staging, ปิด *Expose new tables* ของ Data API (เทียบ `auto_expose_new_tables=false`)
3. **ส่ง Credentials ผ่านช่องทางปลอดภัย** — `SUPABASE_ACCESS_TOKEN` และ DB password ตั้งเป็น secret ของ environment (ไม่ใช่แชท ไม่ใช่ Git)
4. **Dry run** — `supabase link --project-ref <ref>` แล้ว `supabase db push --dry-run` ตรวจรายการ migration ที่จะ apply ให้ตรงตารางข้อ 1
5. **Apply** — `supabase db push` (ไม่ใช้ `--include-seed`) แล้ว `supabase migration list` ยืนยันตรงกันทั้ง local และ remote
6. **ข้อมูลทดสอบ** — สร้างบัญชีทดสอบ `*.test` ด้วย Admin API / Dashboard (ไม่ใช้ seed.sql ตรง ๆ เพราะเขียน `auth.users`) และข้อมูล master/ทะเบียนครูสมมติชุดเดียวกับ seed
7. **ตรวจ RLS ผ่าน Hosted API** — `node scripts/staging/rls-check.mjs` (anon key เท่านั้น สคริปต์ปฏิเสธ service_role) + Security Advisor ใน Dashboard ต้องไม่มี error
8. **Frontend** — `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` ของ staging ใส่ใน `.env.staging` (ถูก ignore) หรือ secret ของระบบ build — ไม่มี service key ใน frontend

9. **R2 + Edge Functions (Phase 1.6)** — ตั้งค่าตาม `docs/architecture/STORAGE.md` ข้อ 3, `supabase functions deploy storage-upload-url storage-confirm-upload storage-download-url storage-delete storage-cleanup`, แล้วทดสอบอัปโหลด/ดาวน์โหลด/สิทธิ์ซ้ำบน staging

## 3. สิ่งที่ต้องได้รับจากผู้ใช้ก่อนเริ่ม

- อนุมัติแผนนี้ และยืนยัน project ref ของ Staging
- ช่องทางส่ง `SUPABASE_ACCESS_TOKEN` + DB password (environment secret) — **ห้ามส่งในแชท**
- อนุญาตให้ environment เข้าถึง host `<ref>.supabase.co` และ `api.supabase.com`
- R2: Account ID และ API Token ที่จำกัดเฉพาะ bucket — ใส่เป็น Supabase Edge Function Secrets โดยผู้ดูแล (ไม่ผ่านแชท / Git)

## 4. Rollback

Migration เป็น forward-only: หากพบปัญหาบน staging ให้แก้ด้วย migration ใหม่ หรือ reset staging database (ข้อมูลทดสอบเท่านั้น) ผ่าน Dashboard — ไม่แก้ไฟล์ migration เดิม

## 5. หลัง Apply (ต้องได้รับอนุมัติแยก)

1. บัญชี Auth ที่สร้างก่อน migration ไม่มีแถว `profiles` (trigger ทำงานเฉพาะบัญชีใหม่) → แอปจะแสดง "ไม่พบข้อมูลโปรไฟล์ของบัญชีนี้"
   ทางแก้ที่ไม่ลบบัญชี: เพิ่ม `profiles` ให้บัญชีเดิมผ่าน SQL Editor (ระบุ id/email จาก `auth.users`) หลังสร้างแถว `schools` แล้ว
2. สร้างแถว `schools` ของโรงเรียน (รหัส/ชื่อที่ฝ่ายวิชาการยืนยัน — ไม่ใช้ seed `SNW-DEV`)
3. Bootstrap บทบาทแรกด้วย `private.bootstrap_school_role` (ดู `STAGING-LOGIN-RUNBOOK.md` ข้อ 4)
4. รัน `scripts/staging/diagnose-login.sql` ยืนยันข้อ 1–8
