-- C1.9: Unified Curriculum Review — Batch Approval + Dependency order (ใช้ตาราง/ฟังก์ชันเดิม ไม่สร้าง schema ซ้ำ)
--  · ชั้นของแถว: pass / warning / conflict / error (+ approved/skipped/committed)
--  · อนุมัติเป็นกลุ่มได้ (pass: approve_clean เดิม, warning: ฟังก์ชันใหม่ต้องมีหมายเหตุ) — error/conflict อนุมัติไม่ได้ (trigger ป้องกันทุกเส้นทาง)
--  · อนุมัติ "ชุด" ยังเป็นหัวหน้าฝ่ายวิชาการที่ไม่ใช่ผู้สร้าง (Two-person) — แถว error/conflict ที่เหลือจะไม่ถูกบันทึก
--  · ระบบไม่อนุมัติ/ตัดสิน conflict แทนมนุษย์

create or replace function private.curriculum_row_class(p_status text, p_issues jsonb, p_school uuid, p_norm jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_status in ('approved', 'skipped', 'committed') then p_status
    when p_status = 'error' or exists (select 1 from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) e where e ->> 'severity' = 'error') then 'error'
    when exists (select 1 from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) e where e ->> 'code' = 'SOURCE_CONFLICT')
         and not exists (select 1 from public.source_conflicts c where c.school_id = p_school and c.status = 'resolved'
                          and c.subject_ref in (coalesce(p_norm ->> 'code', ''), coalesce(p_norm ->> 'subject_code', ''))) then 'conflict'
    when exists (select 1 from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) e where e ->> 'severity' = 'warning') then 'warning'
    else 'pass'
  end
$$;

grant execute on function private.curriculum_row_class(text, jsonb, uuid, jsonb) to authenticated;

-- ห้ามอนุมัติแถว error/conflict ไม่ว่าเรียกจากเส้นทางใด
create or replace function private.curriculum_block_unsafe_approve()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and private.curriculum_row_class('needs_review', new.issues, new.school_id, new.normalized) in ('error', 'conflict') then
    raise exception 'แถวที่ผิดพลาดหรือมีข้อขัดแย้งที่ยังไม่ตัดสิน อนุมัติไม่ได้';
  end if;
  return new;
end;
$$;
drop trigger if exists import_rows_block_unsafe_approve on public.import_rows;
create trigger import_rows_block_unsafe_approve before update of status on public.import_rows
  for each row execute function private.curriculum_block_unsafe_approve();

-- รายงานก่อนอนุมัติ: ผ่าน / เตือน / ขัดแย้ง / ผิดพลาด ต่อชุด (RLS ผู้เรียก)
create or replace function public.curriculum_import_batch_report(p_batch_id uuid default null)
returns table (batch_id uuid, kind text, status text, created_by uuid, total bigint, pass bigint, warning bigint, conflict bigint, error bigint, approved bigint, skipped bigint, committed bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.kind, b.status, b.created_by, count(r.id),
    count(*) filter (where c.cls = 'pass'), count(*) filter (where c.cls = 'warning'), count(*) filter (where c.cls = 'conflict'),
    count(*) filter (where c.cls = 'error'), count(*) filter (where c.cls = 'approved'), count(*) filter (where c.cls = 'skipped'),
    count(*) filter (where c.cls = 'committed')
  from public.import_batches b
  left join public.import_rows r on r.batch_id = b.id
  left join lateral (select private.curriculum_row_class(r.status, r.issues, r.school_id, r.normalized) cls) c on true
  where p_batch_id is null or b.id = p_batch_id
  group by b.id
$$;
grant execute on function public.curriculum_import_batch_report(uuid) to authenticated;

-- รายการแถวตามชั้น (แบ่งหน้า) — ใช้กับหน้ารวม
create or replace function public.curriculum_import_batch_rows(p_batch_id uuid, p_class text, p_limit int default 50, p_offset int default 0)
returns table (id uuid, row_no int, source_page int, status text, cls text, issues jsonb, normalized jsonb, decision_note text, total_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with x as (
    select r.*, private.curriculum_row_class(r.status, r.issues, r.school_id, r.normalized) cls
    from public.import_rows r where r.batch_id = p_batch_id)
  select x.id, x.row_no, x.source_page, x.status, x.cls, x.issues, x.normalized, x.decision_note, count(*) over ()
  from x where p_class is null or x.cls = p_class
  order by x.row_no limit greatest(least(p_limit, 200), 1) offset greatest(p_offset, 0)
$$;
grant execute on function public.curriculum_import_batch_rows(uuid, text, int, int) to authenticated;

-- อนุมัติกลุ่ม "เตือน": แยกจากกลุ่มผ่าน ต้องมีหมายเหตุ ≥ 10 ตัวอักษร (คนกดเอง)
create or replace function public.curriculum_import_rows_approve_warnings(p_batch_id uuid, p_row_ids uuid[], p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.import_batches;
  r public.import_rows;
  v_issues jsonb;
  v_ok int := 0;
  v_skipped int := 0;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id for update;
  if not found or not private.curriculum_can_work_batch(b) then
    raise exception 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'needs_review' then raise exception 'ชุดนำเข้านี้ไม่อยู่ในขั้นตรวจ'; end if;
  if p_row_ids is null or cardinality(p_row_ids) = 0 or cardinality(p_row_ids) > 500 then raise exception 'ระบุแถวได้ครั้งละ 1–500 แถว'; end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'ต้องระบุหมายเหตุอย่างน้อย 10 ตัวอักษร (เหตุผลที่รับคำเตือน)'; end if;
  for r in select * from public.import_rows where batch_id = b.id and id = any (p_row_ids) order by row_no for update loop
    v_issues := private.curriculum_validate(b.id, r.id, r.normalized, r);
    if r.status = 'needs_review' and r.normalized <> '{}'::jsonb
       and private.curriculum_row_class('needs_review', v_issues, r.school_id, r.normalized) = 'warning' then
      update public.import_rows set status = 'approved', issues = v_issues, decision_by = auth.uid(), decision_at = now(), decision_note = btrim(p_note) where id = r.id;
      v_ok := v_ok + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  perform private.curriculum_batch_refresh(b.id);
  return jsonb_build_object('approved', v_ok, 'skipped_not_warning', v_skipped);
end;
$$;
revoke all on function public.curriculum_import_rows_approve_warnings(uuid, uuid[], text) from public, anon;
grant execute on function public.curriculum_import_rows_approve_warnings(uuid, uuid[], text) to authenticated;

-- แก้ไขค่าเป็นกลุ่ม: เฉพาะช่องที่อนุญาต, เฉพาะแถวที่ยังไม่ตัดสิน, ใช้ได้เมื่อ "ตรวจซ้ำแล้วไม่มี error" · ไม่แก้ raw · ไม่อนุมัติ
create or replace function public.curriculum_import_rows_bulk_set(p_batch_id uuid, p_row_ids uuid[], p_field text, p_value text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.import_batches;
  r public.import_rows;
  v_norm jsonb;
  v_issues jsonb;
  v_ok int := 0;
  v_rejected int := 0;
begin
  perform private.require_human();
  select * into b from public.import_batches where id = p_batch_id for update;
  if not found or not private.curriculum_can_work_batch(b) then
    raise exception 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'needs_review' then raise exception 'ชุดนำเข้านี้ไม่อยู่ในขั้นตรวจ'; end if;
  if p_field not in ('learning_area_code', 'subject_type', 'grade_code', 'program_code') then raise exception 'ช่องนี้แก้เป็นกลุ่มไม่ได้'; end if;
  if p_row_ids is null or cardinality(p_row_ids) = 0 or cardinality(p_row_ids) > 500 then raise exception 'ระบุแถวได้ครั้งละ 1–500 แถว'; end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร'; end if;
  if btrim(coalesce(p_value, '')) = '' then raise exception 'ต้องระบุค่าที่ต้องการตั้ง'; end if;
  for r in select * from public.import_rows where batch_id = b.id and id = any (p_row_ids) and status in ('needs_review', 'valid', 'warning', 'error') order by row_no for update loop
    v_norm := r.normalized || jsonb_build_object(p_field, btrim(p_value));
    v_issues := private.curriculum_validate(b.id, r.id, v_norm, r);
    if exists (select 1 from jsonb_array_elements(v_issues) e where e ->> 'severity' = 'error') then
      v_rejected := v_rejected + 1;
    else
      update public.import_rows set normalized = v_norm, issues = v_issues,
        status = private.curriculum_row_status(v_issues, r.proposed_by, r.source_page),
        decision_note = left(btrim(p_note) || ' [แก้ ' || p_field || ': ' || coalesce(r.normalized ->> p_field, '(ว่าง)') || ' → ' || btrim(p_value) || ']', 500)
      where id = r.id;
      v_ok := v_ok + 1;
    end if;
  end loop;
  perform private.curriculum_batch_refresh(b.id);
  return jsonb_build_object('applied', v_ok, 'rejected_still_invalid', v_rejected);
end;
$$;
revoke all on function public.curriculum_import_rows_bulk_set(uuid, uuid[], text, text, text) from public, anon;
grant execute on function public.curriculum_import_rows_bulk_set(uuid, uuid[], text, text, text) to authenticated;

-- อนุมัติชุด (หัวหน้า ≠ ผู้สร้าง): ไม่บังคับแถวผิดพลาด/ขัดแย้งให้ครบ — แถวเหล่านั้นไม่ถูกบันทึก; แถวผ่าน/เตือนต้องถูกตัดสิน (อนุมัติหรือข้าม)
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
$$;
