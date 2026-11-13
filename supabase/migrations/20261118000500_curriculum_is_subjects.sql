-- =============================================================================
-- C1.5 — รายวิชา IS (Independent Study) ไม่สังกัดกลุ่มสาระ
-- หลักฐาน: SRC-01 สารบัญ (pdf:2) จัด "IS1 และ IS2" เป็นหมวดแยก ม.ต้น (pdf:476) / ม.ปลาย (pdf:479)
--          หัวคำอธิบาย (pdf:477–478, 480–481) ไม่ระบุกลุ่มสาระ · ใช้รหัสเดียวกันทั้ง ม.ต้น/ม.ปลาย แต่คำอธิบายต่างกัน
-- - subjects.subject_category: 'regular' (เดิม — ค่าเริ่มต้น ทุกแถวเดิมเป็น regular) | 'is'
-- - subjects.education_stage: ใช้กับ IS เท่านั้น (lower_secondary | upper_secondary) · regular ต้องเป็น null
-- - learning_area_id: NULL ได้เฉพาะ subject_category = 'is' (รายวิชาปกติยังบังคับเหมือนเดิม)
-- - Unique: regular = (version, code) เหมือนเดิม · is = (version, code, education_stage) · ห้ามรหัสชนข้ามหมวด
-- - สิทธิ์: IS ไม่มีกลุ่มสาระ → can_edit_curriculum_area(null) = เฉพาะฝ่ายวิชาการ (หัวหน้ากลุ่มสาระแก้ไม่ได้) — ไม่แก้ policy
-- - Import: ค้นรายวิชาด้วย code + ช่วงชั้น (private.curriculum_find_subject) — รายวิชาปกติผลเหมือนเดิม
-- forward-only · ไม่แตะข้อมูลเดิม
-- =============================================================================

alter table public.subjects
  add column subject_category text not null default 'regular' check (subject_category in ('regular', 'is')),
  add column education_stage text check (education_stage in ('lower_secondary', 'upper_secondary'));
alter table public.subjects alter column learning_area_id drop not null;
alter table public.subjects
  add constraint subjects_area_required check (subject_category = 'is' or learning_area_id is not null),
  add constraint subjects_stage_by_category check ((subject_category = 'is') = (education_stage is not null));

alter table public.subjects drop constraint subjects_code_key;
create unique index subjects_code_regular_key on public.subjects (curriculum_version_id, code) where subject_category = 'regular';
create unique index subjects_code_is_key on public.subjects (curriculum_version_id, code, education_stage) where subject_category = 'is';

-- รหัสเดียวกันห้ามอยู่ทั้งหมวดปกติและ IS ในฉบับเดียวกัน (partial index ตรวจข้ามหมวดไม่ได้)
create or replace function private.subjects_code_category_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.curriculum_version_id::text || '/' || new.code, 0));
  if exists (select 1 from public.subjects s where s.curriculum_version_id = new.curriculum_version_id and s.code = new.code
             and s.id <> new.id and s.subject_category <> new.subject_category) then
    raise exception 'รหัสวิชา % ถูกใช้ในหมวดรายวิชาอื่นของฉบับนี้แล้ว', new.code using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;
create trigger subjects_code_category_guard before insert or update of code, subject_category, curriculum_version_id on public.subjects
  for each row execute function private.subjects_code_category_guard();

grant insert (subject_category, education_stage) on public.subjects to authenticated;
grant update (subject_category, education_stage) on public.subjects to authenticated;

-- ค้นรายวิชาจากรหัส: regular = ตามรหัส · is = ตามรหัส + ช่วงชั้น · กำกวม/ไม่พบ = null
create or replace function private.curriculum_find_subject(p_version_id uuid, p_code text, p_stage text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(s.id))[1] end
  from public.subjects s
  where s.curriculum_version_id = p_version_id and s.code = p_code
    and (s.subject_category = 'regular' or s.education_stage = p_stage)
$$;
revoke all on function private.subjects_code_category_guard(), private.curriculum_find_subject(uuid, text, text) from public, anon;

-- ---------------------------------------------------------------- import: validate
create or replace function private.curriculum_validate(p_batch_id uuid, p_row_id uuid, p_norm jsonb, p_row public.import_rows default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.import_batches;
  cv public.curriculum_versions;
  n jsonb := coalesce(p_norm, '{}'::jsonb);
  out jsonb := '[]'::jsonb;
  v_text text;
  v_num numeric;
  v_area public.learning_areas;
  v_grade public.grade_levels;
  v_prog public.study_programs;
  v_subj public.subjects;
  v_ind uuid;
  v_cat text := coalesce(nullif(btrim(p_norm ->> 'subject_category'), ''), 'regular');
  v_stage text := nullif(btrim(p_norm ->> 'education_stage'), '');
begin
  select * into b from public.import_batches where id = p_batch_id;
  select * into cv from public.curriculum_versions where id = b.curriculum_version_id;

  -- ข้อผิดพลาดจาก parser (เช่น ข้อความเสีย / ชีตระบุฉบับไม่ตรง V62)
  if p_row.raw ? 'parser_issues' then
    out := out || coalesce(p_row.raw -> 'parser_issues', '[]'::jsonb);
  end if;
  if n = '{}'::jsonb then
    -- แถวรายหน้า PDF: รอผู้ตรวจถอดค่าจากข้อความ (needs_review) · แถวอื่นที่ไม่มีค่า = error
    return out || private.issue('NORMALIZED_EMPTY', null, case when p_row.source_page is not null then 'warning' else 'error' end,
      'ยังไม่มีค่าที่ตรวจแล้ว — กรอกค่าจากต้นฉบับ (ห้ามเดา)');
  end if;
  if p_row.source_sheet is not null and p_row.source_cell_range is null then
    out := out || private.issue('V01', 'source_cell_range', 'error', 'ไม่มีตำแหน่งเซลล์ต้นฉบับ');
  end if;

  if b.kind = 'study_programs' then
    if coalesce(n ->> 'code', '') !~ '^[A-Za-z0-9_-]{1,32}$' then out := out || private.issue('V15', 'code', 'error', 'รหัสแผนการเรียนไม่ถูกต้อง'); end if;
    if btrim(coalesce(n ->> 'name_th', '')) = '' then out := out || private.issue('V16', 'name_th', 'error', 'ไม่มีชื่อแผนการเรียน'); end if;
    if coalesce(n ->> 'stage', '') not in ('primary', 'lower_secondary', 'upper_secondary', 'other') then
      out := out || private.issue('V15', 'stage', 'error', 'ช่วงชั้นไม่ถูกต้อง');
    end if;
    if exists (select 1 from public.study_programs p where p.curriculum_version_id = cv.id and p.code = n ->> 'code') then
      out := out || private.issue('V11', 'code', 'warning', 'มีแผนการเรียนรหัสนี้ในฉบับนี้แล้ว');
    end if;

  elsif b.kind = 'subjects' then
    v_text := btrim(coalesce(n ->> 'code', ''));
    if v_text = '' then out := out || private.issue('V10', 'code', 'error', 'ไม่มีรหัสวิชา'); end if;
    -- รหัสซ้ำ: รายวิชาปกติห้ามซ้ำ · IS ซ้ำรหัสได้เฉพาะต่างช่วงชั้น (education_stage)
    if exists (select 1 from public.import_rows r where r.batch_id = p_batch_id and r.id <> coalesce(p_row_id, gen_random_uuid())
               and r.status <> 'skipped' and btrim(r.normalized ->> 'code') = v_text
               and not (v_cat = 'is' and coalesce(nullif(btrim(r.normalized ->> 'subject_category'), ''), 'regular') = 'is'
                        and nullif(btrim(r.normalized ->> 'education_stage'), '') is distinct from v_stage)) then
      out := out || private.issue('V10', 'code', 'error', 'รหัสวิชาซ้ำในชุดนำเข้าเดียวกัน');
    end if;
    if v_cat not in ('regular', 'is') then
      out := out || private.issue('V17', 'subject_category', 'error', 'ประเภทหมวดรายวิชาต้องเป็น regular หรือ is');
    elsif v_cat = 'is' and coalesce(v_stage, '') not in ('lower_secondary', 'upper_secondary') then
      out := out || private.issue('V17', 'education_stage', 'error', 'รายวิชา IS ต้องระบุช่วงชั้น lower_secondary หรือ upper_secondary');
    elsif v_cat = 'regular' and v_stage is not null then
      out := out || private.issue('V17', 'education_stage', 'error', 'รายวิชาปกติไม่ใช้ education_stage');
    end if;
    if v_cat = 'is' and nullif(n ->> 'grade_code', '') is not null and exists (
      select 1 from public.grade_levels g where g.school_id = b.school_id and g.code = n ->> 'grade_code' and g.stage is distinct from v_stage) then
      out := out || private.issue('V17', 'grade_code', 'error', 'ระดับชั้นไม่อยู่ในช่วงชั้นของรายวิชา IS');
    end if;
    if exists (select 1 from public.subjects s where s.curriculum_version_id = cv.id and s.code = v_text
               and not (v_cat = 'is' and s.subject_category = 'is' and s.education_stage is distinct from v_stage)) then
      out := out || private.issue('V11', 'code', 'error', 'มีรหัสวิชานี้ในหลักสูตรฉบับนี้แล้ว');
    end if;
    if cv.subject_code_pattern is not null and v_text !~ cv.subject_code_pattern then
      out := out || private.issue('V12', 'code', 'warning', 'รูปแบบรหัสวิชาไม่ตรงกับแนวปฏิบัติที่กำหนดในฉบับนี้');
    end if;
    if btrim(coalesce(n ->> 'name_th', '')) = '' then out := out || private.issue('V10', 'name_th', 'error', 'ไม่มีชื่อวิชา'); end if;
    select * into v_area from public.learning_areas la where la.school_id = b.school_id and la.code = n ->> 'learning_area_code';
    if v_cat = 'is' and nullif(btrim(n ->> 'learning_area_code'), '') is null then
      -- IS ไม่สังกัดกลุ่มสาระ (ตามเอกสารต้นฉบับ) — ห้ามสร้างกลุ่มสาระใหม่ · ชุดที่จำกัดกลุ่มสาระนำเข้า IS ไม่ได้
      if b.learning_area_id is not null then
        out := out || private.issue('V13', 'learning_area_code', 'error', 'ชุดนำเข้าที่จำกัดกลุ่มสาระนำเข้ารายวิชา IS ไม่ได้');
      else
        out := out || private.issue('V13', 'learning_area_code', 'info', 'รายวิชา IS ไม่สังกัดกลุ่มสาระ');
      end if;
    elsif not found then
      out := out || private.issue('V13', 'learning_area_code', 'error', 'ไม่พบกลุ่มสาระของโรงเรียนตามรหัสนี้ (ห้ามสร้างกลุ่มสาระใหม่จากการนำเข้า)');
    elsif b.learning_area_id is not null and v_area.id <> b.learning_area_id then
      out := out || private.issue('V13', 'learning_area_code', 'error', 'กลุ่มสาระอยู่นอกขอบเขตของชุดนำเข้านี้');
    end if;
    if coalesce(n ->> 'subject_type', '') not in ('basic', 'additional') then
      out := out || private.issue('V14', 'subject_type', 'error', 'ประเภทรายวิชาต้องเป็นพื้นฐาน (basic) หรือเพิ่มเติม (additional)');
    end if;
    v_num := private.try_numeric(n ->> 'credits');
    if v_num is null or v_num <> round(v_num, 1) then
      out := out || private.issue('V20', 'credits', 'error', 'หน่วยกิตต้องเป็นตัวเลข ≥ 0 ทศนิยมไม่เกิน 1 ตำแหน่ง');
    end if;
    if coalesce(n ->> 'learning_hours', '') !~ '^[0-9]+$' then
      out := out || private.issue('V21', 'learning_hours', 'error', 'ชั่วโมงเรียนต้องเป็นจำนวนเต็ม ≥ 0');
    elsif cv.hours_per_credit is not null and v_num is not null and (n ->> 'learning_hours')::numeric <> v_num * cv.hours_per_credit then
      out := out || private.issue('V22', 'learning_hours', 'info',
        format('ชั่วโมงเรียน (%s) ไม่เท่ากับหน่วยกิต × %s — เก็บตามต้นฉบับ ไม่แก้ค่า', n ->> 'learning_hours', cv.hours_per_credit));
    end if;
    if n ? 'grade_code' and nullif(n ->> 'grade_code', '') is not null
       and not exists (select 1 from public.grade_levels g where g.school_id = b.school_id and g.code = n ->> 'grade_code') then
      out := out || private.issue('V30', 'grade_code', 'error', 'ไม่พบระดับชั้นตามรหัสนี้');
    end if;

  elsif b.kind in ('subject_offerings', 'learning_activities') then
    select * into v_grade from public.grade_levels g where g.school_id = b.school_id and g.code = n ->> 'grade_code';
    if not found then out := out || private.issue('V30', 'grade_code', 'error', 'ไม่พบระดับชั้นตามรหัสนี้'); end if;
    if nullif(n ->> 'term_no', '') is not null and n ->> 'term_no' not in ('1', '2') then
      out := out || private.issue('V31', 'term_no', 'error', 'ภาคเรียนต้องเป็น 1, 2 หรือว่าง (ทั้งปี)');
    end if;
    if nullif(n ->> 'program_code', '') is not null then
      select * into v_prog from public.study_programs p where p.curriculum_version_id = cv.id and p.code = n ->> 'program_code';
      if not found then
        out := out || private.issue('V32', 'program_code', 'error', 'ไม่พบแผนการเรียนในฉบับนี้');
      elsif v_grade.id is not null and v_prog.stage <> v_grade.stage then
        out := out || private.issue('V32', 'program_code', 'error', 'ช่วงชั้นของแผนการเรียนไม่ตรงกับระดับชั้น');
      end if;
    end if;
    if b.kind = 'subject_offerings' then
      select * into v_subj from public.subjects s where s.id = private.curriculum_find_subject(cv.id, n ->> 'subject_code', v_grade.stage);
      if not found then out := out || private.issue('V33', 'subject_code', 'error', 'ไม่พบรายวิชานี้ในฉบับ (นำเข้ารายวิชาก่อน)'); end if;
      if coalesce(n ->> 'offering_kind', 'required') not in ('required', 'elective') then
        out := out || private.issue('V33', 'offering_kind', 'error', 'ชนิดการจัดต้องเป็น required หรือ elective');
      end if;
      if v_subj.id is not null and v_grade.id is not null and exists (
        select 1 from public.subject_offerings o where o.subject_id = v_subj.id and o.grade_level_id = v_grade.id
          and o.term_no is not distinct from nullif(n ->> 'term_no', '')::smallint and o.study_program_id is not distinct from v_prog.id) then
        out := out || private.issue('V33', 'subject_code', 'error', 'รายวิชานี้อยู่ในชั้น/ภาค/แผนเดียวกันแล้ว');
      end if;
    else
      if btrim(coalesce(n ->> 'name_th', '')) = '' or btrim(coalesce(n ->> 'activity_type', '')) = '' then
        out := out || private.issue('V40', 'name_th', 'error', 'ไม่มีชื่อหรือประเภทกิจกรรม');
      end if;
      if coalesce(n ->> 'activity_hours', '') !~ '^[0-9]+$' then
        out := out || private.issue('V40', 'activity_hours', 'error', 'ชั่วโมงกิจกรรมต้องเป็นจำนวนเต็ม ≥ 0');
      end if;
      if nullif(n ->> 'credits', '') is not null then
        out := out || private.issue('V40', 'credits', 'warning', 'ต้นฉบับระบุหน่วยกิตให้กิจกรรม — กิจกรรมเก็บเฉพาะชั่วโมง');
      end if;
    end if;

  elsif b.kind = 'learning_outcomes' then
    select * into v_subj from public.subjects s where s.id = private.curriculum_find_subject(cv.id, n ->> 'subject_code', v_stage);
    if not found then
      out := out || private.issue('V45', 'subject_code', 'error', 'ไม่พบรายวิชานี้ในฉบับ');
    elsif n ->> 'outcome_kind' = 'learning_outcome' and v_subj.subject_type <> 'additional' then
      out := out || private.issue('V45', 'outcome_kind', 'warning', 'ผลการเรียนรู้มักใช้กับรายวิชาเพิ่มเติม — ตรวจกับต้นฉบับ');
    end if;
    if coalesce(n ->> 'outcome_kind', '') not in ('learning_outcome', 'interim_indicator') then
      out := out || private.issue('V45', 'outcome_kind', 'error', 'ชนิดต้องเป็น learning_outcome หรือ interim_indicator');
    end if;
    if btrim(coalesce(n ->> 'code', '')) = '' or btrim(coalesce(n ->> 'statement_th', '')) = '' then
      out := out || private.issue('V45', 'code', 'error', 'ไม่มีรหัสหรือข้อความ');
    end if;
    if nullif(n ->> 'indicator_full_code', '') is not null and not exists (
      select 1 from public.indicators i where i.framework_version_id = cv.framework_version_id and i.full_code = n ->> 'indicator_full_code') then
      out := out || private.issue('V50', 'indicator_full_code', 'error', 'ไม่พบตัวชี้วัดปลายทางในกรอบหลักสูตรที่อ้างอิง');
    end if;

  elsif b.kind = 'indicator_mappings' then
    select * into v_subj from public.subjects s where s.id = private.curriculum_find_subject(cv.id, n ->> 'subject_code', v_stage);
    if not found then out := out || private.issue('V50', 'subject_code', 'error', 'ไม่พบรายวิชานี้ในฉบับ'); end if;
    if cv.framework_version_id is null then
      out := out || private.issue('V50', 'indicator_full_code', 'error', 'หลักสูตรฉบับนี้ยังไม่ได้ระบุกรอบหลักสูตรแกนกลาง');
    else
      select i.id into v_ind from public.indicators i where i.framework_version_id = cv.framework_version_id and i.full_code = n ->> 'indicator_full_code';
      if v_ind is null then out := out || private.issue('V50', 'indicator_full_code', 'error', 'ไม่พบตัวชี้วัดในกรอบหลักสูตรที่อ้างอิง'); end if;
    end if;
    if coalesce(n ->> 'coverage', 'primary') not in ('primary', 'supporting') then
      out := out || private.issue('V50', 'coverage', 'error', 'ระดับความสัมพันธ์ต้องเป็น primary หรือ supporting');
    end if;
  end if;
  return out;
end;
$$;


-- ---------------------------------------------------------------- import: commit
create or replace function public.curriculum_import_batch_commit(p_batch_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.import_batches;
  cv public.curriculum_versions;
  d public.source_documents;
  r public.import_rows;
  n jsonb;
  v_loc text;
  v_id uuid;
  v_count int := 0;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id and school_id = private.current_school_id() for update;
  if not found or not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการบันทึกชุดนำเข้าได้' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'approved' then
    raise exception 'ชุดนำเข้ายังไม่ได้รับการอนุมัติ';
  end if;
  if exists (select 1 from public.source_conflicts c where c.school_id = b.school_id and c.status = 'open' and c.impact = 'blocking'
             and b.source_document_id in (c.doc_a_id, c.doc_b_id)) then
    raise exception 'เอกสารต้นทางมีข้อขัดแย้งระดับ blocking ที่ยังไม่ได้ตัดสิน';
  end if;
  select * into cv from public.curriculum_versions where id = b.curriculum_version_id;
  select * into d from public.source_documents where id = b.source_document_id;

  for r in select * from public.import_rows where batch_id = b.id and status = 'approved' order by row_no loop
    n := r.normalized;
    -- ตรวจซ้ำก่อนเขียน (ข้อมูลหลักอาจเปลี่ยนหลังตรวจ)
    if exists (select 1 from jsonb_array_elements(private.curriculum_validate(b.id, r.id, n, r)) e where e ->> 'severity' = 'error') then
      raise exception 'แถวที่ % ไม่ผ่านการตรวจซ้ำก่อนบันทึก', r.row_no;
    end if;
    v_loc := case
      when r.source_page is not null then 'pdf:' || r.source_page
        || case when d.page_offset is not null and r.source_page - d.page_offset > 0 then ';book:' || (r.source_page - d.page_offset) else '' end
      else 'sheet:' || r.source_sheet || '!' || r.source_cell_range end;

    if b.kind = 'study_programs' then
      insert into public.study_programs (school_id, curriculum_version_id, code, name_th, stage, source_document_id, source_locator, import_row_id)
      values (b.school_id, cv.id, n ->> 'code', btrim(n ->> 'name_th'), n ->> 'stage', d.id, v_loc, r.id) returning id into v_id;
    elsif b.kind = 'subjects' then
      insert into public.subjects (school_id, curriculum_version_id, code, name_th, name_en, learning_area_id, subject_type, grade_level_id,
        credits, learning_hours, description_th, source_document_id, source_locator, import_row_id, subject_category, education_stage)
      values (b.school_id, cv.id, btrim(n ->> 'code'), btrim(n ->> 'name_th'), nullif(btrim(n ->> 'name_en'), ''),
        (select id from public.learning_areas where school_id = b.school_id and code = n ->> 'learning_area_code'), n ->> 'subject_type',
        (select id from public.grade_levels where school_id = b.school_id and code = nullif(n ->> 'grade_code', '')),
        (n ->> 'credits')::numeric, (n ->> 'learning_hours')::int, nullif(n ->> 'description_th', ''), d.id, v_loc, r.id,
        coalesce(nullif(btrim(n ->> 'subject_category'), ''), 'regular'), nullif(btrim(n ->> 'education_stage'), ''))
      returning id into v_id;
    elsif b.kind = 'subject_offerings' then
      insert into public.subject_offerings (school_id, curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, offering_kind,
        hours_per_week, sort_order, source_document_id, source_locator, import_row_id)
      values (b.school_id, cv.id,
        private.curriculum_find_subject(cv.id, n ->> 'subject_code',
          (select stage from public.grade_levels where school_id = b.school_id and code = n ->> 'grade_code')),
        (select id from public.study_programs where curriculum_version_id = cv.id and code = nullif(n ->> 'program_code', '')),
        (select id from public.grade_levels where school_id = b.school_id and code = n ->> 'grade_code'),
        nullif(n ->> 'term_no', '')::smallint, coalesce(n ->> 'offering_kind', 'required'), private.try_numeric(n ->> 'hours_per_week'),
        coalesce(nullif(n ->> 'sort_order', '')::int, r.row_no), d.id, v_loc, r.id)
      returning id into v_id;
    elsif b.kind = 'learning_activities' then
      insert into public.learning_activities (school_id, curriculum_version_id, study_program_id, activity_type, name_th, grade_level_id, term_no,
        activity_hours, source_document_id, source_locator, import_row_id)
      values (b.school_id, cv.id,
        (select id from public.study_programs where curriculum_version_id = cv.id and code = nullif(n ->> 'program_code', '')),
        btrim(n ->> 'activity_type'), btrim(n ->> 'name_th'),
        (select id from public.grade_levels where school_id = b.school_id and code = n ->> 'grade_code'),
        nullif(n ->> 'term_no', '')::smallint, (n ->> 'activity_hours')::int, d.id, v_loc, r.id)
      returning id into v_id;
    elsif b.kind = 'learning_outcomes' then
      insert into public.subject_learning_outcomes (school_id, curriculum_version_id, subject_id, outcome_kind, code, statement_th, indicator_id,
        source_document_id, source_locator, import_row_id)
      values (b.school_id, cv.id, private.curriculum_find_subject(cv.id, n ->> 'subject_code', nullif(btrim(n ->> 'education_stage'), '')),
        n ->> 'outcome_kind', btrim(n ->> 'code'), btrim(n ->> 'statement_th'),
        (select id from public.indicators where framework_version_id = cv.framework_version_id and full_code = nullif(n ->> 'indicator_full_code', '')),
        d.id, v_loc, r.id)
      returning id into v_id;
    elsif b.kind = 'indicator_mappings' then
      insert into public.curriculum_indicator_mappings (school_id, curriculum_version_id, subject_id, indicator_id, coverage,
        source_document_id, source_locator, import_row_id)
      values (b.school_id, cv.id, private.curriculum_find_subject(cv.id, n ->> 'subject_code', nullif(btrim(n ->> 'education_stage'), '')),
        (select id from public.indicators where framework_version_id = cv.framework_version_id and full_code = n ->> 'indicator_full_code'),
        coalesce(n ->> 'coverage', 'primary'), d.id, v_loc, r.id)
      returning id into v_id;
    end if;
    update public.import_rows set status = 'committed',
           target_table = case b.kind when 'learning_outcomes' then 'subject_learning_outcomes'
                                      when 'indicator_mappings' then 'curriculum_indicator_mappings' else b.kind end,
           target_id = v_id
     where id = r.id;
    v_count := v_count + 1;
  end loop;
  update public.import_batches set status = 'committed', committed_by = auth.uid(), committed_at = now() where id = b.id;
  perform private.curriculum_batch_refresh(b.id);
  return v_count;
end;
$$;


-- ---------------------------------------------------------------- clone ฉบับ
create or replace function public.curriculum_version_clone(p_source_id uuid, p_version_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.curriculum_versions;
  v_new uuid := gen_random_uuid();
begin
  perform private.require_human();
  if not private.is_office_staff() then
    raise exception 'คุณไม่มีสิทธิ์สร้างหลักสูตรฉบับใหม่' using errcode = 'insufficient_privilege';
  end if;
  select * into v_src from public.curriculum_versions where id = p_source_id and school_id = private.current_school_id();
  if not found then
    raise exception 'ไม่พบหลักสูตรต้นฉบับ';
  end if;
  insert into public.curriculum_versions (id, school_id, school_curriculum_id, framework_version_id, framework_status, version_label,
    effective_year_be, hours_per_credit, subject_code_pattern, announcement_source_id, announcement_locator, based_on_version_id, created_by)
  values (v_new, v_src.school_id, v_src.school_curriculum_id, v_src.framework_version_id, v_src.framework_status, btrim(p_version_label),
    null, v_src.hours_per_credit, v_src.subject_code_pattern, null, null, v_src.id, auth.uid());

  drop table if exists _map;
  create temp table _map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _map select id, gen_random_uuid() from public.study_programs where curriculum_version_id = p_source_id;
  insert into _map select id, gen_random_uuid() from public.subjects where curriculum_version_id = p_source_id;
  insert into _map select id, gen_random_uuid() from public.subject_learning_outcomes where curriculum_version_id = p_source_id;

  insert into public.study_programs (id, school_id, curriculum_version_id, code, name_th, stage, is_active, source_document_id, source_locator, import_row_id)
  select m.new_id, p.school_id, v_new, p.code, p.name_th, p.stage, p.is_active, p.source_document_id, p.source_locator, p.import_row_id
  from public.study_programs p join _map m on m.old_id = p.id;
  insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, name_en, learning_area_id, subject_type, grade_level_id,
    credits, learning_hours, description_th, source_document_id, source_locator, import_row_id, subject_category, education_stage)
  select m.new_id, s.school_id, v_new, s.code, s.name_th, s.name_en, s.learning_area_id, s.subject_type, s.grade_level_id,
    s.credits, s.learning_hours, s.description_th, s.source_document_id, s.source_locator, s.import_row_id,
    s.subject_category, s.education_stage
  from public.subjects s join _map m on m.old_id = s.id;
  insert into public.subject_offerings (school_id, curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, offering_kind,
    hours_per_week, sort_order, source_document_id, source_locator, import_row_id)
  select o.school_id, v_new, ms.new_id, mp.new_id, o.grade_level_id, o.term_no, o.offering_kind, o.hours_per_week, o.sort_order,
    o.source_document_id, o.source_locator, o.import_row_id
  from public.subject_offerings o join _map ms on ms.old_id = o.subject_id left join _map mp on mp.old_id = o.study_program_id
  where o.curriculum_version_id = p_source_id;
  insert into public.learning_activities (school_id, curriculum_version_id, study_program_id, activity_type, name_th, grade_level_id, term_no,
    activity_hours, source_document_id, source_locator, import_row_id)
  select a.school_id, v_new, mp.new_id, a.activity_type, a.name_th, a.grade_level_id, a.term_no, a.activity_hours,
    a.source_document_id, a.source_locator, a.import_row_id
  from public.learning_activities a left join _map mp on mp.old_id = a.study_program_id where a.curriculum_version_id = p_source_id;
  insert into public.subject_learning_outcomes (id, school_id, curriculum_version_id, subject_id, outcome_kind, code, statement_th, indicator_id,
    source_document_id, source_locator, import_row_id)
  select mo.new_id, o.school_id, v_new, ms.new_id, o.outcome_kind, o.code, o.statement_th, o.indicator_id, o.source_document_id, o.source_locator, o.import_row_id
  from public.subject_learning_outcomes o join _map mo on mo.old_id = o.id join _map ms on ms.old_id = o.subject_id;
  -- mapping ที่คัดลอกต้องตรวจซ้ำในฉบับใหม่
  insert into public.curriculum_indicator_mappings (school_id, curriculum_version_id, subject_id, indicator_id, learning_outcome_id, coverage,
    source_document_id, source_locator, import_row_id)
  select c.school_id, v_new, ms.new_id, c.indicator_id, mo.new_id, c.coverage, c.source_document_id, c.source_locator, c.import_row_id
  from public.curriculum_indicator_mappings c join _map ms on ms.old_id = c.subject_id left join _map mo on mo.old_id = c.learning_outcome_id
  where c.curriculum_version_id = p_source_id and c.status <> 'rejected';
  return v_new;
end;
$$;

