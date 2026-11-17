-- =============================================================================
-- Phase 5 — กิจกรรมพัฒนาผู้เรียนรายปี · ข้อมูลส่งตารางสอน · ข้อมูลเล่มหลักสูตร · Dashboard ฝ่ายวิชาการ
--  · กิจกรรม: ครูผู้รับผิดชอบ ชั่วโมง เกณฑ์ประเมิน — ไม่มีเกณฑ์ผ่านเริ่มต้น (ต้องอ้างนโยบาย/เอกสารโรงเรียน)
--  · ตารางสอน: ใช้ course_sections เดิม — จำนวนคาบต่อสัปดาห์เป็นค่าที่ฝ่ายวิชาการกรอก (ระบบไม่คำนวณจากหน่วยกิต)
--  · เล่มหลักสูตร: อ่านข้อมูลที่มีจริง แยกสถานะอนุมัติ/ร่าง — ไม่สร้างข้อความประกาศหรือชื่อผู้ลงนาม
--  · Dashboard: นับจากข้อมูลจริงเท่านั้น
-- =============================================================================

create table public.activity_groups (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  academic_year_id      uuid not null,
  term_id               uuid references public.terms (id) on delete restrict,
  learning_activity_id  uuid references public.learning_activities (id) on delete restrict,
  kind                  text not null check (kind in ('guidance', 'scout', 'club', 'social_service', 'other')),
  name_th               text not null check (length(btrim(name_th)) between 1 and 200),
  teacher_id            uuid,
  hours                 numeric(5,1) check (hours is null or hours >= 0),
  criteria_note         text check (criteria_note is null or length(criteria_note) <= 4000),
  policy_document_id    uuid,
  policy_locator        text check (policy_locator is null or private.is_valid_locator(policy_locator)),
  status                text not null default 'planned' check (status in ('planned', 'active', 'closed', 'cancelled')),
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, school_id),
  foreign key (academic_year_id, school_id) references public.academic_years (id, school_id) on delete restrict,
  foreign key (teacher_id, school_id) references public.teachers (id, school_id) on delete restrict,
  foreign key (policy_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  check ((policy_document_id is null) = (policy_locator is null))
);
alter table public.activity_groups enable row level security;
revoke all on public.activity_groups from anon, authenticated;
grant select, insert, update on public.activity_groups to authenticated;
create policy activity_groups_select on public.activity_groups for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_member()));
create policy activity_groups_insert on public.activity_groups for insert to authenticated
  with check (school_id = (select private.current_school_id()) and ((select private.is_office_staff()) or (select private.is_curriculum_admin())));
create policy activity_groups_update on public.activity_groups for update to authenticated
  using (school_id = (select private.current_school_id()) and ((select private.is_office_staff()) or (select private.is_curriculum_admin())))
  with check (school_id = (select private.current_school_id()));
create trigger activity_groups_updated before update on public.activity_groups for each row execute function private.set_updated_at();
create trigger activity_groups_audit after insert or update or delete on public.activity_groups for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- ข้อมูลส่งตารางสอน (อ่านผ่าน RLS ของผู้เรียก · ใช้เป็น API ได้ที่ /rest/v1/v_timetable_feed)
create view public.v_timetable_feed with (security_invoker = true) as
select cs.id as course_section_id, ay.year_be as academic_year_be, t.term_no, cv.version_label as curriculum_version,
       sp.code as program_code, sp.name_th as program_name, g.code as grade_code,
       case when c.id is null then null else g.name_th || '/' || c.room_no end as classroom,
       coalesce(s.code, 'กิจกรรม') as subject_code, coalesce(s.name_th, la.name_th) as subject_name, s.subject_type,
       cs.section_label, cs.periods_per_week, cs.minutes_per_period, cs.hours_per_week, cs.hours_per_term,
       (select string_agg(concat_ws(' ', tt.prefix, tt.first_name, tt.last_name), ', ' order by ct.role, tt.first_name)
          from public.course_section_teachers ct join public.teachers tt on tt.id = ct.teacher_id where ct.course_section_id = cs.id) as teachers,
       cs.status,
       array_remove(array[
         case when cs.periods_per_week is null then 'ยังไม่กำหนดจำนวนคาบต่อสัปดาห์' end,
         case when not exists (select 1 from public.course_section_teachers ct where ct.course_section_id = cs.id) then 'ยังไม่มีครูผู้สอน' end,
         case when cs.classroom_id is null then 'ยังไม่ระบุห้องเรียน' end], null) as missing
  from public.course_sections cs
  join public.terms t on t.id = cs.term_id
  join public.academic_years ay on ay.id = t.academic_year_id
  join public.curriculum_versions cv on cv.id = cs.curriculum_version_id
  left join public.subject_offerings o on o.id = cs.subject_offering_id
  left join public.subjects s on s.id = o.subject_id
  left join public.learning_activities la on la.id = cs.learning_activity_id
  left join public.study_programs sp on sp.id = coalesce(o.study_program_id, la.study_program_id)
  left join public.classrooms c on c.id = cs.classroom_id
  left join public.grade_levels g on g.id = coalesce(o.grade_level_id, la.grade_level_id, c.grade_level_id)
 where cs.status <> 'cancelled';
revoke all on public.v_timetable_feed from anon, authenticated;
grant select on public.v_timetable_feed to authenticated;

-- ---------------------------------------------------------------- ข้อมูลเล่มหลักสูตร (เฉพาะข้อมูลที่มีในระบบ · ระบุสถานะทุกส่วน)
create or replace function public.curriculum_book_data(p_version_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'version', jsonb_build_object('label', v.version_label, 'status', v.status, 'effective_year_be', v.effective_year_be, 'approved_at', v.approved_at,
               'announcement', (select jsonb_build_object('register_code', d.register_code, 'title', d.title, 'locator', v.announcement_locator)
                                  from public.source_documents d where d.id = v.announcement_source_id)),
    'curriculum_name', (select sc.name_th from public.school_curricula sc where sc.id = v.school_curriculum_id),
    'competencies', coalesce((select jsonb_agg(jsonb_build_object('kind', fc.kind, 'code', fc.code, 'name_th', fc.name_th, 'citation', fc.source_citation) order by fc.kind, fc.code)
                     from public.framework_competencies fc where fc.framework_version_id = v.framework_version_id), '[]'),
    'framework', (select jsonb_build_object('label', fv.version_label, 'status', fv.status) from public.framework_versions fv where fv.id = v.framework_version_id),
    'programs', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'name_th', p.name_th, 'stage', p.stage) order by p.code)
                 from public.study_programs p where p.curriculum_version_id = v.id), '[]'),
    'structure', coalesce((select jsonb_agg(to_jsonb(x)) from public.curriculum_structure_summary(v.id) x), '[]'),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'name_th', s.name_th, 'type', s.subject_type, 'credits', s.credits, 'hours', s.learning_hours,
                   'area', la.name_th, 'grade', g.code, 'description_th', s.description_th,
                   'syllabus', (select jsonb_build_object('status', c.status, 'version_no', c.version_no, 'essence', c.essence,
                                  'units', (select jsonb_agg(jsonb_build_object('seq', u.seq, 'title', u.title, 'hours', u.hours, 'max_score', u.max_score) order by u.seq)
                                             from public.course_units u where u.syllabus_id = c.id))
                                from public.course_syllabi c where c.subject_id = s.id and c.status <> 'retired' order by (c.status = 'approved') desc, c.version_no desc limit 1))
                   order by la.sort_order, s.code)
                 from public.subjects s left join public.learning_areas la on la.id = s.learning_area_id left join public.grade_levels g on g.id = s.grade_level_id
                where s.curriculum_version_id = v.id), '[]'),
    'activities', coalesce((select jsonb_agg(jsonb_build_object('type', a.activity_type, 'name_th', a.name_th, 'hours', a.activity_hours, 'grade', g.code, 'locator', a.source_locator) order by g.level_order, a.name_th)
                   from public.learning_activities a left join public.grade_levels g on g.id = a.grade_level_id where a.curriculum_version_id = v.id), '[]'),
    'grading', (select jsonb_build_object('status', gp.status, 'note', gp.note) from public.grading_policies gp where gp.curriculum_version_id = v.id order by (gp.status = 'verified') desc, gp.created_at desc limit 1),
    'open_conflicts', (select count(*) from public.source_conflicts sc where sc.school_id = v.school_id and sc.status <> 'resolved'))
  from public.curriculum_versions v where v.id = p_version_id
$$;

-- ---------------------------------------------------------------- Dashboard ฝ่ายวิชาการ (นับจากข้อมูลจริง)
create or replace function public.academic_readiness_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_school uuid := private.current_school_id();
begin
  if not private.curriculum_reader_role() then raise exception 'เฉพาะฝ่ายวิชาการและผู้บริหาร' using errcode = 'insufficient_privilege'; end if;
  return jsonb_build_object(
    'versions', coalesce((select jsonb_agg(jsonb_build_object('label', v.version_label, 'year', v.effective_year_be, 'status', v.status,
                    'subjects', (select count(*) from public.subjects s where s.curriculum_version_id = v.id),
                    'offerings', (select count(*) from public.subject_offerings o where o.curriculum_version_id = v.id),
                    'framework_linked', v.framework_version_id is not null) order by v.effective_year_be desc nulls last)
                  from public.curriculum_versions v where v.school_id = v_school and v.status <> 'retired'), '[]'),
    'framework', coalesce((select jsonb_agg(jsonb_build_object('label', fv.version_label, 'status', fv.status, 'is_complete', fv.is_complete,
                    'standards', (select count(*) from public.learning_standards ls where ls.framework_version_id = fv.id),
                    'indicators', (select count(*) from public.indicators i where i.framework_version_id = fv.id))) from public.framework_versions fv), '[]'),
    'analysis_pending', (select count(*) from public.document_analysis_items i where i.school_id = v_school and i.status in ('extracted', 'insufficient') and i.item_type in ('standard', 'indicator')),
    'syllabi', (select coalesce(jsonb_object_agg(status, n), '{}') from (select c.status, count(*) n from public.course_syllabi c where c.school_id = v_school group by 1) x),
    'syllabi_by_area', coalesce((select jsonb_agg(jsonb_build_object('area', la.name_th, 'pending', x.pending, 'approved', x.approved)) from (
                    select s.learning_area_id, count(*) filter (where c.status in ('submitted', 'reviewed')) pending, count(*) filter (where c.status = 'approved') approved
                      from public.course_syllabi c join public.subjects s on s.id = c.subject_id where c.school_id = v_school group by 1) x
                    join public.learning_areas la on la.id = x.learning_area_id), '[]'),
    'plans', (select coalesce(jsonb_object_agg(status, n), '{}') from (select p.status, count(*) n from public.lesson_plans p where p.school_id = v_school group by 1) x),
    'tasks_open', (select count(*) from public.task_assignments a join public.tasks t on t.id = a.task_id
                    where a.school_id = v_school and t.status = 'published' and a.status not in ('approved', 'cancelled')),
    'conflicts_open', (select count(*) from public.source_conflicts sc where sc.school_id = v_school and sc.status <> 'resolved'),
    'timetable', (select jsonb_build_object('sections', count(*), 'ready', count(*) filter (where cardinality(missing) = 0)) from public.v_timetable_feed),
    'activity_groups', (select count(*) from public.activity_groups g where g.school_id = v_school and g.status <> 'cancelled'));
end $$;

revoke all on function public.curriculum_book_data(uuid), public.academic_readiness_summary() from public, anon;
grant execute on function public.curriculum_book_data(uuid), public.academic_readiness_summary() to authenticated;
