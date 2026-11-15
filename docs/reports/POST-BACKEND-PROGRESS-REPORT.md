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
