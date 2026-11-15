-- C2.0: Master Curriculum Registry (ทะเบียนหลักสูตรกลาง) — ใช้ subjects / subject_offerings / study_programs / curriculum_versions เดิม
--  · import_rows (หลักฐาน) ไม่ถูกแก้/ไม่ถูกลบ และไม่เปลี่ยนสถานะ — ทะเบียนอ้างหลักฐานผ่าน import_row_id + source_locator (หน้า PDF)
--  · registry_build: สร้างทะเบียนจากหลักฐานที่ไม่มี error/conflict ตามลำดับ dependency ในครั้งเดียว (ฉบับต้องเป็นแบบร่าง; Two-person อยู่ที่การอนุมัติ "ฉบับ" เดิม)
--  · ประวัติ: audit_logs (trigger เดิม) + is_active/change_note + carried_from_id ข้ามฉบับ · เปรียบเทียบข้ามปีด้วย compare_versions
--  · AI/กฎเสนอ (curriculum_match_proposals) — มนุษย์ตัดสินเท่านั้น; ไม่กำหนดกลุ่มสาระ ไม่แก้รหัส

-- ---------------------------------------------------------------- หมวดรายวิชาเพิ่ม: ทวิศึกษา / เฉพาะ
alter table public.subjects drop constraint subjects_subject_category_check;
alter table public.subjects add constraint subjects_subject_category_check check (subject_category in ('regular', 'is', 'dual_study', 'specific'));
drop index public.subjects_code_regular_key;
create unique index subjects_code_regular_key on public.subjects (curriculum_version_id, code) where subject_category <> 'is';

create or replace function private.curriculum_find_subject(p_version_id uuid, p_code text, p_stage text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(s.id))[1] end
  from public.subjects s
  where s.curriculum_version_id = p_version_id and s.code = p_code
    and (s.subject_category <> 'is' or s.education_stage = p_stage)
$$;

-- ---------------------------------------------------------------- คอลัมน์ประวัติ/สืบทอด
alter table public.subjects
  add column is_active boolean not null default true,
  add column change_note text check (change_note is null or length(change_note) <= 500),
  add column carried_from_id uuid references public.subjects (id) on delete set null;
alter table public.subject_offerings
  add column is_active boolean not null default true,
  add column change_note text check (change_note is null or length(change_note) <= 500),
  add column carried_from_id uuid references public.subject_offerings (id) on delete set null;
create index subjects_carried_from_idx on public.subjects (carried_from_id) where carried_from_id is not null;

-- ---------------------------------------------------------------- ข้อเสนอ (AI/กฎ) — แยกจากข้อเท็จจริง
create table public.curriculum_match_proposals (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id uuid not null references public.curriculum_versions (id) on delete cascade,
  subject_id            uuid not null references public.subjects (id) on delete cascade,
  kind                  text not null check (kind in ('category')),
  proposed              jsonb not null,
  confidence            numeric(3, 2) not null check (confidence between 0 and 1),
  rule                  text not null,
  evidence              jsonb not null default '{}'::jsonb,
  status                text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  decided_by            uuid references auth.users (id) on delete set null,
  decided_at            timestamptz,
  note                  text check (note is null or length(note) <= 500),
  created_at            timestamptz not null default now(),
  unique (subject_id, kind, rule),
  check (status = 'pending' or decided_by is not null)
);
alter table public.curriculum_match_proposals enable row level security;
revoke all on public.curriculum_match_proposals from anon, authenticated;
grant select on public.curriculum_match_proposals to authenticated;
create policy curriculum_match_proposals_select on public.curriculum_match_proposals for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_member()));
create trigger curriculum_match_proposals_audit after insert or update or delete on public.curriculum_match_proposals
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- สร้างทะเบียนจากหลักฐาน (ครั้งเดียว ตามลำดับ dependency)
create or replace function public.curriculum_registry_build(p_version_id uuid, p_include_warnings boolean default false)
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
  foreach k in array array['study_programs', 'subjects', 'subject_offerings', 'learning_activities'] loop
    v_ok := 0; v_skip := 0;
    for r in select ir.* from public.import_rows ir join public.import_batches ib on ib.id = ir.batch_id
              where ib.curriculum_version_id = cv.id and ib.kind = k and ir.status in ('needs_review', 'valid', 'warning', 'error')
              order by ib.created_at desc, ir.row_no loop
      select * into b from public.import_batches where id = r.batch_id;
      select * into d from public.source_documents where id = b.source_document_id;
      n := r.normalized;
      -- ตรวจซ้ำกับทะเบียนปัจจุบัน (dependency ที่เพิ่งสร้างในรอบนี้นับด้วย) — ไม่เขียนผลกลับลง import_rows
      v_issues := private.curriculum_validate(b.id, r.id, n, r);
      v_cls := private.curriculum_row_class('needs_review', v_issues, r.school_id, n);
      if not (v_cls = any (v_allowed)) then v_skip := v_skip + 1; continue; end if;
      if exists (select 1 from public.study_programs x where x.import_row_id = r.id) or exists (select 1 from public.subjects x where x.import_row_id = r.id)
         or exists (select 1 from public.subject_offerings x where x.import_row_id = r.id) or exists (select 1 from public.learning_activities x where x.import_row_id = r.id) then
        v_skip := v_skip + 1; continue;
      end if;
      v_loc := case when r.source_page is not null then 'pdf:' || r.source_page
        || case when d.page_offset is not null and r.source_page - d.page_offset > 0 then ';book:' || (r.source_page - d.page_offset) else '' end
        else 'sheet:' || r.source_sheet || '!' || r.source_cell_range end;
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
      v_ok := v_ok + 1;
    end loop;
    v_res := v_res || jsonb_build_object(k, jsonb_build_object('created', v_ok, 'skipped', v_skip));
  end loop;
  return v_res;
end;
$$;
revoke all on function public.curriculum_registry_build(uuid, boolean) from public, anon;
grant execute on function public.curriculum_registry_build(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- เสนอหมวดทวิศึกษา (กฎจากโครงสร้าง + ข้อความต้นฉบับ) — ไม่กำหนดกลุ่มสาระ ไม่แก้รหัส
create or replace function public.curriculum_registry_propose(p_version_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.curriculum_versions;
  s record;
  v_n int := 0;
  v_text boolean;
begin
  perform private.require_human();
  select * into cv from public.curriculum_versions where id = p_version_id and school_id = private.current_school_id();
  if not found or not private.is_office_staff() then
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
$$;
revoke all on function public.curriculum_registry_propose(uuid) from public, anon;
grant execute on function public.curriculum_registry_propose(uuid) to authenticated;

-- ตัดสินข้อเสนอ: คนเท่านั้น · ฉบับต้องเป็นแบบร่าง · รับ = ตั้งหมวดรายวิชา (ไม่แตะกลุ่มสาระ/รหัส) · ปฏิเสธต้องมีเหตุผล
create or replace function public.curriculum_proposals_decide(p_ids uuid[], p_accept boolean, p_note text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.curriculum_match_proposals;
  v_n int := 0;
begin
  perform private.require_human();
  if not private.is_office_staff() then raise exception 'คุณไม่มีสิทธิ์ตัดสินข้อเสนอ' using errcode = 'insufficient_privilege'; end if;
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
$$;
revoke all on function public.curriculum_proposals_decide(uuid[], boolean, text) from public, anon;
grant execute on function public.curriculum_proposals_decide(uuid[], boolean, text) to authenticated;

-- ---------------------------------------------------------------- ยกเลิก/คืนรายวิชา (เก็บประวัติ ไม่ลบ)
create or replace function public.curriculum_subject_set_active(p_subject_id uuid, p_active boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare s public.subjects;
begin
  perform private.require_human();
  select * into s from public.subjects where id = p_subject_id and school_id = private.current_school_id() for update;
  if not found or not private.is_office_staff() then raise exception 'ไม่พบรายวิชา หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.curriculum_versions v where v.id = s.curriculum_version_id and v.status = 'draft') then
    raise exception 'แก้ได้เฉพาะฉบับที่เป็นแบบร่าง (ฉบับที่อนุมัติแล้วให้คัดลอกเป็นฉบับใหม่)';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร'; end if;
  update public.subjects set is_active = p_active, change_note = left(btrim(p_reason), 500) where id = s.id;
  update public.subject_offerings set is_active = p_active, change_note = left(btrim(p_reason), 500) where subject_id = s.id;
end;
$$;
revoke all on function public.curriculum_subject_set_active(uuid, boolean, text) from public, anon;
grant execute on function public.curriculum_subject_set_active(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------- คัดลอกปีเก่า → ปีใหม่ (แก้ฟังก์ชันเดิม: รองรับ IS/ทวิศึกษา, สืบทอด carried_from_id, ไม่คัดลอกรายการที่ยกเลิก)
create or replace function public.curriculum_version_clone(p_source_id uuid, p_version_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.curriculum_versions;
  v_new uuid := gen_random_uuid();
begin
  perform private.require_human();
  if not private.is_office_staff() then
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
$$;

-- ---------------------------------------------------------------- เปรียบเทียบรายวิชาระหว่างฉบับ/ปี (อ่านอย่างเดียว · RLS ผู้เรียก)
create or replace function public.curriculum_compare_versions(p_a uuid, p_b uuid)
returns table (code text, education_stage text, name_a text, name_b text, change_kind text, changed_fields text[], locator_a text, locator_b text, change_note text)
language sql
stable
security invoker
set search_path = ''
as $$
  with sa as (select s.*, (select string_agg(coalesce(p.code, '-') || '/' || g.code || '/' || coalesce(o.term_no::text, '-') || '/' || o.offering_kind, ',' order by p.code, g.code, o.term_no)
                           from public.subject_offerings o left join public.study_programs p on p.id = o.study_program_id left join public.grade_levels g on g.id = o.grade_level_id
                           where o.subject_id = s.id and o.is_active) offs
              from public.subjects s where s.curriculum_version_id = p_a and s.is_active),
       sb as (select s.*, (select string_agg(coalesce(p.code, '-') || '/' || g.code || '/' || coalesce(o.term_no::text, '-') || '/' || o.offering_kind, ',' order by p.code, g.code, o.term_no)
                           from public.subject_offerings o left join public.study_programs p on p.id = o.study_program_id left join public.grade_levels g on g.id = o.grade_level_id
                           where o.subject_id = s.id and o.is_active) offs
              from public.subjects s where s.curriculum_version_id = p_b)
  select coalesce(sa.code, sb.code), coalesce(sa.education_stage, sb.education_stage), sa.name_th, sb.name_th,
    case when sa.id is null then 'added' when sb.id is null or not sb.is_active then 'cancelled'
         when cardinality(f.fields) > 0 then 'changed' else 'same' end,
    f.fields, sa.source_locator, sb.source_locator, sb.change_note
  from sa full join sb on sa.code = sb.code and coalesce(sa.education_stage, '') = coalesce(sb.education_stage, '')
  cross join lateral (select array_remove(array[
      case when sa.name_th is distinct from sb.name_th then 'name_th' end,
      case when sa.credits is distinct from sb.credits then 'credits' end,
      case when sa.learning_hours is distinct from sb.learning_hours then 'learning_hours' end,
      case when sa.learning_area_id is distinct from sb.learning_area_id then 'learning_area' end,
      case when sa.subject_type is distinct from sb.subject_type then 'subject_type' end,
      case when sa.subject_category is distinct from sb.subject_category then 'subject_category' end,
      case when sa.offs is distinct from sb.offs then 'offerings' end], null) as fields) f
  where not (sa.id is null and not sb.is_active)
  order by 1, 2
$$;
grant execute on function public.curriculum_compare_versions(uuid, uuid) to authenticated;
