-- =============================================================================
-- Phase 1.7 — มอบหมายภาระงาน (Academic Task Assignment)
-- ตาม PHASE-0.md §6: tasks (draft → published → closed | cancelled) และ
-- task_assignments (assigned → submitted → approved | revision_requested, assigned/revision_requested → cancelled)
-- - หนึ่งงาน : หลายครู · หนึ่งครู : หลายงาน · unique (task_id, teacher_id) กันมอบหมายซ้ำ
-- - "เลยกำหนด" คำนวณจาก due_at (ไม่เก็บเป็นสถานะ)
-- - สถานะเปลี่ยนผ่าน RPC เท่านั้น · ไม่มี DELETE · ยกเลิกแล้วประวัติยังอยู่
-- - แม่แบบเอกสารใช้ documents/files ของ Phase 1.6 (kind = 'task_template') ผ่าน Storage Adapter เดิม
-- =============================================================================

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  term_id           uuid,
  learning_area_id  uuid,
  title             text not null,
  description       text not null default '',
  category          text not null default 'general',
  starts_at         timestamptz not null default now(),
  due_at            timestamptz not null,
  allowed_exts      text[] not null default array['pdf', 'doc', 'docx'],
  max_files         int not null default 1,
  status            text not null default 'draft',
  created_by        uuid default auth.uid(),
  published_by      uuid,
  published_at      timestamptz,
  cancelled_by      uuid,
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tasks_id_school_key unique (id, school_id),
  constraint tasks_term_fkey foreign key (term_id, school_id) references public.terms (id, school_id) on delete restrict,
  constraint tasks_learning_area_fkey foreign key (learning_area_id, school_id)
    references public.learning_areas (id, school_id) on delete restrict,
  constraint tasks_title_len check (length(btrim(title)) between 1 and 200),
  constraint tasks_description_len check (length(description) <= 5000),
  constraint tasks_category_check check (category in (
    'lesson_plan', 'post_teaching_record', 'course_syllabus', 'classroom_research', 'assessment_report', 'general'
  )),
  constraint tasks_dates_order check (due_at > starts_at),
  constraint tasks_allowed_exts check (
    cardinality(allowed_exts) between 1 and 5 and allowed_exts <@ array['pdf', 'doc', 'docx', 'xls', 'xlsx']
  ),
  constraint tasks_max_files_range check (max_files between 1 and 10),
  constraint tasks_status_check check (status in ('draft', 'published', 'closed', 'cancelled')),
  constraint tasks_published_meta check (status = 'draft' or status = 'cancelled' or published_at is not null),
  constraint tasks_cancel_meta check ((status = 'cancelled') = (cancelled_at is not null))
);
comment on table public.tasks is 'ภาระงานที่ฝ่ายวิชาการมอบหมาย — learning_area_id = งานของกลุ่มสาระ (null = งานระดับโรงเรียน)';
create index tasks_school_status_idx on public.tasks (school_id, status, due_at);
create index tasks_learning_area_idx on public.tasks (learning_area_id) where learning_area_id is not null;

create table public.task_assignments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  task_id            uuid not null,
  teacher_id         uuid not null,
  status             text not null default 'assigned',
  current_version    int not null default 0,
  last_submitted_at  timestamptz,
  assigned_by        uuid default auth.uid(),
  assigned_at        timestamptz not null default now(),
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint task_assignments_id_school_key unique (id, school_id),
  constraint task_assignments_unique unique (task_id, teacher_id),
  constraint task_assignments_task_fkey foreign key (task_id, school_id) references public.tasks (id, school_id) on delete restrict,
  constraint task_assignments_teacher_fkey foreign key (teacher_id, school_id) references public.teachers (id, school_id) on delete restrict,
  constraint task_assignments_status_check check (status in ('assigned', 'submitted', 'revision_requested', 'approved', 'cancelled')),
  constraint task_assignments_cancel_meta check ((status = 'cancelled') = (cancelled_at is not null))
);
comment on table public.task_assignments is 'การมอบหมายงานรายครู — 1 ครูต่อ 1 งาน (กันซ้ำ)';
create index task_assignments_teacher_idx on public.task_assignments (teacher_id, status);

create table public.assignment_events (
  id             bigint generated always as identity primary key,
  school_id      uuid references public.schools (id) on delete set null,
  task_id        uuid not null,
  assignment_id  uuid,
  event          text not null,
  from_status    text,
  to_status      text,
  actor_id       uuid default auth.uid(),
  detail         jsonb,
  created_at     timestamptz not null default now(),
  constraint assignment_events_event_check check (event in (
    'task_published', 'task_cancelled', 'assigned', 'assignment_cancelled'
  ))
);
comment on table public.assignment_events is 'timeline ของงานและการมอบหมาย (append-only) — การแก้ไขเนื้อหางานอยู่ใน audit_logs';
create index assignment_events_task_idx on public.assignment_events (task_id, created_at);
create index assignment_events_assignment_idx on public.assignment_events (assignment_id) where assignment_id is not null;

create trigger assignment_events_no_update_delete before update or delete on public.assignment_events
  for each row execute function private.prevent_audit_mutation();

do $$
declare t text;
begin
  foreach t in array array['tasks', 'task_assignments'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I
                    for each row execute function private.set_updated_at()', t);
    execute format('create trigger %1$s_lock_columns before update on public.%1$I
                    for each row execute function private.lock_columns_after_insert()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function private.audit_row_change()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- helpers สิทธิ์
create or replace function private.can_manage_task_scope(p_learning_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- coalesce: งานระดับโรงเรียน (learning_area_id = null) ต้องได้ false ไม่ใช่ null (กัน "not null" หลุดใน RPC)
  select coalesce(private.is_office_staff()
      or (private.has_role('learning_area_head') and p_learning_area_id in (select private.my_learning_area_ids())), false)
$$;

create or replace function private.can_manage_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks k
    where k.id = p_task_id and k.school_id = private.current_school_id()
      and private.can_manage_task_scope(k.learning_area_id)
  )
$$;

-- ใครเห็นงาน: ฝ่ายวิชาการ + ผู้บริหาร (อ่าน) ทั้งหมด · หัวหน้ากลุ่มสาระ: งานของกลุ่มตน หรืองานที่มอบให้ครูในกลุ่มตน
-- · ครู: เฉพาะงานที่เผยแพร่และมอบหมายให้ตนเอง
-- ประเมินจากค่าคอลัมน์ของแถว (ใช้ใน policy ได้ทันทีแม้แถวเพิ่งถูก insert)
create or replace function private.can_view_task_row(p_task_id uuid, p_learning_area_id uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_office_staff()
      or private.has_role('executive')
      or (private.has_role('learning_area_head') and (
            p_learning_area_id in (select private.my_learning_area_ids())
            or (p_status <> 'draft' and exists (
                  select 1 from public.task_assignments a join public.teachers t on t.id = a.teacher_id
                  where a.task_id = p_task_id and t.learning_area_id in (select private.my_learning_area_ids())))))
      or (p_status <> 'draft' and exists (
            select 1 from public.task_assignments a where a.task_id = p_task_id and a.teacher_id = private.my_teacher_id()))
$$;

create or replace function private.can_view_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks k
    where k.id = p_task_id and k.school_id = private.current_school_id()
      and private.can_view_task_row(k.id, k.learning_area_id, k.status)
  )
$$;

revoke all on function private.can_manage_task_scope(uuid), private.can_manage_task(uuid), private.can_view_task(uuid),
  private.can_view_task_row(uuid, uuid, text) from public, anon;
grant execute on function private.can_manage_task_scope(uuid), private.can_manage_task(uuid), private.can_view_task(uuid),
  private.can_view_task_row(uuid, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------- RLS
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.assignment_events enable row level security;
revoke all on public.tasks, public.task_assignments, public.assignment_events from anon, authenticated;

grant select on public.tasks, public.task_assignments, public.assignment_events to authenticated;
-- เนื้อหางานแก้ได้ตรง (ตาม RLS) · status / ผู้เผยแพร่ / การยกเลิก เปลี่ยนผ่าน RPC เท่านั้น
grant insert (id, term_id, learning_area_id, title, description, category, starts_at, due_at, allowed_exts, max_files)
  on public.tasks to authenticated;
grant update (term_id, learning_area_id, title, description, category, starts_at, due_at, allowed_exts, max_files)
  on public.tasks to authenticated;
grant select, insert, update on public.tasks, public.task_assignments to service_role;
grant select, insert on public.assignment_events to service_role;

create policy tasks_select on public.tasks for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_view_task_row(id, learning_area_id, status));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_manage_task_scope(learning_area_id));
create policy tasks_update on public.tasks for update to authenticated
  using (school_id = (select private.current_school_id()) and status in ('draft', 'published') and private.can_manage_task_scope(learning_area_id))
  with check (school_id = (select private.current_school_id()) and private.can_manage_task_scope(learning_area_id));

create policy task_assignments_select on public.task_assignments for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.is_office_staff()) or (select private.has_role('executive'))
      or teacher_id = (select private.my_teacher_id())
      or ((select private.has_role('learning_area_head'))
          and exists (select 1 from public.teachers t where t.id = teacher_id and t.learning_area_id in (select private.my_learning_area_ids())))
    )
  );
create policy assignment_events_select on public.assignment_events for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_view_task(task_id)
         and (assignment_id is null or exists (select 1 from public.task_assignments a where a.id = assignment_id)));

-- ความคืบหน้าต่องาน — security_invoker: นับเฉพาะการมอบหมายที่ผู้เรียกมีสิทธิ์เห็น (หัวหน้ากลุ่มสาระเห็นเฉพาะครูในกลุ่ม)
create view public.task_progress with (security_invoker = true) as
select
  k.id as task_id,
  count(a.id) filter (where a.status <> 'cancelled')::int as total,
  count(a.id) filter (where a.status = 'assigned')::int as assigned,
  count(a.id) filter (where a.status = 'submitted')::int as submitted,
  count(a.id) filter (where a.status = 'revision_requested')::int as revision_requested,
  count(a.id) filter (where a.status = 'approved')::int as approved,
  count(a.id) filter (where a.status = 'cancelled')::int as cancelled,
  count(a.id) filter (where a.status in ('assigned', 'revision_requested') and k.status = 'published' and k.due_at < now())::int as overdue
from public.tasks k
left join public.task_assignments a on a.task_id = k.id
group by k.id;
revoke all on public.task_progress from anon, authenticated;
grant select on public.task_progress to authenticated;

-- ---------------------------------------------------------------- RPC: เผยแพร่ / มอบหมาย
-- p_mode: 'all' (ครูผู้สอนทุกคนที่ปฏิบัติงาน) | 'learning_areas' | 'teachers'
-- เรียกซ้ำได้เพื่อเพิ่มผู้รับ — ผู้ที่ได้รับมอบหมายอยู่แล้วจะถูกข้าม (กันซ้ำ)
create or replace function public.task_publish(p_task_id uuid, p_mode text, p_learning_area_ids uuid[] default null, p_teacher_ids uuid[] default null)
returns table (assigned_count int, skipped_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_task public.tasks;
  v_scoped boolean;
  v_targets uuid[];
  v_new int;
begin
  select * into v_task from public.tasks where id = p_task_id and school_id = v_school for update;
  if not found or not private.can_manage_task_scope(v_task.learning_area_id) then
    raise exception 'ไม่พบงาน หรือคุณไม่มีสิทธิ์มอบหมายงานนี้' using errcode = 'insufficient_privilege';
  end if;
  if v_task.status not in ('draft', 'published') then
    raise exception 'งานนี้ถูกยกเลิกหรือปิดแล้ว มอบหมายเพิ่มไม่ได้';
  end if;
  if v_task.due_at <= now() then
    raise exception 'วันครบกำหนดผ่านไปแล้ว กรุณาแก้ไขวันครบกำหนดก่อนมอบหมาย';
  end if;
  -- หัวหน้ากลุ่มสาระ (ที่ไม่ใช่ฝ่ายวิชาการ) มอบหมายได้เฉพาะครูในกลุ่มสาระของตน
  v_scoped := not private.is_office_staff();

  select coalesce(array_agg(t.id), '{}') into v_targets
  from public.teachers t
  where t.school_id = v_school and t.employment_status = 'active'
    and (not v_scoped or t.learning_area_id in (select private.my_learning_area_ids()))
    and case p_mode
          when 'all' then t.position in ('teacher', 'assistant_teacher', 'government_employee', 'contract_teacher')
          when 'learning_areas' then t.learning_area_id = any (coalesce(p_learning_area_ids, '{}'))
          when 'teachers' then t.id = any (coalesce(p_teacher_ids, '{}'))
          else false
        end;
  if p_mode not in ('all', 'learning_areas', 'teachers') then
    raise exception 'รูปแบบการเลือกผู้รับไม่ถูกต้อง';
  end if;
  if p_mode = 'teachers' and cardinality(v_targets) <> cardinality(array(select distinct unnest(coalesce(p_teacher_ids, '{}')))) then
    raise exception 'มีครูที่เลือกไม่อยู่ในขอบเขตสิทธิ์ หรือไม่ได้อยู่ในสถานะปฏิบัติงาน' using errcode = 'insufficient_privilege';
  end if;
  if cardinality(v_targets) = 0 then
    raise exception 'ไม่พบครูที่ตรงกับเงื่อนไขผู้รับ';
  end if;

  if v_task.status = 'draft' then
    update public.tasks set status = 'published', published_by = auth.uid(), published_at = now() where id = p_task_id;
    insert into public.assignment_events (school_id, task_id, event, from_status, to_status, detail)
    values (v_school, p_task_id, 'task_published', 'draft', 'published', jsonb_build_object('mode', p_mode));
  end if;

  with ins as (
    insert into public.task_assignments (school_id, task_id, teacher_id)
    select v_school, p_task_id, unnest(v_targets)
    on conflict (task_id, teacher_id) do nothing
    returning id
  ), ev as (
    insert into public.assignment_events (school_id, task_id, assignment_id, event, to_status)
    select v_school, p_task_id, ins.id, 'assigned', 'assigned' from ins
  )
  select count(*)::int into v_new from ins;

  return query select v_new, cardinality(v_targets) - v_new;
end;
$$;

-- ---------------------------------------------------------------- RPC: ยกเลิกงาน (ไม่ลบประวัติ)
create or replace function public.task_cancel(p_task_id uuid, p_reason text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_task public.tasks;
  v_n int;
begin
  select * into v_task from public.tasks where id = p_task_id and school_id = v_school for update;
  if not found or not private.can_manage_task_scope(v_task.learning_area_id) then
    raise exception 'ไม่พบงาน หรือคุณไม่มีสิทธิ์ยกเลิกงานนี้' using errcode = 'insufficient_privilege';
  end if;
  if v_task.status not in ('draft', 'published') then
    raise exception 'งานนี้ถูกยกเลิกหรือปิดไปแล้ว';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'กรุณาระบุเหตุผลการยกเลิก';
  end if;
  update public.tasks set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = left(btrim(p_reason), 500)
   where id = p_task_id;
  insert into public.assignment_events (school_id, task_id, event, from_status, to_status, detail)
  values (v_school, p_task_id, 'task_cancelled', v_task.status, 'cancelled', jsonb_build_object('reason', p_reason));
  -- งานที่ส่งแล้ว/ตรวจรับแล้วคงสถานะเดิมไว้เป็นหลักฐาน ยกเลิกเฉพาะที่ยังไม่ส่ง (ตาม state machine Phase 0)
  with c as (
    update public.task_assignments set status = 'cancelled', cancelled_at = now()
     where task_id = p_task_id and status in ('assigned', 'revision_requested')
    returning id, 'assigned'::text as old
  ), ev as (
    insert into public.assignment_events (school_id, task_id, assignment_id, event, to_status)
    select v_school, p_task_id, c.id, 'assignment_cancelled', 'cancelled' from c
  )
  select count(*)::int into v_n from c;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- RPC: ยกเลิกการมอบหมายรายคน
create or replace function public.assignment_cancel(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.task_assignments;
begin
  select * into v_a from public.task_assignments where id = p_assignment_id and school_id = private.current_school_id() for update;
  if not found or not private.can_manage_task(v_a.task_id) then
    raise exception 'ไม่พบการมอบหมาย หรือคุณไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  if v_a.status not in ('assigned', 'revision_requested') then
    raise exception 'ยกเลิกได้เฉพาะงานที่ครูยังไม่ส่ง';
  end if;
  update public.task_assignments set status = 'cancelled', cancelled_at = now() where id = p_assignment_id;
  insert into public.assignment_events (school_id, task_id, assignment_id, event, from_status, to_status)
  values (v_a.school_id, v_a.task_id, v_a.id, 'assignment_cancelled', v_a.status, 'cancelled');
end;
$$;

revoke all on function public.task_publish(uuid, text, uuid[], uuid[]), public.task_cancel(uuid, text),
  public.assignment_cancel(uuid) from public, anon;
grant execute on function public.task_publish(uuid, text, uuid[], uuid[]), public.task_cancel(uuid, text),
  public.assignment_cancel(uuid) to authenticated;

-- ---------------------------------------------------------------- แม่แบบเอกสาร: ใช้ storage ของ Phase 1.6
alter table public.documents add column kind text not null default 'teacher_document';
alter table public.documents add column task_id uuid;
alter table public.documents alter column owner_teacher_id drop not null;
alter table public.documents
  add constraint documents_kind_check check (kind in ('teacher_document', 'task_template')),
  add constraint documents_kind_owner_check check (
    (kind = 'teacher_document' and owner_teacher_id is not null and task_id is null)
    or (kind = 'task_template' and owner_teacher_id is null and task_id is not null)
  ),
  add constraint documents_task_fkey foreign key (task_id, school_id) references public.tasks (id, school_id) on delete restrict;
create index documents_task_idx on public.documents (task_id) where task_id is not null;

-- อ่านเอกสาร: เอกสารครู (เดิม) + แม่แบบงาน (ผู้ที่เห็นงานนั้น)
create or replace function private.can_read_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    left join public.teachers t on t.id = d.owner_teacher_id
    where d.id = p_document_id
      and d.school_id = private.current_school_id()
      and (
        (d.kind = 'teacher_document' and (
          t.profile_id = (select auth.uid())
          or private.is_office_staff()
          or (private.has_role('learning_area_head') and t.learning_area_id in (select private.my_learning_area_ids()))))
        or (d.kind = 'task_template' and private.can_view_task(d.task_id))
      )
  )
$$;

-- เริ่มอัปโหลดแม่แบบงาน (ผู้จัดการงาน) — ใช้ตาราง files / Edge Functions / การตรวจไฟล์เดิมทั้งหมด
create or replace function public.storage_begin_template_upload(p_task_id uuid, p_original_name text, p_mime_type text, p_size_bytes bigint)
returns table (file_id uuid, document_id uuid, version int, object_key text, mime_type text, size_bytes bigint, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_task public.tasks;
  v_doc public.documents;
  v_ext text;
  v_name text := btrim(coalesce(p_original_name, ''));
  v_file public.files;
begin
  select * into v_task from public.tasks where id = p_task_id and school_id = v_school;
  if not found or not private.can_manage_task_scope(v_task.learning_area_id) then
    raise exception 'ไม่พบงาน หรือคุณไม่มีสิทธิ์แนบแม่แบบ' using errcode = 'insufficient_privilege';
  end if;
  if v_task.status not in ('draft', 'published') then
    raise exception 'งานนี้ถูกยกเลิกหรือปิดแล้ว';
  end if;
  v_ext := lower(substring(v_name from '\.([A-Za-z0-9]{1,5})$'));
  if v_ext is null or private.mime_for_ext(v_ext) is null then
    raise exception 'รองรับเฉพาะไฟล์ PDF, Word (.doc/.docx) และ Excel (.xls/.xlsx)';
  end if;
  if p_mime_type is distinct from private.mime_for_ext(v_ext) then
    raise exception 'ชนิดไฟล์ (MIME) ไม่ตรงกับนามสกุลไฟล์';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 20971520 then
    raise exception 'ขนาดไฟล์ต้องไม่เกิน 20 MB';
  end if;
  if length(v_name) > 255 or v_name ~ '[\x00-\x1f/\\]' then
    raise exception 'ชื่อไฟล์ไม่ถูกต้อง';
  end if;
  if (select count(*) from public.documents d where d.task_id = p_task_id) >= 10 then
    raise exception 'แนบแม่แบบได้ไม่เกิน 10 ไฟล์ต่องาน';
  end if;

  insert into public.documents (school_id, kind, task_id, title, category)
  values (v_school, 'task_template', p_task_id, left(v_name, 200), v_task.category)
  returning * into v_doc;
  v_file.id := gen_random_uuid();
  insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type,
                            size_bytes, uploaded_by, upload_expires_at)
  values (v_file.id, v_school, v_doc.id, 1,
          format('schools/%s/tasks/%s/templates/%s.%s', v_school, p_task_id, v_file.id, v_ext),
          v_name, v_ext, p_mime_type, p_size_bytes, auth.uid(), now() + interval '5 minutes')
  returning * into v_file;
  perform private.log_file_event(v_file, 'upload_requested', jsonb_build_object('size', p_size_bytes, 'ext', v_ext, 'task_id', p_task_id));
  return query select v_file.id, v_doc.id, v_file.version, v_file.object_key, v_file.mime_type, v_file.size_bytes, v_file.upload_expires_at;
end;
$$;
revoke all on function public.storage_begin_template_upload(uuid, text, text, bigint) from public, anon;
grant execute on function public.storage_begin_template_upload(uuid, text, text, bigint) to authenticated;

-- ปิดช่องโหว่: เอกสารแม่แบบ owner_teacher_id = null ต้องไม่ถูกครูอัปโหลดทับเป็นเวอร์ชันใหม่
create or replace function public.storage_begin_upload(
  p_document_id uuid,
  p_title text,
  p_category text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns table (file_id uuid, document_id uuid, version int, object_key text, mime_type text, size_bytes bigint, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_teacher uuid;
  v_doc public.documents;
  v_ext text;
  v_name text := btrim(coalesce(p_original_name, ''));
  v_file public.files;
  v_version int;
begin
  if not private.has_role('teacher') then
    raise exception 'เฉพาะครูผู้สอนที่ผูกกับทะเบียนครูเท่านั้นที่อัปโหลดเอกสารได้' using errcode = 'insufficient_privilege';
  end if;
  select t.id into v_teacher from public.teachers t
   where t.profile_id = auth.uid() and t.school_id = v_school and t.employment_status = 'active';
  if v_teacher is null then
    raise exception 'บัญชีของคุณยังไม่ได้ผูกกับทะเบียนครูที่ปฏิบัติงานอยู่' using errcode = 'insufficient_privilege';
  end if;

  -- ชนิดไฟล์: นามสกุลต้องอยู่ใน whitelist และ MIME ที่แจ้งต้องตรงกับนามสกุล
  v_ext := lower(substring(v_name from '\.([A-Za-z0-9]{1,5})$'));
  if v_ext is null or private.mime_for_ext(v_ext) is null then
    raise exception 'รองรับเฉพาะไฟล์ PDF, Word (.doc/.docx) และ Excel (.xls/.xlsx)';
  end if;
  if p_mime_type is distinct from private.mime_for_ext(v_ext) then
    raise exception 'ชนิดไฟล์ (MIME) ไม่ตรงกับนามสกุลไฟล์';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 20971520 then
    raise exception 'ขนาดไฟล์ต้องไม่เกิน 20 MB';
  end if;
  if length(v_name) > 255 or v_name ~ '[\x00-\x1f/\\]' then
    raise exception 'ชื่อไฟล์ไม่ถูกต้อง';
  end if;

  -- กันการขอ URL ซ้ำจำนวนมาก
  if (select count(*) from public.files f
       where f.uploaded_by = auth.uid() and f.status = 'pending' and f.upload_expires_at > now()) >= 5 then
    raise exception 'มีการอัปโหลดที่ยังไม่เสร็จหลายรายการ กรุณารอสักครู่แล้วลองใหม่';
  end if;

  if p_document_id is null then
    insert into public.documents (school_id, owner_teacher_id, title, category)
    values (v_school, v_teacher, btrim(coalesce(p_title, '')), coalesce(p_category, 'general'))
    returning * into v_doc;
  else
    select * into v_doc from public.documents d where d.id = p_document_id and d.school_id = v_school for update;
    -- แก้ใน Phase 1.7: owner_teacher_id เป็น null ได้ (แม่แบบงาน) จึงใช้ is distinct from
    if not found or v_doc.kind <> 'teacher_document' or v_doc.owner_teacher_id is distinct from v_teacher then
      raise exception 'ไม่พบเอกสาร หรือคุณไม่ใช่เจ้าของเอกสารนี้' using errcode = 'insufficient_privilege';
    end if;
  end if;

  select coalesce(max(f.version), 0) + 1 into v_version from public.files f where f.document_id = v_doc.id;

  v_file.id := gen_random_uuid();
  insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type,
                            size_bytes, uploaded_by, upload_expires_at)
  values (v_file.id, v_school, v_doc.id, v_version,
          format('schools/%s/documents/%s/%s.%s', v_school, v_doc.id, v_file.id, v_ext),
          v_name, v_ext, p_mime_type, p_size_bytes, auth.uid(), now() + interval '5 minutes')
  returning * into v_file;

  perform private.log_file_event(v_file, 'upload_requested', jsonb_build_object('size', p_size_bytes, 'ext', v_ext));
  return query select v_file.id, v_doc.id, v_file.version, v_file.object_key, v_file.mime_type, v_file.size_bytes, v_file.upload_expires_at;
end;
$$;
