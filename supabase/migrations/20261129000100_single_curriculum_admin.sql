-- C2.3: บัญชีผู้ดูแลหลักสูตร (academic_head) บัญชีเดียวจัดการทะเบียนหลักสูตรครบวงจร
--  · private.is_curriculum_admin() = academic_head (บัญชีเดียว) — แทน is_office_staff() เฉพาะใน RLS/RPC ของหลักสูตร (ไม่แตะงานเอกสาร/ภาระงาน)
--  · เจ้าหน้าที่ฝ่ายวิชาการ (academic_staff) และผู้ใช้อื่นแก้ไขหลักสูตรไม่ได้ · หัวหน้ากลุ่มสาระ (learning_area_head) แก้ได้เฉพาะรายวิชาในกลุ่มสาระที่ได้รับมอบหมาย (กลไกมอบหมายเดิม)
--  · ยกเลิก Two-person เฉพาะ curriculum_import_batch_approve (ผู้สร้างชุดอนุมัติเองได้) — Audit/หลักฐาน PDF คงเดิมทุกจุด
--  · การจัดการทะเบียน (ร่าง) แยกจากการประกาศใช้อย่างเป็นทางการ: ส่งตรวจ/อนุมัติ/ใช้งาน/เลิกใช้ของ "ฉบับ" ยังเป็นขั้นตอนแยก ต้องมีเอกสารประกาศใช้+เลขหน้า
--  · forward-only: เปลี่ยนเฉพาะเงื่อนไขสิทธิ์ ไม่แตะข้อมูล

-- ยกเลิก Two-person ระดับฐานข้อมูลของชุดนำเข้า (เดิม: approved_by <> created_by) — ยังบังคับว่าสถานะ approved/committed ต้องมี approved_by (import_batches_check1)
alter table public.import_batches drop constraint import_batches_check;

create or replace function private.is_curriculum_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.has_role('academic_head'), false) $$;
grant execute on function private.is_curriculum_admin() to authenticated;

CREATE OR REPLACE FUNCTION private.can_edit_curriculum_area(p_learning_area_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(private.is_curriculum_admin()
    or (private.has_role('learning_area_head') and p_learning_area_id in (select private.my_learning_area_ids())), false)
$function$;

CREATE OR REPLACE FUNCTION private.curriculum_can_work_batch(p_batch import_batches)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_batch.school_id = private.current_school_id()
     and coalesce(private.is_curriculum_admin()
       or (private.has_role('learning_area_head') and p_batch.learning_area_id in (select private.my_learning_area_ids())), false)
$function$;

CREATE OR REPLACE FUNCTION public.curriculum_import_batch_approve(p_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.import_batches;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id and school_id = private.current_school_id() for update;
  if not found or not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการอนุมัติชุดนำเข้าได้' using errcode = 'insufficient_privilege';
  end if;
  -- Two-person ถูกยกเลิกสำหรับการจัดการทะเบียน: ผู้สร้างชุดที่เป็นผู้ดูแลหลักสูตรอนุมัติเองได้ (บันทึก approved_by/approved_at)
  if b.status <> 'needs_review' then raise exception 'ชุดนำเข้านี้ไม่อยู่ในขั้นตรวจ'; end if;
  if exists (select 1 from public.import_rows r where r.batch_id = b.id
             and private.curriculum_row_class(r.status, r.issues, r.school_id, r.normalized) in ('pass', 'warning')) then
    raise exception 'ยังมีแถวผ่าน/เตือนที่ยังไม่ได้ตัดสิน (อนุมัติหรือข้าม) — แถวผิดพลาดและข้อขัดแย้งไม่ต้องตัดสินและจะไม่ถูกบันทึก';
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
$function$;

CREATE OR REPLACE FUNCTION public.curriculum_import_batch_commit(p_batch_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.curriculum_proposals_decide(p_ids uuid[], p_accept boolean, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pr public.curriculum_match_proposals;
  v_n int := 0;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then raise exception 'คุณไม่มีสิทธิ์ตัดสินข้อเสนอ' using errcode = 'insufficient_privilege'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'ระบุข้อเสนอได้ครั้งละ 1–500 รายการ'; end if;
  if not p_accept and length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'การปฏิเสธต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร'; end if;
  for pr in select * from public.curriculum_match_proposals where id = any (p_ids) and school_id = private.current_school_id() and status = 'pending' for update loop
    if not exists (select 1 from public.curriculum_versions v where v.id = pr.curriculum_version_id and v.status = 'draft') then
      raise exception 'ตัดสินได้เฉพาะฉบับที่เป็นแบบร่าง';
    end if;
    if p_accept then
      update public.subjects set subject_category = pr.proposed ->> 'subject_category',
             change_note = left(coalesce(nullif(btrim(p_note), ''), 'รับข้อเสนอหมวดรายวิชา (' || pr.rule || ', ความมั่นใจ ' || pr.confidence || ')'), 500)
       where id = pr.subject_id;
    end if;
    update public.curriculum_match_proposals set status = case when p_accept then 'accepted' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), note = left(btrim(p_note), 500)
     where id = pr.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.curriculum_registry_build(p_version_id uuid, p_include_warnings boolean DEFAULT false, p_source_version_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cv public.curriculum_versions;
  r public.import_rows;
  b public.import_batches;
  d public.source_documents;
  k text;
  n jsonb;
  v_issues jsonb;
  v_cls text;
  v_loc text;
  v_allowed text[] := case when p_include_warnings then array['pass', 'warning'] else array['pass'] end;
  v_res jsonb := '{}'::jsonb;
  v_ok int;
  v_skip int;
begin
  perform private.require_human();
  select * into cv from public.curriculum_versions where id = p_version_id and school_id = private.current_school_id() for update;
  if not found or not private.is_curriculum_admin() then
    raise exception 'ไม่พบฉบับหลักสูตร หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if cv.status <> 'draft' then
    raise exception 'สร้างทะเบียนได้เฉพาะฉบับที่เป็นแบบร่าง (draft)';
  end if;
  if p_source_version_id is not null and not exists (select 1 from public.curriculum_versions sv where sv.id = p_source_version_id
       and sv.school_id = cv.school_id and sv.school_curriculum_id = cv.school_curriculum_id) then
    raise exception 'ฉบับที่เป็นแหล่งหลักฐานต้องอยู่ในหลักสูตรเดียวกัน';
  end if;
  foreach k in array array['study_programs', 'subjects', 'subject_offerings', 'learning_activities'] loop
    v_ok := 0; v_skip := 0;
    for r in select ir.* from public.import_rows ir join public.import_batches ib on ib.id = ir.batch_id
              where ib.curriculum_version_id = coalesce(p_source_version_id, cv.id) and ib.kind = k and ir.status in ('needs_review', 'valid', 'warning', 'error', 'approved')
              order by ib.created_at desc, ir.row_no loop
      select * into b from public.import_batches where id = r.batch_id;
      select * into d from public.source_documents where id = b.source_document_id;
      n := r.normalized;
      -- ตรวจซ้ำกับทะเบียนปัจจุบัน (dependency ที่เพิ่งสร้างในรอบนี้นับด้วย) — ไม่เขียนผลกลับลง import_rows
      v_issues := private.curriculum_validate(b.id, r.id, n, r);
      -- ดึงหลักฐานจากฉบับอื่น: dependency และรหัสซ้ำ (V11/V32/V33/V45) ตรวจกับทะเบียนของฉบับปลายทางด้านล่าง/ด้วย unique index แทน
      if coalesce(p_source_version_id, cv.id) <> cv.id then
        v_issues := coalesce((select jsonb_agg(e) from jsonb_array_elements(v_issues) e where e ->> 'code' not in ('V11', 'V32', 'V33', 'V45')), '[]'::jsonb);
      end if;
      v_cls := private.curriculum_row_class('needs_review', v_issues, r.school_id, n);
      -- แถวที่มนุษย์อนุมัติแล้วรวมเข้าทะเบียนแม้มีคำเตือน (error/conflict ยังถูกข้าม)
      if not (v_cls = any (v_allowed) or (r.status = 'approved' and v_cls = 'warning')) then v_skip := v_skip + 1; continue; end if;
      if exists (select 1 from public.study_programs x where x.import_row_id = r.id and x.curriculum_version_id = cv.id) or exists (select 1 from public.subjects x where x.import_row_id = r.id and x.curriculum_version_id = cv.id)
         or exists (select 1 from public.subject_offerings x where x.import_row_id = r.id and x.curriculum_version_id = cv.id) or exists (select 1 from public.learning_activities x where x.import_row_id = r.id and x.curriculum_version_id = cv.id) then
        v_skip := v_skip + 1; continue;
      end if;
      v_loc := case when r.source_page is not null then 'pdf:' || r.source_page
        || case when d.page_offset is not null and r.source_page - d.page_offset > 0 then ';book:' || (r.source_page - d.page_offset) else '' end
        else 'sheet:' || r.source_sheet || '!' || r.source_cell_range end;
      if k = 'subject_offerings' and (private.curriculum_find_subject(cv.id, n ->> 'subject_code', (select stage from public.grade_levels where school_id = cv.school_id and code = n ->> 'grade_code')) is null
         or not exists (select 1 from public.study_programs sp where sp.curriculum_version_id = cv.id and sp.code = nullif(n ->> 'program_code', ''))) then v_skip := v_skip + 1; continue; end if;
      if k = 'learning_activities' and nullif(n ->> 'program_code', '') is not null and not exists (select 1 from public.study_programs sp where sp.curriculum_version_id = cv.id and sp.code = n ->> 'program_code') then v_skip := v_skip + 1; continue; end if;
      begin
      if k = 'study_programs' then
        insert into public.study_programs (school_id, curriculum_version_id, code, name_th, stage, source_document_id, source_locator, import_row_id, created_by)
        values (cv.school_id, cv.id, n ->> 'code', btrim(n ->> 'name_th'), n ->> 'stage', d.id, v_loc, r.id, auth.uid());
      elsif k = 'subjects' then
        insert into public.subjects (school_id, curriculum_version_id, code, name_th, name_en, learning_area_id, subject_type, grade_level_id,
          credits, learning_hours, description_th, source_document_id, source_locator, import_row_id, subject_category, education_stage, created_by)
        values (cv.school_id, cv.id, btrim(n ->> 'code'), btrim(n ->> 'name_th'), nullif(btrim(n ->> 'name_en'), ''),
          (select id from public.learning_areas where school_id = cv.school_id and code = n ->> 'learning_area_code'), n ->> 'subject_type',
          (select id from public.grade_levels where school_id = cv.school_id and code = nullif(n ->> 'grade_code', '')),
          (n ->> 'credits')::numeric, (n ->> 'learning_hours')::int, nullif(n ->> 'description_th', ''), d.id, v_loc, r.id,
          coalesce(nullif(btrim(n ->> 'subject_category'), ''), 'regular'), nullif(btrim(n ->> 'education_stage'), ''), auth.uid());
      elsif k = 'subject_offerings' then
        insert into public.subject_offerings (school_id, curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, offering_kind,
          hours_per_week, sort_order, source_document_id, source_locator, import_row_id, created_by)
        values (cv.school_id, cv.id,
          private.curriculum_find_subject(cv.id, n ->> 'subject_code', (select stage from public.grade_levels where school_id = cv.school_id and code = n ->> 'grade_code')),
          (select id from public.study_programs where curriculum_version_id = cv.id and code = nullif(n ->> 'program_code', '')),
          (select id from public.grade_levels where school_id = cv.school_id and code = n ->> 'grade_code'),
          nullif(n ->> 'term_no', '')::smallint, coalesce(n ->> 'offering_kind', 'required'), private.try_numeric(n ->> 'hours_per_week'),
          coalesce(nullif(n ->> 'sort_order', '')::int, r.row_no), d.id, v_loc, r.id, auth.uid());
      else
        insert into public.learning_activities (school_id, curriculum_version_id, study_program_id, activity_type, name_th, grade_level_id, term_no,
          activity_hours, source_document_id, source_locator, import_row_id, created_by)
        values (cv.school_id, cv.id, (select id from public.study_programs where curriculum_version_id = cv.id and code = nullif(n ->> 'program_code', '')),
          btrim(n ->> 'activity_type'), btrim(n ->> 'name_th'), (select id from public.grade_levels where school_id = cv.school_id and code = n ->> 'grade_code'),
          nullif(n ->> 'term_no', '')::smallint, (n ->> 'activity_hours')::int, d.id, v_loc, r.id, auth.uid());
      end if;
      exception when unique_violation or check_violation or not_null_violation or foreign_key_violation then
        v_skip := v_skip + 1; continue;
      end;
      v_ok := v_ok + 1;
    end loop;
    v_res := v_res || jsonb_build_object(k, jsonb_build_object('created', v_ok, 'skipped', v_skip));
  end loop;
  return v_res;
end;
$function$;

CREATE OR REPLACE FUNCTION public.curriculum_registry_propose(p_version_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cv public.curriculum_versions;
  s record;
  v_n int := 0;
  v_text boolean;
begin
  perform private.require_human();
  select * into cv from public.curriculum_versions where id = p_version_id and school_id = private.current_school_id();
  if not found or not private.is_curriculum_admin() then
    raise exception 'ไม่พบฉบับหลักสูตร หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  for s in
    select su.id, su.code,
           count(o.id) filter (where p.name_th like '%ทวิศึกษา%') dve,
           count(o.id) filter (where p.name_th not like '%ทวิศึกษา%' or p.id is null) other,
           array_agg(distinct p.code) filter (where p.name_th like '%ทวิศึกษา%') progs,
           array_agg(distinct o.source_locator) filter (where p.name_th like '%ทวิศึกษา%') locs
    from public.subjects su
    join public.subject_offerings o on o.subject_id = su.id and o.is_active
    left join public.study_programs p on p.id = o.study_program_id
    where su.curriculum_version_id = cv.id and su.is_active and su.subject_category = 'regular'
    group by su.id, su.code
  loop
    if s.dve > 0 and s.other = 0 then
      v_text := exists (select 1 from public.import_rows ir join public.import_batches ib on ib.id = ir.batch_id
                        where ib.curriculum_version_id = cv.id and ir.raw::text like '%ทวิศึกษา%'
                          and coalesce(ir.normalized ->> 'code', ir.normalized ->> 'subject_code') = s.code);
      insert into public.curriculum_match_proposals (school_id, curriculum_version_id, subject_id, kind, proposed, confidence, rule, evidence)
      values (cv.school_id, cv.id, s.id, 'category', jsonb_build_object('subject_category', 'dual_study'), case when v_text then 0.90 else 0.70 end,
              'offered_only_in_dual_study_programs',
              jsonb_build_object('programs', to_jsonb(s.progs), 'source_locators', to_jsonb(s.locs), 'source_text_mentions_dual_study', v_text))
      on conflict (subject_id, kind, rule) do nothing;
      if found then v_n := v_n + 1; end if;
    end if;
  end loop;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.curriculum_rule_verify(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.curriculum_rules;
begin
  perform private.require_human();
  if not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการยืนยันเกณฑ์ได้' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.curriculum_rules where id = p_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบเกณฑ์'; end if;
  if p_status = 'verified' then
    if v.status <> 'draft' then raise exception 'ยืนยันได้เฉพาะเกณฑ์ร่าง'; end if;
    if v.source_document_id is null or v.source_locator is null then raise exception 'เกณฑ์ต้องอ้างเอกสารและหน้าก่อนยืนยัน'; end if;
    update public.curriculum_rules set status = 'verified', verified_by = auth.uid(), verified_at = now(), updated_at = now() where id = p_id;
  elsif p_status = 'retired' then
    update public.curriculum_rules set status = 'retired', updated_at = now() where id = p_id;
  else
    raise exception 'สถานะไม่ถูกต้อง';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.curriculum_subject_set_active(p_subject_id uuid, p_active boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.subjects;
begin
  perform private.require_human();
  select * into s from public.subjects where id = p_subject_id and school_id = private.current_school_id() for update;
  if not found or not private.is_curriculum_admin() then raise exception 'ไม่พบรายวิชา หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.curriculum_versions v where v.id = s.curriculum_version_id and v.status = 'draft') then
    raise exception 'แก้ได้เฉพาะฉบับที่เป็นแบบร่าง (ฉบับที่อนุมัติแล้วให้คัดลอกเป็นฉบับใหม่)';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร'; end if;
  update public.subjects set is_active = p_active, change_note = left(btrim(p_reason), 500) where id = s.id;
  update public.subject_offerings set is_active = p_active, change_note = left(btrim(p_reason), 500) where subject_id = s.id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.curriculum_transition(p_id uuid, p_from text[], p_to text, p_head_only boolean)
 RETURNS curriculum_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.curriculum_versions;
begin
  perform private.require_human();
  select * into v from public.curriculum_versions where id = p_id and school_id = private.current_school_id() for update;
  if not found then
    raise exception 'ไม่พบหลักสูตรฉบับนี้';
  end if;
  if p_head_only and not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการเท่านั้น' using errcode = 'insufficient_privilege';
  end if;
  if not p_head_only and not private.is_curriculum_admin() then
    raise exception 'คุณไม่มีสิทธิ์ดำเนินการกับหลักสูตร' using errcode = 'insufficient_privilege';
  end if;
  if not (v.status = any (p_from)) then
    raise exception 'เปลี่ยนสถานะจาก % เป็น % ไม่ได้', v.status, p_to;
  end if;
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.curriculum_version_clone(p_source_id uuid, p_version_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_src public.curriculum_versions;
  v_new uuid := gen_random_uuid();
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'คุณไม่มีสิทธิ์สร้างหลักสูตรฉบับใหม่' using errcode = 'insufficient_privilege';
  end if;
  select * into v_src from public.curriculum_versions where id = p_source_id and school_id = private.current_school_id();
  if not found then raise exception 'ไม่พบหลักสูตรต้นฉบับ'; end if;
  insert into public.curriculum_versions (id, school_id, school_curriculum_id, framework_version_id, framework_status, version_label,
    effective_year_be, hours_per_credit, subject_code_pattern, announcement_source_id, announcement_locator, based_on_version_id, created_by)
  values (v_new, v_src.school_id, v_src.school_curriculum_id, v_src.framework_version_id, v_src.framework_status, btrim(p_version_label),
    null, v_src.hours_per_credit, v_src.subject_code_pattern, null, null, v_src.id, auth.uid());

  drop table if exists _map;
  create temp table _map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _map select id, gen_random_uuid() from public.study_programs where curriculum_version_id = p_source_id;
  insert into _map select id, gen_random_uuid() from public.subjects where curriculum_version_id = p_source_id and is_active;
  insert into _map select id, gen_random_uuid() from public.subject_learning_outcomes where curriculum_version_id = p_source_id
    and subject_id in (select id from public.subjects where curriculum_version_id = p_source_id and is_active);

  insert into public.study_programs (id, school_id, curriculum_version_id, code, name_th, stage, is_active, source_document_id, source_locator, import_row_id)
  select m.new_id, p.school_id, v_new, p.code, p.name_th, p.stage, p.is_active, p.source_document_id, p.source_locator, p.import_row_id
  from public.study_programs p join _map m on m.old_id = p.id;
  insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, name_en, learning_area_id, subject_type, grade_level_id,
    credits, learning_hours, description_th, source_document_id, source_locator, import_row_id, subject_category, education_stage, carried_from_id)
  select m.new_id, s.school_id, v_new, s.code, s.name_th, s.name_en, s.learning_area_id, s.subject_type, s.grade_level_id,
    s.credits, s.learning_hours, s.description_th, s.source_document_id, s.source_locator, s.import_row_id, s.subject_category, s.education_stage, s.id
  from public.subjects s join _map m on m.old_id = s.id;
  insert into public.subject_offerings (school_id, curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, offering_kind,
    hours_per_week, sort_order, source_document_id, source_locator, import_row_id, carried_from_id)
  select o.school_id, v_new, ms.new_id, mp.new_id, o.grade_level_id, o.term_no, o.offering_kind, o.hours_per_week, o.sort_order,
    o.source_document_id, o.source_locator, o.import_row_id, o.id
  from public.subject_offerings o join _map ms on ms.old_id = o.subject_id left join _map mp on mp.old_id = o.study_program_id
  where o.curriculum_version_id = p_source_id and o.is_active;
  insert into public.learning_activities (school_id, curriculum_version_id, study_program_id, activity_type, name_th, grade_level_id, term_no,
    activity_hours, source_document_id, source_locator, import_row_id)
  select a.school_id, v_new, mp.new_id, a.activity_type, a.name_th, a.grade_level_id, a.term_no, a.activity_hours,
    a.source_document_id, a.source_locator, a.import_row_id
  from public.learning_activities a left join _map mp on mp.old_id = a.study_program_id where a.curriculum_version_id = p_source_id;
  insert into public.subject_learning_outcomes (id, school_id, curriculum_version_id, subject_id, outcome_kind, code, statement_th, indicator_id,
    source_document_id, source_locator, import_row_id)
  select mo.new_id, o.school_id, v_new, ms.new_id, o.outcome_kind, o.code, o.statement_th, o.indicator_id, o.source_document_id, o.source_locator, o.import_row_id
  from public.subject_learning_outcomes o join _map mo on mo.old_id = o.id join _map ms on ms.old_id = o.subject_id;
  insert into public.curriculum_indicator_mappings (school_id, curriculum_version_id, subject_id, indicator_id, learning_outcome_id, coverage,
    source_document_id, source_locator, import_row_id)
  select c.school_id, v_new, ms.new_id, c.indicator_id, mo.new_id, c.coverage, c.source_document_id, c.source_locator, c.import_row_id
  from public.curriculum_indicator_mappings c join _map ms on ms.old_id = c.subject_id left join _map mo on mo.old_id = c.learning_outcome_id
  where c.curriculum_version_id = p_source_id and c.status <> 'rejected';
  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.source_conflict_annotate(p_id uuid, p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_bad text;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะฝ่ายวิชาการบันทึกผลวิเคราะห์ได้' using errcode = 'insufficient_privilege';
  end if;
  select k into v_bad from jsonb_object_keys(coalesce(p_fields, '{}'::jsonb)) k
   where k not in ('category', 'value_a', 'value_b', 'difference', 'impact_note', 'recommendation', 'decision_authority', 'impact') limit 1;
  if v_bad is not null then
    raise exception 'แก้ฟิลด์ % ผ่านคำสั่งนี้ไม่ได้', v_bad;
  end if;
  update public.source_conflicts c set
    category = coalesce(p_fields ->> 'category', c.category),
    value_a = case when p_fields ? 'value_a' then nullif(btrim(p_fields ->> 'value_a'), '') else c.value_a end,
    value_b = case when p_fields ? 'value_b' then nullif(btrim(p_fields ->> 'value_b'), '') else c.value_b end,
    difference = case when p_fields ? 'difference' then nullif(btrim(p_fields ->> 'difference'), '') else c.difference end,
    impact_note = case when p_fields ? 'impact_note' then nullif(btrim(p_fields ->> 'impact_note'), '') else c.impact_note end,
    recommendation = case when p_fields ? 'recommendation' then nullif(btrim(p_fields ->> 'recommendation'), '') else c.recommendation end,
    decision_authority = coalesce(p_fields ->> 'decision_authority', c.decision_authority),
    impact = coalesce(p_fields ->> 'impact', c.impact),
    updated_at = now()
   where c.id = p_id and c.school_id = private.current_school_id() and c.status <> 'resolved';
  if not found then
    raise exception 'ไม่พบข้อขัดแย้งที่ยังไม่ปิด';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.source_conflict_set_status(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะฝ่ายวิชาการคัดกรองข้อขัดแย้งได้' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('open', 'needs_decision') then
    raise exception 'คำสั่งนี้เปลี่ยนได้เฉพาะ open / needs_decision — การปิดต้องใช้การตัดสินของหัวหน้าฝ่ายวิชาการ';
  end if;
  update public.source_conflicts set status = p_status, updated_at = now()
   where id = p_id and school_id = private.current_school_id() and status <> 'resolved';
  if not found then
    raise exception 'ไม่พบข้อขัดแย้งที่ยังไม่ปิด';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.storage_begin_curriculum_source_upload(p_original_name text, p_mime_type text, p_size_bytes bigint)
 RETURNS TABLE(file_id uuid, document_id uuid, version integer, object_key text, mime_type text, size_bytes bigint, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_school uuid := private.current_school_id();
  v_name text := btrim(coalesce(p_original_name, ''));
  v_ext text := lower(substring(btrim(coalesce(p_original_name, '')) from '\.([A-Za-z0-9]{1,5})$'));
  v_doc public.documents;
  v_file public.files;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะฝ่ายวิชาการที่อัปโหลดเอกสารต้นทางหลักสูตรได้' using errcode = 'insufficient_privilege';
  end if;
  if v_ext not in ('pdf', 'xlsx', 'xls') or p_mime_type is distinct from private.mime_for_ext(v_ext) then
    raise exception 'เอกสารต้นทางหลักสูตรรองรับเฉพาะ PDF และ Excel';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 104857600 then
    raise exception 'ขนาดไฟล์ต้องไม่เกิน 100 MB';
  end if;
  if length(v_name) > 255 or v_name ~ '[\x00-\x1f/\\]' then
    raise exception 'ชื่อไฟล์ไม่ถูกต้อง';
  end if;
  insert into public.documents (school_id, kind, title, category) values (v_school, 'curriculum_source', left(v_name, 200), 'general')
  returning * into v_doc;
  v_file.id := gen_random_uuid();
  insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type, size_bytes, uploaded_by, upload_expires_at)
  values (v_file.id, v_school, v_doc.id, 1, format('schools/%s/curriculum-sources/%s.%s', v_school, v_file.id, v_ext),
          v_name, v_ext, p_mime_type, p_size_bytes, auth.uid(), now() + interval '5 minutes')
  returning * into v_file;
  perform private.log_file_event(v_file, 'upload_requested', jsonb_build_object('size', p_size_bytes, 'ext', v_ext, 'kind', 'curriculum_source'));
  return query select v_file.id, v_doc.id, v_file.version, v_file.object_key, v_file.mime_type, v_file.size_bytes, v_file.upload_expires_at;
end;
$function$;

drop policy curriculum_rules_insert on public.curriculum_rules;
create policy curriculum_rules_insert on public.curriculum_rules for insert to authenticated
  with check (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)));

drop policy curriculum_rules_update on public.curriculum_rules;
create policy curriculum_rules_update on public.curriculum_rules for update to authenticated
  using (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin) AND (status = 'draft'::text)))
  with check (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND (status = 'draft'::text)));

drop policy curriculum_versions_insert on public.curriculum_versions;
create policy curriculum_versions_insert on public.curriculum_versions for insert to authenticated
  with check (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)));

drop policy curriculum_versions_update on public.curriculum_versions;
create policy curriculum_versions_update on public.curriculum_versions for update to authenticated
  using (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND (status = 'draft'::text) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)))
  with check ((school_id = ( SELECT private.current_school_id() AS current_school_id)));

drop policy import_batches_insert on public.import_batches;
create policy import_batches_insert on public.import_batches for insert to authenticated
  with check (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND (created_by = auth.uid()) AND (private.is_curriculum_admin() OR (private.has_role('learning_area_head'::app_role) AND (learning_area_id IN ( SELECT private.my_learning_area_ids() AS my_learning_area_ids))))));

drop policy learning_activities_insert on public.learning_activities;
create policy learning_activities_insert on public.learning_activities for insert to authenticated
  with check (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)));

drop policy learning_activities_update on public.learning_activities;
create policy learning_activities_update on public.learning_activities for update to authenticated
  using (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)))
  with check ((school_id = ( SELECT private.current_school_id() AS current_school_id)));

drop policy source_conflicts_insert on public.source_conflicts;
create policy source_conflicts_insert on public.source_conflicts for insert to authenticated
  with check (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)));

drop policy source_documents_insert on public.source_documents;
create policy source_documents_insert on public.source_documents for insert to authenticated
  with check (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)));

drop policy source_documents_update on public.source_documents;
create policy source_documents_update on public.source_documents for update to authenticated
  using (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)))
  with check ((school_id = ( SELECT private.current_school_id() AS current_school_id)));

drop policy study_programs_insert on public.study_programs;
create policy study_programs_insert on public.study_programs for insert to authenticated
  with check (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)));

drop policy study_programs_update on public.study_programs;
create policy study_programs_update on public.study_programs for update to authenticated
  using (((school_id = ( SELECT private.current_school_id() AS current_school_id)) AND ( SELECT private.is_curriculum_admin() AS is_curriculum_admin)))
  with check ((school_id = ( SELECT private.current_school_id() AS current_school_id)));
