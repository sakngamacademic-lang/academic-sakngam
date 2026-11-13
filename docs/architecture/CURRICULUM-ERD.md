# Curriculum ERD (C1.0)

> สถานะ: **ตรงกับ migration** `20261118000100`–`20261118000400` (C1.1–C1.2) · ไม่มีข้อมูลหลักสูตรจริงในระบบ · รายละเอียดคอลัมน์และ constraint อยู่ใน [Data Dictionary](CURRICULUM-DATA-DICTIONARY.md)
> สัญลักษณ์: ตาราง **ตัวหนา** = ตารางเดิมที่มีอยู่แล้ว (ไม่สร้างซ้ำ) · ตาราง global ไม่มี `school_id`

## 1. National Framework (global · อ่านอย่างเดียว)

```mermaid
erDiagram
  curriculum_frameworks ||--o{ framework_versions : "ฉบับ/ปรับปรุง"
  framework_versions ||--o{ framework_learning_areas : "กลุ่มสาระในกรอบ"
  framework_versions ||--o{ framework_grade_levels : "ระดับชั้นในกรอบ"
  framework_learning_areas ||--o{ learning_standards : ""
  learning_standards ||--o{ indicators : "ตัวชี้วัดปลายทาง"
  framework_grade_levels ||--o{ indicators : "ชั้นปี / ช่วงชั้น"

  curriculum_frameworks { uuid id PK text code UK text name_th }
  framework_versions { uuid id PK uuid framework_id FK text version_label int published_year_be text status boolean is_complete text source_citation }
  framework_learning_areas { uuid id PK uuid framework_version_id FK text code text name_th }
  framework_grade_levels { uuid id PK uuid framework_version_id FK text code text name_th int level_order }
  learning_standards { uuid id PK uuid framework_version_id FK uuid framework_learning_area_id FK text code text statement_th text source_citation }
  indicators { uuid id PK uuid framework_version_id FK uuid standard_id FK uuid framework_grade_level_id FK text code text full_code text indicator_kind text statement_th text source_citation }
```

## 2. School Curriculum (school_id + RLS)

```mermaid
erDiagram
  schools ||--o{ school_curricula : ""
  school_curricula ||--o{ curriculum_versions : "ฉบับ"
  framework_versions ||--o{ curriculum_versions : "based_on"
  curriculum_versions ||--o{ study_programs : "แผนการเรียน"
  curriculum_versions ||--o{ curriculum_implementations : "ใช้กับรุ่นใด"
  study_programs ||--o{ curriculum_implementations : "nullable"
  academic_years ||--o{ curriculum_implementations : "ปีที่รุ่นเข้าเรียน"
  grade_levels ||--o{ curriculum_implementations : "ชั้นแรกเข้า"
  classrooms ||--o| classroom_programs : ""
  study_programs ||--o{ classroom_programs : ""

  curriculum_versions ||--o{ subjects : "รายวิชาของฉบับ"
  learning_areas ||--o{ subjects : ""
  grade_levels ||--o{ subjects : "ชั้นที่ออกแบบไว้ (nullable)"
  subjects ||--o{ subject_offerings : "จัดในโครงสร้าง"
  study_programs ||--o{ subject_offerings : "nullable = ทุกแผน"
  grade_levels ||--o{ subject_offerings : ""
  curriculum_versions ||--o{ learning_activities : "กิจกรรมพัฒนาผู้เรียน"
  study_programs ||--o{ learning_activities : "nullable"
  grade_levels ||--o{ learning_activities : ""
  subjects ||--o{ subject_learning_outcomes : "ผลการเรียนรู้ (รายวิชาเพิ่มเติม)"
  subjects ||--o{ curriculum_indicator_mappings : ""
  indicators ||--o{ curriculum_indicator_mappings : "nullable"
  indicators ||--o{ subject_learning_outcomes : "ระหว่างทาง → ปลายทาง (nullable)"
  subject_learning_outcomes ||--o{ curriculum_indicator_mappings : "nullable"

  school_curricula { uuid id PK uuid school_id FK text name_th }
  curriculum_versions { uuid id PK uuid school_id FK uuid school_curriculum_id FK uuid framework_version_id FK text version_label int effective_year_be numeric hours_per_credit text subject_code_pattern text framework_status text status uuid announcement_source_id FK uuid based_on_version_id FK }
  study_programs { uuid id PK uuid school_id FK uuid curriculum_version_id FK text code text name_th text stage }
  curriculum_implementations { uuid id PK uuid school_id FK uuid curriculum_version_id FK uuid study_program_id FK uuid entry_academic_year_id FK uuid entry_grade_level_id FK text status }
  classroom_programs { uuid classroom_id PK uuid school_id FK uuid study_program_id FK }
  subjects { uuid id PK uuid school_id FK uuid curriculum_version_id FK text code text name_th uuid learning_area_id FK text subject_type numeric credits int learning_hours }
  subject_offerings { uuid id PK uuid school_id FK uuid curriculum_version_id FK uuid subject_id FK uuid study_program_id FK uuid grade_level_id FK smallint term_no text offering_kind }
  learning_activities { uuid id PK uuid school_id FK uuid curriculum_version_id FK text activity_type text name_th uuid grade_level_id FK smallint term_no int activity_hours }
  subject_learning_outcomes { uuid id PK uuid school_id FK uuid curriculum_version_id FK uuid subject_id FK text outcome_kind text code text statement_th uuid indicator_id FK }
  curriculum_indicator_mappings { uuid id PK uuid school_id FK uuid curriculum_version_id FK uuid subject_id FK uuid indicator_id FK uuid learning_outcome_id FK text coverage text status uuid verified_by }
```

## 3. Evidence & Import

```mermaid
erDiagram
  files ||--o| source_documents : "ไฟล์ต้นฉบับ (Phase 1.6)"
  source_documents ||--o{ source_conflicts : "doc_a / doc_b"
  source_documents ||--o{ import_batches : ""
  curriculum_versions ||--o{ import_batches : "เป้าหมาย"
  import_batches ||--o{ import_rows : ""

  source_documents { uuid id PK uuid school_id FK uuid file_id FK text register_code text doc_type text reliability text sha256 int page_offset text declared_curriculum_ref text content_status uuid learning_area_id FK }
  source_conflicts { uuid id PK uuid school_id FK text conflict_code uuid doc_a_id FK uuid doc_b_id FK text subject_ref text description text impact text resolution uuid resolved_by }
  import_batches { uuid id PK uuid school_id FK uuid source_document_id FK uuid curriculum_version_id FK text kind text status jsonb column_mapping uuid created_by uuid approved_by uuid committed_by }
  import_rows { uuid id PK uuid school_id FK uuid batch_id FK int row_no text source_sheet text source_cell_range int source_page jsonb raw jsonb normalized jsonb issues text status text proposed_by }
```

**Provenance**: ตารางข้อมูลหลัก (`curriculum_versions`, `study_programs`, `subjects`, `subject_offerings`, `learning_activities`, `subject_learning_outcomes`, `curriculum_indicator_mappings`) ทุกตารางมีคอลัมน์ `source_document_id` + `source_locator` + `import_row_id` (ไม่แสดงในแผนภาพเพื่อความอ่านง่าย)

## 4. ความสัมพันธ์ข้ามชั้นกับตารางเดิม

| ตารางใหม่ | อ้างอิงตารางเดิม (composite FK กับ school_id) |
|---|---|
| `subjects.learning_area_id` | **learning_areas** (ไม่สร้างกลุ่มสาระใหม่) |
| `subjects.grade_level_id`, `subject_offerings.grade_level_id`, `learning_activities.grade_level_id`, `curriculum_implementations.entry_grade_level_id` | **grade_levels** |
| `curriculum_implementations.entry_academic_year_id` | **academic_years** |
| `classroom_programs.classroom_id` | **classrooms** |
| `source_documents.file_id` | **files** (private storage + sha256 เดิม) |
| National ↔ School | `learning_areas.national_area_code` ↔ `framework_learning_areas.code`, `grade_levels.national_grade_code` ↔ `framework_grade_levels.code` (คอลัมน์ใหม่ใน C1.1) |

ภายหลัง (C2): `course_sections(subject_offering_id, term_id, classroom_id, teacher_id)` เชื่อมกับ `teachers` / `terms` / `classrooms` ที่มีอยู่

## 5. Views (security_invoker — ใช้ RLS ของผู้เรียก)

| View | ใช้ทำอะไร |
|---|---|
| `v_classroom_curriculum` | ห้องเรียน → ฉบับหลักสูตรของรุ่น (`resolved` / `unresolved` / `ambiguous`) ผ่าน RPC `curriculum_resolve` — ไม่ใช้ปีปัจจุบัน |
| `v_indicator_coverage` | ตัวชี้วัดแต่ละตัว × ฉบับหลักสูตร: `verified` / `pending_review` / `unmapped` + `evidence_incomplete` + `possible_duplicate` + `framework_complete` |

## 6. ส่วนขยาย C1.5–C3 (migrations `20261118000500`–`20261118000900`)

| ตาราง / ฟังก์ชัน | หน้าที่ |
|---|---|
| `subjects.subject_category` (`regular`/`is`) + `education_stage` | รายวิชา IS ไม่สังกัดกลุ่มสาระ แยก ม.ต้น/ม.ปลาย · unique: regular = (version, code) · is = (version, code, stage) |
| `source_conflicts` + category / value_a / value_b / difference / impact_note / recommendation / decision_authority | ทะเบียนข้อขัดแย้ง · สถานะ open → needs_decision → resolved (หัวหน้าฝ่ายวิชาการเท่านั้น) |
| `curriculum_review_queue()` / `curriculum_staged_structure()` | ตรวจความสัมพันธ์ข้ามชุดนำเข้า และยอดจากข้อมูลรอตรวจ (อ่านอย่างเดียว) |
| `curriculum_rules` + `curriculum_compliance_check()` + `curriculum_structure_summary()` | เกณฑ์จากเอกสาร (มีแหล่ง/เวอร์ชัน, ยืนยันโดยมนุษย์) · ผล pass/warning/fail/insufficient_data จากข้อมูลที่บันทึกแล้ว |
| `course_sections` → `course_section_teachers` → `teachers` · `v_teacher_load` | กลุ่มเรียนของหลักสูตรฉบับที่อนุมัติ · ครูหลายคน · แยกคาบ/ชั่วโมงสอน/ชั่วโมงกิจกรรม/หน่วยกิต |

```mermaid
erDiagram
  curriculum_versions ||--o{ course_sections : "approved/active เท่านั้น"
  subject_offerings ||--o{ course_sections : ""
  learning_activities ||--o{ course_sections : ""
  terms ||--o{ course_sections : ""
  classrooms ||--o{ course_sections : "nullable"
  course_sections ||--o{ course_section_teachers : ""
  teachers ||--o{ course_section_teachers : ""
  source_documents ||--o{ curriculum_rules : "source + locator"
```
