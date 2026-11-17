-- =============================================================================
-- Phase 3 — คำอธิบายรายวิชา + โครงสร้างรายวิชา (หน่วยการเรียนรู้)
--  · ใช้ทะเบียนรายวิชาเดิม (subjects) เป็นฐาน — ไม่สร้างทะเบียนซ้ำ ไม่แก้ค่าหน่วยกิต/ชั่วโมงของรายวิชา
--  · หนึ่งรายวิชามี “ฉบับที่กำลังจัดทำ” ได้ฉบับเดียว (เปิดของเดิมแทนการสร้างซ้ำ) · ฉบับใหม่คัดลอกจากฉบับที่อนุมัติล่าสุด
--  · มาตรฐาน/ตัวชี้วัดเลือกจากฐานกรอบแกนกลาง (indicators) หรือผลการเรียนรู้ของรายวิชา (subject_learning_outcomes) — ไม่พิมพ์ซ้ำ
--  · Workflow: ร่าง → ส่งตรวจ → หัวหน้ากลุ่มสาระตรวจ (ตรวจแล้ว/ส่งแก้ไข) → ผู้ดูแลหลักสูตรอนุมัติ · ผู้จัดทำอนุมัติของตนเองไม่ได้
--  · แก้เนื้อหาได้เฉพาะสถานะร่าง/ส่งแก้ไข · ทุกการเปลี่ยนแปลงบันทึก Audit Log
--  · ครูเห็นรายวิชาผ่าน RPC เฉพาะกลุ่มสาระของตน/รายวิชาที่สอน (ไม่ผ่อน RLS ของ subjects)
-- =============================================================================

create table public.course_syllabi (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  subject_id             uuid not null,
  curriculum_version_id  uuid not null,
  version_no             int not null check (version_no > 0),
  status                 text not null default 'draft' check (status in ('draft', 'submitted', 'returned', 'reviewed', 'approved', 'retired')),
  essence                text check (essence is null or length(essence) <= 8000),
  learning_process       text check (learning_process is null or length(learning_process) <= 8000),
  expected_skills        text check (expected_skills is null or length(expected_skills) <= 8000),
  assessment_note        text check (assessment_note is null or length(assessment_note) <= 8000),
  competency_ids         uuid[] not null default '{}',
  owner_teacher_id       uuid,
  based_on_id            uuid references public.course_syllabi (id) on delete restrict,
  submitted_at           timestamptz,
  reviewed_by            uuid,
  reviewed_at            timestamptz,
  approved_by            uuid,
  approved_at            timestamptz,
  return_note            text check (return_note is null or length(return_note) <= 4000),
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (subject_id, version_no),
  unique (id, school_id),
  foreign key (subject_id, curriculum_version_id) references public.subjects (id, curriculum_version_id) on delete restrict,
  foreign key (owner_teacher_id, school_id) references public.teachers (id, school_id) on delete restrict,
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);
create unique index course_syllabi_one_open on public.course_syllabi (subject_id) where status in ('draft', 'submitted', 'returned', 'reviewed');

create table public.course_syllabus_targets (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  syllabus_id          uuid not null,
  indicator_id         uuid references public.indicators (id) on delete restrict,
  learning_outcome_id  uuid references public.subject_learning_outcomes (id) on delete restrict,
  created_at           timestamptz not null default now(),
  foreign key (syllabus_id, school_id) references public.course_syllabi (id, school_id) on delete cascade,
  check (num_nonnulls(indicator_id, learning_outcome_id) = 1),
  constraint course_syllabus_targets_key unique nulls not distinct (syllabus_id, indicator_id, learning_outcome_id)
);

create table public.course_units (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  syllabus_id         uuid not null,
  seq                 int not null check (seq > 0),
  title               text not null check (length(btrim(title)) between 1 and 300),
  essence             text check (essence is null or length(essence) <= 8000),
  objectives          text check (objectives is null or length(objectives) <= 8000),
  hours               numeric(6,1) check (hours is null or hours >= 0),
  max_score           numeric(6,1) check (max_score is null or max_score >= 0),
  tasks               text check (tasks is null or length(tasks) <= 4000),
  assessment_methods  text check (assessment_methods is null or length(assessment_methods) <= 4000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, school_id),
  foreign key (syllabus_id, school_id) references public.course_syllabi (id, school_id) on delete cascade
);
create index course_units_syllabus_idx on public.course_units (syllabus_id, seq);

create table public.course_unit_targets (
  unit_id    uuid not null references public.course_units (id) on delete cascade,
  target_id  uuid not null references public.course_syllabus_targets (id) on delete cascade,
  school_id  uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  primary key (unit_id, target_id)
);

-- ---------------------------------------------------------------- สิทธิ์
create or replace function private.syllabus_area(p_syllabus_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.learning_area_id from public.course_syllabi c join public.subjects s on s.id = c.subject_id where c.id = p_syllabus_id
$$;

-- ครูที่ทำงานกับรายวิชานี้ได้: ครูในกลุ่มสาระของรายวิชา หรือครูที่สอนกลุ่มเรียนของรายวิชา
create or replace function private.teacher_can_work_subject(p_subject_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subjects s
     where s.id = p_subject_id and s.school_id = private.current_school_id()
       and (exists (select 1 from public.teachers t where t.id = private.my_teacher_id() and t.learning_area_id = s.learning_area_id)
            or exists (select 1 from public.subject_offerings o join public.course_sections cs on cs.subject_offering_id = o.id
                        join public.course_section_teachers ct on ct.course_section_id = cs.id
                       where o.subject_id = s.id and ct.teacher_id = private.my_teacher_id())))
$$;

create or replace function private.can_read_syllabus(p_syllabus_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_syllabi c
     where c.id = p_syllabus_id and c.school_id = private.current_school_id()
       and (private.curriculum_reader_role() or c.owner_teacher_id = private.my_teacher_id() or private.teacher_can_work_subject(c.subject_id)))
$$;

create or replace function private.can_write_syllabus(p_syllabus_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_syllabi c
     where c.id = p_syllabus_id and c.school_id = private.current_school_id() and c.status in ('draft', 'returned')
       and (c.owner_teacher_id = private.my_teacher_id() or private.can_edit_curriculum_area(private.syllabus_area(c.id))))
$$;

do $$
declare t text;
begin
  foreach t in array array['course_syllabi', 'course_syllabus_targets', 'course_units', 'course_unit_targets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
grant select on public.course_syllabi, public.course_syllabus_targets, public.course_units, public.course_unit_targets to authenticated;
grant update (essence, learning_process, expected_skills, assessment_note, competency_ids) on public.course_syllabi to authenticated;
grant insert, delete on public.course_syllabus_targets, public.course_unit_targets to authenticated;
grant insert, update, delete on public.course_units to authenticated;

create policy course_syllabi_select on public.course_syllabi for select to authenticated using (private.can_read_syllabus(id));
create policy course_syllabi_update on public.course_syllabi for update to authenticated using (private.can_write_syllabus(id)) with check (private.can_write_syllabus(id));
create policy course_syllabus_targets_select on public.course_syllabus_targets for select to authenticated using (private.can_read_syllabus(syllabus_id));
create policy course_syllabus_targets_write on public.course_syllabus_targets for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_write_syllabus(syllabus_id));
create policy course_syllabus_targets_delete on public.course_syllabus_targets for delete to authenticated using (private.can_write_syllabus(syllabus_id));
create policy course_units_select on public.course_units for select to authenticated using (private.can_read_syllabus(syllabus_id));
create policy course_units_insert on public.course_units for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_write_syllabus(syllabus_id));
create policy course_units_update on public.course_units for update to authenticated using (private.can_write_syllabus(syllabus_id)) with check (private.can_write_syllabus(syllabus_id));
create policy course_units_delete on public.course_units for delete to authenticated using (private.can_write_syllabus(syllabus_id));
create policy course_unit_targets_select on public.course_unit_targets for select to authenticated
  using (exists (select 1 from public.course_units u where u.id = unit_id and private.can_read_syllabus(u.syllabus_id)));
create policy course_unit_targets_insert on public.course_unit_targets for insert to authenticated
  with check (school_id = (select private.current_school_id()) and exists (
    select 1 from public.course_units u join public.course_syllabus_targets g on g.id = target_id
     where u.id = unit_id and g.syllabus_id = u.syllabus_id and private.can_write_syllabus(u.syllabus_id)));
create policy course_unit_targets_delete on public.course_unit_targets for delete to authenticated
  using (exists (select 1 from public.course_units u where u.id = unit_id and private.can_write_syllabus(u.syllabus_id)));

create trigger course_syllabi_updated before update on public.course_syllabi for each row execute function private.set_updated_at();
create trigger course_units_updated before update on public.course_units for each row execute function private.set_updated_at();
create trigger course_syllabi_audit after insert or update or delete on public.course_syllabi for each row execute function private.audit_row_change();
create trigger course_syllabus_targets_audit after insert or update or delete on public.course_syllabus_targets for each row execute function private.audit_row_change();
create trigger course_units_audit after insert or update or delete on public.course_units for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- รายวิชาที่ฉันทำงานได้ (ไม่ผ่อน RLS ของ subjects)
create or replace function public.my_course_subjects()
returns table (subject_id uuid, code text, name_th text, name_en text, subject_type text, learning_area text, grade_code text, credits numeric,
               learning_hours int, version_label text, version_status text, effective_year_be int, syllabus_id uuid, syllabus_status text, syllabus_version int)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.code, s.name_th, s.name_en, s.subject_type, la.name_th, g.code, s.credits, s.learning_hours, v.version_label, v.status, v.effective_year_be,
         c.id, c.status, c.version_no
    from public.subjects s
    join public.curriculum_versions v on v.id = s.curriculum_version_id
    left join public.learning_areas la on la.id = s.learning_area_id
    left join public.grade_levels g on g.id = s.grade_level_id
    left join lateral (select c.* from public.course_syllabi c where c.subject_id = s.id order by (c.status = 'retired'), c.version_no desc limit 1) c on true
   where s.school_id = private.current_school_id() and v.status <> 'retired'
     and (private.curriculum_reader_role() or private.teacher_can_work_subject(s.id))
   order by v.effective_year_be desc nulls last, s.code
$$;

-- ---------------------------------------------------------------- เปิด/สร้างคำอธิบายรายวิชา (เปิดของเดิมก่อน)
create or replace function public.course_syllabus_open(p_subject_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subjects;
  v_open uuid;
  v_base public.course_syllabi;
  v_id uuid;
  v_unit record;
  v_new_unit uuid;
begin
  perform private.require_human();
  select * into s from public.subjects where id = p_subject_id and school_id = private.current_school_id();
  if not found then raise exception 'ไม่พบรายวิชา' using errcode = 'insufficient_privilege'; end if;
  if not (private.teacher_can_work_subject(s.id) or private.can_edit_curriculum_area(s.learning_area_id)) then
    raise exception 'คุณไม่มีสิทธิ์จัดทำคำอธิบายรายวิชานี้' using errcode = 'insufficient_privilege';
  end if;
  select id into v_open from public.course_syllabi where subject_id = s.id and status in ('draft', 'submitted', 'returned', 'reviewed');
  if found then return v_open; end if;
  select * into v_base from public.course_syllabi where subject_id = s.id and status = 'approved' order by version_no desc limit 1;
  insert into public.course_syllabi (school_id, subject_id, curriculum_version_id, version_no, owner_teacher_id, based_on_id,
                                     essence, learning_process, expected_skills, assessment_note, competency_ids)
  values (s.school_id, s.id, s.curriculum_version_id,
          coalesce((select max(version_no) from public.course_syllabi where subject_id = s.id), 0) + 1,
          private.my_teacher_id(), v_base.id, v_base.essence, v_base.learning_process, v_base.expected_skills, v_base.assessment_note,
          coalesce(v_base.competency_ids, '{}'))
  returning id into v_id;
  if v_base.id is not null then
    insert into public.course_syllabus_targets (school_id, syllabus_id, indicator_id, learning_outcome_id)
    select s.school_id, v_id, t.indicator_id, t.learning_outcome_id from public.course_syllabus_targets t where t.syllabus_id = v_base.id;
    for v_unit in select * from public.course_units where syllabus_id = v_base.id order by seq loop
      insert into public.course_units (school_id, syllabus_id, seq, title, essence, objectives, hours, max_score, tasks, assessment_methods)
      values (s.school_id, v_id, v_unit.seq, v_unit.title, v_unit.essence, v_unit.objectives, v_unit.hours, v_unit.max_score, v_unit.tasks, v_unit.assessment_methods)
      returning id into v_new_unit;
      insert into public.course_unit_targets (unit_id, target_id, school_id)
      select v_new_unit, nt.id, s.school_id
        from public.course_unit_targets ut join public.course_syllabus_targets ot on ot.id = ut.target_id
        join public.course_syllabus_targets nt on nt.syllabus_id = v_id and nt.indicator_id is not distinct from ot.indicator_id
                                              and nt.learning_outcome_id is not distinct from ot.learning_outcome_id
       where ut.unit_id = v_unit.id;
    end loop;
  end if;
  return v_id;
end $$;

-- ข้อมูลทั้งหมดของคำอธิบายรายวิชา (รวมข้อมูลรายวิชาจากทะเบียน) — สำหรับแบบฟอร์มของครู
create or replace function public.course_syllabus_get(p_syllabus_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r jsonb;
begin
  if not private.can_read_syllabus(p_syllabus_id) then raise exception 'ไม่พบคำอธิบายรายวิชา' using errcode = 'insufficient_privilege'; end if;
  select jsonb_build_object(
    'syllabus', to_jsonb(c) || jsonb_build_object('can_write', private.can_write_syllabus(c.id),
                 'owner_name', (select concat_ws(' ', t.prefix, t.first_name, t.last_name) from public.teachers t where t.id = c.owner_teacher_id)),
    'subject', jsonb_build_object('id', s.id, 'code', s.code, 'name_th', s.name_th, 'name_en', s.name_en, 'subject_type', s.subject_type,
                 'credits', s.credits, 'learning_hours', s.learning_hours, 'description_th', s.description_th, 'source_locator', s.source_locator,
                 'learning_area', la.name_th, 'learning_area_id', la.id, 'grade_code', g.code, 'version_label', v.version_label, 'version_status', v.status,
                 'framework_version_id', v.framework_version_id),
    'outcomes', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'statement_th', o.statement_th, 'kind', o.outcome_kind) order by o.code)
                          from public.subject_learning_outcomes o where o.subject_id = s.id), '[]'),
    'targets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'indicator_id', t.indicator_id, 'learning_outcome_id', t.learning_outcome_id,
                          'code', coalesce(i.full_code, o.code), 'statement_th', coalesce(i.statement_th, o.statement_th),
                          'verified', case when i.id is not null then fv.status = 'published' else null end) order by coalesce(i.full_code, o.code))
                          from public.course_syllabus_targets t left join public.indicators i on i.id = t.indicator_id
                          left join public.framework_versions fv on fv.id = i.framework_version_id
                          left join public.subject_learning_outcomes o on o.id = t.learning_outcome_id
                         where t.syllabus_id = c.id), '[]'),
    'units', coalesce((select jsonb_agg(to_jsonb(u) || jsonb_build_object('target_ids',
                          coalesce((select jsonb_agg(ut.target_id) from public.course_unit_targets ut where ut.unit_id = u.id), '[]')) order by u.seq)
                        from public.course_units u where u.syllabus_id = c.id), '[]'))
    into r
    from public.course_syllabi c join public.subjects s on s.id = c.subject_id
    join public.curriculum_versions v on v.id = s.curriculum_version_id
    left join public.learning_areas la on la.id = s.learning_area_id
    left join public.grade_levels g on g.id = s.grade_level_id
   where c.id = p_syllabus_id;
  return r;
end $$;

-- ---------------------------------------------------------------- Workflow
create or replace function private.notify_users(p_user_ids uuid[], p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (school_id, user_id, kind, title, body, link)
  select private.current_school_id(), u, p_kind, left(p_title, 200), left(p_body, 1000), p_link from unnest(p_user_ids) u where u is not null
$$;

create or replace function public.course_syllabus_transition(p_syllabus_id uuid, p_action text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.course_syllabi;
  s public.subjects;
  v_owner_user uuid;
  v_me uuid := private.my_teacher_id();
  v_is_owner boolean;
  v_new text;
begin
  perform private.require_human();
  select * into c from public.course_syllabi where id = p_syllabus_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบคำอธิบายรายวิชา' using errcode = 'insufficient_privilege'; end if;
  select * into s from public.subjects where id = c.subject_id;
  select t.profile_id into v_owner_user from public.teachers t where t.id = c.owner_teacher_id;
  v_is_owner := c.owner_teacher_id is not null and c.owner_teacher_id = v_me;

  if p_action = 'submit' then
    if not private.can_write_syllabus(c.id) then raise exception 'ส่งตรวจได้เฉพาะผู้จัดทำ เมื่อสถานะร่างหรือส่งแก้ไข' using errcode = 'insufficient_privilege'; end if;
    if not exists (select 1 from public.course_units u where u.syllabus_id = c.id) then raise exception 'ยังไม่มีหน่วยการเรียนรู้ — เพิ่มอย่างน้อย 1 หน่วยก่อนส่งตรวจ'; end if;
    update public.course_syllabi set status = 'submitted', submitted_at = now(), return_note = null where id = c.id;
    perform private.notify_users(array(select r.user_id from public.user_roles r where r.school_id = c.school_id and r.role = 'learning_area_head' and r.learning_area_id = s.learning_area_id),
      'submitted', 'มีคำอธิบายรายวิชารอตรวจ', s.code || ' ' || s.name_th, '/office/curriculum/syllabi');
    v_new := 'submitted';
  elsif p_action in ('review', 'return') and c.status in ('submitted', 'reviewed') then
    if v_is_owner then raise exception 'ผู้จัดทำตรวจงานของตนเองไม่ได้' using errcode = 'insufficient_privilege'; end if;
    if not private.can_edit_curriculum_area(s.learning_area_id) then raise exception 'เฉพาะหัวหน้ากลุ่มสาระหรือผู้ดูแลหลักสูตร' using errcode = 'insufficient_privilege'; end if;
    if p_action = 'return' and length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'กรุณาระบุจุดที่ต้องแก้ไข'; end if;
    v_new := case when p_action = 'return' then 'returned' else 'reviewed' end;
    update public.course_syllabi set status = v_new, reviewed_by = auth.uid(), reviewed_at = now(), return_note = nullif(btrim(coalesce(p_note, '')), '') where id = c.id;
    perform private.notify_users(array[v_owner_user], case when v_new = 'returned' then 'revision_requested' else 'approved' end,
      case when v_new = 'returned' then 'คำอธิบายรายวิชาถูกส่งกลับแก้ไข' else 'หัวหน้ากลุ่มสาระตรวจคำอธิบายรายวิชาแล้ว' end,
      s.code || ' ' || s.name_th || coalesce(' — ' || p_note, ''), '/teacher/courses-plan');
  elsif p_action = 'approve' and c.status in ('submitted', 'reviewed') then
    if v_is_owner then raise exception 'ผู้จัดทำอนุมัติงานของตนเองไม่ได้' using errcode = 'insufficient_privilege'; end if;
    if not private.is_curriculum_admin() then raise exception 'เฉพาะผู้ดูแลหลักสูตรอนุมัติได้' using errcode = 'insufficient_privilege'; end if;
    -- ฉบับที่อนุมัติก่อนหน้าเลิกใช้ (ไม่ลบ)
    update public.course_syllabi set status = 'retired' where subject_id = c.subject_id and status = 'approved' and id <> c.id;
    update public.course_syllabi set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = c.id;
    perform private.notify_users(array[v_owner_user], 'approved', 'คำอธิบายรายวิชาได้รับอนุมัติ', s.code || ' ' || s.name_th, '/teacher/courses-plan');
    v_new := 'approved';
  else
    raise exception 'ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน';
  end if;
  return v_new;
end $$;

-- ---------------------------------------------------------------- ตรวจโครงสร้างรายวิชา
create or replace function public.course_syllabus_check(p_syllabus_id uuid)
returns table (check_code text, status text, message_th text, target text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.course_syllabi;
  s public.subjects;
  v_hours numeric;
  v_score numeric;
  v_total numeric;
  v_n int;
  r record;
begin
  if not private.can_read_syllabus(p_syllabus_id) then raise exception 'ไม่พบคำอธิบายรายวิชา' using errcode = 'insufficient_privilege'; end if;
  select * into c from public.course_syllabi where id = p_syllabus_id;
  select * into s from public.subjects where id = c.subject_id;
  select sum(hours), sum(max_score), count(*) into v_hours, v_score, v_n from public.course_units where syllabus_id = c.id;

  check_code := 'HOURS'; target := 'units';
  if v_n = 0 then status := 'insufficient'; message_th := 'ยังไม่มีหน่วยการเรียนรู้';
  elsif coalesce(v_hours, 0) = s.learning_hours then status := 'ok'; message_th := 'ชั่วโมงรวม ' || v_hours || ' ชั่วโมง ตรงกับรายวิชา';
  else status := 'warning'; message_th := 'ชั่วโมงรวมของหน่วย ' || coalesce(v_hours, 0) || ' ชั่วโมง ไม่ตรงกับรายวิชา ' || s.learning_hours || ' ชั่วโมง (ระบบไม่ปรับค่าให้)'; end if;
  return next;

  -- คะแนนรวม: ใช้เกณฑ์ที่โรงเรียนยืนยันแล้วเท่านั้น (grading_policies.params.total_score)
  select (g.params ->> 'total_score')::numeric into v_total from public.grading_policies g
   where g.school_id = c.school_id and g.curriculum_version_id = c.curriculum_version_id and g.status = 'verified'
     and g.params ? 'total_score' order by g.verified_at desc limit 1;
  check_code := 'SCORE'; target := 'units';
  if v_total is null then status := 'insufficient'; message_th := 'ยังไม่มีเกณฑ์คะแนนรวมที่โรงเรียนยืนยัน — คะแนนรวมของหน่วยตอนนี้ ' || coalesce(v_score, 0);
  elsif coalesce(v_score, 0) = v_total then status := 'ok'; message_th := 'คะแนนรวม ' || v_score || ' ตรงตามเกณฑ์โรงเรียน';
  else status := 'warning'; message_th := 'คะแนนรวมของหน่วย ' || coalesce(v_score, 0) || ' ไม่ตรงกับเกณฑ์โรงเรียน ' || v_total; end if;
  return next;

  check_code := 'TARGETS'; target := 'targets';
  select count(*) into v_n from public.course_syllabus_targets where syllabus_id = c.id;
  if v_n = 0 then status := 'warning'; message_th := 'ยังไม่ได้เลือกมาตรฐาน/ตัวชี้วัดหรือผลการเรียนรู้'; return next; end if;

  for r in select coalesce(i.full_code, o.code) as code from public.course_syllabus_targets t
            left join public.indicators i on i.id = t.indicator_id left join public.subject_learning_outcomes o on o.id = t.learning_outcome_id
           where t.syllabus_id = c.id and not exists (select 1 from public.course_unit_targets ut where ut.target_id = t.id) order by 1 loop
    check_code := 'UNASSIGNED'; status := 'warning'; target := 'units'; message_th := r.code || ' ยังไม่ได้จัดลงหน่วยใด'; return next;
  end loop;
  for r in select coalesce(i.full_code, o.code) as code, string_agg('หน่วยที่ ' || u.seq, ', ' order by u.seq) as units, count(*) as n
             from public.course_syllabus_targets t join public.course_unit_targets ut on ut.target_id = t.id join public.course_units u on u.id = ut.unit_id
             left join public.indicators i on i.id = t.indicator_id left join public.subject_learning_outcomes o on o.id = t.learning_outcome_id
            where t.syllabus_id = c.id group by 1 having count(*) > 1 order by 1 loop
    check_code := 'SHARED'; status := 'info'; target := 'units'; message_th := r.code || ' ใช้ใน ' || r.units; return next;
  end loop;
  for r in select u.seq, u.title, (nullif(btrim(coalesce(u.objectives, '')), '') is null) as no_obj, (nullif(btrim(coalesce(u.assessment_methods, '')), '') is null) as no_assess
             from public.course_units u where u.syllabus_id = c.id order by u.seq loop
    if r.no_obj or r.no_assess then
      check_code := 'UNIT_INCOMPLETE'; status := 'warning'; target := 'unit:' || r.seq;
      message_th := 'หน่วยที่ ' || r.seq || ' ' || r.title || ' ยังไม่มี' || concat_ws(' และ', case when r.no_obj then 'จุดประสงค์' end, case when r.no_assess then 'วิธีประเมิน' end);
      return next;
    end if;
  end loop;
  select count(*) into v_n from public.course_syllabus_targets t join public.indicators i on i.id = t.indicator_id
    join public.framework_versions fv on fv.id = i.framework_version_id where t.syllabus_id = c.id and fv.status <> 'published';
  if v_n > 0 then
    check_code := 'UNVERIFIED'; status := 'warning'; target := 'targets';
    message_th := 'มีตัวชี้วัด ' || v_n || ' ข้อจากกรอบหลักสูตรที่ยังไม่ยืนยัน'; return next;
  end if;
end $$;

revoke all on function public.my_course_subjects(), public.course_syllabus_open(uuid), public.course_syllabus_get(uuid),
  public.course_syllabus_transition(uuid, text, text), public.course_syllabus_check(uuid), private.notify_users(uuid[], text, text, text, text),
  private.syllabus_area(uuid), private.teacher_can_work_subject(uuid), private.can_read_syllabus(uuid), private.can_write_syllabus(uuid) from public, anon;
grant execute on function public.my_course_subjects(), public.course_syllabus_open(uuid), public.course_syllabus_get(uuid),
  public.course_syllabus_transition(uuid, text, text), public.course_syllabus_check(uuid) to authenticated;
grant execute on function private.syllabus_area(uuid), private.teacher_can_work_subject(uuid), private.can_read_syllabus(uuid), private.can_write_syllabus(uuid) to authenticated;
