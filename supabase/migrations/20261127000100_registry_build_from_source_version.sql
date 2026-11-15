-- C2.1: สร้างทะเบียนจากหลักฐานของ "ฉบับอื่น" ได้ (เช่น หลักฐานนำเข้าผูกกับฉบับที่เลิกใช้แล้ว) — หลักฐานไม่ถูกย้าย/แก้
--  · เพิ่มพารามิเตอร์ p_source_version_id (ต้องอยู่ในหลักสูตรเดียวกัน) · ฉบับปลายทางต้องเป็นแบบร่างเหมือนเดิม
drop function if exists public.curriculum_registry_build(uuid, boolean);
create or replace function public.curriculum_registry_build(p_version_id uuid, p_include_warnings boolean default false, p_source_version_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if not found or not private.is_office_staff() then
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
              where ib.curriculum_version_id = coalesce(p_source_version_id, cv.id) and ib.kind = k and ir.status in ('needs_review', 'valid', 'warning', 'error')
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
      if not (v_cls = any (v_allowed)) then v_skip := v_skip + 1; continue; end if;
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
$$;
revoke all on function public.curriculum_registry_build(uuid, boolean, uuid) from public, anon;
grant execute on function public.curriculum_registry_build(uuid, boolean, uuid) to authenticated;
