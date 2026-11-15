-- =============================================================================
-- Assessment Foundation — นักเรียน · ลงทะเบียนเรียน · องค์ประกอบคะแนน · คะแนน · เวลาเรียน · ผลการเรียน
-- หลักการ
-- - เกณฑ์ตัดเกรด / เกณฑ์เวลาเรียน ไม่ hard-code: อยู่ใน grading_policies (แยกตามหลักสูตรฉบับ + ปีการศึกษา)
--   ต้องอ้างเอกสารระเบียบ (source_documents + locator) และยืนยันโดยหัวหน้าฝ่ายวิชาการ (มนุษย์) ก่อนใช้คำนวณ
-- - ไม่มีนโยบายที่ยืนยัน → คำนวณเกรดไม่ได้ (คืน insufficient_data) · ร/มส/ผ/มผ บันทึกได้แต่ต้องมีเหตุผล
-- - ครูบันทึกคะแนน/เวลาเรียนได้เฉพาะกลุ่มเรียนที่ตนสอน · ผลการเรียนต้องได้รับอนุมัติจากหัวหน้าฝ่ายวิชาการ (คนละคนกับผู้ส่ง)
-- - ข้อมูลนักเรียนเป็นข้อมูลส่วนบุคคล: RLS เข้ม + audit ทุกตาราง
-- =============================================================================

create table public.students (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  student_code  text not null check (student_code ~ '^[A-Za-z0-9-]{1,20}$'),
  prefix        text not null check (length(btrim(prefix)) between 1 and 30),
  first_name    text not null check (length(btrim(first_name)) between 1 and 100),
  last_name     text not null check (length(btrim(last_name)) between 1 and 100),
  status        text not null default 'active' check (status in ('active', 'transferred', 'graduated', 'withdrawn')),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (school_id, student_code),
  unique (id, school_id)
);

-- นักเรียนในห้องเรียน (ห้องเรียนผูกปีการศึกษาอยู่แล้ว) — ปีละ 1 ห้อง
create table public.classroom_students (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  classroom_id  uuid not null,
  student_id    uuid not null,
  student_no    smallint check (student_no is null or student_no between 1 and 99),
  created_at    timestamptz not null default now(),
  unique (classroom_id, student_id),
  foreign key (classroom_id, school_id) references public.classrooms (id, school_id) on delete restrict,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete restrict
);

-- ลงทะเบียนเรียนในกลุ่มเรียน (course_sections จาก C2)
create table public.course_enrollments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  course_section_id  uuid not null,
  student_id         uuid not null,
  status             text not null default 'enrolled' check (status in ('enrolled', 'dropped')),
  created_at         timestamptz not null default now(),
  unique (course_section_id, student_id),
  unique (id, school_id),
  foreign key (course_section_id, school_id) references public.course_sections (id, school_id) on delete restrict,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete restrict
);

-- เกณฑ์การวัดผลของโรงเรียน (จากระเบียบ) — แยกตามหลักสูตรฉบับ + ปีการศึกษา
create table public.grading_policies (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  academic_year_id       uuid not null,
  -- {"bands":[{"min":80,"grade":"4"},…], "attendance_min_percent": <ตามระเบียบ หรือไม่ระบุ>}
  params                 jsonb not null,
  source_document_id     uuid,
  source_locator         text check (source_locator is null or private.is_valid_locator(source_locator)),
  status                 text not null default 'draft' check (status in ('draft', 'verified', 'retired')),
  note                   text,
  verified_by            uuid,
  verified_at            timestamptz,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  unique (id, school_id),
  check (status = 'draft' or (source_document_id is not null and source_locator is not null)),
  check ((status = 'verified') = (verified_by is not null) or status = 'retired'),
  check (jsonb_typeof(params -> 'bands') = 'array' and jsonb_array_length(params -> 'bands') > 0),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (academic_year_id, school_id) references public.academic_years (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict
);
create unique index grading_policies_one_verified on public.grading_policies (curriculum_version_id, academic_year_id) where status = 'verified';

create table public.assessment_components (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  course_section_id  uuid not null,
  name               text not null check (length(btrim(name)) between 1 and 150),
  kind               text not null check (kind in ('formative', 'midterm', 'final', 'project', 'other')),
  max_score          numeric(6,2) not null check (max_score > 0),
  sort_order         int not null default 0,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (id, school_id),
  foreign key (course_section_id, school_id) references public.course_sections (id, school_id) on delete restrict
);

create table public.assessment_scores (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  component_id  uuid not null,
  student_id    uuid not null,
  score         numeric(6,2) check (score is null or score >= 0),
  status        text not null default 'recorded' check (status in ('recorded', 'missing', 'absent', 'excused')),
  note          text check (note is null or length(note) <= 500),
  recorded_by   uuid default auth.uid(),
  recorded_at   timestamptz not null default now(),
  unique (component_id, student_id),
  check ((status = 'recorded') = (score is not null)),
  foreign key (component_id, school_id) references public.assessment_components (id, school_id) on delete restrict,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete restrict
);

create table public.attendance_records (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  course_section_id  uuid not null,
  student_id         uuid not null,
  session_date       date not null,
  period_no          smallint not null default 1 check (period_no between 1 and 12),
  status             text not null check (status in ('present', 'late', 'absent', 'leave')),
  recorded_by        uuid default auth.uid(),
  recorded_at        timestamptz not null default now(),
  unique (course_section_id, student_id, session_date, period_no),
  foreign key (course_section_id, school_id) references public.course_sections (id, school_id) on delete restrict,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete restrict
);

create table public.course_grades (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  course_section_id  uuid not null,
  student_id         uuid not null,
  total_score        numeric(7,2),
  max_score          numeric(7,2),
  attendance_percent numeric(5,2),
  grade              text check (grade in ('0', '1', '1.5', '2', '2.5', '3', '3.5', '4', 'ร', 'มส', 'ผ', 'มผ')),
  special_reason     text check (special_reason is null or length(special_reason) <= 500),
  policy_id          uuid,
  status             text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  submitted_by       uuid,
  approved_by        uuid,
  approved_at        timestamptz,
  updated_at         timestamptz not null default now(),
  unique (course_section_id, student_id),
  check (grade not in ('ร', 'มส', 'ผ', 'มผ') or length(btrim(coalesce(special_reason, ''))) >= 3 or policy_id is not null),
  check ((status = 'approved') = (approved_by is not null)),
  foreign key (course_section_id, school_id) references public.course_sections (id, school_id) on delete restrict,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete restrict,
  foreign key (policy_id, school_id) references public.grading_policies (id, school_id) on delete restrict
);

-- ---------------------------------------------------------------- สิทธิ์
create or replace function private.teaches_section(p_section_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.course_section_teachers t where t.course_section_id = p_section_id and t.teacher_id = private.my_teacher_id())
$$;
create or replace function private.can_view_section(p_section_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_sections s
     where s.id = p_section_id and s.school_id = private.current_school_id()
       and (private.is_office_staff() or private.has_role('executive') or private.teaches_section(s.id)
            or (private.has_role('learning_area_head') and exists (
                  select 1 from public.subject_offerings o join public.subjects sub on sub.id = o.subject_id
                   where o.id = s.subject_offering_id and sub.learning_area_id in (select private.my_learning_area_ids())))))
$$;
create or replace function private.can_record_section(p_section_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.course_sections s where s.id = p_section_id and s.school_id = private.current_school_id()
                   and s.status <> 'cancelled' and (private.teaches_section(s.id) or private.is_office_staff()))
$$;
create or replace function private.can_view_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_office_staff() or private.has_role('executive')
      or exists (select 1 from public.course_enrollments e where e.student_id = p_student_id and private.can_view_section(e.course_section_id))
$$;
revoke all on function private.teaches_section(uuid), private.can_view_section(uuid), private.can_record_section(uuid), private.can_view_student(uuid) from public, anon;
grant execute on function private.teaches_section(uuid), private.can_view_section(uuid), private.can_record_section(uuid), private.can_view_student(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['students', 'classroom_students', 'course_enrollments', 'grading_policies', 'assessment_components',
                           'assessment_scores', 'attendance_records', 'course_grades'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.audit_row_change()', t);
  end loop;
end;
$$;

-- นักเรียน / ห้องเรียน / ลงทะเบียน: ฝ่ายวิชาการเขียน · อ่านตามสิทธิ์
grant insert (id, student_code, prefix, first_name, last_name, status) on public.students to authenticated;
grant update (prefix, first_name, last_name, status) on public.students to authenticated;
create policy students_select on public.students for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_view_student(id));
create policy students_write on public.students for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));
create policy students_update on public.students for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()))
  with check (school_id = (select private.current_school_id()));

grant insert (id, classroom_id, student_id, student_no), delete on public.classroom_students to authenticated;
create policy classroom_students_select on public.classroom_students for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_view_student(student_id));
create policy classroom_students_write on public.classroom_students for all to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()))
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));

grant insert (id, course_section_id, student_id, status), update (status) on public.course_enrollments to authenticated;
create policy course_enrollments_select on public.course_enrollments for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_view_section(course_section_id));
create policy course_enrollments_write on public.course_enrollments for all to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()))
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));

-- เกณฑ์: ฝ่ายวิชาการร่าง · ยืนยันผ่าน RPC (หัวหน้าฝ่ายวิชาการ)
grant insert (id, curriculum_version_id, academic_year_id, params, source_document_id, source_locator, note) on public.grading_policies to authenticated;
grant update (params, source_document_id, source_locator, note) on public.grading_policies to authenticated;
create policy grading_policies_select on public.grading_policies for select to authenticated
  using (school_id = (select private.current_school_id()));
create policy grading_policies_insert on public.grading_policies for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));
create policy grading_policies_update on public.grading_policies for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()) and status = 'draft')
  with check (school_id = (select private.current_school_id()) and status = 'draft');

-- องค์ประกอบ / คะแนน / เวลาเรียน: ครูผู้สอนกลุ่มนั้น (หรือฝ่ายวิชาการ) · ผลที่อนุมัติแล้วล็อก
grant insert (id, course_section_id, name, kind, max_score, sort_order), update (name, kind, max_score, sort_order), delete on public.assessment_components to authenticated;
create policy assessment_components_select on public.assessment_components for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_view_section(course_section_id));
create policy assessment_components_write on public.assessment_components for all to authenticated
  using (school_id = (select private.current_school_id()) and private.can_record_section(course_section_id))
  with check (school_id = (select private.current_school_id()) and private.can_record_section(course_section_id));

grant insert (id, component_id, student_id, score, status, note), update (score, status, note) on public.assessment_scores to authenticated;
create policy assessment_scores_select on public.assessment_scores for select to authenticated
  using (school_id = (select private.current_school_id())
         and exists (select 1 from public.assessment_components c where c.id = component_id and private.can_view_section(c.course_section_id)));
create policy assessment_scores_write on public.assessment_scores for all to authenticated
  using (school_id = (select private.current_school_id())
         and exists (select 1 from public.assessment_components c where c.id = component_id and private.can_record_section(c.course_section_id)))
  with check (school_id = (select private.current_school_id())
         and exists (select 1 from public.assessment_components c join public.course_enrollments e on e.course_section_id = c.course_section_id
                      where c.id = component_id and e.student_id = assessment_scores.student_id and e.status = 'enrolled'
                        and private.can_record_section(c.course_section_id)));

grant insert (id, course_section_id, student_id, session_date, period_no, status), update (status) on public.attendance_records to authenticated;
create policy attendance_select on public.attendance_records for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_view_section(course_section_id));
create policy attendance_write on public.attendance_records for all to authenticated
  using (school_id = (select private.current_school_id()) and private.can_record_section(course_section_id))
  with check (school_id = (select private.current_school_id()) and private.can_record_section(course_section_id)
              and exists (select 1 from public.course_enrollments e where e.course_section_id = attendance_records.course_section_id
                            and e.student_id = attendance_records.student_id and e.status = 'enrolled'));

create policy course_grades_select on public.course_grades for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_view_section(course_section_id));

-- คะแนน/เวลาเรียนของกลุ่มที่ผลการเรียนอนุมัติแล้ว → แก้ไม่ได้
create or replace function private.assessment_lock_after_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_section uuid;
begin
  if tg_table_name = 'assessment_scores' then
    select c.course_section_id into v_section from public.assessment_components c where c.id = coalesce(new.component_id, old.component_id);
  elsif tg_table_name = 'assessment_components' then
    v_section := coalesce(new.course_section_id, old.course_section_id);
  else
    v_section := coalesce(new.course_section_id, old.course_section_id);
  end if;
  if exists (select 1 from public.course_grades g where g.course_section_id = v_section and g.status = 'approved') then
    raise exception 'ผลการเรียนของกลุ่มเรียนนี้อนุมัติแล้ว — แก้คะแนน/เวลาเรียนไม่ได้' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function private.assessment_lock_after_approval() from public, anon, authenticated;
create trigger assessment_components_lock before insert or update or delete on public.assessment_components for each row execute function private.assessment_lock_after_approval();
create trigger assessment_scores_lock before insert or update or delete on public.assessment_scores for each row execute function private.assessment_lock_after_approval();
create trigger attendance_records_lock before insert or update or delete on public.attendance_records for each row execute function private.assessment_lock_after_approval();

-- ---------------------------------------------------------------- RPC
create or replace function public.grading_policy_verify(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.grading_policies;
begin
  perform private.require_human();
  if not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการยืนยันเกณฑ์การวัดผลได้' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.grading_policies where id = p_id and school_id = private.current_school_id() for update;
  if not found or v.status <> 'draft' then raise exception 'ยืนยันได้เฉพาะเกณฑ์ร่าง'; end if;
  if v.source_document_id is null or v.source_locator is null then raise exception 'ต้องอ้างเอกสารระเบียบและหน้าก่อนยืนยัน'; end if;
  update public.grading_policies set status = 'verified', verified_by = auth.uid(), verified_at = now() where id = p_id;
end $$;

/** คำนวณผลการเรียนร่าง — ใช้เกณฑ์ที่ยืนยันแล้วเท่านั้น · ไม่มีเกณฑ์ = insufficient_data · ไม่เขียนทับเกรดพิเศษที่ครูกำหนดพร้อมเหตุผล */
create or replace function public.course_grades_compute(p_section_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sec public.course_sections;
  v_pol public.grading_policies;
  v_year uuid;
  v_n int := 0;
  r record;
  v_pct numeric;
  v_grade text;
begin
  perform private.require_human();
  select * into v_sec from public.course_sections where id = p_section_id and school_id = private.current_school_id();
  if not found or not private.can_record_section(p_section_id) then
    raise exception 'คุณไม่มีสิทธิ์บันทึกผลของกลุ่มเรียนนี้' using errcode = 'insufficient_privilege';
  end if;
  select academic_year_id into v_year from public.terms where id = v_sec.term_id;
  select * into v_pol from public.grading_policies
   where curriculum_version_id = v_sec.curriculum_version_id and academic_year_id = v_year and status = 'verified';
  if not found then
    return jsonb_build_object('status', 'insufficient_data', 'reason', 'ยังไม่มีเกณฑ์การวัดผลที่ยืนยันสำหรับหลักสูตรฉบับนี้และปีการศึกษานี้');
  end if;
  for r in
    select e.student_id,
           (select sum(s.score) from public.assessment_scores s join public.assessment_components c on c.id = s.component_id
             where c.course_section_id = p_section_id and s.student_id = e.student_id and s.status = 'recorded') as total,
           (select sum(c.max_score) from public.assessment_components c where c.course_section_id = p_section_id) as max_total,
           (select round(100.0 * count(*) filter (where a.status in ('present', 'late')) / nullif(count(*), 0), 2)
              from public.attendance_records a where a.course_section_id = p_section_id and a.student_id = e.student_id) as att
      from public.course_enrollments e where e.course_section_id = p_section_id and e.status = 'enrolled'
  loop
    v_pct := case when r.max_total > 0 and r.total is not null then 100.0 * r.total / r.max_total end;
    v_grade := null;
    if (v_pol.params ? 'attendance_min_percent') and r.att is not null and r.att < (v_pol.params ->> 'attendance_min_percent')::numeric then
      v_grade := 'มส';
    elsif v_pct is not null then
      select b ->> 'grade' into v_grade from jsonb_array_elements(v_pol.params -> 'bands') b
       where v_pct >= (b ->> 'min')::numeric order by (b ->> 'min')::numeric desc limit 1;
    end if;
    insert into public.course_grades (school_id, course_section_id, student_id, total_score, max_score, attendance_percent, grade, policy_id, status)
    values (v_sec.school_id, p_section_id, r.student_id, r.total, r.max_total, r.att, v_grade, v_pol.id, 'draft')
    on conflict (course_section_id, student_id) do update
      set total_score = excluded.total_score, max_score = excluded.max_score, attendance_percent = excluded.attendance_percent,
          grade = case when public.course_grades.special_reason is not null then public.course_grades.grade else excluded.grade end,
          policy_id = excluded.policy_id, updated_at = now()
      where public.course_grades.status = 'draft';
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('status', 'computed', 'students', v_n, 'policy_id', v_pol.id);
end $$;

create or replace function public.course_grades_submit(p_section_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform private.require_human();
  if not private.can_record_section(p_section_id) then raise exception 'คุณไม่มีสิทธิ์ส่งผลการเรียนของกลุ่มนี้' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.course_grades where course_section_id = p_section_id and status = 'draft' and grade is null) then
    raise exception 'ยังมีนักเรียนที่ไม่มีผลการเรียน — ตรวจคะแนน/เวลาเรียนก่อนส่ง';
  end if;
  update public.course_grades set status = 'submitted', submitted_by = auth.uid(), updated_at = now()
   where course_section_id = p_section_id and status = 'draft';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.course_grades_approve(p_section_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform private.require_human();
  if not private.has_role('academic_head') then raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการอนุมัติผลการเรียน' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.course_grades where course_section_id = p_section_id and submitted_by = auth.uid()) then
    raise exception 'อนุมัติผลการเรียนที่ตนเองส่งไม่ได้' using errcode = 'insufficient_privilege';
  end if;
  update public.course_grades set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
   where course_section_id = p_section_id and status = 'submitted' and school_id = private.current_school_id();
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'ไม่มีผลการเรียนที่รออนุมัติ'; end if;
  return v_n;
end $$;

/** บันทึกผลพิเศษ (ร/มส/ผ/มผ) โดยครูผู้สอน — ต้องมีเหตุผล · ใช้เมื่อระเบียบโรงเรียนกำหนด */
create or replace function public.course_grade_set_special(p_section_id uuid, p_student_id uuid, p_grade text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_human();
  if not private.can_record_section(p_section_id) then raise exception 'คุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege'; end if;
  if p_grade not in ('ร', 'มส', 'ผ', 'มผ') then raise exception 'ผลพิเศษต้องเป็น ร / มส / ผ / มผ'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'ต้องระบุเหตุผล'; end if;
  insert into public.course_grades (school_id, course_section_id, student_id, grade, special_reason, status)
  select s.school_id, s.id, p_student_id, p_grade, btrim(p_reason), 'draft' from public.course_sections s
   where s.id = p_section_id and exists (select 1 from public.course_enrollments e where e.course_section_id = s.id and e.student_id = p_student_id)
  on conflict (course_section_id, student_id) do update set grade = excluded.grade, special_reason = excluded.special_reason, updated_at = now()
    where public.course_grades.status = 'draft';
  if not found then raise exception 'นักเรียนไม่ได้ลงทะเบียนในกลุ่มนี้ หรือผลการเรียนส่งแล้ว'; end if;
end $$;

revoke all on function public.grading_policy_verify(uuid), public.course_grades_compute(uuid), public.course_grades_submit(uuid),
  public.course_grades_approve(uuid), public.course_grade_set_special(uuid, uuid, text, text) from public, anon;
grant execute on function public.grading_policy_verify(uuid), public.course_grades_compute(uuid), public.course_grades_submit(uuid),
  public.course_grades_approve(uuid), public.course_grade_set_special(uuid, uuid, text, text) to authenticated;

-- ภาพรวมกลุ่มเรียน (งานค้าง / เสี่ยง) — อ่านตาม RLS ผู้เรียก · ไม่มีเกณฑ์เสี่ยงที่ hard-code (แสดงข้อเท็จจริง)
create view public.v_section_student_progress with (security_invoker = true) as
select e.course_section_id, e.student_id,
       count(c.id) as components,
       count(s.id) filter (where s.status = 'recorded') as recorded,
       count(c.id) - count(s.id) filter (where s.status in ('recorded', 'excused')) as pending_work,
       sum(s.score) filter (where s.status = 'recorded') as total_score,
       sum(c.max_score) as max_score,
       (select round(100.0 * count(*) filter (where a.status in ('present', 'late')) / nullif(count(*), 0), 2)
          from public.attendance_records a where a.course_section_id = e.course_section_id and a.student_id = e.student_id) as attendance_percent
  from public.course_enrollments e
  left join public.assessment_components c on c.course_section_id = e.course_section_id
  left join public.assessment_scores s on s.component_id = c.id and s.student_id = e.student_id
 where e.status = 'enrolled'
 group by e.course_section_id, e.student_id;
grant select on public.v_section_student_progress to authenticated;
