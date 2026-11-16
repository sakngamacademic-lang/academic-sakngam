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
