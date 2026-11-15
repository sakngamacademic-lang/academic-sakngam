# Post Backend Connection — Progress Report

> 15 พ.ย. 2569 · Branch `claude/stoic-feynman-y7af1p` · Staging `ifwercnzbnkpadikqigj` · ไม่ Merge main · ไม่ Deploy · ไม่แตะ Production
> การเข้าถึง Hosted จาก session นี้: Management API ด้วย token **อ่านอย่างเดียว** (`supabase_read_only_user`) — ไม่มีการเขียนข้อมูลหรือ apply migration บน Hosted

## สรุปตัวเลขจริง (ตรวจจากฐานข้อมูล ไม่ใช้รายงานเก่า)

| ข้อมูล | Local | Hosted Staging |
|---|---|---|
| Migrations | 23 | **21** (ขาด 2 ไฟล์ใหม่ — รออนุมัติ) |
| auth users / profiles / schools / user_roles | seed ทดสอบ | 1 / 1 / 1 (`1062040443`) / 1 (`academic_head`) |
| import_batches / import_rows | 5 / 1,453 (needs_review 411 · error 1,042) | 0 / 0 |
| source_documents / source_conflicts / curriculum_rules | 7 / 80 (needs_decision) / 43 (draft) | 0 / 0 / 0 |
| รายวิชา/แผน/offering/กิจกรรม ที่บันทึกแล้ว (committed) | 0 | 0 |
| Indicator references / Learning outcomes | **ไม่อยู่ในฐานข้อมูล** (ไฟล์สกัด 1,235 / 1,624) | 0 |

## ✅ Completed (ทดสอบจริงแล้ว)

| งาน | หลักฐาน |
|---|---|
| ตรวจ Hosted: project ref ที่ถูกต้องคือ `ifwercnzbnkpadikqigj` (เอกสารเดิมพิมพ์ผิด `…rnc…`) | Management API 200 vs 404 · แก้ทุกไฟล์ (`8296636`) |
| Hosted schema ตรง repo | คอลัมน์ + policy fingerprint ตรงกัน · ฟังก์ชันตรงกันเมื่อตัด CR (Hosted ถูก push จาก Windows → CRLF) · เพิ่ม `.gitattributes` บังคับ LF |
| RLS เปิดทุกตาราง (39/39 บน Hosted) · `get_my_access` เรียกได้เฉพาะ authenticated · bootstrap เรียกไม่ได้จาก service_role | read-only query บน Hosted |
| บัญชี academic_head บน Hosted ถูกต้อง: ยืนยันอีเมล มีรหัสผ่าน app_metadata/profile/school ตรงกัน เข้าระบบสำเร็จล่าสุด 13 พ.ย. | read-only query (ไม่สร้างบัญชี ไม่ bootstrap ซ้ำ ไม่แก้ role) |
| Loading/Error/Session: แสดงข้อความภาษาไทยแทน loading ไม่สิ้นสุด (timeout 15 วิ, PGRST202, null profile, auth refresh ค้าง) | Playwright ดักคำขอจริง (`f1dbd2d`) |
| ส่งงาน → ตรวจรับ → ขอแก้ไข → ส่งฉบับใหม่ (ทุกเวอร์ชันเก็บ, ไฟล์ล็อกเป็นหลักฐาน, ตรวจงานตนเองไม่ได้, ต้องมีหลักฐาน) + แจ้งเตือน + หน้า `/office/reviews` | pgTAP 015 (21) · smoke UI (`29723ce`) |
| Office / Teacher Dashboard ใช้ข้อมูลจริง — ลบ Demo data ทั้งหมด · ส่วนนักเรียนแสดง empty state | smoke desktop+mobile: demo=0, overflow=0, console error=0 |
| Data Transfer tooling: รักษา UUID/FK/source page/cell/status · upsert ปลอดภัย · abort เมื่อเนื้อหาต่าง · ตรวจจำนวนแถว · รันซ้ำได้ · rollback plan | ทดสอบบน Supabase stack แยก: hash ตรง, idempotent, tamper abort, rollback (`fc1377b`) |
| Backup: local pg_dump + PDF 6 ไฟล์ + SHA256 manifest (นอก Git) | `sha256sum -c` ผ่าน 6/6 |
| Assessment foundation: นักเรียน · ลงทะเบียน · องค์ประกอบคะแนน · คะแนน · เวลาเรียน · ผลการเรียน · เกณฑ์ตามระเบียบ (ต้องยืนยัน) · ส่ง/อนุมัติสองคน · ล็อกหลังอนุมัติ | pgTAP 016 (20) (`4973eae`) |
| ทดสอบรวม | pgTAP **438/438** · Deno 13/13 · SigV4 5/5 · typecheck · build |

## 🟡 Partially Completed

| งาน | ทำแล้ว | ยังขาด |
|---|---|---|
| Assessment / Grade / Attendance | schema + RLS + RPC + tests | หน้าจอบันทึกคะแนน/เวลาเรียน (ใช้ได้เมื่อมีหลักสูตรที่อนุมัติ + กลุ่มเรียน) · รายงานผลการเรียน |
| At-risk / Pending work | view ข้อเท็จจริง (งานค้าง, % เวลาเรียน) | เกณฑ์ "กลุ่มเสี่ยง" ต้องมาจากระเบียบโรงเรียน — ยังไม่กำหนด |
| National framework comparison / Coverage | ระบบแสดง `insufficient_data` · ไม่สร้าง % ปลอม | ชุดตัวชี้วัดแกนกลางฉบับทางการ (ยังไม่มีหลักฐาน) · indicator/outcome ยังไม่อยู่ใน DB |
| Parser checks (IS, ว22120, ง30224, ว30288, ว31101, ว32101/ว32103, ทวิศึกษา, CF-08…35) | แก้ parser + regression tests + ทะเบียนข้อขัดแย้ง 80 ข้อ (รอบก่อน) | การตัดสินโดยฝ่ายวิชาการ |
| Edge Functions บน Hosted | โค้ดพร้อม | token ไม่มีสิทธิ์ `edge_functions_read` — ตรวจไม่ได้ว่า deploy แล้วหรือไม่ |
| E2E | ปรับ expectation ให้ตรง dashboard จริง | ไม่ได้รัน (globalSetup ใช้ `db reset`) — ใช้ pgTAP + Playwright smoke แบบอ่านอย่างเดียวแทน |

## ⛔ Blocked

| งาน | สาเหตุ |
|---|---|
| ปิด Self Signup บน Hosted (`disable_signup: false` อยู่ตอนนี้) | การแก้ Auth config ถูกระบบความปลอดภัยของ session ปฏิเสธ — ต้องให้เจ้าของโปรเจกต์ทำใน Dashboard |
| ตรวจ Vercel Preview env (URL/anon key/APP_ENV) | ไม่มีสิทธิ์เข้าถึง Vercel — ใช้ป้าย `Supabase <ref>` ใต้ฟอร์ม Login ตรวจแทน |
| ย้ายข้อมูลขึ้น Hosted / apply migration 22–23 | token อ่านอย่างเดียว และต้องได้รับอนุมัติ |
| R2 จริง | ไม่มี credentials · token อ่าน secrets ไม่ได้ · ไม่สร้าง secret ปลอม |
| ย้าย PDF ไป R2 + ตรวจ SHA256 หลังย้าย | รอ R2 |

## 🧑‍⚖️ Requires Human Approval / Action

1. **Supabase Auth (Dashboard → Authentication)**: ปิด *Allow new users to sign up* · ตั้ง Site URL / Redirect URLs เป็น URL ของ Vercel Preview · ตั้งความยาวรหัสผ่านขั้นต่ำ ≥ 10 (ตอนนี้ 6)
2. **Apply migration 22–23** บน Staging (`supabase db push --dry-run` แล้ว `db push`) — ไม่กระทบข้อมูลเดิม
3. **ย้ายข้อมูลหลักสูตร**: อนุมัติรัน `transfer-*.sql` (ดู `docs/architecture/DATA-TRANSFER.md`) และตัดสินเรื่อง **Two-person approval** — staging มี academic_head คนเดียว ต้องมีบัญชีผู้ตรวจคนที่สอง (academic_head หรือเจ้าหน้าที่วิชาการเป็นผู้สร้างชุด)
4. **R2**: สร้าง bucket private `sakngam-academic-documents` + API token จำกัด bucket → ใส่เป็น Edge Function Secrets โดยผู้ดูแล
5. **หลักสูตร**: ตัดสินข้อขัดแย้ง 80 ข้อ, รายวิชาที่ต้องตัดสินใจ 52 รายการ, การจับคู่ ว221201/ว221202, ยืนยันเกณฑ์ 43 ข้อ — แล้วอนุมัติชุดนำเข้า (Two-person)
6. **ระเบียบวัดผล**: เอกสารระเบียบโรงเรียน (เกณฑ์ตัดเกรด, เวลาเรียน, ร/มส/ผ/มผ) เพื่อสร้าง grading policy ให้หัวหน้าฝ่ายวิชาการยืนยัน
7. **เอกสารทางการ**: มาตรฐาน/ตัวชี้วัดหลักสูตรแกนกลาง 2551 (ปรับปรุง 2560) สำหรับ Coverage
8. **Supabase token** ที่มีสิทธิ์อ่าน Edge Functions / Secrets (ถ้าต้องการให้ตรวจ deploy)


---

# อัปเดตรอบที่ 2 (15 พ.ย. 2569) — ทำต่อจาก commit `2bb0689`

> Hosted ตรวจซ้ำแบบอ่านอย่างเดียว: 21 migration · 1 user (`academic_head`) · 0 import rows · Auth config ยังไม่แก้ (signup เปิด, site_url=localhost, password min 6)

| # | งาน | สถานะ | หลักฐาน |
|---|---|---|---|
| 1 | Security config | ✅ เตรียมแล้ว / ⏸ รอเจ้าของลงมือ | `STAGING-SECURITY-CONFIG.md` + `scripts/staging/check-auth-config.mjs` (อ่านอย่างเดียว; ตอนนี้ ❌ 5 ข้อ ✅ 2 ข้อ) |
| 2 | Migration 22–24 | ✅ ตรวจ + ซ้อมอัปเกรด / ⏸ ยังไม่ apply | stack จำลอง Hosted: apply ผ่าน, `auth.users` hash เท่าเดิม · `db push --dry-run` ต้องรันโดยเจ้าของ (ต่อ Postgres ตรง) |
| 3 | Reviewer คนที่สอง | ✅ เตรียมแล้ว / ⏸ รอสร้างบัญชี | migration 24 `private.grant_school_role` (postgres-only, dry run, audit, ไม่สร้างบัญชี, ปฏิเสธบัญชี academic_head) · pgTAP 017 (9) |
| 4 | Data Transfer | ✅ เครื่องมือ + ซ้อมแล้ว / ⏸ ยังไม่รันบน Hosted | 6 ชุด / 2,832 แถว needs_review·error · รันซ้ำคงที่ · hash ตรง · หยุดเมื่อขัดแย้ง |
| 5 | R2 | 🟡 สคริปต์ + runbook พร้อม / ⛔ ไม่มี credentials | `verify-storage` 9/9 + `migrate-source-pdfs` SHA256 6/6 บน local; R2 จริงยังไม่ได้ทดสอบ |
| 6 | Curriculum Review บน Hosted | 🟡 UI ครบแล้ว (ชุดนำเข้า, ตรวจรายแถว, ทะเบียนข้อขัดแย้ง, Source PDF) / ⏸ รอย้ายข้อมูล | เพิ่มชุดผลการเรียนรู้ 1,379 แถว (ตัวชี้วัดแกนกลางยังไม่นำเข้า — รอเอกสารทางการ) |
| 7 | Reporting | 🟡 หน้ารายงาน PDF/Excel ใช้ข้อมูลจริงจากฐานข้อมูล (ทดสอบบน local ในรอบก่อน) / ⏸ ยังไม่ได้ทดสอบกับข้อมูล Hosted (ยังว่าง) | ไม่มี demo / ไม่สร้างตัวเลขแทนข้อมูลที่ขาด |
| 8 | Assessment UI | 🟡 หน้าจอคะแนน/เวลาเรียน/ผลการเรียนเสร็จ ทดสอบ RLS + upsert ด้วย pgTAP · หน้าจอทดสอบเฉพาะ empty state (ยังไม่มีกลุ่มเรียนจริง) | เกณฑ์ตัดเกรดถูกปิดไว้จนมีนโยบายที่ยืนยัน (`insufficient_data`) |

ทดสอบรวม: pgTAP **449/449** (17 ไฟล์) · typecheck · build · Deno 13/13 · SigV4 5/5 · ไม่รัน E2E (reset DB)

## สิ่งที่เจ้าของระบบ / ฝ่ายวิชาการต้องดำเนินการ (ตามลำดับ)
1. Dashboard: ปิด signup, Site URL + Redirect URLs ของ Preview, password min 10 → รัน `check-auth-config.mjs` ให้ผ่านทุกข้อ
2. `supabase link` + `supabase db push --dry-run` (ต้องเห็น 3 ไฟล์: 20261120000100, 20261121000100, 20261122000100) → อนุมัติ `db push`
3. Invite บัญชีผู้ตรวจคนที่สอง → `select private.grant_school_role(...)` (dry run แล้วจริง)
4. อนุมัติรัน `transfer-*.sql` (สร้างด้วย staff เป็นผู้สร้างชุด) → ตรวจ audit `data_transfer`
5. R2: bucket private + token + `supabase secrets set` + deploy functions → `verify-storage.mjs` → `migrate-source-pdfs.mjs` → รัน `link-r2-*.sql`
6. ฝ่ายวิชาการ: ตัดสินข้อขัดแย้ง 80 ข้อ / รายวิชา 52 รายการ → อนุมัติชุดแผน → ชุดรายวิชา (Two-person) → ตรวจซ้ำชุดจัดรายวิชา/กิจกรรม/ผลการเรียนรู้
7. ส่งเอกสารระเบียบวัดผล + ตัวชี้วัดแกนกลางฉบับทางการ
