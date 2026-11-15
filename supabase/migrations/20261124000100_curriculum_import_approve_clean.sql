-- C1.8: คนกดอนุมัติ "แถวที่ไม่มีข้อสังเกต" ทีละกลุ่ม (ลดงานคลิกรายแถว) — ยังเป็นการตัดสินของมนุษย์ ไม่ใช่ระบบอัตโนมัติ
--  · ต้องเป็นผู้ใช้จริง (require_human) ที่มีสิทธิ์ทำงานกับชุดนั้น และชุดอยู่ในขั้น needs_review
--  · ส่งรายการ id ที่ผู้ตรวจเห็นบนหน้าจอ (ไม่เกิน 500) · ตรวจซ้ำด้วย validator ก่อนอนุมัติทุกแถว
--  · อนุมัติเฉพาะแถว needs_review ที่ไม่มี issue ระดับ error/warning และมีค่า normalized
--  · บันทึก decision_by/decision_at ของผู้กด · ไม่แตะแถว error/warning/skipped/approved และไม่แก้ค่าต้นฉบับ
--  · การอนุมัติ "ชุด" ยังต้องเป็นหัวหน้าฝ่ายวิชาการที่ไม่ใช่ผู้สร้างชุด (กติกา 2 คน เดิม)
create or replace function public.curriculum_import_rows_approve_clean(p_batch_id uuid, p_row_ids uuid[], p_note text default null)
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
  v_ok int := 0;
  v_skipped int := 0;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id for update;
  if not found or not private.curriculum_can_work_batch(b) then
    raise exception 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'needs_review' then
    raise exception 'ชุดนำเข้านี้ไม่อยู่ในขั้นตรวจ';
  end if;
  if p_row_ids is null or cardinality(p_row_ids) = 0 or cardinality(p_row_ids) > 500 then
    raise exception 'ระบุแถวได้ครั้งละ 1–500 แถว';
  end if;
  for r in select * from public.import_rows where batch_id = b.id and id = any (p_row_ids) order by row_no for update loop
    v_issues := private.curriculum_validate(b.id, r.id, r.normalized, r);
    v_status := private.curriculum_row_status(v_issues, r.proposed_by, r.source_page);
    if r.status = 'needs_review' and v_status = 'needs_review' and r.normalized <> '{}'::jsonb
       and not exists (select 1 from jsonb_array_elements(v_issues) e where e ->> 'severity' in ('error', 'warning')) then
      update public.import_rows set status = 'approved', issues = v_issues, decision_by = auth.uid(), decision_at = now(),
             decision_note = coalesce(nullif(btrim(p_note), ''), 'อนุมัติกลุ่มแถวที่ไม่มีข้อสังเกต (ตรวจเทียบต้นฉบับแล้ว)')
       where id = r.id;
      v_ok := v_ok + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  perform private.curriculum_batch_refresh(b.id);
  return jsonb_build_object('approved', v_ok, 'skipped_not_clean', v_skipped);
end;
$$;
revoke all on function public.curriculum_import_rows_approve_clean(uuid, uuid[], text) from public, anon;
grant execute on function public.curriculum_import_rows_approve_clean(uuid, uuid[], text) to authenticated;
