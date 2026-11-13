# Runbook: เข้าสู่ระบบไม่ได้บน Vercel Preview (Supabase Staging) + Bootstrap บทบาทแรก

> Project ref ที่แจ้ง: `ifwernczbnkpadikqigj` · ห้ามแตะ Production · ห้ามเปิด Self Signup · ห้ามใช้/เปิดเผย Service Role Key · ห้ามแก้ RLS · ห้ามลบบัญชีเดิม

## 1. อาการ "อีเมลหรือรหัสผ่านไม่ถูกต้อง" มาจากไหน

ข้อความนี้แสดงเมื่อ Supabase Auth ตอบ `invalid_credentials` ที่ `POST /auth/v1/token?grant_type=password` เท่านั้น (`src/features/auth/errors.ts`)
ขั้นนี้เกิด **ก่อน** แอปอ่าน `profiles` / `user_roles` / `get_my_access()` — ปัญหาเรื่อง profile, school_id, บทบาท จะไม่ทำให้เกิดข้อความนี้
(ถ้าผ่านขั้นรหัสผ่านแล้วแต่ไม่มีโรงเรียน/บทบาท แอปจะแสดง "บัญชียังไม่ได้ผูกกับโรงเรียน…" หรือ "ไม่มีสิทธิ์เข้าถึงหน้านี้" แทน)

สาเหตุที่เป็นไปได้ (เรียงจากพบบ่อย)

| # | สาเหตุ | วิธีตรวจ |
|---|---|---|
| A | Vercel Preview ใช้ `VITE_SUPABASE_URL` ของ **project อื่น** (เช่น ตั้งค่าไว้เฉพาะ scope Production, หรือค่าเก่า) — บัญชีถูกสร้างใน `ifwernczbnkpadikqigj` แต่แอปไปถามอีก project | หน้า Login (build ใหม่) แสดง `Supabase <ref>` ใต้ฟอร์ม · หรือ DevTools → Network → คำขอ `…/auth/v1/token` ดูโดเมน · Vercel → Settings → Environment Variables ดูว่าค่าอยู่ใน scope **Preview** |
| B | แก้ env บน Vercel แล้ว **ยังไม่ Redeploy** — ค่า `VITE_*` ถูกฝังตอน build | Redeploy Preview (ไม่ใช้ build cache) แล้วตรวจข้อ A ซ้ำ |
| C | บัญชี **ไม่มีรหัสผ่าน** — สร้างด้วย "Invite user"/Magic link หรือยืนยันอีเมลแล้วแต่ไม่ได้ตั้งรหัส | `diagnose-login.sql` ข้อ 1 → `has_password = false` · แก้: ส่ง "Reset password" จาก Dashboard หรือใช้หน้า "ลืมรหัสผ่าน" (ต้องตั้ง Site URL/Redirect URL ของ Preview ใน Auth → URL Configuration) |
| D | รหัสผ่าน/อีเมลไม่ตรง (พิมพ์ผิด, ช่องว่างท้าย, อีเมลคนละตัว) | `diagnose-login.sql` ข้อ 1 `found = 0` = ไม่มีอีเมลนี้ใน project |
| E | anon key ไม่ใช่ของ project เดียวกับ URL | จะได้ "Invalid API key" (401) ไม่ใช่ invalid_credentials — ใช้แยกกรณี |
| F | `VITE_APP_ENV` บน Vercel ไม่ใช่ `local`/`staging` (เช่น `preview`) | env ทั้งชุดไม่ผ่านการตรวจ → ปุ่มเข้าสู่ระบบถูกปิด + แจ้ง "ยังไม่ได้ตั้งค่า" (ไม่ใช่ invalid_credentials) — ต้องตั้ง `VITE_APP_ENV=staging` |

## 2. หลังเข้าสู่ระบบได้: profile / school_id / บทบาท

- `profiles.school_id` ถูกตั้ง **ครั้งเดียวตอนสร้างบัญชี** จาก `app_metadata.school_id` (trigger `on_auth_user_created`) และต้องตรงกับแถวใน `schools` ที่ active — ถ้าบัญชีสร้างจาก Dashboard โดยไม่มี `app_metadata.school_id` หรือยังไม่มีแถวโรงเรียน → `school_id = null` ถาวร (เพิ่ม app_metadata ทีหลังไม่ย้อนแก้ profile)
- `private.current_school_id()` อ่านจาก `profiles` (ไม่ใช่ JWT) — RLS ทั้งหมดอิงค่านี้
- `user_roles` เขียนได้เฉพาะ `system_admin` ของโรงเรียนเดียวกัน → บัญชีแรกของโรงเรียนต้อง **bootstrap**
- Seed (`supabase/seed.sql`) ไม่ถูก push ขึ้น hosted → ตาราง `schools` บน staging อาจว่าง

## 3. ขั้นตอนตรวจ (อ่านอย่างเดียว)

1. Vercel: Settings → Environment Variables → scope **Preview**: `VITE_SUPABASE_URL = https://ifwernczbnkpadikqigj.supabase.co`, `VITE_SUPABASE_ANON_KEY` = anon/publishable key ของ project เดียวกัน, `VITE_APP_ENV = staging` → Redeploy
2. เปิด Preview → หน้า Login ต้องแสดง `Supabase ifwernczbnkpadikqigj`
3. Supabase Dashboard (project `ifwernczbnkpadikqigj`) → SQL Editor → วาง `scripts/staging/diagnose-login.sql` แก้อีเมล 2 จุด → Run (ไฟล์เปิด transaction แบบ read only และ rollback)
4. ส่งผลข้อ 1–7 กลับมา (ไม่มีรหัสผ่าน/hash/token ในผล)

## 4. Bootstrap บทบาทแรก (ทำหลังได้รับอนุมัติเท่านั้น)

ใช้ `private.bootstrap_school_role` (migration `20261119000100`) — เรียกได้เฉพาะ `postgres` ผ่าน SQL Editor, ไม่มีทางเรียกผ่าน API/anon/authenticated/service_role

1. Apply migration ขึ้น staging ตาม `STAGING-PLAN.md` (dry run → push) — ต้องได้รับอนุมัติ
2. ถ้า `schools` ยังไม่มีโรงเรียน: เพิ่ม 1 แถว (รหัส/ชื่อทางการที่ฝ่ายวิชาการยืนยัน) เช่น
   `insert into public.schools (code, name_th, province) values ('<รหัส>', 'โรงเรียนสักงามวิทยา', 'กำแพงเพชร');`
3. Dry run (ค่าเริ่มต้น ไม่เขียนข้อมูล):
   `select private.bootstrap_school_role('<อีเมลเจ้าของระบบ>', '<รหัส>', array['academic_head']::public.app_role[], '<เหตุผล เช่น กำหนดเจ้าของระบบเป็นหัวหน้าฝ่ายวิชาการ ตามคำสั่ง …>');`
4. ดำเนินการจริง: เรียกซ้ำโดยเพิ่มอาร์กิวเมนต์สุดท้าย `false`
5. ตรวจ: รัน `diagnose-login.sql` ซ้ำ → ข้อ 4 ตรงกัน, ข้อ 5 มี `academic_head`, ข้อ 6 `account_status = active` · ดู `audit_logs` (`table_name in ('role_bootstrap','user_roles','profiles')`)

เงื่อนไขความปลอดภัยของฟังก์ชัน: บัญชีต้องยืนยันอีเมลและไม่ถูกระงับ · ให้ได้เฉพาะ `academic_head`/`system_admin` · ทำได้เฉพาะเมื่อโรงเรียนยังไม่มี `system_admin`/`academic_head` · ไม่ย้าย profile ที่ผูกโรงเรียนอื่น · ต้องมีเหตุผล · บันทึก audit · ไม่สร้าง/ลบบัญชี · ไม่แก้ RLS

ข้อควรตัดสินใจ: `academic_head` อย่างเดียว **กำหนดบทบาทให้ผู้อื่นไม่ได้** (สิทธิ์จัดการบทบาทเป็นของ `system_admin`) — ถ้าเจ้าของระบบต้องเพิ่มผู้ใช้/บทบาทเอง ให้ bootstrap `array['academic_head','system_admin']`

## 5. ค้างที่ "กำลังตรวจสอบสิทธิ์…" (เข้าสู่ระบบผ่านแล้ว)

คำขอในขั้นตรวจสิทธิ์มีเพียง 2 ชนิด — `profiles` / `user_roles` ไม่ถูกเรียกจากเบราว์เซอร์โดยตรง (`get_my_access()` อ่านในฐานข้อมูล)

| ลำดับ | คำขอ | ผลที่เป็นไปได้ | ข้อความที่แอปแสดง (ตั้งแต่ commit นี้) |
|---|---|---|---|
| 1 | `POST /auth/v1/token?grant_type=password` (หรือ `refresh_token` ตอนเปิดหน้าใหม่) | 200 = ผ่าน · ค้าง > 15 วิ | "เชื่อมต่อระบบยืนยันตัวตนไม่สำเร็จ" |
| 2 | `POST /rest/v1/rpc/get_my_access` | **404 + `PGRST202`** = ไม่มีฟังก์ชัน (migration `20261113000100` ยังไม่ถูกติดตั้ง) | "ระบบฐานข้อมูลยังติดตั้งไม่ครบ" |
| | | **200 + `null`** = ไม่มีแถว `profiles` ของผู้ใช้ (บัญชีสร้างก่อนติดตั้ง trigger) | "ไม่พบข้อมูลโปรไฟล์ของบัญชีนี้" |
| | | 401/403/42501 | "ไม่มีสิทธิ์เรียกข้อมูลสิทธิ์ผู้ใช้" |
| | | ค้าง > 15 วิ | "ตรวจสอบสิทธิ์ไม่สำเร็จ (หมดเวลา)" |
| | | 200 + `account_status = no_school` | ออกจากระบบพร้อมข้อความ "บัญชียังไม่ได้ผูกกับโรงเรียน…" |

เดิม (ก่อนแก้) หน้า Login แสดง spinner ตลอดไปเมื่อคำขอข้อ 2 error หรือคืน `null` — หน้าข้อผิดพลาดแสดงรหัสคำขอ/HTTP/code ที่ล้มเหลวจริงเพื่อใช้วิเคราะห์ (ไม่มีข้อมูลลับ)

ตรวจ Migration บน hosted: `scripts/staging/diagnose-login.sql` ข้อ 8 (รายการที่ repo มีแต่ hosted ไม่มี — ว่าง = ครบ) และ 8b (`get_my_access` มีอยู่และ `authenticated` เรียกได้)

แนวทางแก้ตามผล (ต้องได้รับอนุมัติก่อนทุกข้อ)
- มี migration ขาด → `supabase db push --dry-run` แล้ว `db push` ตาม `STAGING-PLAN.md` (ไม่ใช้ seed)
- ไม่มีแถว `profiles` (บัญชีสร้างก่อน migration): ไม่ลบบัญชี — เพิ่ม profile ให้บัญชีเดิมผ่าน SQL Editor หลังอนุมัติ แล้วจึง bootstrap บทบาท (ข้อ 4)
