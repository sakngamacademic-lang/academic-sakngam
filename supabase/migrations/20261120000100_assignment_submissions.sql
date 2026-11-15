-- =============================================================================
-- Phase 1.8–1.10 — ส่งงาน / ตรวจรับ / ขอแก้ไข / ประวัติทุกเวอร์ชัน / แจ้งเตือน
-- ใช้ระบบเดิม: tasks, task_assignments, assignment_events, documents/files (ไฟล์เก็บใน Storage เดิม — ทุกเวอร์ชันอยู่ใน files)
-- - ครูส่ง: เลือกไฟล์เวอร์ชันที่อัปโหลดสมบูรณ์ของเอกสารตนเอง → ล็อกไฟล์เป็นหลักฐาน (ลบไม่ได้) → assignment = submitted
-- - ฝ่ายวิชาการ/หัวหน้ากลุ่มสาระ (ตามขอบเขตงาน) ตรวจ: approved หรือ revision_requested (ต้องมีเหตุผล)
-- - ส่งซ้ำได้เมื่อถูกขอแก้ไข → เวอร์ชันการส่งใหม่ (เก็บย้อนหลังทั้งหมด)
-- - แจ้งเตือนสร้างอัตโนมัติจาก assignment_events (append-only)
-- - require_human: AI/service_role ส่งงานหรือตรวจรับแทนคนไม่ได้
-- =============================================================================

alter table public.assignment_events drop constraint assignment_events_event_check;
alter table public.assignment_events add constraint assignment_events_event_check check (event in (
  'task_published', 'task_cancelled', 'assigned', 'assignment_cancelled', 'submitted', 'approved', 'revision_requested'));

create table public.assignment_submissions (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete restrict,
  assignment_id   uuid not null,
  version         int not null check (version > 0),
  file_id         uuid not null,
  note            text check (note is null or length(note) <= 1000),
  is_late         boolean not null default false,
  submitted_by    uuid not null default auth.uid(),
  submitted_at    timestamptz not null default now(),
  review_status   text not null default 'pending' check (review_status in ('pending', 'approved', 'revision_requested')),
  review_comment  text check (review_comment is null or length(review_comment) <= 2000),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  unique (assignment_id, version),
  unique (id, school_id),
  check ((review_status = 'pending') = (reviewed_at is null)),
  check (review_status <> 'revision_requested' or length(btrim(coalesce(review_comment, ''))) >= 5),
  foreign key (assignment_id, school_id) references public.task_assignments (id, school_id) on delete restrict,
  foreign key (file_id, school_id) references public.files (id, school_id) on delete restrict
);
comment on table public.assignment_submissions is 'การส่งงานแต่ละครั้ง (เวอร์ชัน) พร้อมผลตรวจ — ไฟล์ที่ส่งถูกล็อกเป็นหลักฐาน';
create index assignment_submissions_assignment_idx on public.assignment_submissions (assignment_id, version desc);
create trigger assignment_submissions_audit after insert or update or delete on public.assignment_submissions
  for each row execute function private.audit_row_change();

alter table public.assignment_submissions enable row level security;
revoke all on public.assignment_submissions from anon, authenticated;
grant select on public.assignment_submissions to authenticated;
-- เห็นได้เมื่อเห็นการมอบหมายนั้น (RLS ของ task_assignments: ฝ่ายวิชาการ/ผู้บริหาร/หัวหน้ากลุ่มสาระตามขอบเขต/ครูเจ้าของ)
create policy assignment_submissions_select on public.assignment_submissions for select to authenticated
  using (school_id = (select private.current_school_id())
         and exists (select 1 from public.task_assignments a where a.id = assignment_id));

-- ---------------------------------------------------------------- RPC: ครูส่งงาน
create or replace function public.assignment_submit(p_assignment_id uuid, p_file_id uuid, p_note text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.task_assignments;
  v_task public.tasks;
  v_file public.files;
  v_owner uuid;
  v_version int;
  v_late boolean;
begin
  perform private.require_human();
  select * into v_a from public.task_assignments where id = p_assignment_id and school_id = private.current_school_id() for update;
  if not found or v_a.teacher_id is distinct from private.my_teacher_id() then
    raise exception 'ไม่พบงานที่มอบหมายให้คุณ' using errcode = 'insufficient_privilege';
  end if;
  if v_a.status not in ('assigned', 'revision_requested') then
    raise exception 'งานนี้อยู่ในสถานะที่ส่งไม่ได้ (%)', v_a.status;
  end if;
  select * into v_task from public.tasks where id = v_a.task_id;
  if v_task.status <> 'published' then
    raise exception 'งานนี้ปิดรับหรือถูกยกเลิกแล้ว';
  end if;

  select f.* into v_file from public.files f where f.id = p_file_id and f.school_id = v_a.school_id for update;
  select d.owner_teacher_id into v_owner from public.documents d where d.id = v_file.document_id;
  if v_file.id is null or v_owner is distinct from v_a.teacher_id then
    raise exception 'ไฟล์นี้ไม่ใช่เอกสารของคุณ' using errcode = 'insufficient_privilege';
  end if;
  if v_file.status <> 'ready' then
    raise exception 'ส่งได้เฉพาะไฟล์ที่อัปโหลดและตรวจสอบสมบูรณ์แล้ว';
  end if;
  if exists (select 1 from public.assignment_submissions s where s.assignment_id = v_a.id and s.file_id = v_file.id) then
    raise exception 'ไฟล์เวอร์ชันนี้ถูกส่งแล้ว — กรุณาอัปโหลดเวอร์ชันใหม่';
  end if;

  -- ไฟล์ที่ส่งเป็นหลักฐาน: ล็อก (ลบไม่ได้)
  if v_file.locked_at is null then
    update public.files set locked_at = now(), locked_by = auth.uid() where id = v_file.id returning * into v_file;
    perform private.log_file_event(v_file, 'locked', jsonb_build_object('reason', 'assignment_submitted', 'assignment_id', v_a.id));
  end if;

  v_version := v_a.current_version + 1;
  v_late := now() > v_task.due_at;
  insert into public.assignment_submissions (school_id, assignment_id, version, file_id, note, is_late)
  values (v_a.school_id, v_a.id, v_version, v_file.id, nullif(btrim(p_note), ''), v_late);
  update public.task_assignments set status = 'submitted', current_version = v_version, last_submitted_at = now(), updated_at = now()
   where id = v_a.id;
  insert into public.assignment_events (school_id, task_id, assignment_id, event, from_status, to_status, detail)
  values (v_a.school_id, v_a.task_id, v_a.id, 'submitted', v_a.status, 'submitted',
          jsonb_build_object('version', v_version, 'file_id', v_file.id, 'late', v_late));
  return v_version;
end;
$$;

-- ---------------------------------------------------------------- RPC: ตรวจรับ / ขอแก้ไข
create or replace function public.assignment_review(p_assignment_id uuid, p_decision text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.task_assignments;
  v_s public.assignment_submissions;
  v_to text;
begin
  perform private.require_human();
  select * into v_a from public.task_assignments where id = p_assignment_id and school_id = private.current_school_id() for update;
  if not found or not private.can_manage_task(v_a.task_id) then
    raise exception 'คุณไม่มีสิทธิ์ตรวจงานนี้' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('approve', 'revision') then
    raise exception 'ผลการตรวจต้องเป็น approve หรือ revision';
  end if;
  if v_a.status <> 'submitted' then
    raise exception 'ตรวจได้เฉพาะงานที่ส่งแล้วและรอตรวจ';
  end if;
  if p_decision = 'revision' and length(btrim(coalesce(p_comment, ''))) < 5 then
    raise exception 'กรุณาระบุสิ่งที่ต้องแก้ไข (อย่างน้อย 5 ตัวอักษร)';
  end if;
  select * into v_s from public.assignment_submissions where assignment_id = v_a.id and version = v_a.current_version for update;
  if v_s.id is null then
    raise exception 'ไม่พบไฟล์ที่ส่งของงานนี้ — ตรวจรับไม่ได้หากไม่มีหลักฐาน';
  end if;
  if v_s.submitted_by = auth.uid() then
    raise exception 'ตรวจงานที่ตนเองส่งไม่ได้' using errcode = 'insufficient_privilege';
  end if;
  v_to := case p_decision when 'approve' then 'approved' else 'revision_requested' end;
  update public.assignment_submissions set review_status = v_to, review_comment = nullif(btrim(p_comment), ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = v_s.id;
  update public.task_assignments set status = v_to, updated_at = now() where id = v_a.id;
  insert into public.assignment_events (school_id, task_id, assignment_id, event, from_status, to_status, detail)
  values (v_a.school_id, v_a.task_id, v_a.id, v_to, 'submitted', v_to,
          jsonb_build_object('version', v_s.version, 'comment', nullif(btrim(p_comment), '')));
end;
$$;

revoke all on function public.assignment_submit(uuid, uuid, text), public.assignment_review(uuid, text, text) from public, anon;
grant execute on function public.assignment_submit(uuid, uuid, text), public.assignment_review(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------- แจ้งเตือน (สร้างจากเหตุการณ์เท่านั้น)
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('assigned', 'submitted', 'approved', 'revision_requested', 'task_cancelled')),
  title       text not null,
  body        text,
  link        text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  task_id     uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function private.notify_from_assignment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_teacher_user uuid;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if new.assignment_id is not null then
    select t.profile_id into v_teacher_user from public.task_assignments a join public.teachers t on t.id = a.teacher_id where a.id = new.assignment_id;
  end if;
  if new.event in ('assigned', 'approved', 'revision_requested') and v_teacher_user is not null then
    insert into public.notifications (school_id, user_id, kind, title, body, link, task_id)
    values (new.school_id, v_teacher_user, new.event,
            case new.event when 'assigned' then 'ได้รับมอบหมายงาน: ' when 'approved' then 'ตรวจรับแล้ว: ' else 'ขอให้แก้ไข: ' end || v_task.title,
            case when new.event = 'revision_requested' then new.detail ->> 'comment' when new.event = 'assigned' then 'กำหนดส่ง ' || to_char(v_task.due_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI') end,
            '/teacher/assignments', v_task.id);
  elsif new.event = 'submitted' and v_task.created_by is not null then
    insert into public.notifications (school_id, user_id, kind, title, body, link, task_id)
    values (new.school_id, v_task.created_by, 'submitted', 'มีงานส่งรอตรวจ: ' || v_task.title,
            case when (new.detail ->> 'late')::boolean then 'ส่งหลังกำหนด' end, '/office/tasks/' || v_task.id, v_task.id);
  elsif new.event = 'task_cancelled' then
    insert into public.notifications (school_id, user_id, kind, title, body, link, task_id)
    select new.school_id, t.profile_id, 'task_cancelled', 'ยกเลิกงาน: ' || v_task.title, new.detail ->> 'reason', '/teacher/assignments', v_task.id
      from public.task_assignments a join public.teachers t on t.id = a.teacher_id
     where a.task_id = new.task_id and t.profile_id is not null;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_from_assignment_event() from public, anon, authenticated;
create trigger assignment_events_notify after insert on public.assignment_events
  for each row execute function private.notify_from_assignment_event();
