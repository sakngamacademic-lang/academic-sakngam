-- =============================================================================
-- C1.2 (ต่อ) — แถวรายหน้าจาก PDF
-- - แถวที่ยังไม่มีค่า (รอถอดจากข้อความหน้า PDF) = needs_review แทน error
-- - อนุมัติแถวที่ยังไม่มีค่าไม่ได้
-- =============================================================================

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
    if v_row.normalized = '{}'::jsonb then
      raise exception 'ยังไม่ได้กรอกค่าจากต้นฉบับ อนุมัติไม่ได้';
    end if;
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
