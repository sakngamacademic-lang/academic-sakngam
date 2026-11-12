# Curriculum Data Dictionary (C1.0)

> สถานะ: ออกแบบ รออนุมัติ C1.1 · ชื่อตาราง/คอลัมน์ตรงกับ [ERD](CURRICULUM-ERD.md) และ [Import Plan](CURRICULUM-IMPORT-PLAN.md)
> ค่าในคอลัมน์ "ตัวอย่างรูปแบบ" เป็นรูปแบบเท่านั้น ไม่ใช่ข้อมูลหลักสูตรจริง — ค่าจริงต้องมาจาก Source Register

## 0. ข้อกำหนดร่วม

| ข้อกำหนด | รายละเอียด |
|---|---|
| คอลัมน์มาตรฐาน | `id uuid PK default gen_random_uuid()`, `created_at`, `updated_at` (trigger `private.set_updated_at`), `created_by uuid default auth.uid()` |
| Multi-school | ตารางโรงเรียนทุกตาราง: `school_id uuid not null default private.current_school_id()` + `unique (id, school_id)` + FK แบบ composite `(x_id, school_id)` + trigger `lock_columns_after_insert` (ห้ามย้ายโรงเรียน) |
| Provenance (P) | `source_document_id uuid not null` → `source_documents`, `source_locator text not null`, `import_row_id uuid` → `import_rows` (null = กรอกมือ) |
| รูปแบบ locator | `pdf:<หน้า PDF>` (บังคับสำหรับ PDF) · `book:<เลขหน้าที่พิมพ์>` (ถ้ามี — ห้ามใช้แทน pdf) · `sheet:<ชื่อชีต>!<cell/range>` · `file:<path ในZIP>` · คั่นหลายตำแหน่งด้วย `;` เช่น `pdf:4;book:3` |
| Audit | trigger `private.audit_row_change` ทุกตารางโรงเรียน · ไม่มี DELETE grant (ใช้สถานะ) |
| Version lock (V) | แก้ไขได้เฉพาะเมื่อ `curriculum_versions.status = 'draft'` (ตรวจใน RLS update + trigger) |
| Null-safe scope | helper สิทธิ์ทุกตัวต้อง `coalesce(..., false)` |

ตัวย่อสิทธิ์: **H** academic_head · **S** academic_staff · **L** learning_area_head (เฉพาะกลุ่มสาระตน) · **E** executive · **T** teacher · **A** system_admin

---

## 1. National Framework (global · ไม่มี school_id)

เขียนได้เฉพาะ migration/seed ที่ผ่านการตรวจ (D1) · `authenticated` อ่านได้ทั้งหมด · ทุกแถวมี `source_citation text not null` (ชื่อเอกสาร + หน้า)

### `curriculum_frameworks`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| code | text | unique, `^[A-Za-z0-9_-]{2,32}$` |
| name_th | text | not null |

### `framework_versions`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| framework_id | uuid | FK `curriculum_frameworks` |
| version_label | text | unique ต่อ framework (ข้อความตามเอกสาร) |
| published_year_be | int | 2500–2700 |
| status | text | `draft` \| `published` |

### `framework_learning_areas`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| framework_version_id | uuid | FK |
| code | text | unique ต่อ version — ใช้ map กับ `learning_areas.national_area_code` |
| name_th | text | not null |

### `framework_grade_levels`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| framework_version_id | uuid | FK |
| code | text | unique ต่อ version — map กับ `grade_levels.national_grade_code` (รองรับระดับช่วงชั้น) |
| name_th | text | not null |
| level_order | int | เรียงลำดับ |

### `standards`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| framework_version_id | uuid | FK |
| framework_learning_area_id | uuid | FK (version เดียวกัน — ตรวจด้วย composite FK) |
| code | text | unique ต่อ version (รูปแบบตามเอกสาร) |
| statement_th | text | not null |

### `indicators`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| standard_id | uuid | FK |
| framework_grade_level_id | uuid | FK |
| code | text | unique ต่อ standard + grade |
| indicator_kind | text | `grade` (ตัวชี้วัดชั้นปี) \| `stage` (ตัวชี้วัดช่วงชั้น) — ยืนยันชนิดที่มีจริงจากเอกสารของ framework version |
| statement_th | text | not null |

---

## 2. School Curriculum

### `school_curricula`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| school_id | uuid | composite key |
| name_th | text | unique ต่อโรงเรียน |

สิทธิ์: อ่าน ทุกบทบาท · เขียน H

### `curriculum_versions` (P)
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| school_curriculum_id | uuid | composite FK |
| framework_version_id | uuid | FK global (อ้างกรอบแกนกลางที่ใช้ — ยืนยันจาก SRC-01) |
| version_label | text | unique ต่อ school_curriculum (เช่น "พ.ศ. ____" ตามเอกสาร) |
| effective_year_be | int | ปีที่ประกาศใช้ |
| hours_per_credit | numeric(5,2) **null** | optional (D6) — ใช้เตือนเท่านั้น **ห้ามใช้คำนวณหรือเขียนทับ** `credits` / `learning_hours` จากต้นฉบับ (CF-07) |
| framework_status | text | `confirmed` \| `provisional` — ฉบับ 2569 = `provisional` จนกว่า CF-02 ปิด (D2) |
| status | text | `draft` → `under_review` → `approved` → `active` → `retired` (เปลี่ยนผ่าน RPC) |
| announcement_source_id | uuid | FK `source_documents` — ประกาศใช้หลักสูตร |
| announcement_locator | text | หน้าที่อ้างอิงในประกาศ |
| approved_by / approved_at | uuid / timestamptz | ต้องเป็น H และเป็นมนุษย์ |

สิทธิ์: อ่าน H S L E A; T อ่านเฉพาะ `approved`/`active` · แก้ H S (draft) · อนุมัติ H (RPC `curriculum_version_approve`)

### `study_programs` (P, V)
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| curriculum_version_id | uuid | composite FK |
| code | text | unique ต่อ version |
| name_th | text | ชื่อแผนการเรียนตามเอกสาร |
| stage | text | ตรงกับ `grade_levels.stage` (`lower_secondary` \| `upper_secondary` …) |
| is_active | boolean | |

### `curriculum_implementations`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| curriculum_version_id | uuid | composite FK (version ต้อง `approved`/`active`) |
| study_program_id | uuid null | null = ทุกแผนของรุ่นนั้น |
| entry_academic_year_id | uuid | composite FK `academic_years` |
| entry_grade_level_id | uuid | composite FK `grade_levels` |
| status | text | `planned` \| `active` \| `completed` |
| decided_source_id / decided_locator | uuid / text | อ้างประกาศที่กำหนดการใช้ |

unique `nulls not distinct (entry_academic_year_id, entry_grade_level_id, study_program_id)` — รุ่นเดียวใช้ได้ฉบับเดียว · สิทธิ์เขียน H (RPC)

### `classroom_programs`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| classroom_id | uuid | PK + composite FK `classrooms` |
| study_program_id | uuid | composite FK — stage ต้องตรงกับระดับชั้นของห้อง (trigger) |

### `subjects` (P, V)
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| curriculum_version_id | uuid | composite FK |
| code | text | unique ต่อ version · รูปแบบตรวจใน import (เตือน ไม่ใช่ constraint แข็ง) |
| name_th / name_en | text | name_th not null |
| learning_area_id | uuid | composite FK **learning_areas เดิม** |
| subject_type | text | `basic` (พื้นฐาน) \| `additional` (เพิ่มเติม) |
| grade_level_id | uuid null | ชั้นที่ออกแบบไว้ (null = หลายชั้น) |
| credits | numeric(4,1) | ≥ 0 — **หน่วยกิต** |
| learning_hours | int | ≥ 0 — **ชั่วโมงเรียนต่อรายวิชา** (เก็บแยก ไม่คำนวณจาก credits) |
| description_th | text | คำอธิบายรายวิชา |

สิทธิ์: อ่าน ทุกบทบาท (T เฉพาะ version approved/active) · เขียน H S, L เฉพาะ `learning_area_id` ในขอบเขต (V)

### `subject_offerings` (P, V) — โครงสร้างหลักสูตร
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| subject_id | uuid | composite FK |
| study_program_id | uuid null | null = ทุกแผน |
| grade_level_id | uuid | composite FK |
| term_no | smallint null | 1 \| 2 \| null (ทั้งปี) |
| offering_kind | text | `required` \| `elective` |
| hours_per_week | numeric(4,1) null | ตามตารางโครงสร้าง (ถ้ามี) |
| sort_order | int | ลำดับในตาราง |

unique `nulls not distinct (subject_id, study_program_id, grade_level_id, term_no)` · trigger: subject และ program ต้องเป็น version เดียวกัน

### `learning_activities` (P, V) — กิจกรรมพัฒนาผู้เรียน (ไม่มีหน่วยกิต)
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| curriculum_version_id | uuid | composite FK |
| study_program_id | uuid null | |
| activity_type | text | ค่าที่อนุญาตกำหนดจากเอกสาร SRC-01 ใน C1.1 (ไม่ตั้งล่วงหน้า) |
| name_th | text | ตามเอกสาร |
| grade_level_id | uuid | composite FK |
| term_no | smallint null | |
| activity_hours | int | ≥ 0 — **ชั่วโมงกิจกรรม** (แยกจาก learning_hours) |

### `subject_learning_outcomes` (P, V) — ผลการเรียนรู้ของรายวิชาเพิ่มเติม
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| subject_id | uuid | composite FK |
| code | text | unique ต่อ subject |
| statement_th | text | not null |

### `curriculum_indicator_mappings` (P, V)
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| subject_id | uuid | composite FK |
| indicator_id | uuid null | FK global `indicators` |
| learning_outcome_id | uuid null | composite FK `subject_learning_outcomes` |
| coverage | text | `primary` \| `supporting` |
| note | text | |

check: มีค่าอย่างใดอย่างหนึ่งระหว่าง indicator_id / learning_outcome_id · unique ต่อคู่ · trigger: indicator ต้องอยู่ใน framework_version ของ curriculum_version เดียวกัน และกลุ่มสาระตรงกัน (ผ่าน `national_area_code`)

---

## 3. Evidence & Import

### `source_documents`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| register_code | text | unique ต่อโรงเรียน (เช่น `SRC-01`, `SRC-03-SC`) — ตรงกับ Source Register |
| title | text | not null |
| doc_type | text | `curriculum_book` \| `announcement` \| `learning_area_curriculum` \| `assessment_regulation` \| `structure_workbook` \| `other` |
| file_id | uuid null | composite FK `files` (Phase 1.6, private) |
| parent_id | uuid null | ไฟล์ย่อยใน ZIP → แฟ้ม ZIP |
| sha256 | text | ตรงกับ `files.sha256` |
| page_count | int null | จำนวนหน้า PDF (SRC-01 = 547) |
| page_offset | int null | หน้า PDF − หน้าเล่ม (SRC-01 = 1 จากประกาศ เล่ม 3 = PDF 4) — ใช้แปลงเท่านั้น locator เก็บทั้งสองแบบ |
| declared_curriculum_ref | text null | ฉบับที่เอกสาร **ระบุเอง** (เช่น "2551 ปรับปรุง 2560") — แยกจากฉบับที่ระบบตัดสิน |
| content_status | text | `has_content` \| `empty` \| `duplicate` \| `variant` (CF-04, SRC-02) |
| duplicate_of_id | uuid null | ชี้เอกสารต้นแบบเมื่อซ้ำ |
| reliability | text | `A` \| `B` \| `C` \| `D` (นิยามใน Source Register §2) |
| curriculum_version_id | uuid null | |
| learning_area_id | uuid null | |
| grade_scope | text null | ตามเอกสาร |
| issued_year_be | int null | |
| status | text | `registered` \| `reviewed` \| `superseded` |
| reviewed_by / reviewed_at | | |

สิทธิ์: อ่าน H S L E · เขียน H S

### `source_conflicts`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| conflict_code | text | unique ต่อโรงเรียน (เช่น `CF-02`) — ตรงกับ Source Register §3 |
| doc_a_id / doc_b_id | uuid | composite FK `source_documents` (doc_b null ได้เมื่อขัดกันภายในเอกสารเดียว เช่น CF-03 ชื่อไฟล์ ↔ เนื้อหา) |
| subject_ref | text | สิ่งที่ขัดแย้ง (เช่น รหัสวิชา / ช่องโครงสร้าง) |
| locator_a / locator_b | text | หน้า / Sheet!Cell ของแต่ละฝั่ง |
| description | text | not null |
| resolution | text null | ผลตัดสิน + เหตุผล |
| impact | text | `blocking` (ห้าม commit ข้อมูลที่เกี่ยว) \| `warning` |
| status | text | `open` \| `resolved` |
| resolved_by / resolved_at | | H เท่านั้น (มนุษย์) |

### `import_batches`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| source_document_id | uuid | composite FK — **ต้องมีเสมอ** |
| curriculum_version_id | uuid | composite FK (ต้อง `draft`) |
| kind | text | `study_programs` \| `subjects` \| `subject_offerings` \| `learning_activities` \| `learning_outcomes` \| `indicator_mappings` |
| learning_area_id | uuid null | ขอบเขตของ L |
| status | text | `uploaded` → `parsed` → `validated` → `needs_review` → `approved` → `committed` · `rejected` · `failed` |
| parser | text | ชื่อ/เวอร์ชันตัวอ่านไฟล์ (`xlsx@…`, `pdf-text@…`, `manual`, `ai-proposal@…`) |
| counts | jsonb | total / valid / warning / error / approved / skipped |
| created_by | uuid | |
| approved_by / approved_at | uuid / timestamptz | ≠ created_by (D3) · มนุษย์เท่านั้น |
| committed_at | timestamptz | |

### `import_rows`
| คอลัมน์ | ชนิด | ข้อกำหนด |
|---|---|---|
| batch_id | uuid | composite FK |
| row_no | int | unique ต่อ batch |
| source_sheet | text null | ชื่อ Sheet |
| source_cell_range | text null | เช่น `B5:H5` |
| source_page | int null | หน้า PDF |
| raw | jsonb | ค่าตามต้นฉบับ (ไม่แก้) |
| normalized | jsonb | ค่าหลังแปลง (แก้ได้ระหว่างตรวจ — บันทึก audit) |
| issues | jsonb | `[{code, field, severity: error\|warning\|info, message_th}]` |
| status | text | `pending` \| `valid` \| `warning` \| `error` \| `needs_review` \| `approved` \| `skipped` \| `committed` |
| proposed_by | text | `parser` \| `manual` \| `ai` |
| decision_by / decision_at / decision_note | | ผู้ตรวจ (มนุษย์) |
| target_table / target_id | text / uuid | หลัง commit — เชื่อมกลับข้อมูลหลัก |

แถวสถานะ `error` commit ไม่ได้ · แถว `proposed_by = 'ai'` เริ่มที่ `needs_review` เสมอ

---

## 4. คอลัมน์ที่เพิ่มในตารางเดิม (C1.1)

| ตาราง | คอลัมน์ | เหตุผล |
|---|---|---|
| `learning_areas` | `national_area_code text null` | map กลุ่มสาระโรงเรียน ↔ `framework_learning_areas.code` (ไม่สร้างกลุ่มสาระซ้ำ) |
| `grade_levels` | `national_grade_code text null` | map ระดับชั้น ↔ `framework_grade_levels.code` |
| `documents` | `kind` เพิ่ม `curriculum_source` | เก็บไฟล์ต้นฉบับใน storage เดิม (Phase 1.6) |

## 5. RPC ที่วางแผน (C1.1–C1.3)

| RPC | ผู้เรียก | หน้าที่ |
|---|---|---|
| `curriculum_version_submit(id)` | H S | draft → under_review |
| `curriculum_version_approve(id)` | H (มนุษย์) | under_review → approved (ล็อกข้อมูลทั้งฉบับ) |
| `curriculum_version_activate(id)` / `retire(id)` | H | approved → active → retired |
| `curriculum_implementation_set(...)` | H | กำหนดรุ่นที่ใช้ฉบับ (ต้องอ้าง source) |
| `import_row_decide(row_id, decision, normalized, note)` | H S L(scope) | needs_review/valid/warning → approved / skipped |
| `import_batch_approve(batch_id)` | H, ≠ ผู้สร้าง | ทุกแถว approved/skipped และไม่มี error |
| `import_batch_commit(batch_id)` | H | เขียนข้อมูลหลักในธุรกรรมเดียว + ใส่ provenance |
