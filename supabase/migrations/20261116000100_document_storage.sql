-- =============================================================================
-- Phase 1.6 — Secure Document Storage (metadata ใน PostgreSQL, ไฟล์จริงใน R2)
-- - documents     : เอกสาร 1 ชิ้นของครู 1 คน (ระเบียนครู) — มีได้หลายเวอร์ชัน
-- - files         : ไฟล์แต่ละเวอร์ชัน (pending → ready | rejected | expired, ready → deleted)
-- - file_events   : บันทึกการเข้าถึง/เหตุการณ์ของไฟล์ (append-only) เช่น ออก URL ดาวน์โหลด
-- ผู้ใช้เขียนตารางเหล่านี้ตรง ๆ ไม่ได้ ทุกการเปลี่ยนแปลงผ่าน RPC ที่ตรวจสิทธิ์
-- การยืนยันไฟล์ (ขนาด / magic bytes / sha256) ทำโดย Edge Function ด้วย service_role เท่านั้น
-- Object key สร้างโดยฐานข้อมูล ไม่ใช้ชื่อไฟล์จากผู้ใช้
-- =============================================================================

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  owner_teacher_id  uuid not null,
  title             text not null,
  category          text not null default 'general',
  latest_version    int not null default 0,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint documents_id_school_key unique (id, school_id),
  constraint documents_owner_fkey foreign key (owner_teacher_id, school_id)
    references public.teachers (id, school_id) on delete restrict,
  constraint documents_title_len check (length(btrim(title)) between 1 and 200),
  constraint documents_category_check check (category in (
    'lesson_plan', 'post_teaching_record', 'course_syllabus', 'classroom_research', 'assessment_report', 'general'
  ))
);
comment on table public.documents is 'เอกสารของครู (ภาชนะของหลายเวอร์ชัน) — ไฟล์จริงอยู่ใน R2';
create index documents_school_owner_idx on public.documents (school_id, owner_teacher_id);

create table public.files (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  document_id        uuid not null,
  version            int not null,
  storage_provider   text,
  bucket             text not null default 'sakngam-academic-documents',
  object_key         text not null,
  original_name      text not null,
  file_ext           text not null,
  mime_type          text not null,
  size_bytes         bigint not null,
  sha256             text,
  status             text not null default 'pending',
  status_reason      text,
  uploaded_by        uuid not null default auth.uid(),
  upload_expires_at  timestamptz not null,
  confirmed_at       timestamptz,
  locked_at          timestamptz,
  locked_by          uuid,
  deleted_at         timestamptz,
  deleted_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint files_document_fkey foreign key (document_id, school_id)
    references public.documents (id, school_id) on delete restrict,
  constraint files_object_key_key unique (object_key),
  constraint files_version_key unique (document_id, version),
  constraint files_version_positive check (version > 0),
  constraint files_name_len check (length(btrim(original_name)) between 1 and 255),
  constraint files_ext_check check (file_ext in ('pdf', 'doc', 'docx', 'xls', 'xlsx')),
  constraint files_size_range check (size_bytes between 1 and 20971520),
  constraint files_sha256_format check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint files_status_check check (status in ('pending', 'ready', 'rejected', 'expired', 'deleted')),
  constraint files_ready_has_hash check (status <> 'ready' or (sha256 is not null and confirmed_at is not null)),
  constraint files_locked_not_deleted check (locked_at is null or status <> 'deleted')
);
comment on table public.files is 'ไฟล์แต่ละเวอร์ชัน — locked_at = หลักฐานที่ตรวจรับแล้ว ลบไม่ได้หากไม่มี workflow อนุมัติ';
create index files_document_idx on public.files (document_id);
create index files_pending_idx on public.files (upload_expires_at) where status = 'pending';
create index files_uploaded_by_idx on public.files (uploaded_by, created_at);

create table public.file_events (
  id           bigint generated always as identity primary key,
  school_id    uuid references public.schools (id) on delete set null,
  file_id      uuid,
  document_id  uuid,
  actor_id     uuid,
  event        text not null,
  detail       jsonb,
  created_at   timestamptz not null default now(),
  constraint file_events_event_check check (event in (
    'upload_requested', 'upload_confirmed', 'upload_rejected', 'upload_expired',
    'download_url_issued', 'deleted', 'locked'
  ))
);
comment on table public.file_events is 'เหตุการณ์ของไฟล์ (append-only) รวมการออก URL ดาวน์โหลด';
create index file_events_file_idx on public.file_events (file_id, created_at);
create index file_events_school_idx on public.file_events (school_id, created_at desc);

create trigger file_events_no_update_delete before update or delete on public.file_events
  for each row execute function private.prevent_audit_mutation();

do $$
declare t text;
begin
  foreach t in array array['documents', 'files'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I
                    for each row execute function private.set_updated_at()', t);
    execute format('create trigger %1$s_lock_columns before update on public.%1$I
                    for each row execute function private.lock_columns_after_insert()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function private.audit_row_change()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- helpers
-- อ่านเอกสารได้: ครูเจ้าของ · หัวหน้า/เจ้าหน้าที่วิชาการ (ทั้งโรงเรียน) · หัวหน้ากลุ่มสาระ (ครูในกลุ่มสาระของตน)
-- (Permission Matrix: ส่งเอกสาร O · ตรวจรับ A / A(S) — ผู้บริหารและผู้ดูแลระบบไม่มีสิทธิ์อ่านไฟล์)
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
    join public.teachers t on t.id = d.owner_teacher_id
    where d.id = p_document_id
      and d.school_id = private.current_school_id()
      and (
        t.profile_id = (select auth.uid())
        or private.is_office_staff()
        or (private.has_role('learning_area_head') and t.learning_area_id in (select private.my_learning_area_ids()))
      )
  )
$$;

create or replace function private.can_review_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    join public.teachers t on t.id = d.owner_teacher_id
    where d.id = p_document_id
      and d.school_id = private.current_school_id()
      and (
        private.is_office_staff()
        or (private.has_role('learning_area_head') and t.learning_area_id in (select private.my_learning_area_ids()))
      )
  )
$$;

create or replace function private.log_file_event(p_file public.files, p_event text, p_detail jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.file_events (school_id, file_id, document_id, actor_id, event, detail)
  values (p_file.school_id, p_file.id, p_file.document_id, auth.uid(), p_event, p_detail)
$$;

revoke all on function private.can_read_document(uuid), private.can_review_document(uuid),
  private.log_file_event(public.files, text, jsonb) from public, anon;
grant execute on function private.can_read_document(uuid), private.can_review_document(uuid) to authenticated, service_role;
grant execute on function private.log_file_event(public.files, text, jsonb) to service_role;

-- ---------------------------------------------------------------- RLS (อ่านอย่างเดียว เขียนผ่าน RPC)
alter table public.documents   enable row level security;
alter table public.files       enable row level security;
alter table public.file_events enable row level security;
revoke all on public.documents, public.files, public.file_events from anon, authenticated;
grant select on public.documents, public.files, public.file_events to authenticated;
grant select, insert, update on public.documents, public.files to service_role;
grant select, insert on public.file_events to service_role;

create policy documents_select on public.documents for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_read_document(id));
create policy files_select on public.files for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_read_document(document_id));
create policy file_events_select on public.file_events for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (actor_id = (select auth.uid())
         or (select private.has_any_role(array['system_admin', 'academic_head']::public.app_role[])))
  );

-- ---------------------------------------------------------------- กติกาไฟล์ (ต้องตรงกับ supabase/functions/_shared/file-rules.ts)
create or replace function private.mime_for_ext(p_ext text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_ext
    when 'pdf'  then 'application/pdf'
    when 'doc'  then 'application/msword'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xls'  then 'application/vnd.ms-excel'
    when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  end
$$;

-- ---------------------------------------------------------------- RPC: เริ่มอัปโหลด (ครูเจ้าของเอกสาร)
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
    if not found or v_doc.owner_teacher_id <> v_teacher then
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

-- ---------------------------------------------------------------- RPC: ข้อมูลไฟล์ที่รอยืนยัน (เฉพาะผู้อัปโหลด)
create or replace function public.storage_pending_upload(p_file_id uuid)
returns table (file_id uuid, object_key text, file_ext text, mime_type text, size_bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.object_key, f.file_ext, f.mime_type, f.size_bytes
  from public.files f
  where f.id = p_file_id
    and f.uploaded_by = auth.uid()
    and f.school_id = private.current_school_id()
    and f.status = 'pending'
    and f.upload_expires_at + interval '10 minutes' > now()
$$;

-- ---------------------------------------------------------------- RPC: ผลการตรวจไฟล์ (Edge Function / service_role เท่านั้น)
create or replace function public.storage_complete_upload(
  p_file_id uuid,
  p_actor uuid,
  p_ok boolean,
  p_actual_size bigint,
  p_sha256 text,
  p_provider text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  select * into v_file from public.files where id = p_file_id for update;
  if not found or v_file.status <> 'pending' or v_file.uploaded_by <> p_actor then
    raise exception 'ไม่พบไฟล์ที่รอยืนยัน';
  end if;
  if p_ok then
    update public.files set status = 'ready', sha256 = p_sha256, size_bytes = p_actual_size,
           storage_provider = p_provider, confirmed_at = now(), status_reason = null
     where id = p_file_id returning * into v_file;
    update public.documents set latest_version = greatest(latest_version, v_file.version) where id = v_file.document_id;
  else
    update public.files set status = 'rejected', storage_provider = p_provider, status_reason = left(p_reason, 300)
     where id = p_file_id returning * into v_file;
  end if;
  insert into public.file_events (school_id, file_id, document_id, actor_id, event, detail)
  values (v_file.school_id, v_file.id, v_file.document_id, p_actor,
          case when p_ok then 'upload_confirmed' else 'upload_rejected' end,
          jsonb_build_object('size', p_actual_size, 'sha256', p_sha256, 'reason', p_reason));
  return v_file.status;
end;
$$;

-- ---------------------------------------------------------------- RPC: อนุญาตดาวน์โหลด
create or replace function public.storage_authorize_download(p_file_id uuid)
returns table (object_key text, original_name text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  select * into v_file from public.files f where f.id = p_file_id and f.school_id = private.current_school_id();
  if not found or not private.can_read_document(v_file.document_id) then
    raise exception 'ไม่พบไฟล์ หรือคุณไม่มีสิทธิ์เข้าถึงไฟล์นี้' using errcode = 'insufficient_privilege';
  end if;
  if v_file.status <> 'ready' then
    raise exception 'ไฟล์นี้ยังไม่พร้อมให้ดาวน์โหลด';
  end if;
  perform private.log_file_event(v_file, 'download_url_issued');
  return query select v_file.object_key, v_file.original_name, v_file.mime_type;
end;
$$;

-- ---------------------------------------------------------------- RPC: ลบไฟล์ตามสิทธิ์
-- ผู้อัปโหลด (เจ้าของ) หรือหัวหน้าฝ่ายวิชาการ · ห้ามลบไฟล์ที่ล็อกเป็นหลักฐานแล้ว
create or replace function public.storage_delete_file(p_file_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  select * into v_file from public.files f where f.id = p_file_id and f.school_id = private.current_school_id() for update;
  if not found or not private.can_read_document(v_file.document_id)
     or not (v_file.uploaded_by = auth.uid() or private.has_role('academic_head')) then
    raise exception 'คุณไม่มีสิทธิ์ลบไฟล์นี้' using errcode = 'insufficient_privilege';
  end if;
  if v_file.locked_at is not null then
    raise exception 'ไฟล์นี้ผ่านการตรวจรับเป็นหลักฐานแล้ว ลบได้ผ่านขั้นตอนอนุมัติเท่านั้น' using errcode = 'insufficient_privilege';
  end if;
  if v_file.status = 'deleted' then
    raise exception 'ไฟล์นี้ถูกลบไปแล้ว';
  end if;
  update public.files set status = 'deleted', deleted_at = now(), deleted_by = auth.uid()
   where id = p_file_id returning * into v_file;
  perform private.log_file_event(v_file, 'deleted');
  return v_file.object_key;
end;
$$;

-- ---------------------------------------------------------------- RPC: ล็อกเป็นหลักฐาน (ผู้ตรวจ — จะถูกเรียกโดย workflow ตรวจรับใน Phase 1.10)
create or replace function public.storage_lock_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  select * into v_file from public.files f where f.id = p_file_id and f.school_id = private.current_school_id() for update;
  if not found or not private.can_review_document(v_file.document_id) then
    raise exception 'คุณไม่มีสิทธิ์ตรวจรับไฟล์นี้' using errcode = 'insufficient_privilege';
  end if;
  if v_file.status <> 'ready' then
    raise exception 'ล็อกได้เฉพาะไฟล์ที่อัปโหลดสมบูรณ์';
  end if;
  if v_file.locked_at is null then
    update public.files set locked_at = now(), locked_by = auth.uid() where id = p_file_id returning * into v_file;
    perform private.log_file_event(v_file, 'locked');
  end if;
end;
$$;

-- ---------------------------------------------------------------- RPC: ตรวจไฟล์ที่อัปโหลดไม่สำเร็จ (service_role / งานตามเวลา)
create or replace function public.storage_expire_stale_uploads(p_grace interval default interval '15 minutes')
returns table (file_id uuid, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with expired as (
    update public.files f set status = 'expired', status_reason = 'ไม่ได้ยืนยันการอัปโหลดภายในเวลาที่กำหนด'
     where f.status = 'pending' and f.upload_expires_at + p_grace < now()
    returning f.*
  ), logged as (
    insert into public.file_events (school_id, file_id, document_id, actor_id, event)
    select e.school_id, e.id, e.document_id, null, 'upload_expired' from expired e
  )
  select e.id, e.object_key from expired e;
end;
$$;

revoke all on function
  private.mime_for_ext(text),
  public.storage_begin_upload(uuid, text, text, text, text, bigint),
  public.storage_pending_upload(uuid),
  public.storage_complete_upload(uuid, uuid, boolean, bigint, text, text, text),
  public.storage_authorize_download(uuid),
  public.storage_delete_file(uuid),
  public.storage_lock_file(uuid),
  public.storage_expire_stale_uploads(interval)
from public, anon, authenticated;

grant execute on function
  public.storage_begin_upload(uuid, text, text, text, text, bigint),
  public.storage_pending_upload(uuid),
  public.storage_authorize_download(uuid),
  public.storage_delete_file(uuid),
  public.storage_lock_file(uuid)
to authenticated;

grant execute on function
  public.storage_complete_upload(uuid, uuid, boolean, bigint, text, text, text),
  public.storage_expire_stale_uploads(interval)
to service_role;
