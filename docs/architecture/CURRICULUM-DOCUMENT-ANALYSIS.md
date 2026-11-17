# ระบบวิเคราะห์และเปรียบเทียบหลักสูตรอัตโนมัติ (C4)

ผู้ดูแลหลักสูตรอัปโหลด PDF/Excel ผ่านหน้าเว็บ → ระบบอ่าน จำแนก สกัดข้อมูล (เบื้องหลัง) → ผู้ดูแลตรวจเทียบต้นฉบับ → ยืนยันเข้ากรอบแกนกลาง → เปรียบเทียบหลักสูตรสถานศึกษา 2569
**การอ่านเอกสารแยกจากการอนุมัติ** — parser/AI เขียนได้เฉพาะ "ผลวิเคราะห์" ไม่แตะทะเบียนหลักสูตร ไม่ปิด CF ไม่สร้าง/คัดลอกหลักสูตรปีใด

## ส่วนประกอบ
| ส่วน | ไฟล์ |
|---|---|
| ตาราง + RPC + RLS + Audit | `supabase/migrations/20261201000100_document_analysis.sql` |
| ตัววิเคราะห์ rule-based | `supabase/functions/_shared/curriculum-analyze.ts` (ใช้ `parseCourseHeader` เดิม) |
| อ่าน PDF/Excel | `supabase/functions/_shared/curriculum-parse.ts` (`pdfPages`, `xlsxCells`) |
| AI (ทางเลือก) | `supabase/functions/_shared/ai-classify.ts` |
| Edge Function | `supabase/functions/curriculum-document-analyze/` |
| หน้าเว็บ | `/office/curriculum/analysis` (`src/features/curriculum/pages/AnalysisPage.tsx`) |
| เทสต์ | `supabase/tests/database/027_document_analysis.test.sql`, `*_test.ts` |

## ลำดับการทำงาน
1. `document_analysis_request` (academic_head) ตรวจสิทธิ์/ไฟล์ ready สร้างงาน `queued` — ห้ามซ้อน (งานค้าง > 15 นาทีถือว่าล้มเหลว)
2. Edge Function ตอบ 202 ทันที แล้ววิเคราะห์ด้วย `EdgeRuntime.waitUntil` (หน้าเว็บ poll ทุก 3 วินาทีขณะมีงาน)
3. อ่านไฟล์จาก R2 private ด้วยสิทธิ์ฝั่งเซิร์ฟเวอร์ → `analyzePdfPages` / `analyzeXlsxCells`
4. `document_analysis_store` (service_role เท่านั้น) — แยกรายการซ้ำ (`duplicate`), ติดธงค่าต่างในเอกสาร (`VARIANT_IN_DOC`), เทียบกรอบเดิม (`EXISTS_IN_FRAMEWORK` / `VARIANT_FRAMEWORK`)
5. ผู้ดูแลตรวจ: `document_analysis_item_decide` ยอมรับ / แก้แล้วยอมรับ (ต้องมีพิกัด) / ปฏิเสธ (ต้องมีเหตุผล) / ย้อนกลับ — รายการ `committed` แก้ไม่ได้
6. `document_analysis_commit_framework` — เฉพาะเอกสารแกนกลาง/มาตรฐานและตัวชี้วัด, เฉพาะรายการที่ยอมรับ, ไม่เขียนทับ (ค่าต่าง → ข้าม + ธง `COMMIT_CONFLICT`), ฉบับ `published` แก้ไม่ได้
7. `framework_version_confirm` — ผู้ดูแลยืนยันฉบับและระบุว่าชุดตัวชี้วัดครบหรือไม่ (`is_complete`)
8. `curriculum_compliance_review` — ห่อ `curriculum_compliance_check` เดิม: `pass` / `fail` / `insufficient_data` / `conflict_pending`

## กติกาข้อมูล
- ทุกรายการมี `locator` (`pdf:N` หรือ `sheet:ชื่อ!A1`) — ไม่มีพิกัด/ข้อความ = `insufficient` (ข้อมูลไม่พอ) ยอมรับไม่ได้จนกว่าผู้ดูแลกรอกจากต้นฉบับ
- ตัวชี้วัดที่ไม่พบมาตรฐานกำกับ → ไม่ผูกเอง
- โครงสร้างเวลาเรียนเก็บตัวเลขตามบรรทัด + ธง `COLUMNS_UNMAPPED` (ระบบไม่รู้ว่าคอลัมน์ใดเป็นชั้นใด)
- หน้าภาพสแกน: ไม่มี OCR → `unreadable`

## เปรียบเทียบ (4 สถานะ)
| ผลเดิม | CF ที่ยังไม่ตัดสินในขอบเขต | ผล |
|---|---|---|
| insufficient_data | – | ข้อมูลไม่พอ |
| pass / warning / fail | มี | รอตรวจข้อขัดแย้ง |
| pass | ไม่มี | ผ่าน |
| warning / fail | ไม่มี | ไม่ผ่าน |
CF ที่เกี่ยวข้องกับเกณฑ์ชั่วโมง = CF ของรายวิชาในกลุ่มสาระของเกณฑ์ + CF ระดับโครงสร้าง (learning_hours/program_total/credits ที่ไม่ผูกรหัสวิชา)
ข้อมูลที่ใช้ = ข้อมูลที่บันทึกแล้ว + เกณฑ์ที่ยืนยันแล้วเท่านั้น (ตามตัวประเมินเดิม)

## AI
ใช้เฉพาะเมื่อ rule-based จำแนกไม่มั่นใจ (< 0.6) และครบ 3 เงื่อนไข: Secret `ANTHROPIC_API_KEY`, Secret `AI_DOCUMENT_ANALYSIS=enabled`, ผู้ดูแลติ๊กอนุญาตต่อครั้ง
ส่งเฉพาะข้อความบางหน้า (≤ 24,000 ตัวอักษร) ไม่ส่งไฟล์ · AI เสนอประเภทได้เท่านั้น ผลถูกตรวจซ้ำ (ประเภทในรายการ + พิกัดที่ส่งไปจริง)

## Deploy (Staging)
```
supabase functions deploy curriculum-document-analyze --project-ref <staging-ref>
```
Migration: รัน `20261201000100_document_analysis.sql` ใน SQL Editor แล้วบันทึกประวัติ

## C4.1 — แก้ CPU limit / งานค้าง / หน้าเปรียบเทียบ (migration `20261201000200`)
สาเหตุที่พบบน Staging (16 พ.ย. 2569) — **สองเรื่องแยกกัน**
1. **Edge Function เกิน CPU** (SRC-02 PDF 1.7 MB ค้าง `running`): `unpdf.extractText` แปลงทุกหน้าพร้อมกัน (`Promise.all`) ในคำขอเดียว + regex แถวเวลาเรียน `(?:[ก-๙]+\s?){1,6}` backtrack ทวีคูณ (บรรทัดไทยไม่มีวรรค 80 ตัวอักษร ≈ 14 วินาที) · worker ถูกหยุดก่อนเข้า `catch` จึงไม่เคยบันทึก failed
2. **หน้าเปรียบเทียบ error**: `curriculum_compliance_review` หา CF ที่เกี่ยวข้องรายเกณฑ์ด้วย join ผ่าน RLS ซ้ำ ๆ → ~35 วินาทีกับข้อมูลขนาด Staging เกิน statement timeout (ไม่เกี่ยวกับข้อ 1)

การแก้
- อ่าน PDF **ทีละหน้า** (`pdfPageRange`) รอบละ ≤ 25 หน้า / ≤ 700 ms (ปรับได้ด้วย Secret `ANALYZE_CHUNK_MAX_PAGES`, `ANALYZE_CHUNK_BUDGET_MS`) อ่านอย่างน้อย 1 หน้าต่อรอบ ไม่ข้ามหน้า
- เก็บข้อความรายหน้าใน `document_analysis_pages` + `pages_done`/`phase`/`heartbeat_at` → รอบสุดท้าย (`analyze`) วิเคราะห์จากข้อความครบทุกหน้า
- แต่ละรอบส่งต่อรอบถัดไป 1 ครั้งด้วย service_role · `document_analysis_claim` ตรวจลำดับรอบ (กันทำซ้อน) และเพดาน 400 รอบ (กันวนไม่สิ้นสุด → failed พร้อมเหตุผล)
- งานไม่มีความเคลื่อนไหว 10 นาที → `document_analysis_reap_stale` (เรียกอัตโนมัติเมื่อเปิดหน้า) เปลี่ยนเป็น failed พร้อมหน้าที่ค้าง
- ผู้ดูแลกด “ทำต่อ” → `document_analysis_retry` ใช้งานเดิม (ไม่สร้างงานใหม่) อ่านต่อจากหน้าที่บันทึกไว้ สูงสุด 5 ครั้ง · ระหว่างมีงานค้าง “วิเคราะห์ใหม่” จะถูกปฏิเสธ
- regex แถวเวลาเรียนเปลี่ยนเป็นตัวแยก token แบบเส้นตรง (`timeStructureLine`)
- `curriculum_compliance_review` อ่านรหัสวิชาของฉบับครั้งเดียวแล้วจับคู่ CF ในหน่วยความจำ (ผลเท่าเดิม · ~0.5 วินาที)
- หน้าเว็บ: แสดงความคืบหน้า “อ่านแล้ว X/Y หน้า”, สถานะ “ค้าง”, ปุ่ม “ทำต่อ”; ข้อความ error 57014 (timeout) / PGRST202 (ไม่พบฟังก์ชัน) เป็นภาษาไทย

## C4.2 — ตรวจ CPU Time exceeded ซ้ำ (17 พ.ย. 2569)
- หลักฐาน Staging: งาน SRC-02 ทั้ง 3 งานมี `started_at` แต่ `heartbeat_at` ว่างและ `chunk_count = 0` — รูปแบบนี้เกิดจาก `document_analysis_set_status('running')` ของ **ฟังก์ชันรุ่นแรก** (อ่านทั้งไฟล์ด้วย `unpdf.extractText`) เท่านั้น รุ่นแบ่งรอบจะตั้ง heartbeat + รอบที่ 1 ใน `document_analysis_claim` ก่อนเปิดไฟล์เสมอ → ฟังก์ชันบน Staging ยังเป็นรุ่นเดิม
- วัด CPU (PDF ไทยฝังฟอนต์ 300 หน้า 1.98 MB สร้างด้วย LibreOffice): รุ่นเดิมอ่านทั้งไฟล์ **2,224 ms** (เกิน 2 วินาที) · รุ่นแบ่งรอบ: import ฟังก์ชัน ~310 ms + เปิด PDF 90–100 ms (ไม่ขึ้นกับหน้าเริ่ม = ไม่ถอดทั้งไฟล์ก่อน) + ~12 ms/หน้า · ทดสอบครบ 16 รอบ (process ใหม่ทุกรอบ อ่าน checkpoint) CPU ต่อรอบ 0.68–0.80 s → วิเคราะห์จบ
- เพิ่มงบ CPU จริงต่อรอบ (`ANALYZE_CHUNK_CPU_MS`, ค่าเริ่ม 600 ms ถ้า runtime รายงาน `Deno.cpuUsage`) และลดเพดานเป็น 20 หน้า/รอบ
- probe คืน `version` → หน้าเว็บแสดง “Edge Function รุ่นเดิม” ถ้า deploy ยังไม่อัปเดต
