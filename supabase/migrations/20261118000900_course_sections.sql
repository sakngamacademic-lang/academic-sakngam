-- =============================================================================
-- C2 — Course Sections & Teaching Load (ยังไม่ใช่ระบบจัดตารางสอน)
-- ความสัมพันธ์: ครู (teachers เดิม) → กลุ่มเรียน (course_sections) → การจัดรายวิชา/กิจกรรมของหลักสูตรฉบับที่อนุมัติ
--               → รายวิชา → กลุ่มสาระ · ภาคเรียน (terms เดิม → ปีการศึกษา) · ห้องเรียน (classrooms เดิม) · แผนการเรียน (ผ่าน offering)
-- ภาระงานแยก: จำนวนคาบ/สัปดาห์ · ชั่วโมง/สัปดาห์ · ชั่วโมง/ภาคเรียน · ชั่วโมงกิจกรรม · หน่วยกิต (ข้อมูลประกอบ — ไม่ใช้แทนชั่วโมงสอน)
-- เปิดกลุ่มเรียนได้เฉพาะหลักสูตรฉบับที่อนุมัติ/ใช้งาน (ไม่นำข้อมูลที่ยังไม่ตรวจไปใช้จริง)
-- =============================================================================

alter table public.subject_offerings add constraint subject_offerings_id_version_key unique (id, curriculum_version_id);
alter table public.learning_activities add constraint learning_activities_id_version_key unique (id, curriculum_version_id);

create table public.course_sections (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  subject_offering_id    uuid,
  learning_activity_id   uuid,
  term_id                uuid not null,
  classroom_id           uuid,
  section_label          text check (section_label is null or length(btrim(section_label)) between 1 and 50),
  periods_per_week       smallint check (periods_per_week is null or periods_per_week between 0 and 60),
  minutes_per_period     smallint check (minutes_per_period is null or minutes_per_period between 1 and 240),
  hours_per_week         numeric(5,2) check (hours_per_week is null or hours_per_week >= 0),
  hours_per_term         int check (hours_per_term is null or hours_per_term >= 0),
  status                 text not null default 'planned' check (status in ('planned', 'active', 'cancelled')),
  note                   text,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, school_id),
  check ((subject_offering_id is null) <> (learning_activity_id is null)),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (subject_offering_id, curriculum_version_id) references public.subject_offerings (id, curriculum_version_id) on delete restrict,
  foreign key (learning_activity_id, curriculum_version_id) references public.learning_activities (id, curriculum_version_id) on delete restrict,
  foreign key (term_id, school_id) references public.terms (id, school_id) on delete restrict,
  foreign key (classroom_id, school_id) references public.classrooms (id, school_id) on delete restrict
);
create index course_sections_term_idx on public.course_sections (term_id);
create index course_sections_offering_idx on public.course_sections (subject_offering_id);
create index course_sections_activity_idx on public.course_sections (learning_activity_id);

create table public.course_section_teachers (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  course_section_id  uuid not null,
  teacher_id         uuid not null,
  role               text not null default 'lead' check (role in ('lead', 'co_teacher', 'assistant')),
  -- ส่วนที่ครูคนนี้สอนจริง (สอนร่วม) — null = ใช้ค่าของกลุ่มเรียน
  periods_per_week   smallint check (periods_per_week is null or periods_per_week between 0 and 60),
  hours_per_term     int check (hours_per_term is null or hours_per_term >= 0),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (course_section_id, teacher_id),
  foreign key (course_section_id, school_id) references public.course_sections (id, school_id) on delete cascade,
  foreign key (teacher_id, school_id) references public.teachers (id, school_id) on delete restrict
);
create index course_section_teachers_teacher_idx on public.course_section_teachers (teacher_id);

-- เปิดกลุ่มเรียนได้เฉพาะฉบับที่อนุมัติ/ใช้งาน · ภาคเรียนของ offering ต้องตรงกับภาคเรียนจริง (ถ้า offering ระบุภาค)
create or replace function private.course_section_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text; v_term_no smallint; v_off_term smallint;
begin
  select status into v_status from public.curriculum_versions where id = new.curriculum_version_id;
  if v_status not in ('approved', 'active') then
    raise exception 'เปิดกลุ่มเรียนได้เฉพาะหลักสูตรฉบับที่อนุมัติหรือใช้งานแล้ว' using errcode = 'check_violation';
  end if;
  select term_no into v_term_no from public.terms where id = new.term_id;
  if new.subject_offering_id is not null then
    select term_no into v_off_term from public.subject_offerings where id = new.subject_offering_id;
  else
    select term_no into v_off_term from public.learning_activities where id = new.learning_activity_id;
  end if;
  if v_off_term is not null and v_off_term <> v_term_no then
    raise exception 'ภาคเรียนไม่ตรงกับโครงสร้างหลักสูตร (โครงสร้างระบุภาค %)', v_off_term using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger course_sections_guard before insert or update on public.course_sections
  for each row execute function private.course_section_guard();
revoke all on function private.course_section_guard() from public, anon, authenticated;

alter table public.course_sections enable row level security;
alter table public.course_section_teachers enable row level security;
revoke all on public.course_sections, public.course_section_teachers from anon, authenticated;
grant select, delete on public.course_sections, public.course_section_teachers to authenticated;
grant insert (id, curriculum_version_id, subject_offering_id, learning_activity_id, term_id, classroom_id, section_label, periods_per_week,
  minutes_per_period, hours_per_week, hours_per_term, status, note) on public.course_sections to authenticated;
grant update (classroom_id, section_label, periods_per_week, minutes_per_period, hours_per_week, hours_per_term, status, note) on public.course_sections to authenticated;
grant insert (id, course_section_id, teacher_id, role, periods_per_week, hours_per_term) on public.course_section_teachers to authenticated;
grant update (role, periods_per_week, hours_per_term) on public.course_section_teachers to authenticated;

-- อ่าน: ผู้อ่านหลักสูตร (ฝ่ายวิชาการ/ผู้บริหาร/หัวหน้ากลุ่มสาระ) หรือครูที่อยู่ในกลุ่มเรียนนั้น · เขียน: ฝ่ายวิชาการ
create policy course_sections_select on public.course_sections for select to authenticated
  using (school_id = (select private.current_school_id())
         and ((select private.curriculum_reader_role())
              or exists (select 1 from public.course_section_teachers t where t.course_section_id = course_sections.id and t.teacher_id = (select private.my_teacher_id()))));
create policy course_sections_write on public.course_sections for all to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()))
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));
create policy course_section_teachers_select on public.course_section_teachers for select to authenticated
  using (school_id = (select private.current_school_id())
         and ((select private.curriculum_reader_role()) or teacher_id = (select private.my_teacher_id())));
create policy course_section_teachers_write on public.course_section_teachers for all to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()))
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));

-- ภาระงานต่อครูต่อภาคเรียน — แยกคาบ/ชั่วโมงสอน/ชั่วโมงกิจกรรม/หน่วยกิต (หน่วยกิตเป็นข้อมูลประกอบ ไม่ใช่ชั่วโมงสอน)
create view public.v_teacher_load with (security_invoker = true) as
select t.teacher_id, s.term_id, tm.academic_year_id,
       count(*) filter (where s.subject_offering_id is not null)::int as subject_sections,
       count(*) filter (where s.learning_activity_id is not null)::int as activity_sections,
       sum(coalesce(t.periods_per_week, s.periods_per_week)) filter (where s.subject_offering_id is not null)::int as periods_per_week,
       sum(s.hours_per_week) filter (where s.subject_offering_id is not null) as teaching_hours_per_week,
       sum(coalesce(t.hours_per_term, s.hours_per_term)) filter (where s.subject_offering_id is not null)::int as teaching_hours_per_term,
       sum(coalesce(t.hours_per_term, s.hours_per_term, la.activity_hours)) filter (where s.learning_activity_id is not null)::int as activity_hours_per_term,
       sum(sub.credits) filter (where s.subject_offering_id is not null) as credits_reference,
       count(*) filter (where s.subject_offering_id is not null and coalesce(t.periods_per_week, s.periods_per_week) is null)::int as sections_missing_periods
  from public.course_section_teachers t
  join public.course_sections s on s.id = t.course_section_id and s.status <> 'cancelled'
  join public.terms tm on tm.id = s.term_id
  left join public.subject_offerings o on o.id = s.subject_offering_id
  left join public.subjects sub on sub.id = o.subject_id
  left join public.learning_activities la on la.id = s.learning_activity_id
 group by t.teacher_id, s.term_id, tm.academic_year_id;
grant select on public.v_teacher_load to authenticated;
