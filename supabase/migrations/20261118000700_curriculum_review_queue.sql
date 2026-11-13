-- =============================================================================
-- C1.5 — Review Queue ข้ามชุดนำเข้า (อ่านอย่างเดียว · security invoker → ใช้ RLS ของผู้เรียก)
-- 1) curriculum_review_queue: ทุกแถวการจัดรายวิชา/กิจกรรม อ้างรายวิชา/แผนการเรียนที่
--    committed (บันทึกแล้ว) | staged (รอตรวจในชุดอื่น) | staged_error (มีแต่แถวที่ผิดพลาด) | missing (ไม่พบเลย)
--    → บอกฝ่ายวิชาการว่าควรบันทึกชุดใดก่อน และแถวใดจะยัง error แม้บันทึกครบแล้ว
-- 2) curriculum_staged_structure: ยอดรายวิชา/หน่วยกิต/ชั่วโมง ต่อชั้น-ภาค-แผน จาก "ข้อมูลรอตรวจ" (ไม่ใช่ข้อมูลที่ยืนยัน)
-- ไม่เขียนข้อมูลใด ๆ · ไม่เปลี่ยนสถานะแถว
-- =============================================================================

create or replace function public.curriculum_review_queue(p_version_id uuid)
returns table (batch_id uuid, row_id uuid, row_no int, kind text, source_page int, row_status text, ref_kind text, ref_code text, resolution text)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select b.id, b.kind, b.school_id from public.import_batches b
     where b.curriculum_version_id = p_version_id and b.status in ('uploaded', 'needs_review', 'approved', 'failed')
  ), r as materialized (
    select r.id, r.batch_id, r.row_no, r.source_page, r.status, r.normalized, b.kind, b.school_id
      from public.import_rows r join b on b.id = r.batch_id where r.status <> 'skipped'
  ), g as (
    select gl.code, gl.stage from public.grade_levels gl where gl.school_id in (select school_id from b)
  ), ssub as (  -- รายวิชาในชุดรอตรวจ: code + ช่วงชั้น (IS) · good = มีแถวที่ไม่ error
    select r.normalized ->> 'code' as code, nullif(r.normalized ->> 'education_stage', '') as stage, bool_or(r.status <> 'error') as good
      from r where r.kind = 'subjects' group by 1, 2
  ), sprog as (
    select r.normalized ->> 'code' as code, bool_or(r.status <> 'error') as good from r where r.kind = 'study_programs' group by 1
  ), csub as (
    select s.code, s.subject_category, s.education_stage from public.subjects s where s.curriculum_version_id = p_version_id
  ), refs as (
    select r.batch_id, r.id as row_id, r.row_no, r.kind, r.source_page, r.status as row_status, 'subject'::text as ref_kind,
           r.normalized ->> 'subject_code' as ref_code, g.stage
      from r left join g on g.code = r.normalized ->> 'grade_code' where r.kind = 'subject_offerings'
    union all
    select r.batch_id, r.id, r.row_no, r.kind, r.source_page, r.status, 'program', r.normalized ->> 'program_code', null
      from r where r.kind in ('subject_offerings', 'learning_activities') and nullif(r.normalized ->> 'program_code', '') is not null
  )
  select x.batch_id, x.row_id, x.row_no, x.kind, x.source_page, x.row_status, x.ref_kind, x.ref_code,
    case
      when x.ref_kind = 'subject' and exists (select 1 from csub s where s.code = x.ref_code and (s.subject_category = 'regular' or s.education_stage = x.stage)) then 'committed'
      when x.ref_kind = 'program' and exists (select 1 from public.study_programs p where p.curriculum_version_id = p_version_id and p.code = x.ref_code) then 'committed'
      when x.ref_kind = 'subject' and exists (select 1 from ssub s where s.code = x.ref_code and s.good and coalesce(s.stage, x.stage) is not distinct from x.stage) then 'staged'
      when x.ref_kind = 'program' and exists (select 1 from sprog p where p.code = x.ref_code and p.good) then 'staged'
      when x.ref_kind = 'subject' and exists (select 1 from ssub s where s.code = x.ref_code and coalesce(s.stage, x.stage) is not distinct from x.stage) then 'staged_error'
      when x.ref_kind = 'program' and exists (select 1 from sprog p where p.code = x.ref_code) then 'staged_error'
      else 'missing'
    end
  from refs x
$$;

create or replace function public.curriculum_staged_structure(p_version_id uuid)
returns table (grade_code text, program_code text, term_no int, subject_type text, subjects int, credits numeric, learning_hours int, unresolved int)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select b.id, b.kind, b.school_id from public.import_batches b
     where b.curriculum_version_id = p_version_id and b.status in ('uploaded', 'needs_review', 'approved', 'failed')
  ), r as materialized (
    select r.status, r.normalized, r.created_at, b.kind from public.import_rows r join b on b.id = r.batch_id where r.status <> 'skipped'
  ), g as (
    select gl.code, gl.stage from public.grade_levels gl where gl.school_id in (select school_id from b)
  ), subj as (  -- แถวรายวิชาล่าสุดที่ไม่ error ต่อ code + ช่วงชั้น
    select distinct on (r.normalized ->> 'code', nullif(r.normalized ->> 'education_stage', ''))
           r.normalized ->> 'code' as code, nullif(r.normalized ->> 'education_stage', '') as stage, r.normalized as sn
      from r where r.kind = 'subjects' and r.status <> 'error'
     order by r.normalized ->> 'code', nullif(r.normalized ->> 'education_stage', ''), r.created_at desc
  ), o as (
    select r.normalized ->> 'grade_code' as grade_code, r.normalized ->> 'program_code' as program_code,
           nullif(r.normalized ->> 'term_no', '')::int as term_no, r.normalized ->> 'subject_code' as code, g.stage
      from r left join g on g.code = r.normalized ->> 'grade_code' where r.kind = 'subject_offerings'
  ), j as (
    select o.*, s.sn from o left join subj s on s.code = o.code and (s.stage is null or s.stage = o.stage)
  )
  select j.grade_code, j.program_code, j.term_no, coalesce(j.sn ->> 'subject_type', 'unresolved') as subject_type,
         count(*)::int, coalesce(sum(nullif(j.sn ->> 'credits', '')::numeric), 0), coalesce(sum(nullif(j.sn ->> 'learning_hours', '')::int), 0)::int,
         count(*) filter (where j.sn is null)::int
    from j
   group by 1, 2, 3, 4
   order by 1, 2, 3, 4
$$;

revoke all on function public.curriculum_review_queue(uuid), public.curriculum_staged_structure(uuid) from public, anon;
grant execute on function public.curriculum_review_queue(uuid), public.curriculum_staged_structure(uuid) to authenticated;
