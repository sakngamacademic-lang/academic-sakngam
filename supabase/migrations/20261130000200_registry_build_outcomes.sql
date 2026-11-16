-- สร้างผลการเรียนรู้เข้าทะเบียนกลาง จากหลักฐานนำเข้าของฉบับแหล่งหลักฐาน (ปุ่มสร้างทะเบียนเดิมไม่ครอบคลุมผลการเรียนรู้)
--  · เฉพาะผู้ดูแลหลักสูตร (academic_head) · ฉบับปลายทางต้องเป็นแบบร่าง · ไม่แตะ import_rows
--  · ผูกกับรายวิชาที่อยู่ในทะเบียนปลายทางตามรหัสเท่านั้น (ไม่พบ = ข้าม ไม่สร้างรายวิชา/ตัวชี้วัดขึ้นเอง)
--  · แถวของรายวิชาที่ยังมี CF เปิด/ข้อผิดพลาด ถูกข้าม (curriculum_row_class) · รันซ้ำได้: ข้ามแถวที่เข้าทะเบียนแล้ว
--  · ใส่ p_row_ids เพื่อจำกัดเฉพาะแถวที่ผู้ดูแลระบุ (ไม่ระบุ = ทุกแถวที่ผ่านเกณฑ์)

create or replace function public.curriculum_registry_build_outcomes(p_version_id uuid, p_source_version_id uuid, p_row_ids uuid[] default null)
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
  n jsonb;
  v_issues jsonb;
  v_cls text;
  v_loc text;
  v_subject uuid;
  v_ok int := 0; v_no_subject int := 0; v_blocked int := 0; v_existing int := 0; v_dup int := 0;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะผู้ดูแลหลักสูตรสร้างผลการเรียนรู้เข้าทะเบียนได้' using errcode = 'insufficient_privilege';
  end if;
  select * into cv from public.curriculum_versions where id = p_version_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบฉบับหลักสูตร' using errcode = 'insufficient_privilege'; end if;
  if cv.status <> 'draft' then raise exception 'สร้างได้เฉพาะฉบับที่เป็นแบบร่าง (draft)'; end if;
  if not exists (select 1 from public.curriculum_versions sv where sv.id = p_source_version_id and sv.school_id = cv.school_id
                  and sv.school_curriculum_id = cv.school_curriculum_id) then
    raise exception 'ฉบับที่เป็นแหล่งหลักฐานต้องอยู่ในหลักสูตรเดียวกัน';
  end if;
  for r in select ir.* from public.import_rows ir join public.import_batches ib on ib.id = ir.batch_id
            where ib.curriculum_version_id = p_source_version_id and ib.kind = 'learning_outcomes'
              and ir.status in ('needs_review', 'valid', 'warning', 'error', 'approved')
              and (p_row_ids is null or ir.id = any (p_row_ids))
            order by ib.created_at desc, ir.row_no loop
    select * into b from public.import_batches where id = r.batch_id;
    select * into d from public.source_documents where id = b.source_document_id;
    n := r.normalized;
    if exists (select 1 from public.subject_learning_outcomes x where x.import_row_id = r.id and x.curriculum_version_id = cv.id) then v_existing := v_existing + 1; continue; end if;
    v_issues := private.curriculum_validate(b.id, r.id, n, r);
    -- ฉบับต่างกัน: ละเว้นเฉพาะ dependency ของรหัสวิชาระหว่างฉบับ
    -- คง V45 ของชนิดผลการเรียนรู้/รหัส/ข้อความที่ผิด และข้อผิดพลาด V50 ไว้
    v_issues := coalesce((select jsonb_agg(e) from jsonb_array_elements(v_issues) e
      where e ->> 'code' not in ('V11', 'V32', 'V33')
      and not (e ->> 'code' = 'V45' and e ->> 'field' = 'subject_code')), '[]'::jsonb);
    v_cls := private.curriculum_row_class('needs_review', v_issues, r.school_id, n);
    if v_cls not in ('pass', 'warning') or (v_cls = 'warning' and r.status <> 'approved') then v_blocked := v_blocked + 1; continue; end if;
    v_subject := private.curriculum_find_subject(cv.id, n ->> 'subject_code', nullif(btrim(n ->> 'education_stage'), ''));
    if v_subject is null then v_no_subject := v_no_subject + 1; continue; end if;
    v_loc := case when r.source_page is not null then 'pdf:' || r.source_page
      || case when d.page_offset is not null and r.source_page - d.page_offset > 0 then ';book:' || (r.source_page - d.page_offset) else '' end
      else 'sheet:' || r.source_sheet || '!' || r.source_cell_range end;
    begin
      insert into public.subject_learning_outcomes (school_id, curriculum_version_id, subject_id, outcome_kind, code, statement_th, indicator_id,
        source_document_id, source_locator, import_row_id)
      values (cv.school_id, cv.id, v_subject, n ->> 'outcome_kind', btrim(n ->> 'code'), btrim(n ->> 'statement_th'),
        (select id from public.indicators where framework_version_id = cv.framework_version_id and full_code = nullif(n ->> 'indicator_full_code', '')),
        d.id, v_loc, r.id);
      v_ok := v_ok + 1;
    exception when unique_violation then
      v_dup := v_dup + 1;
    end;
  end loop;
  return jsonb_build_object('built', v_ok, 'skipped_no_subject', v_no_subject, 'skipped_blocked', v_blocked, 'skipped_existing', v_existing, 'skipped_duplicate', v_dup);
end;
$$;
revoke all on function public.curriculum_registry_build_outcomes(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.curriculum_registry_build_outcomes(uuid, uuid, uuid[]) to authenticated;
