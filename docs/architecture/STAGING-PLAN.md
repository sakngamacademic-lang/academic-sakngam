# แผนนำ Migration ขึ้น Hosted Supabase Staging (รออนุมัติ — ยังไม่ดำเนินการ)

> สถานะ: **แผนเท่านั้น** · ยังไม่ได้เชื่อมต่อ Hosted Project · ยังไม่ได้ apply migration ใด ๆ
> ใช้เฉพาะข้อมูลทดสอบ (`*.test`, ชื่อสมมติ) · ไม่มีข้อมูลนักเรียน/บุคลากรจริง

## 1. Migration ที่จะนำขึ้น (forward-only, เรียงตามเวลา)

| # | ไฟล์ | เนื้อหา |
|---|---|---|
| 1 | `20261112000100_foundation.sql` | default privileges, schema `private`, enum `app_role` |
| 2 | `20261112000200_core_identity.sql` | `schools`, `profiles`, `user_roles`, trigger สร้าง profile |
| 3 | `20261112000300_audit_logs.sql` | `audit_logs` (append-only) + trigger |
| 4 | `20261112000400_rls_policies.sql` | helper functions + RLS core |
| 5 | `20261113000100_get_my_access.sql` | RPC สิทธิ์ผู้ใช้ |
| 6 | `20261114000100_master_data_tables.sql` | ปีการศึกษา ภาคเรียน ระดับชั้น ห้องเรียน กลุ่มสาระ |
| 7 | `20261114000200_learning_area_scope.sql` | scope หัวหน้ากลุ่มสาระ |
| 8 | `20261114000300_master_data_rls.sql` | RLS + RPC master data |
| 9 | `20261115000100_teacher_registry.sql` | **Phase 1.5** ทะเบียนครู + RLS + RPC ผูกบัญชี |
| 10 | `20261116000100_document_storage.sql` | **Phase 1.6** documents / files / file_events + RPC จัดเก็บเอกสาร |

ตรวจแล้วบน local (PostgreSQL 17 เท่ากับ Hosted): `supabase db reset` ผ่าน · pgTAP 156/156 · E2E 56/56
ข้อควรระวัง: migration 9 ใช้ `on delete set null (profile_id)` ต้องใช้ PostgreSQL ≥ 15 (Hosted ใหม่เป็น 17)

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
