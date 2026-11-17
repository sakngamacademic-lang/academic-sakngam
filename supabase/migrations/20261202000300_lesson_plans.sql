-- =============================================================================
-- Phase 4 — แผนการจัดการเรียนรู้ + การส่งตรวจ/อนุมัติ
--  · สร้างจากหน่วยการเรียนรู้ (course_units) — ข้อมูลรายวิชา/ตัวชี้วัด/ชั่วโมงดึงจากทะเบียน ไม่พิมพ์ซ้ำ
--  · คัดลอกแผน = สร้างฉบับใหม่ (copied_from_id) ไม่เขียนทับต้นฉบับ · แนบเอกสารจากคลังเอกสารเดิม (R2 private)
--  · Workflow: ร่าง → ส่งตรวจ → หัวหน้ากลุ่มสาระเห็นชอบ/ส่งกลับ → ผู้ดูแลหลักสูตรอนุมัติ/ส่งกลับ
--    ผู้จัดทำตรวจ/อนุมัติแผนของตนเองไม่ได้ · ความเห็นทุกขั้นเก็บแบบเพิ่มอย่างเดียว · Audit Log
--  · ภาระงานครู (ส่งแผน/คำอธิบายรายวิชา ฯลฯ) ใช้ระบบ tasks เดิม (หมวด lesson_plan / course_syllabus มีอยู่แล้ว)
-- =============================================================================

create table public.lesson_plans (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  subject_id       uuid not null references public.subjects (id) on delete restrict,
  unit_id          uuid references public.course_units (id) on delete restrict,
  teacher_id       uuid not null,
  term_id          uuid references public.terms (id) on delete restrict,
  title            text not null check (length(btrim(title)) between 1 and 300),
  plan_no          int check (plan_no is null or plan_no > 0),
  hours            numeric(5,1) check (hours is null or hours >= 0),
  teaching_model   text check (teaching_model is null or length(teaching_model) <= 200),
  content          jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object' and length(content::text) <= 200000),
  status           text not null default 'draft' check (status in ('draft', 'submitted', 'returned', 'area_approved', 'approved')),
  copied_from_id   uuid references public.lesson_plans (id) on delete restrict,
  submitted_at     timestamptz,
  area_reviewed_by uuid,
  area_reviewed_at timestamptz,
  approved_by      uuid,
  approved_at      timestamptz,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, school_id),
  foreign key (teacher_id, school_id) references public.teachers (id, school_id) on delete restrict,
  check (status <> 'approved' or approved_at is not null)
);
create index lesson_plans_teacher_idx on public.lesson_plans (teacher_id, updated_at desc);
create index lesson_plans_subject_idx on public.lesson_plans (subject_id, status);

create table public.lesson_plan_reviews (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  plan_id     uuid not null,
  stage       text not null check (stage in ('area', 'academic', 'comment')),
  decision    text not null check (decision in ('approve', 'return', 'comment')),
  comment     text check (comment is null or length(comment) <= 4000),
  issues      jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  reviewer_id uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  foreign key (plan_id, school_id) references public.lesson_plans (id, school_id) on delete restrict
);
create table public.lesson_plan_documents (
  plan_id     uuid not null,
  document_id uuid not null,
  school_id   uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (plan_id, document_id),
  foreign key (plan_id, school_id) references public.lesson_plans (id, school_id) on delete cascade,
  foreign key (document_id, school_id) references public.documents (id, school_id) on delete restrict
);

create or replace function private.can_read_plan(p_plan_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lesson_plans p join public.subjects s on s.id = p.subject_id
                  where p.id = p_plan_id and p.school_id = private.current_school_id()
                    and (p.teacher_id = private.my_teacher_id() or private.curriculum_reader_role()
                         or private.can_edit_curriculum_area(s.learning_area_id) or private.teacher_can_work_subject(s.id)))
$$;
create or replace function private.can_write_plan(p_plan_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lesson_plans p where p.id = p_plan_id and p.school_id = private.current_school_id()
                    and p.status in ('draft', 'returned') and p.teacher_id = private.my_teacher_id())
$$;

alter table public.lesson_plans enable row level security;
alter table public.lesson_plan_reviews enable row level security;
alter table public.lesson_plan_documents enable row level security;
revoke all on public.lesson_plans, public.lesson_plan_reviews, public.lesson_plan_documents from anon, authenticated;
grant select on public.lesson_plans, public.lesson_plan_reviews, public.lesson_plan_documents to authenticated;
grant update (title, plan_no, hours, teaching_model, content, term_id) on public.lesson_plans to authenticated;
grant insert, delete on public.lesson_plan_documents to authenticated;
create policy lesson_plans_select on public.lesson_plans for select to authenticated using (private.can_read_plan(id));
create policy lesson_plans_update on public.lesson_plans for update to authenticated using (private.can_write_plan(id)) with check (private.can_write_plan(id));
create policy lesson_plan_reviews_select on public.lesson_plan_reviews for select to authenticated using (private.can_read_plan(plan_id));
create policy lesson_plan_documents_select on public.lesson_plan_documents for select to authenticated using (private.can_read_plan(plan_id));
create policy lesson_plan_documents_insert on public.lesson_plan_documents for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_write_plan(plan_id)
              and exists (select 1 from public.documents d where d.id = document_id and d.owner_teacher_id = private.my_teacher_id()));
create policy lesson_plan_documents_delete on public.lesson_plan_documents for delete to authenticated using (private.can_write_plan(plan_id));
create trigger lesson_plans_updated before update on public.lesson_plans for each row execute function private.set_updated_at();
create trigger lesson_plans_audit after insert or update or delete on public.lesson_plans for each row execute function private.audit_row_change();
create trigger lesson_plan_reviews_audit after insert or update or delete on public.lesson_plan_reviews for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- สร้าง / คัดลอก
create or replace function public.lesson_plan_create(p_subject_id uuid, p_unit_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := private.my_teacher_id();
  u public.course_units;
  v_id uuid;
begin
  perform private.require_human();
  if v_teacher is null then raise exception 'บัญชีนี้ยังไม่ผูกกับทะเบียนครู' using errcode = 'insufficient_privilege'; end if;
  if not private.teacher_can_work_subject(p_subject_id) then raise exception 'คุณไม่ได้สอนหรือไม่ได้อยู่ในกลุ่มสาระของรายวิชานี้' using errcode = 'insufficient_privilege'; end if;
  if p_unit_id is not null then
    select cu.* into u from public.course_units cu join public.course_syllabi c on c.id = cu.syllabus_id where cu.id = p_unit_id and c.subject_id = p_subject_id;
    if not found then raise exception 'หน่วยการเรียนรู้ไม่ตรงกับรายวิชา'; end if;
  end if;
  insert into public.lesson_plans (subject_id, unit_id, teacher_id, title, hours, plan_no)
  values (p_subject_id, p_unit_id, v_teacher, coalesce(nullif(btrim(p_title), ''), u.title, 'แผนการจัดการเรียนรู้'), u.hours,
          (select coalesce(max(plan_no), 0) + 1 from public.lesson_plans where subject_id = p_subject_id and teacher_id = v_teacher))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.lesson_plan_copy(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.lesson_plans;
  v_teacher uuid := private.my_teacher_id();
  v_id uuid;
begin
  perform private.require_human();
  if v_teacher is null then raise exception 'บัญชีนี้ยังไม่ผูกกับทะเบียนครู' using errcode = 'insufficient_privilege'; end if;
  if not private.can_read_plan(p_plan_id) then raise exception 'ไม่พบแผน' using errcode = 'insufficient_privilege'; end if;
  select * into p from public.lesson_plans where id = p_plan_id;
  if not private.teacher_can_work_subject(p.subject_id) then raise exception 'คุณไม่ได้สอนหรือไม่ได้อยู่ในกลุ่มสาระของรายวิชานี้' using errcode = 'insufficient_privilege'; end if;
  insert into public.lesson_plans (subject_id, unit_id, teacher_id, title, plan_no, hours, teaching_model, content, copied_from_id)
  values (p.subject_id, p.unit_id, v_teacher, p.title || ' (สำเนา)', p.plan_no, p.hours, p.teaching_model,
          p.content - 'post_teaching_note', p.id)  -- บันทึกหลังสอนเป็นของครั้งเดิม ไม่คัดลอก
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- Workflow
create or replace function public.lesson_plan_transition(p_plan_id uuid, p_action text, p_comment text default null, p_issues jsonb default '[]'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.lesson_plans;
  s public.subjects;
  v_owner_user uuid;
  v_is_owner boolean;
  v_new text;
  v_has_area_head boolean;
begin
  perform private.require_human();
  select * into p from public.lesson_plans where id = p_plan_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบแผน' using errcode = 'insufficient_privilege'; end if;
  select * into s from public.subjects where id = p.subject_id;
  select t.profile_id into v_owner_user from public.teachers t where t.id = p.teacher_id;
  v_is_owner := p.teacher_id = private.my_teacher_id();
  v_has_area_head := exists (select 1 from public.user_roles r where r.school_id = p.school_id and r.role = 'learning_area_head' and r.learning_area_id = s.learning_area_id);
  if p_action in ('return') and length(btrim(coalesce(p_comment, ''))) = 0 then raise exception 'กรุณาระบุจุดที่ต้องแก้ไข'; end if;

  if p_action = 'submit' then
    if not private.can_write_plan(p.id) then raise exception 'ส่งตรวจได้เฉพาะผู้จัดทำ เมื่อเป็นร่างหรือถูกส่งกลับ' using errcode = 'insufficient_privilege'; end if;
    update public.lesson_plans set status = 'submitted', submitted_at = now() where id = p.id;
    perform private.notify_users(array(select r.user_id from public.user_roles r where r.school_id = p.school_id and r.role = 'learning_area_head' and r.learning_area_id = s.learning_area_id),
      'submitted', 'มีแผนการจัดการเรียนรู้รอตรวจ', s.code || ' ' || p.title, '/office/curriculum/lesson-plans');
    return 'submitted';
  elsif p_action = 'comment' then
    if not (private.can_read_plan(p.id) and (private.can_edit_curriculum_area(s.learning_area_id) or private.curriculum_reader_role())) then
      raise exception 'เฉพาะผู้ตรวจแสดงความคิดเห็นได้' using errcode = 'insufficient_privilege';
    end if;
    insert into public.lesson_plan_reviews (plan_id, stage, decision, comment, issues) values (p.id, 'comment', 'comment', p_comment, coalesce(p_issues, '[]'));
    return p.status;
  end if;

  if v_is_owner then raise exception 'ผู้จัดทำตรวจหรืออนุมัติแผนของตนเองไม่ได้' using errcode = 'insufficient_privilege'; end if;
  if p_action in ('area_approve', 'return') and p.status = 'submitted' then
    if not private.can_edit_curriculum_area(s.learning_area_id) then raise exception 'เฉพาะหัวหน้ากลุ่มสาระของรายวิชานี้' using errcode = 'insufficient_privilege'; end if;
    v_new := case when p_action = 'return' then 'returned' else 'area_approved' end;
    update public.lesson_plans set status = v_new, area_reviewed_by = auth.uid(), area_reviewed_at = now() where id = p.id;
    insert into public.lesson_plan_reviews (plan_id, stage, decision, comment, issues) values (p.id, 'area', case when v_new = 'returned' then 'return' else 'approve' end, p_comment, coalesce(p_issues, '[]'));
  elsif p_action in ('approve', 'return') and (p.status = 'area_approved' or (p.status = 'submitted' and not v_has_area_head)) then
    if not private.is_curriculum_admin() then raise exception 'เฉพาะผู้ดูแลหลักสูตรอนุมัติได้' using errcode = 'insufficient_privilege'; end if;
    v_new := case when p_action = 'return' then 'returned' else 'approved' end;
    update public.lesson_plans set status = v_new, approved_by = case when v_new = 'approved' then auth.uid() end,
           approved_at = case when v_new = 'approved' then now() end where id = p.id;
    insert into public.lesson_plan_reviews (plan_id, stage, decision, comment, issues) values (p.id, 'academic', case when v_new = 'returned' then 'return' else 'approve' end, p_comment, coalesce(p_issues, '[]'));
  else
    raise exception 'ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน';
  end if;
  perform private.notify_users(array[v_owner_user], case when v_new = 'returned' then 'revision_requested' else 'approved' end,
    case v_new when 'returned' then 'แผนการจัดการเรียนรู้ถูกส่งกลับแก้ไข' when 'area_approved' then 'หัวหน้ากลุ่มสาระเห็นชอบแผนแล้ว' else 'แผนการจัดการเรียนรู้ได้รับอนุมัติ' end,
    s.code || ' ' || p.title || coalesce(' — ' || p_comment, ''), '/teacher/lesson-plans');
  return v_new;
end $$;

-- ---------------------------------------------------------------- อ่าน (เติมข้อมูลรายวิชา/หน่วย/ตัวชี้วัดอัตโนมัติ)
create or replace function public.lesson_plan_get(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r jsonb;
begin
  if not private.can_read_plan(p_plan_id) then raise exception 'ไม่พบแผน' using errcode = 'insufficient_privilege'; end if;
  select jsonb_build_object(
    'plan', to_jsonb(p) || jsonb_build_object('can_write', private.can_write_plan(p.id), 'is_owner', p.teacher_id = private.my_teacher_id(),
              'teacher_name', concat_ws(' ', t.prefix, t.first_name, t.last_name),
              'copied_from_title', (select c.title from public.lesson_plans c where c.id = p.copied_from_id)),
    'subject', jsonb_build_object('code', s.code, 'name_th', s.name_th, 'credits', s.credits, 'learning_hours', s.learning_hours, 'grade_code', g.code,
              'learning_area', la.name_th, 'learning_area_id', la.id),
    'unit', case when u.id is null then null else jsonb_build_object('seq', u.seq, 'title', u.title, 'essence', u.essence, 'objectives', u.objectives, 'hours', u.hours) end,
    'targets', coalesce((select jsonb_agg(jsonb_build_object('code', coalesce(i.full_code, o.code), 'statement_th', coalesce(i.statement_th, o.statement_th),
                 'standard', ls.code, 'standard_statement', ls.statement_th) order by coalesce(i.full_code, o.code))
               from public.course_unit_targets ut join public.course_syllabus_targets st on st.id = ut.target_id
               left join public.indicators i on i.id = st.indicator_id left join public.learning_standards ls on ls.id = i.standard_id
               left join public.subject_learning_outcomes o on o.id = st.learning_outcome_id
              where ut.unit_id = u.id), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('stage', rv.stage, 'decision', rv.decision, 'comment', rv.comment, 'issues', rv.issues, 'at', rv.created_at,
                 'reviewer', (select coalesce(pr.display_name, pr.email) from public.profiles pr where pr.id = rv.reviewer_id)) order by rv.created_at)
               from public.lesson_plan_reviews rv where rv.plan_id = p.id), '[]'),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title)) from public.lesson_plan_documents pd join public.documents d on d.id = pd.document_id where pd.plan_id = p.id), '[]'))
    into r
    from public.lesson_plans p join public.subjects s on s.id = p.subject_id join public.teachers t on t.id = p.teacher_id
    left join public.grade_levels g on g.id = s.grade_level_id left join public.learning_areas la on la.id = s.learning_area_id
    left join public.course_units u on u.id = p.unit_id
   where p.id = p_plan_id;
  return r;
end $$;

-- รายการแผน: ของฉัน + คิวตรวจตามสิทธิ์ · ค้นหาตามรายวิชา/ครู
create or replace function public.lesson_plan_list(p_scope text default 'mine', p_search text default null)
returns table (id uuid, title text, plan_no int, status text, subject_code text, subject_name text, teacher_name text, updated_at timestamptz, unit_title text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.title, p.plan_no, p.status, s.code, s.name_th, concat_ws(' ', t.prefix, t.first_name, t.last_name), p.updated_at, u.title
    from public.lesson_plans p join public.subjects s on s.id = p.subject_id join public.teachers t on t.id = p.teacher_id
    left join public.course_units u on u.id = p.unit_id
   where p.school_id = private.current_school_id() and private.can_read_plan(p.id)
     and case p_scope
           when 'mine' then p.teacher_id = private.my_teacher_id()
           when 'review' then p.teacher_id is distinct from private.my_teacher_id()
                and ((p.status = 'submitted' and private.can_edit_curriculum_area(s.learning_area_id))
                     or (p.status = 'area_approved' and private.is_curriculum_admin()))
           else true end
     and (p_search is null or s.code ilike '%' || p_search || '%' or s.name_th ilike '%' || p_search || '%' or p.title ilike '%' || p_search || '%'
          or t.first_name ilike '%' || p_search || '%' or t.last_name ilike '%' || p_search || '%')
   order by p.updated_at desc
   limit 300
$$;

revoke all on function public.lesson_plan_create(uuid, uuid, text), public.lesson_plan_copy(uuid), public.lesson_plan_transition(uuid, text, text, jsonb),
  public.lesson_plan_get(uuid), public.lesson_plan_list(text, text), private.can_read_plan(uuid), private.can_write_plan(uuid) from public, anon;
grant execute on function public.lesson_plan_create(uuid, uuid, text), public.lesson_plan_copy(uuid), public.lesson_plan_transition(uuid, text, text, jsonb),
  public.lesson_plan_get(uuid), public.lesson_plan_list(text, text) to authenticated;
grant execute on function private.can_read_plan(uuid), private.can_write_plan(uuid) to authenticated;
