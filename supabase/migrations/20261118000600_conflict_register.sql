-- =============================================================================
-- C1.5 — Conflict Register
-- ทะเบียนข้อขัดแย้งที่ฝ่ายวิชาการใช้ตัดสินได้จริง: หมวด · ค่า A / ค่า B · ความแตกต่าง · ผลกระทบ · ข้อเสนอ · ผู้มีอำนาจตัดสิน
-- สถานะ: open → needs_decision (คัดกรองแล้ว รอมติ) → resolved (เฉพาะหัวหน้าฝ่ายวิชาการ, มนุษย์เท่านั้น)
-- AI/service_role: เพิ่มข้อขัดแย้ง/บันทึกการวิเคราะห์ไม่ได้ผ่าน RPC (require_human) และปิดข้อขัดแย้งไม่ได้
-- forward-only · แถวเดิมได้ category = 'other' และ authority = academic_head
-- =============================================================================

alter table public.source_conflicts
  add column category text not null default 'other' check (category in (
    'page_reference', 'credits', 'learning_hours', 'program_total', 'duplicate_code', 'subject_name', 'subject_type',
    'subject_code', 'missing_data', 'framework', 'other')),
  add column value_a text check (value_a is null or length(value_a) <= 2000),
  add column value_b text check (value_b is null or length(value_b) <= 2000),
  add column difference text check (difference is null or length(difference) <= 2000),
  add column impact_note text check (impact_note is null or length(impact_note) <= 2000),
  add column recommendation text check (recommendation is null or length(recommendation) <= 4000),
  add column decision_authority text not null default 'academic_head'
    check (decision_authority in ('academic_head', 'learning_area_head', 'academic_committee', 'director'));

alter table public.source_conflicts drop constraint source_conflicts_status_check;
alter table public.source_conflicts add constraint source_conflicts_status_check check (status in ('open', 'needs_decision', 'resolved'));
create index source_conflicts_status_idx on public.source_conflicts (school_id, status, category);

grant insert (category, value_a, value_b, difference, impact_note, recommendation, decision_authority) on public.source_conflicts to authenticated;

-- บันทึกผลวิเคราะห์ (ไม่ใช่การตัดสิน) — ฝ่ายวิชาการ · เฉพาะข้อที่ยังไม่ resolved
create or replace function public.source_conflict_annotate(p_id uuid, p_fields jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bad text;
begin
  perform private.require_human();
  if not private.is_office_staff() then
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
end $$;

-- คัดกรอง: open ↔ needs_decision (ไม่ใช่การตัดสิน)
create or replace function public.source_conflict_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_human();
  if not private.is_office_staff() then
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
end $$;

-- ตัดสิน: หัวหน้าฝ่ายวิชาการ (มนุษย์) · ปิดได้ทั้ง open และ needs_decision
create or replace function public.source_conflict_resolve(p_id uuid, p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_human();
  if not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการตัดสินข้อขัดแย้งได้' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_resolution, ''))) = 0 then
    raise exception 'กรุณาระบุผลการตัดสินและเหตุผล';
  end if;
  update public.source_conflicts set status = 'resolved', resolution = btrim(p_resolution), resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
   where id = p_id and school_id = private.current_school_id() and status in ('open', 'needs_decision');
  if not found then
    raise exception 'ไม่พบข้อขัดแย้งที่ยังเปิดอยู่';
  end if;
end $$;

revoke all on function public.source_conflict_annotate(uuid, jsonb), public.source_conflict_set_status(uuid, text) from public, anon;
grant execute on function public.source_conflict_annotate(uuid, jsonb), public.source_conflict_set_status(uuid, text) to authenticated;
