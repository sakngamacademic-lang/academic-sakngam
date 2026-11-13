-- =============================================================================
-- C1.1 — Curriculum Intelligence: Schema
-- ตาม docs/architecture/CURRICULUM-DATA-DICTIONARY.md (ชื่อ learning_standards ตาม sprint brief)
-- - National framework = global (ไม่มี school_id) อ่านอย่างเดียว เขียนได้เฉพาะ migration/seed ที่ตรวจแล้ว (D1)
-- - School curriculum = school_id + composite FK + version lock
-- - ทุกแถวเนื้อหามี provenance (source_document_id + source_locator) — ไม่มีข้อมูลหลักสูตรใน migration นี้
-- =============================================================================

-- ---------------------------------------------------------------- ส่วนขยายตารางเดิม (ไม่สร้างซ้ำ)
alter table public.learning_areas add column national_area_code text;
alter table public.grade_levels add column national_grade_code text;
comment on column public.learning_areas.national_area_code is 'map กับ framework_learning_areas.code';
comment on column public.grade_levels.national_grade_code is 'map กับ framework_grade_levels.code';
alter table public.documents drop constraint documents_kind_check;
alter table public.documents add constraint documents_kind_check
  check (kind in ('teacher_document', 'task_template', 'curriculum_source'));
alter table public.documents drop constraint documents_kind_owner_check;
alter table public.documents add constraint documents_kind_owner_check check (
  (kind = 'teacher_document' and owner_teacher_id is not null and task_id is null)
  or (kind = 'task_template' and owner_teacher_id is null and task_id is not null)
  or (kind = 'curriculum_source' and owner_teacher_id is null and task_id is null)
);

-- รูปแบบ locator: pdf:N ; book:N ; sheet:<ชื่อ>!<cell> ; file:<path>
create or replace function private.is_valid_locator(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p ~ '^(pdf:[1-9][0-9]*|book:[0-9ivxlcdm]+|sheet:[^;]+![A-Z]{1,3}[0-9]+(:[A-Z]{1,3}[0-9]+)?|file:[^;]+)(;(pdf:[1-9][0-9]*|book:[0-9ivxlcdm]+|sheet:[^;]+![A-Z]{1,3}[0-9]+(:[A-Z]{1,3}[0-9]+)?|file:[^;]+))*$'
$$;

-- =============================================================================
-- 1. National Framework (global)
-- =============================================================================
create table public.curriculum_frameworks (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Za-z0-9_-]{2,32}$'),
  name_th          text not null check (length(btrim(name_th)) > 0),
  source_citation  text not null check (length(btrim(source_citation)) > 0),
  created_at       timestamptz not null default now()
);

create table public.framework_versions (
  id                 uuid primary key default gen_random_uuid(),
  framework_id       uuid not null references public.curriculum_frameworks (id) on delete restrict,
  version_label      text not null,
  published_year_be  int check (published_year_be between 2500 and 2700),
  status             text not null default 'draft' check (status in ('draft', 'published')),
  -- false = reference dataset ยังไม่ครบ → ห้ามแสดง % coverage เป็นผลสมบูรณ์
  is_complete        boolean not null default false,
  source_citation    text not null check (length(btrim(source_citation)) > 0),
  created_at         timestamptz not null default now(),
  unique (framework_id, version_label)
);

create table public.framework_learning_areas (
  id                    uuid primary key default gen_random_uuid(),
  framework_version_id  uuid not null references public.framework_versions (id) on delete restrict,
  code                  text not null,
  name_th               text not null,
  unique (framework_version_id, code),
  unique (id, framework_version_id)
);

create table public.framework_grade_levels (
  id                    uuid primary key default gen_random_uuid(),
  framework_version_id  uuid not null references public.framework_versions (id) on delete restrict,
  code                  text not null,
  name_th               text not null,
  level_order           int not null,
  unique (framework_version_id, code),
  unique (id, framework_version_id)
);

create table public.learning_standards (
  id                          uuid primary key default gen_random_uuid(),
  framework_version_id        uuid not null,
  framework_learning_area_id  uuid not null,
  code                        text not null,
  statement_th                text not null,
  source_citation             text not null,
  unique (framework_version_id, code),
  unique (id, framework_version_id),
  foreign key (framework_learning_area_id, framework_version_id)
    references public.framework_learning_areas (id, framework_version_id) on delete restrict
);
create index learning_standards_area_idx on public.learning_standards (framework_learning_area_id);

create table public.indicators (
  id                        uuid primary key default gen_random_uuid(),
  framework_version_id      uuid not null,
  standard_id               uuid not null,
  framework_grade_level_id  uuid not null,
  code                      text not null,
  full_code                 text not null,
  indicator_kind            text not null check (indicator_kind in ('grade', 'stage')),
  statement_th              text not null,
  source_citation           text not null,
  unique (framework_version_id, full_code),
  unique (standard_id, framework_grade_level_id, code),
  unique (id, framework_version_id),
  foreign key (standard_id, framework_version_id) references public.learning_standards (id, framework_version_id) on delete restrict,
  foreign key (framework_grade_level_id, framework_version_id)
    references public.framework_grade_levels (id, framework_version_id) on delete restrict
);
create index indicators_grade_idx on public.indicators (framework_grade_level_id);

-- =============================================================================
-- 2. Source & evidence (school)
-- =============================================================================
-- files ต้องมี unique (id, school_id) เพื่อใช้ composite FK
alter table public.files add constraint files_id_school_key unique (id, school_id);

create table public.source_documents (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  register_code            text not null check (register_code ~ '^SRC-[0-9]{2}(-[A-Z0-9]{1,8})?$'),
  title                    text not null check (length(btrim(title)) between 1 and 300),
  doc_type                 text not null check (doc_type in (
    'curriculum_book', 'announcement', 'learning_area_curriculum', 'assessment_regulation', 'structure_workbook', 'other')),
  file_id                  uuid,
  parent_id                uuid,
  sha256                   text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  page_count               int check (page_count is null or page_count > 0),
  page_offset              int,
  declared_curriculum_ref  text,
  content_status           text not null default 'has_content' check (content_status in ('has_content', 'empty', 'duplicate', 'variant')),
  duplicate_of_id          uuid,
  reliability              text not null check (reliability in ('A', 'B', 'C', 'D')),
  learning_area_id         uuid,
  grade_scope              text,
  issued_year_be           int check (issued_year_be is null or issued_year_be between 2500 and 2700),
  status                   text not null default 'registered' check (status in ('registered', 'reviewed', 'superseded')),
  notes                    text,
  reviewed_by              uuid,
  reviewed_at              timestamptz,
  created_by               uuid default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (school_id, register_code),
  unique (id, school_id),
  foreign key (file_id, school_id) references public.files (id, school_id) on delete restrict,
  foreign key (parent_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  foreign key (duplicate_of_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  foreign key (learning_area_id, school_id) references public.learning_areas (id, school_id) on delete restrict,
  check ((content_status = 'duplicate') = (duplicate_of_id is not null))
);
create index source_documents_file_idx on public.source_documents (file_id) where file_id is not null;

create table public.source_conflicts (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  conflict_code  text not null check (conflict_code ~ '^CF-[0-9]{2,4}$'),
  doc_a_id       uuid not null,
  doc_b_id       uuid,
  subject_ref    text,
  locator_a      text check (locator_a is null or private.is_valid_locator(locator_a)),
  locator_b      text check (locator_b is null or private.is_valid_locator(locator_b)),
  description    text not null check (length(btrim(description)) > 0),
  impact         text not null default 'warning' check (impact in ('blocking', 'warning')),
  status         text not null default 'open' check (status in ('open', 'resolved')),
  resolution     text,
  resolved_by    uuid,
  resolved_at    timestamptz,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (school_id, conflict_code),
  unique (id, school_id),
  foreign key (doc_a_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  foreign key (doc_b_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  check ((status = 'resolved') = (resolved_at is not null and resolution is not null))
);
create index source_conflicts_docs_idx on public.source_conflicts (doc_a_id, doc_b_id) where status = 'open';

-- =============================================================================
-- 3. School curriculum
-- =============================================================================
create table public.school_curricula (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  name_th     text not null check (length(btrim(name_th)) between 1 and 200),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, name_th),
  unique (id, school_id)
);

create table public.curriculum_versions (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  school_curriculum_id    uuid not null,
  framework_version_id    uuid references public.framework_versions (id) on delete restrict,
  framework_status        text not null default 'provisional' check (framework_status in ('confirmed', 'provisional')),
  version_label           text not null check (length(btrim(version_label)) between 1 and 100),
  effective_year_be       int check (effective_year_be is null or effective_year_be between 2500 and 2700),
  hours_per_credit        numeric(5,2) check (hours_per_credit is null or hours_per_credit > 0),
  subject_code_pattern    text,
  status                  text not null default 'draft' check (status in ('draft', 'under_review', 'approved', 'active', 'retired')),
  announcement_source_id  uuid,
  announcement_locator    text check (announcement_locator is null or private.is_valid_locator(announcement_locator)),
  based_on_version_id     uuid,
  submitted_by            uuid,
  submitted_at            timestamptz,
  approved_by             uuid,
  approved_at             timestamptz,
  activated_at            timestamptz,
  retired_at              timestamptz,
  created_by              uuid default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (school_curriculum_id, version_label),
  unique (id, school_id),
  foreign key (school_curriculum_id, school_id) references public.school_curricula (id, school_id) on delete restrict,
  foreign key (announcement_source_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  foreign key (based_on_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  check (status in ('draft', 'under_review') or (approved_by is not null and approved_at is not null)),
  check (status = 'draft' or (announcement_source_id is not null and announcement_locator is not null))
);
create index curriculum_versions_status_idx on public.curriculum_versions (school_id, status);

create table public.study_programs (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  code                   text not null check (code ~ '^[A-Za-z0-9_-]{1,32}$'),
  name_th                text not null check (length(btrim(name_th)) between 1 and 200),
  stage                  text not null check (stage in ('primary', 'lower_secondary', 'upper_secondary', 'other')),
  is_active              boolean not null default true,
  source_document_id     uuid not null,
  source_locator         text not null check (private.is_valid_locator(source_locator)),
  import_row_id          uuid,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (curriculum_version_id, code),
  unique (id, school_id),
  unique (id, curriculum_version_id),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict
);

create table public.curriculum_implementations (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id   uuid not null,
  study_program_id        uuid,
  entry_academic_year_id  uuid not null,
  entry_grade_level_id    uuid not null,
  status                  text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  decided_source_id       uuid not null,
  decided_locator         text not null check (private.is_valid_locator(decided_locator)),
  created_by              uuid default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, school_id),
  constraint curriculum_implementations_cohort_key unique nulls not distinct (entry_academic_year_id, entry_grade_level_id, study_program_id),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (study_program_id, curriculum_version_id) references public.study_programs (id, curriculum_version_id) on delete restrict,
  foreign key (entry_academic_year_id, school_id) references public.academic_years (id, school_id) on delete restrict,
  foreign key (entry_grade_level_id, school_id) references public.grade_levels (id, school_id) on delete restrict,
  foreign key (decided_source_id, school_id) references public.source_documents (id, school_id) on delete restrict
);
create index curriculum_implementations_version_idx on public.curriculum_implementations (curriculum_version_id);

create table public.classroom_programs (
  classroom_id      uuid primary key,
  school_id         uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  study_program_id  uuid not null,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (classroom_id, school_id) references public.classrooms (id, school_id) on delete restrict,
  foreign key (study_program_id, school_id) references public.study_programs (id, school_id) on delete restrict
);
create index classroom_programs_program_idx on public.classroom_programs (study_program_id);

create table public.subjects (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  code                   text not null check (length(btrim(code)) between 1 and 20),
  name_th                text not null check (length(btrim(name_th)) between 1 and 200),
  name_en                text,
  learning_area_id       uuid not null,
  subject_type           text not null check (subject_type in ('basic', 'additional')),
  grade_level_id         uuid,
  credits                numeric(4,1) not null check (credits >= 0),
  learning_hours         int not null check (learning_hours >= 0),
  description_th         text,
  source_document_id     uuid not null,
  source_locator         text not null check (private.is_valid_locator(source_locator)),
  import_row_id          uuid,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subjects_code_key unique (curriculum_version_id, code),
  unique (id, school_id),
  unique (id, curriculum_version_id),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (learning_area_id, school_id) references public.learning_areas (id, school_id) on delete restrict,
  foreign key (grade_level_id, school_id) references public.grade_levels (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict
);
create index subjects_area_idx on public.subjects (learning_area_id);
create index subjects_version_grade_idx on public.subjects (curriculum_version_id, grade_level_id);

create table public.subject_offerings (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  subject_id             uuid not null,
  study_program_id       uuid,
  grade_level_id         uuid not null,
  term_no                smallint check (term_no in (1, 2)),
  offering_kind          text not null default 'required' check (offering_kind in ('required', 'elective')),
  hours_per_week         numeric(4,1) check (hours_per_week is null or hours_per_week >= 0),
  sort_order             int not null default 0,
  source_document_id     uuid not null,
  source_locator         text not null check (private.is_valid_locator(source_locator)),
  import_row_id          uuid,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, school_id),
  constraint subject_offerings_slot_key unique nulls not distinct (subject_id, study_program_id, grade_level_id, term_no),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (subject_id, curriculum_version_id) references public.subjects (id, curriculum_version_id) on delete restrict,
  foreign key (study_program_id, curriculum_version_id) references public.study_programs (id, curriculum_version_id) on delete restrict,
  foreign key (grade_level_id, school_id) references public.grade_levels (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict
);
create index subject_offerings_structure_idx on public.subject_offerings (curriculum_version_id, study_program_id, grade_level_id, term_no);

create table public.learning_activities (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  study_program_id       uuid,
  activity_type          text not null check (length(btrim(activity_type)) between 1 and 100),
  name_th                text not null check (length(btrim(name_th)) between 1 and 200),
  grade_level_id         uuid not null,
  term_no                smallint check (term_no in (1, 2)),
  activity_hours         int not null check (activity_hours >= 0),
  source_document_id     uuid not null,
  source_locator         text not null check (private.is_valid_locator(source_locator)),
  import_row_id          uuid,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, school_id),
  constraint learning_activities_slot_key unique nulls not distinct (curriculum_version_id, study_program_id, grade_level_id, term_no, name_th),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (study_program_id, curriculum_version_id) references public.study_programs (id, curriculum_version_id) on delete restrict,
  foreign key (grade_level_id, school_id) references public.grade_levels (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict
);

-- ผลการเรียนรู้ (รายวิชาเพิ่มเติม) และตัวชี้วัดระหว่างทาง (ของรายวิชา) — ตัวชี้วัดปลายทาง = indicators (national)
create table public.subject_learning_outcomes (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  subject_id             uuid not null,
  outcome_kind           text not null check (outcome_kind in ('learning_outcome', 'interim_indicator')),
  code                   text not null check (length(btrim(code)) between 1 and 40),
  statement_th           text not null check (length(btrim(statement_th)) > 0),
  indicator_id           uuid references public.indicators (id) on delete restrict,
  source_document_id     uuid not null,
  source_locator         text not null check (private.is_valid_locator(source_locator)),
  import_row_id          uuid,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (subject_id, outcome_kind, code),
  unique (id, school_id),
  unique (id, subject_id),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (subject_id, curriculum_version_id) references public.subjects (id, curriculum_version_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict
);

create table public.curriculum_indicator_mappings (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  subject_id             uuid not null,
  indicator_id           uuid references public.indicators (id) on delete restrict,
  learning_outcome_id    uuid,
  coverage               text not null default 'primary' check (coverage in ('primary', 'supporting')),
  status                 text not null default 'pending_review' check (status in ('pending_review', 'verified', 'rejected')),
  review_note            text,
  verified_by            uuid,
  verified_at            timestamptz,
  source_document_id     uuid not null,
  source_locator         text not null check (private.is_valid_locator(source_locator)),
  import_row_id          uuid,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, school_id),
  constraint curriculum_indicator_mappings_pair_key unique nulls not distinct (subject_id, indicator_id, learning_outcome_id),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (subject_id, curriculum_version_id) references public.subjects (id, curriculum_version_id) on delete restrict,
  foreign key (learning_outcome_id, subject_id) references public.subject_learning_outcomes (id, subject_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  check (num_nonnulls(indicator_id, learning_outcome_id) = 1),
  check ((status = 'pending_review') = (verified_at is null))
);
create index curriculum_indicator_mappings_indicator_idx on public.curriculum_indicator_mappings (indicator_id) where indicator_id is not null;
create index curriculum_indicator_mappings_version_idx on public.curriculum_indicator_mappings (curriculum_version_id, status);

-- =============================================================================
-- 4. Import staging
-- =============================================================================
create table public.import_batches (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  source_document_id     uuid not null,
  curriculum_version_id  uuid not null,
  kind                   text not null check (kind in (
    'study_programs', 'subjects', 'subject_offerings', 'learning_activities', 'learning_outcomes', 'indicator_mappings')),
  learning_area_id       uuid,
  status                 text not null default 'uploaded' check (status in (
    'uploaded', 'parsed', 'validated', 'needs_review', 'approved', 'committed', 'rejected', 'failed')),
  parser                 text,
  column_mapping         jsonb,
  counts                 jsonb not null default '{}'::jsonb,
  status_note            text,
  created_by             uuid not null default auth.uid(),
  approved_by            uuid,
  approved_at            timestamptz,
  committed_by           uuid,
  committed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, school_id),
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (learning_area_id, school_id) references public.learning_areas (id, school_id) on delete restrict,
  -- กติกา 2 คน (D3)
  check (approved_by is null or approved_by <> created_by),
  check (status not in ('approved', 'committed') or approved_by is not null)
);
create index import_batches_status_idx on public.import_batches (school_id, status);

create table public.import_rows (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  batch_id           uuid not null,
  row_no             int not null check (row_no > 0),
  source_sheet       text,
  source_cell_range  text,
  source_page        int check (source_page is null or source_page > 0),
  raw                jsonb not null,
  normalized         jsonb not null default '{}'::jsonb,
  issues             jsonb not null default '[]'::jsonb,
  status             text not null default 'pending' check (status in (
    'pending', 'valid', 'warning', 'error', 'needs_review', 'approved', 'skipped', 'committed')),
  proposed_by        text not null default 'parser' check (proposed_by in ('parser', 'manual', 'ai')),
  decision_by        uuid,
  decision_at        timestamptz,
  decision_note      text,
  target_table       text,
  target_id          uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (batch_id, row_no),
  unique (id, school_id),
  foreign key (batch_id, school_id) references public.import_batches (id, school_id) on delete restrict,
  check (source_page is not null or source_sheet is not null),
  check (status not in ('approved', 'skipped') or decision_by is not null)
);
create index import_rows_batch_status_idx on public.import_rows (batch_id, status);

-- provenance: import_row_id ชี้กลับ staging
alter table public.study_programs add foreign key (import_row_id) references public.import_rows (id) on delete restrict;
alter table public.subjects add foreign key (import_row_id) references public.import_rows (id) on delete restrict;
alter table public.subject_offerings add foreign key (import_row_id) references public.import_rows (id) on delete restrict;
alter table public.learning_activities add foreign key (import_row_id) references public.import_rows (id) on delete restrict;
alter table public.subject_learning_outcomes add foreign key (import_row_id) references public.import_rows (id) on delete restrict;
alter table public.curriculum_indicator_mappings add foreign key (import_row_id) references public.import_rows (id) on delete restrict;

-- =============================================================================
-- 5. Integrity triggers
-- =============================================================================

-- เนื้อหาของฉบับที่ไม่ใช่ draft แก้/เพิ่ม/ลบไม่ได้ — ทุกผู้ใช้รวม RPC (แก้โดยสร้าง version ใหม่)
create or replace function private.curriculum_guard_version_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid := coalesce(new.curriculum_version_id, old.curriculum_version_id);
  v_status text;
begin
  if tg_op = 'UPDATE' and new.curriculum_version_id is distinct from old.curriculum_version_id then
    raise exception 'ย้ายข้อมูลไปหลักสูตรฉบับอื่นโดยตรงไม่ได้ กรุณาสร้างรายการใหม่ในฉบับนั้น';
  end if;
  select status into v_status from public.curriculum_versions where id = v_version;
  if v_status is distinct from 'draft' then
    raise exception 'หลักสูตรฉบับนี้อยู่ในสถานะ % แก้ไขเนื้อหาไม่ได้ — สร้างฉบับใหม่เพื่อแก้ไข', v_status
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

-- curriculum_versions: ผู้ใช้แก้ฟิลด์ได้เฉพาะตอน draft · สถานะเปลี่ยนผ่าน RPC
create or replace function private.curriculum_guard_version_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and old.status <> 'draft' then
    raise exception 'หลักสูตรฉบับนี้อยู่ในสถานะ % แก้ไขไม่ได้', old.status using errcode = 'insufficient_privilege';
  end if;
  if new.school_curriculum_id is distinct from old.school_curriculum_id then
    raise exception 'เปลี่ยนหลักสูตรต้นทางของฉบับไม่ได้';
  end if;
  return new;
end;
$$;

-- รายการย่อยต้องอ้างข้อมูลแม่ที่เปลี่ยนไม่ได้ (subject_id / indicator)
create or replace function private.curriculum_lock_parent_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) ->> 'subject_id') is distinct from (to_jsonb(old) ->> 'subject_id')
     or (to_jsonb(new) ->> 'indicator_id') is distinct from (to_jsonb(old) ->> 'indicator_id')
     or (to_jsonb(new) ->> 'learning_outcome_id') is distinct from (to_jsonb(old) ->> 'learning_outcome_id') then
    raise exception 'เปลี่ยนรายวิชา/ตัวชี้วัดที่อ้างอิงไม่ได้ กรุณาสร้างรายการใหม่';
  end if;
  return new;
end;
$$;

-- ช่วงชั้นของแผนการเรียน = ช่วงชั้นของระดับชั้น (offering / activity / classroom)
create or replace function private.curriculum_check_program_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid := new.study_program_id;
  v_grade uuid;
begin
  if tg_table_name = 'classroom_programs' then
    select c.grade_level_id into v_grade from public.classrooms c where c.id = new.classroom_id;
  else
    v_grade := new.grade_level_id;
  end if;
  if v_program is not null and not exists (
    select 1 from public.study_programs p join public.grade_levels g on g.id = v_grade
    where p.id = v_program and p.stage = g.stage
  ) then
    raise exception 'ช่วงชั้นของแผนการเรียนไม่ตรงกับระดับชั้น';
  end if;
  return new;
end;
$$;

-- รุ่นเดียวกันห้ามมีทั้งแถว "ทุกแผน" และแถวรายแผน (กำกวม) · ฉบับต้อง approved/active
create or replace function private.curriculum_check_implementation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.curriculum_versions v where v.id = new.curriculum_version_id and v.status in ('approved', 'active')) then
    raise exception 'ใช้ได้เฉพาะหลักสูตรฉบับที่อนุมัติแล้ว';
  end if;
  if exists (
    select 1 from public.curriculum_implementations i
    where i.id <> new.id
      and i.entry_academic_year_id = new.entry_academic_year_id
      and i.entry_grade_level_id = new.entry_grade_level_id
      and ((i.study_program_id is null) <> (new.study_program_id is null))
  ) then
    raise exception 'รุ่นนี้มีการกำหนดหลักสูตรแบบ "ทุกแผน" และ "รายแผน" ซ้อนกัน' using errcode = '23505';
  end if;
  return new;
end;
$$;

-- Mapping: ตัวชี้วัดต้องอยู่ใน framework version ของหลักสูตรฉบับนั้น + กลุ่มสาระตรง + ระดับชั้นตรง (ตัวชี้วัดชั้นปี)
create or replace function private.curriculum_check_mapping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cv public.curriculum_versions;
  v_ind public.indicators;
  v_area_code text;
  v_subject public.subjects;
  v_grade_code text;
begin
  if new.indicator_id is null then
    return new;
  end if;
  select * into v_cv from public.curriculum_versions where id = new.curriculum_version_id;
  select * into v_ind from public.indicators where id = new.indicator_id;
  if v_cv.framework_version_id is null or v_ind.framework_version_id is distinct from v_cv.framework_version_id then
    raise exception 'ตัวชี้วัดไม่อยู่ในกรอบหลักสูตรแกนกลางฉบับที่หลักสูตรนี้อ้างอิง' using errcode = '23514';
  end if;
  select * into v_subject from public.subjects where id = new.subject_id;
  select fla.code into v_area_code from public.learning_standards s
    join public.framework_learning_areas fla on fla.id = s.framework_learning_area_id where s.id = v_ind.standard_id;
  if not exists (select 1 from public.learning_areas la where la.id = v_subject.learning_area_id and la.national_area_code = v_area_code) then
    raise exception 'ตัวชี้วัดอยู่คนละกลุ่มสาระกับรายวิชา' using errcode = '23514';
  end if;
  if v_ind.indicator_kind = 'grade' and v_subject.grade_level_id is not null then
    select fgl.code into v_grade_code from public.framework_grade_levels fgl where fgl.id = v_ind.framework_grade_level_id;
    if not exists (select 1 from public.grade_levels g where g.id = v_subject.grade_level_id and g.national_grade_code = v_grade_code) then
      raise exception 'ตัวชี้วัดชั้นปีไม่ตรงกับระดับชั้นของรายวิชา' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- import_batches: เวอร์ชันเป้าหมายต้องเป็น draft · แหล่งต้องมีเนื้อหา (V02, V64)
create or replace function private.curriculum_check_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.curriculum_versions v where v.id = new.curriculum_version_id and v.status = 'draft') then
      raise exception 'นำเข้าได้เฉพาะหลักสูตรฉบับร่าง (draft)';
    end if;
    if exists (select 1 from public.source_documents d where d.id = new.source_document_id and d.content_status in ('empty', 'duplicate')) then
      raise exception 'เอกสารต้นทางไม่มีเนื้อหาหรือเป็นสำเนาซ้ำ นำเข้าไม่ได้';
    end if;
  elsif new.curriculum_version_id is distinct from old.curriculum_version_id or new.source_document_id is distinct from old.source_document_id
        or new.kind is distinct from old.kind or new.created_by is distinct from old.created_by then
    raise exception 'เปลี่ยนเป้าหมาย/แหล่ง/ชนิด/ผู้สร้างของชุดนำเข้าไม่ได้';
  end if;
  return new;
end;
$$;

revoke all on function private.is_valid_locator(text) from public, anon;
grant execute on function private.is_valid_locator(text) to authenticated, service_role;
revoke all on function private.curriculum_guard_version_content(), private.curriculum_guard_version_row(),
  private.curriculum_lock_parent_columns(), private.curriculum_check_program_stage(), private.curriculum_check_implementation(),
  private.curriculum_check_mapping(), private.curriculum_check_batch() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['study_programs', 'subjects', 'subject_offerings', 'learning_activities',
                           'subject_learning_outcomes', 'curriculum_indicator_mappings'] loop
    execute format('create trigger %1$s_version_guard before insert or update or delete on public.%1$I
                    for each row execute function private.curriculum_guard_version_content()', t);
  end loop;
  foreach t in array array['subject_offerings', 'subject_learning_outcomes', 'curriculum_indicator_mappings'] loop
    execute format('create trigger %1$s_lock_parent before update on public.%1$I
                    for each row execute function private.curriculum_lock_parent_columns()', t);
  end loop;
  foreach t in array array['source_documents', 'source_conflicts', 'school_curricula', 'curriculum_versions', 'study_programs',
                           'curriculum_implementations', 'classroom_programs', 'subjects', 'subject_offerings', 'learning_activities',
                           'subject_learning_outcomes', 'curriculum_indicator_mappings', 'import_batches', 'import_rows'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I
                    for each row execute function private.set_updated_at()', t);
    execute format('create trigger %1$s_lock_columns before update on public.%1$I
                    for each row execute function private.lock_columns_after_insert()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function private.audit_row_change()', t);
  end loop;
end;
$$;

create trigger curriculum_versions_guard before update on public.curriculum_versions
  for each row execute function private.curriculum_guard_version_row();
create trigger subject_offerings_stage before insert or update on public.subject_offerings
  for each row execute function private.curriculum_check_program_stage();
create trigger learning_activities_stage before insert or update on public.learning_activities
  for each row execute function private.curriculum_check_program_stage();
create trigger classroom_programs_stage before insert or update on public.classroom_programs
  for each row execute function private.curriculum_check_program_stage();
create trigger curriculum_implementations_check before insert or update on public.curriculum_implementations
  for each row execute function private.curriculum_check_implementation();
create trigger curriculum_indicator_mappings_check before insert or update of indicator_id, subject_id on public.curriculum_indicator_mappings
  for each row execute function private.curriculum_check_mapping();
create trigger import_batches_check before insert or update on public.import_batches
  for each row execute function private.curriculum_check_batch();
