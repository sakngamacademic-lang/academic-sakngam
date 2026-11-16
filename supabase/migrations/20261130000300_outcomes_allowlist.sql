-- ผลการเรียนรู้ที่ติด "คำเตือน" (เช่น คำอธิบายหลายหน้า) นำเข้าได้เฉพาะแถวที่ผู้ดูแลระบุรหัสแถวเอง (Allowlist UUID) พร้อมเหตุผล
--  · เฉพาะผู้ดูแลหลักสูตร (academic_head) · ฉบับปลายทางต้องเป็นแบบร่าง · 1–500 แถว/ครั้ง · เหตุผลอย่างน้อย 10 ตัวอักษร
--  · ใช้เกณฑ์ตรวจเดียวกับ curriculum_registry_build_outcomes (ฉบับ REVIEWED): error/ข้อขัดแย้ง/CF เปิด ยังถูกปฏิเสธ
--  · กันข้อมูลผิดหน้า: แถวที่มีคำเตือนต้องมาจากหน้า PDF เดียวกับหน้าที่บันทึกรายวิชานั้นในทะเบียน
--  · IS ใช้รหัสซ้ำต่างช่วงชั้น: จับคู่กับรายวิชาที่หน้า PDF ตรงกับแถว (ไม่เดาช่วงชั้น)
--  · กันรหัสซ้ำด้วย unique เดิม · บันทึก Audit Log สรุป 1 แถว · ไม่แตะ import_rows · ไม่สร้างรายวิชา/ตัวชี้วัดเอง

create or replace function public.curriculum_registry_build_outcomes_allowlist(p_version_id uuid, p_source_version_id uuid, p_row_ids uuid[], p_note text)
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
  s public.subjects;
  n jsonb;
  v_issues jsonb;
  v_cls text;
  v_loc text;
  v_subject uuid;
  v_built uuid[] := '{}';
  v_ok int := 0; v_no_subject int := 0; v_blocked int := 0; v_existing int := 0; v_dup int := 0; v_page int := 0; v_not_found int;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะผู้ดูแลหลักสูตรนำเข้าผลการเรียนรู้ตามรายการได้' using errcode = 'insufficient_privilege';
  end if;
  if p_row_ids is null or cardinality(p_row_ids) = 0 or cardinality(p_row_ids) > 500 then raise exception 'ระบุแถวได้ครั้งละ 1–500 แถว'; end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร'; end if;
  select * into cv from public.curriculum_versions where id = p_version_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบฉบับหลักสูตร' using errcode = 'insufficient_privilege'; end if;
  if cv.status <> 'draft' then raise exception 'นำเข้าได้เฉพาะฉบับที่เป็นแบบร่าง (draft)'; end if;
  if not exists (select 1 from public.curriculum_versions sv where sv.id = p_source_version_id and sv.school_id = cv.school_id
                  and sv.school_curriculum_id = cv.school_curriculum_id) then
    raise exception 'ฉบับที่เป็นแหล่งหลักฐานต้องอยู่ในหลักสูตรเดียวกัน';
  end if;
  select cardinality(p_row_ids) - count(*) into v_not_found from public.import_rows ir join public.import_batches ib on ib.id = ir.batch_id
   where ir.id = any (p_row_ids) and ib.curriculum_version_id = p_source_version_id and ib.kind = 'learning_outcomes';
  for r in select ir.* from public.import_rows ir join public.import_batches ib on ib.id = ir.batch_id
            where ir.id = any (p_row_ids) and ib.curriculum_version_id = p_source_version_id and ib.kind = 'learning_outcomes'
              and ir.status in ('needs_review', 'valid', 'warning', 'error', 'approved')
            order by ir.row_no for update of ir loop
    select * into b from public.import_batches where id = r.batch_id;
    select * into d from public.source_documents where id = b.source_document_id;
    n := r.normalized;
    if exists (select 1 from public.subject_learning_outcomes x where x.import_row_id = r.id and x.curriculum_version_id = cv.id) then v_existing := v_existing + 1; continue; end if;
    v_issues := private.curriculum_validate(b.id, r.id, n, r);
    v_issues := coalesce((select jsonb_agg(e) from jsonb_array_elements(v_issues) e
      where e ->> 'code' not in ('V11', 'V32', 'V33')
      and not (e ->> 'code' = 'V45' and e ->> 'field' = 'subject_code')), '[]'::jsonb);
    v_cls := private.curriculum_row_class('needs_review', v_issues, r.school_id, n);
    if v_cls not in ('pass', 'warning') then v_blocked := v_blocked + 1; continue; end if;
    v_subject := private.curriculum_find_subject(cv.id, n ->> 'subject_code', nullif(btrim(n ->> 'education_stage'), ''));
    if v_subject is null and r.source_page is not null then
      -- IS: รหัสเดียวกันต่างช่วงชั้น — เลือกรายวิชาที่บันทึกจากหน้า PDF เดียวกับแถว (ต้องมีเพียงรายการเดียว)
      select (array_agg(x.id))[1] into v_subject from public.subjects x
       where x.curriculum_version_id = cv.id and x.code = n ->> 'subject_code' and x.subject_category = 'is'
         and x.source_locator ~ ('(^|;)pdf:' || r.source_page || '($|;)')
      having count(*) = 1;
    end if;
    if v_subject is null then v_no_subject := v_no_subject + 1; continue; end if;
    select * into s from public.subjects where id = v_subject;
    if v_cls = 'warning' and r.source_page is not null and s.source_locator !~ ('(^|;)pdf:' || r.source_page || '($|;)') then
      v_page := v_page + 1; continue;
    end if;
    v_loc := case when r.source_page is not null then 'pdf:' || r.source_page
      || case when d.page_offset is not null and r.source_page - d.page_offset > 0 then ';book:' || (r.source_page - d.page_offset) else '' end
      else 'sheet:' || r.source_sheet || '!' || r.source_cell_range end;
    begin
      insert into public.subject_learning_outcomes (school_id, curriculum_version_id, subject_id, outcome_kind, code, statement_th, indicator_id,
        source_document_id, source_locator, import_row_id)
      values (cv.school_id, cv.id, v_subject, n ->> 'outcome_kind', btrim(n ->> 'code'), btrim(n ->> 'statement_th'),
        (select id from public.indicators where framework_version_id = cv.framework_version_id and full_code = nullif(n ->> 'indicator_full_code', '')),
        d.id, v_loc, r.id);
      v_ok := v_ok + 1; v_built := v_built || r.id;
    exception when unique_violation then
      v_dup := v_dup + 1;
    end;
  end loop;
  insert into public.audit_logs (school_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (cv.school_id, auth.uid(), 'curriculum_outcomes_allowlist', cv.id, 'INSERT', null,
    jsonb_build_object('note', btrim(p_note), 'requested', cardinality(p_row_ids), 'built', v_ok, 'built_row_ids', to_jsonb(v_built)));
  return jsonb_build_object('built', v_ok, 'not_found', v_not_found, 'skipped_blocked', v_blocked, 'skipped_no_subject', v_no_subject,
    'skipped_page_mismatch', v_page, 'skipped_existing', v_existing, 'skipped_duplicate', v_dup);
end;
$$;
revoke all on function public.curriculum_registry_build_outcomes_allowlist(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.curriculum_registry_build_outcomes_allowlist(uuid, uuid, uuid[], text) to authenticated;
