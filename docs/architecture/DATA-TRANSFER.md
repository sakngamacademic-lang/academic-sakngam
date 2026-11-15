# Data Transfer: Local curriculum staging → Supabase Staging (`ifwercnzbnkpadikqigj`)

> ห้ามรันบน Production · ห้าม reset · ห้ามลบข้อมูลเดิม · ไฟล์ SQL ที่สร้างมีข้อมูลหลักสูตรที่ยังไม่อนุมัติ → **ห้าม commit** (`transfer-out/` อยู่ใน .gitignore)

## ย้ายอะไร
| ตาราง | เงื่อนไข | การแมป |
|---|---|---|
| `source_documents` | ทั้งหมด (SRC-01 + 6 ส่วน) | `file_id = null` (ไฟล์อยู่ storage local — ผูกใหม่หลังอัปโหลด R2 และตรวจ SHA256) |
| `source_conflicts` | ยังไม่ตัดสิน | สถานะคงเดิม (`needs_decision`) |
| `school_curricula`, `curriculum_versions` | ฉบับ `draft` เท่านั้น | กรอบแกนกลาง = null (ยังไม่ยืนยัน) |
| `import_batches`, `import_rows` | ยังไม่มีการอนุมัติ/บันทึก | สถานะ `needs_review` / `error` คงเดิม · source page / sheet / cell / raw / normalized / issues คงเดิม |
| `curriculum_rules` | `draft` เท่านั้น | – |

ทุกตาราง: **UUID เดิม** · `school_id` → โรงเรียนปลายทางตามรหัส · ผู้สร้าง → บัญชีปลายทางที่ระบุ · ไม่ย้าย: บัญชีผู้ใช้ ครู seed โรงเรียน seed audit เดิม

สคริปต์ **ปฏิเสธ** ถ้าพบข้อมูลที่ approved / committed / verified / active (ต้องตัดสินใจแยก)

## ความปลอดภัยของไฟล์ที่สร้าง
- transaction เดียว — ผิดพลาดใด ๆ = ไม่มีอะไรเปลี่ยน
- `insert … on conflict (id) do nothing` → รันซ้ำได้ไม่สร้างซ้ำ
- ถ้าปลายทางมีแถว id เดียวกันแต่เนื้อหาต่าง → **abort** (ไม่เขียนทับ)
- ตรวจจำนวนแถวหลังย้ายทุกตาราง ไม่ตรง → abort
- บันทึก `audit_logs` (`table_name = 'data_transfer'`) พร้อม sha256 ของข้อมูลแต่ละตาราง
- `rollback-*.sql` ลบเฉพาะ id ที่ย้าย และปฏิเสธถ้ามีแถวที่คนตรวจ/อนุมัติแล้ว

## ผลทดสอบ (stack แยก, 15 พ.ย. 2569)
ย้าย 7 + 80 + 1 + 5 + 1,453 + 43 แถว → รันซ้ำจำนวนไม่เปลี่ยน → hash ของ import_rows / conflicts ตรงต้นทาง → แก้แถวปลายทาง 1 แถวแล้วรันซ้ำ = abort ไม่เขียนทับ → rollback เหลือ 0 (โรงเรียน/โปรไฟล์ไม่ถูกแตะ)

## ขั้นตอน (ต้องได้รับอนุมัติก่อนรันบน Staging)
1. Backup local: `docker exec supabase_db_academic-sakngam pg_dump -U postgres -d postgres -Fc > backup.dump`
2. สร้างไฟล์: `node scripts/transfer/export-curriculum-staging.mjs --school-code <รหัสโรงเรียนบน staging> --actor-email <อีเมลบัญชีบน staging> --out transfer-out`
3. ตรวจ `manifest-*.json` (จำนวนแถว + sha256)
4. รัน `transfer-*.sql` ใน SQL Editor ของ Staging (หรือ `psql` ด้วย connection string ของ Staging)
5. ตรวจ: `select table_name, new_data->'tables' from audit_logs where table_name = 'data_transfer'`

## ข้อที่ต้องตัดสินใจ
- **Two-person approval**: ชุดนำเข้าจะมีผู้สร้าง = บัญชีที่ระบุ ผู้อนุมัติต้องเป็นหัวหน้าฝ่ายวิชาการ **คนละคน** — ถ้าใช้บัญชี academic_head เดิมเป็นผู้สร้าง ต้องมี academic_head คนที่สองเพื่ออนุมัติ (หรือใช้บัญชีเจ้าหน้าที่วิชาการเป็นผู้สร้าง)

## อัปเดต 15 พ.ย. 2569
- Local มีชุดนำเข้า **6 ชุด / 2,832 แถว** (เพิ่มชุด `learning_outcomes` 1,379 แถว — ผลการเรียนรู้จากคำอธิบายรายวิชา 213 วิชา · สถานะ `error` เพราะรายวิชายังไม่ถูกบันทึก (V45) — ตรวจซ้ำได้หลังอนุมัติและบันทึกชุดรายวิชา · 126 แถวมีคำเตือนคำอธิบายซ้ำหลายหน้า, 15 แถวเป็น IS)
- ตัวชี้วัดแกนกลาง (อ้างอิง 1,235 รายการ) **ยังไม่นำเข้า** เพราะต้องมีชุดอ้างอิงทางการที่ยืนยันก่อน
- ซ้อมย้ายบน stack ที่จำลอง Hosted (21 migration → 24) โดยใช้บัญชี staff เป็นผู้สร้างชุด: รัน 2 ครั้งจำนวนคงที่ · hash ตรงต้นทาง · ไม่มี approved/committed · `auth.users` ไม่ถูกแตะ
- สร้างไฟล์ด้วยข้อมูลปัจจุบันแล้วตรวจได้: ชุดนำเข้า 6 · แถว 2,832 (ไฟล์ ~4.9 MB — ถ้า SQL Editor รับไม่ไหวให้ใช้ `psql -f` กับ connection string ของ Staging)

## Dry Run บน Hosted (อ่านอย่างเดียว) — 15 พ.ย. 2569

สร้างไฟล์ด้วย `--dry-run` (ไม่เขียนข้อมูลจริง):

```bash
node scripts/transfer/export-curriculum-staging.mjs --school-code <code> --actor-email <email> --out <dir> --dry-run
```

- `dryrun-<ts>.sql` — แบบ temp table + `begin; … rollback;` สำหรับ SQL Editor
- `dryrun-ro-NN-<table>-<k>.sql` — แบบ CTE ล้วน แบ่งชิ้น ≤ ~450KB ส่งผ่าน Management API
  (`/database/query`, `read_only: true`) ได้ทีละไฟล์ (ไฟล์เดียว 3MB ได้ HTTP 413)

ตรวจ: โรงเรียน/ผู้สร้างชุดมีจริง, ผู้สร้างเป็น `academic_staff` ไม่ใช่ `academic_head`,
มี `academic_head` อื่นเป็นผู้อนุมัติ, จำนวนแถว, FK, unique key, ไม่ชน id เดิม, และสถานะที่ย้าย

ผลบน Hosted (อ่านอย่างเดียว, 13 ไฟล์, 48 checks):
ผ่านทุกข้อด้านข้อมูล — source_documents 7, source_conflicts 80 (needs_decision), school_curricula 1,
curriculum_versions 1 (draft), import_batches 6 (needs_review), import_rows 2,832, curriculum_rules 43 (draft);
FK orphan 0, unique collision 0, ปลายทางว่าง
ไม่ผ่าน 2 ข้อตามคาด (blocker): ยังไม่มีบัญชี `academic_staff` และไม่มี `academic_head` อื่นนอกจากผู้สร้าง
→ ต้องสร้างบัญชีและรัน `private.grant_school_role(...)` ก่อนย้ายจริง

## โหมดแบ่งไฟล์ `--chunked` (สำหรับ SQL Editor)

SQL Editor รับไฟล์เดียวขนาดหลาย MB ไม่ไหว (ข้อผิดพลาด `unterminated dollar-quoted string`) จึงมี `--chunked`
สร้าง `part-NN-<table>-<k>of<n>.sql` ที่แต่ละไฟล์เป็น transaction ของตัวเอง ทำซ้ำได้ (`on conflict (id) do nothing`),
ตรวจ id ซ้ำแต่เนื้อหาต่าง และตรวจจำนวนแถว; รันตามลำดับเลขไฟล์ (ไฟล์สุดท้าย = audit)
`--part-kb <n>` ปรับขนาด (ค่าเริ่มต้น 150KB ของ JSON; ไฟล์ภาษาไทยจะใหญ่ประมาณ 2 เท่า)
ทดสอบบน stack แยก: 28 ไฟล์ผ่าน จำนวนแถวตรงต้นทาง สถานะคงเดิม และรันซ้ำไม่เกิดแถวซ้ำ
