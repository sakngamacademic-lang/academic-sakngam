-- C1.7: ตรวจซ้ำทั้งชุดนำเข้า + สรุป error ตามประเภท (ช่วยฝ่ายวิชาการ — ไม่อนุมัติอะไรแทนคน)
-- ข้อผิดพลาดแบบ "รอ dependency" (V32/V33/V45: ยังไม่มีแผน/รายวิชาในฉบับ) จะหายเมื่อชุดต้นทางถูกอนุมัติ+บันทึกแล้ว
-- ฟังก์ชันนี้คำนวณ issues ใหม่ด้วย validator เดิม แล้วอัปเดตเฉพาะแถวที่ยังไม่มีการตัดสินของคน
--   · แถว approved / skipped / committed ไม่ถูกแตะ (ห้ามเขียนทับการตัดสินใจ)
--   · ไม่มีทางตั้งสถานะเป็น approved (ผลลัพธ์ที่เป็นไปได้: error / needs_review / warning / valid ตามกฎเดิม)
--   · ไม่แก้ค่า normalized และ raw (ค่าต้นฉบับคงเดิม)
create or replace function public.curriculum_import_batch_revalidate(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.import_batches;
  r public.import_rows;
  v_issues jsonb;
  v_status text;
  v_checked int := 0;
  v_changed int := 0;
  v_before jsonb;
  v_after jsonb;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id for update;
  if not found or not private.curriculum_can_work_batch(b) then
    raise exception 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'needs_review' then
    raise exception 'ชุดนำเข้านี้ไม่อยู่ในขั้นตรวจ';
  end if;
  select coalesce(jsonb_object_agg(status, n), '{}') into v_before from (select status, count(*) n from public.import_rows where batch_id = b.id group by 1) x;
  for r in select * from public.import_rows where batch_id = b.id and status in ('error', 'needs_review', 'warning', 'valid') order by row_no for update loop
    v_issues := private.curriculum_validate(b.id, r.id, r.normalized, r);
    v_status := private.curriculum_row_status(v_issues, r.proposed_by, r.source_page);
    v_checked := v_checked + 1;
    if v_issues is distinct from r.issues or v_status is distinct from r.status then
      update public.import_rows set issues = v_issues, status = v_status where id = r.id;
      v_changed := v_changed + 1;
    end if;
  end loop;
  perform private.curriculum_batch_refresh(b.id);
  select coalesce(jsonb_object_agg(status, n), '{}') into v_after from (select status, count(*) n from public.import_rows where batch_id = b.id group by 1) x;
  return jsonb_build_object('checked', v_checked, 'changed', v_changed, 'before', v_before, 'after', v_after);
end;
$$;
revoke all on function public.curriculum_import_batch_revalidate(uuid) from public, anon;
grant execute on function public.curriculum_import_batch_revalidate(uuid) to authenticated;

-- สรุป error/warning ตามรหัส + ประเภท (dependency = แก้ได้เมื่อบันทึกชุดต้นทางก่อน, source = ต้องให้คนตัดสินใจ)
create or replace function public.curriculum_import_error_summary(p_batch_id uuid default null)
returns table (batch_id uuid, kind text, status text, code text, severity text, field text, cause text, rows bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.kind, r.status, e ->> 'code', e ->> 'severity', e ->> 'field',
         case when e ->> 'code' in ('V32', 'V33', 'V45') and e ->> 'severity' = 'error' then 'dependency'
              when e ->> 'severity' = 'error' then 'source_or_master_data'
              else 'review_note' end,
         count(*)
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(r.issues) = 'array' then r.issues else '[]'::jsonb end) e
  where (p_batch_id is null or b.id = p_batch_id)
  group by 1, 2, 3, 4, 5, 6, 7
$$;
grant execute on function public.curriculum_import_error_summary(uuid) to authenticated;
