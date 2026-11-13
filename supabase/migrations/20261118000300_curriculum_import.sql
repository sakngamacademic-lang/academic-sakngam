-- =============================================================================
-- C1.2 — Curriculum Import Engine (staging → review → approve → commit)
-- docs/architecture/CURRICULUM-IMPORT-PLAN.md
-- - parser (Edge Function, service_role) เขียนได้เฉพาะ import_rows ผ่าน curriculum_import_store_rows
-- - คนตรวจรายแถว (decide) → หัวหน้าฝ่ายวิชาการอนุมัติ (≠ ผู้สร้าง batch) → commit ในธุรกรรมเดียว
-- - ไม่เติมค่าแทนต้นฉบับ · ไม่ใช้ชั่วโมงต่อหน่วยกิตเขียนทับค่า (V22 = info)
-- =============================================================================

create or replace function private.try_numeric(p text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when btrim(coalesce(p, '')) ~ '^[0-9]+(\.[0-9]+)?$' then btrim(p)::numeric end
$$;

create or replace function private.issue(p_code text, p_field text, p_severity text, p_message text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('code', p_code, 'field', p_field, 'severity', p_severity, 'message_th', p_message)
$$;

-- ---------------------------------------------------------------- validation (V-rules)
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
begin
  select * into b from public.import_batches where id = p_batch_id;
  select * into cv from public.curriculum_versions where id = b.curriculum_version_id;

  -- ข้อผิดพลาดจาก parser (เช่น ข้อความเสีย / ชีตระบุฉบับไม่ตรง V62)
  if p_row.raw ? 'parser_issues' then
    out := out || coalesce(p_row.raw -> 'parser_issues', '[]'::jsonb);
  end if;
  if n = '{}'::jsonb then
    return out || private.issue('NORMALIZED_EMPTY', null, 'error', 'ยังไม่มีค่าที่ตรวจแล้ว — กรอกค่าจากต้นฉบับ (ห้ามเดา)');
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
    if exists (select 1 from public.import_rows r where r.batch_id = p_batch_id and r.id <> coalesce(p_row_id, gen_random_uuid())
               and r.status <> 'skipped' and btrim(r.normalized ->> 'code') = v_text) then
      out := out || private.issue('V10', 'code', 'error', 'รหัสวิชาซ้ำในชุดนำเข้าเดียวกัน');
    end if;
    if exists (select 1 from public.subjects s where s.curriculum_version_id = cv.id and s.code = v_text) then
      out := out || private.issue('V11', 'code', 'error', 'มีรหัสวิชานี้ในหลักสูตรฉบับนี้แล้ว');
    end if;
    if cv.subject_code_pattern is not null and v_text !~ cv.subject_code_pattern then
      out := out || private.issue('V12', 'code', 'warning', 'รูปแบบรหัสวิชาไม่ตรงกับแนวปฏิบัติที่กำหนดในฉบับนี้');
    end if;
    if btrim(coalesce(n ->> 'name_th', '')) = '' then out := out || private.issue('V10', 'name_th', 'error', 'ไม่มีชื่อวิชา'); end if;
    select * into v_area from public.learning_areas la where la.school_id = b.school_id and la.code = n ->> 'learning_area_code';
    if not found then
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
      select * into v_subj from public.subjects s where s.curriculum_version_id = cv.id and s.code = n ->> 'subject_code';
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
    select * into v_subj from public.subjects s where s.curriculum_version_id = cv.id and s.code = n ->> 'subject_code';
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
    select * into v_subj from public.subjects s where s.curriculum_version_id = cv.id and s.code = n ->> 'subject_code';
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

create or replace function private.curriculum_row_status(p_issues jsonb, p_proposed_by text, p_source_page int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when exists (select 1 from jsonb_array_elements(p_issues) e where e ->> 'severity' = 'error') then 'error'
    -- แถวจาก PDF และจาก AI ต้องผ่านคนตรวจเสมอ (D5, V61)
    when p_proposed_by = 'ai' or p_source_page is not null then 'needs_review'
    when exists (select 1 from jsonb_array_elements(p_issues) e where e ->> 'severity' = 'warning') then 'warning'
    else 'valid'
  end
$$;

create or replace function private.curriculum_batch_refresh(p_batch_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.import_batches b set counts = (
    select jsonb_build_object(
      'total', count(*), 'valid', count(*) filter (where r.status = 'valid'), 'warning', count(*) filter (where r.status = 'warning'),
      'error', count(*) filter (where r.status = 'error'), 'needs_review', count(*) filter (where r.status = 'needs_review'),
      'approved', count(*) filter (where r.status = 'approved'), 'skipped', count(*) filter (where r.status = 'skipped'),
      'committed', count(*) filter (where r.status = 'committed'))
    from public.import_rows r where r.batch_id = p_batch_id)
  where b.id = p_batch_id
$$;

create or replace function private.curriculum_can_work_batch(p_batch public.import_batches)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_batch.school_id = private.current_school_id()
     and coalesce(private.is_office_staff()
       or (private.has_role('learning_area_head') and p_batch.learning_area_id in (select private.my_learning_area_ids())), false)
$$;

-- ---------------------------------------------------------------- parse (Edge Function)
create or replace function public.curriculum_import_parse_target(p_batch_id uuid)
returns table (batch_id uuid, kind text, file_ext text, object_key text, column_mapping jsonb, doc_type text, page_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare b public.import_batches;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id;
  if not found or not private.curriculum_can_work_batch(b) then
    raise exception 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if b.status not in ('uploaded', 'failed') then
    raise exception 'ชุดนำเข้านี้อ่านไฟล์ไปแล้ว';
  end if;
  return query
  select b.id, b.kind, f.file_ext, f.object_key, b.column_mapping, d.doc_type, d.page_count
  from public.source_documents d join public.files f on f.id = d.file_id
  where d.id = b.source_document_id and f.status = 'ready';
  if not found then
    raise exception 'เอกสารต้นทางยังไม่มีไฟล์ที่ตรวจแล้ว';
  end if;
end;
$$;

-- เขียนแถว staging จาก parser — service_role เท่านั้น (AI / parser ไม่มีทางอนุมัติ)
create or replace function public.curriculum_import_store_rows(p_batch_id uuid, p_actor uuid, p_parser text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.import_batches;
  r jsonb;
  v_row public.import_rows;
  v_n int := 0;
begin
  select * into b from public.import_batches where id = p_batch_id for update;
  if not found or b.status not in ('uploaded', 'failed') or b.created_by <> p_actor then
    raise exception 'ชุดนำเข้าไม่อยู่ในสถานะที่รับข้อมูลจาก parser';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    insert into public.import_rows (school_id, batch_id, row_no, source_sheet, source_cell_range, source_page, raw, normalized, proposed_by)
    values (b.school_id, b.id, (r ->> 'row_no')::int, r ->> 'source_sheet', r ->> 'source_cell_range', (r ->> 'source_page')::int,
            coalesce(r -> 'raw', '{}'::jsonb), coalesce(r -> 'normalized', '{}'::jsonb),
            case when r ->> 'proposed_by' = 'ai' then 'ai' else 'parser' end)
    returning * into v_row;
    update public.import_rows set issues = private.curriculum_validate(b.id, v_row.id, v_row.normalized, v_row)
     where id = v_row.id returning * into v_row;
    update public.import_rows set status = private.curriculum_row_status(v_row.issues, v_row.proposed_by, v_row.source_page) where id = v_row.id;
    v_n := v_n + 1;
  end loop;
  update public.import_batches set status = case when v_n = 0 then 'failed' else 'needs_review' end, parser = left(p_parser, 100),
         status_note = case when v_n = 0 then 'ไม่พบแถวข้อมูลในไฟล์' end
   where id = b.id;
  perform private.curriculum_batch_refresh(b.id);
  return v_n;
end;
$$;

-- กรอกแถวเอง (เช่น อ่านจาก PDF ด้วยตา) — ต้องอ้างหน้า/เซลล์เสมอ
create or replace function public.curriculum_import_add_row(p_batch_id uuid, p_source_page int, p_source_sheet text, p_source_cell_range text,
  p_normalized jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.import_batches;
  v_row public.import_rows;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id for update;
  if not found or not private.curriculum_can_work_batch(b) then
    raise exception 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if b.status not in ('uploaded', 'failed', 'needs_review') then
    raise exception 'ชุดนำเข้านี้ไม่รับข้อมูลเพิ่มแล้ว';
  end if;
  insert into public.import_rows (school_id, batch_id, row_no, source_sheet, source_cell_range, source_page, raw, normalized, proposed_by)
  values (b.school_id, b.id, coalesce((select max(row_no) from public.import_rows where batch_id = b.id), 0) + 1,
          p_source_sheet, p_source_cell_range, p_source_page, jsonb_build_object('manual_entry', true, 'note', p_note),
          coalesce(p_normalized, '{}'::jsonb), 'manual')
  returning * into v_row;
  update public.import_rows set issues = private.curriculum_validate(b.id, v_row.id, v_row.normalized, v_row) where id = v_row.id returning * into v_row;
  update public.import_rows set status = private.curriculum_row_status(v_row.issues, v_row.proposed_by, v_row.source_page) where id = v_row.id;
  update public.import_batches set status = 'needs_review', parser = coalesce(parser, 'manual') where id = b.id;
  perform private.curriculum_batch_refresh(b.id);
  return v_row.id;
end;
$$;

-- ---------------------------------------------------------------- review
create or replace function public.curriculum_import_row_decide(p_row_id uuid, p_decision text, p_normalized jsonb default null, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.import_rows;
  b public.import_batches;
  v_status text;
begin
  perform private.require_human();
  select * into v_row from public.import_rows where id = p_row_id for update;
  select * into b from public.import_batches where id = v_row.batch_id;
  if v_row.id is null or not private.curriculum_can_work_batch(b) then
    raise exception 'ไม่พบแถว หรือคุณไม่มีสิทธิ์ตรวจ' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'needs_review' then
    raise exception 'ชุดนำเข้านี้ไม่อยู่ในขั้นตรวจ';
  end if;
  if p_decision not in ('approve', 'skip', 'revalidate') then
    raise exception 'คำสั่งไม่ถูกต้อง';
  end if;
  if p_normalized is not null then
    v_row.normalized := p_normalized;
  end if;
  v_row.issues := private.curriculum_validate(b.id, v_row.id, v_row.normalized, v_row);
  v_status := private.curriculum_row_status(v_row.issues, v_row.proposed_by, v_row.source_page);
  if p_decision = 'approve' then
    if v_status = 'error' then
      raise exception 'แถวนี้ยังมีข้อผิดพลาด อนุมัติไม่ได้';
    end if;
    v_status := 'approved';
  elsif p_decision = 'skip' then
    v_status := 'skipped';
  end if;
  update public.import_rows set normalized = v_row.normalized, issues = v_row.issues, status = v_status,
         decision_by = case when p_decision = 'revalidate' then decision_by else auth.uid() end,
         decision_at = case when p_decision = 'revalidate' then decision_at else now() end,
         decision_note = coalesce(p_note, decision_note)
   where id = p_row_id;
  perform private.curriculum_batch_refresh(b.id);
  return v_status;
end;
$$;

-- อนุมัติชุด: หัวหน้าฝ่ายวิชาการ (มนุษย์) และไม่ใช่ผู้สร้างชุด (D3) · ไม่มีแถวค้าง · ไม่มีข้อขัดแย้ง blocking (V65)
create or replace function public.curriculum_import_batch_approve(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare b public.import_batches;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id and school_id = private.current_school_id() for update;
  if not found or not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการอนุมัติชุดนำเข้าได้' using errcode = 'insufficient_privilege';
  end if;
  if b.created_by = auth.uid() then
    raise exception 'ผู้สร้างชุดนำเข้าอนุมัติชุดของตนเองไม่ได้ (ต้องเป็นอีกคนหนึ่ง)' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'needs_review' then
    raise exception 'ชุดนำเข้านี้ไม่อยู่ในขั้นตรวจ';
  end if;
  if exists (select 1 from public.import_rows r where r.batch_id = b.id and r.status not in ('approved', 'skipped')) then
    raise exception 'ยังมีแถวที่ไม่ได้ตรวจ (ต้องอนุมัติหรือข้ามทุกแถว)';
  end if;
  if not exists (select 1 from public.import_rows r where r.batch_id = b.id and r.status = 'approved') then
    raise exception 'ไม่มีแถวที่อนุมัติ';
  end if;
  if exists (select 1 from public.source_conflicts c where c.school_id = b.school_id and c.status = 'open' and c.impact = 'blocking'
             and b.source_document_id in (c.doc_a_id, c.doc_b_id)) then
    raise exception 'เอกสารต้นทางมีข้อขัดแย้งระดับ blocking ที่ยังไม่ได้ตัดสิน';
  end if;
  update public.import_batches set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = b.id;
end;
$$;

create or replace function public.curriculum_import_batch_reject(p_batch_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare b public.import_batches;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id for update;
  if not found or not private.curriculum_can_work_batch(b) then
    raise exception 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if b.status in ('committed', 'rejected') then
    raise exception 'ชุดนำเข้านี้ปิดไปแล้ว';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'กรุณาระบุเหตุผล';
  end if;
  update public.import_batches set status = 'rejected', status_note = btrim(p_reason) where id = b.id;
end;
$$;

-- ---------------------------------------------------------------- commit (ธุรกรรมเดียว + provenance)
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
        credits, learning_hours, description_th, source_document_id, source_locator, import_row_id)
      values (b.school_id, cv.id, btrim(n ->> 'code'), btrim(n ->> 'name_th'), nullif(btrim(n ->> 'name_en'), ''),
        (select id from public.learning_areas where school_id = b.school_id and code = n ->> 'learning_area_code'), n ->> 'subject_type',
        (select id from public.grade_levels where school_id = b.school_id and code = nullif(n ->> 'grade_code', '')),
        (n ->> 'credits')::numeric, (n ->> 'learning_hours')::int, nullif(n ->> 'description_th', ''), d.id, v_loc, r.id)
      returning id into v_id;
    elsif b.kind = 'subject_offerings' then
      insert into public.subject_offerings (school_id, curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, offering_kind,
        hours_per_week, sort_order, source_document_id, source_locator, import_row_id)
      values (b.school_id, cv.id,
        (select id from public.subjects where curriculum_version_id = cv.id and code = n ->> 'subject_code'),
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
      values (b.school_id, cv.id, (select id from public.subjects where curriculum_version_id = cv.id and code = n ->> 'subject_code'),
        n ->> 'outcome_kind', btrim(n ->> 'code'), btrim(n ->> 'statement_th'),
        (select id from public.indicators where framework_version_id = cv.framework_version_id and full_code = nullif(n ->> 'indicator_full_code', '')),
        d.id, v_loc, r.id)
      returning id into v_id;
    elsif b.kind = 'indicator_mappings' then
      insert into public.curriculum_indicator_mappings (school_id, curriculum_version_id, subject_id, indicator_id, coverage,
        source_document_id, source_locator, import_row_id)
      values (b.school_id, cv.id, (select id from public.subjects where curriculum_version_id = cv.id and code = n ->> 'subject_code'),
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

-- ---------------------------------------------------------------- grants
revoke all on function private.try_numeric(text), private.issue(text, text, text, text),
  private.curriculum_validate(uuid, uuid, jsonb, public.import_rows), private.curriculum_row_status(jsonb, text, int),
  private.curriculum_batch_refresh(uuid), private.curriculum_can_work_batch(public.import_batches) from public, anon, authenticated;
revoke all on function
  public.curriculum_import_parse_target(uuid), public.curriculum_import_store_rows(uuid, uuid, text, jsonb),
  public.curriculum_import_add_row(uuid, int, text, text, jsonb, text), public.curriculum_import_row_decide(uuid, text, jsonb, text),
  public.curriculum_import_batch_approve(uuid), public.curriculum_import_batch_reject(uuid, text), public.curriculum_import_batch_commit(uuid)
from public, anon, authenticated, service_role;
-- parser เท่านั้นที่เขียนแถวจากไฟล์
grant execute on function public.curriculum_import_store_rows(uuid, uuid, text, jsonb) to service_role;
-- คนเท่านั้นที่ตรวจ / อนุมัติ / บันทึก
grant execute on function
  public.curriculum_import_parse_target(uuid), public.curriculum_import_add_row(uuid, int, text, text, jsonb, text),
  public.curriculum_import_row_decide(uuid, text, jsonb, text), public.curriculum_import_batch_approve(uuid),
  public.curriculum_import_batch_reject(uuid, text), public.curriculum_import_batch_commit(uuid)
to authenticated;
