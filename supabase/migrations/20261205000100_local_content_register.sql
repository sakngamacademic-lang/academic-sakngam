-- ทะเบียนสาระการเรียนรู้ท้องถิ่น (นำเข้าจากตาราง CSV ที่จัดเตรียม) — forward-only · เพิ่มตารางใหม่ ไม่แก้ข้อมูลเดิม
--  · เก็บรหัสตัวชี้วัดและข้อความ “ตามต้นฉบับ” ทุกตัวอักษร (ไม่แก้/ไม่เดารหัส) พร้อมตาราง/แถว/แหล่งอ้างอิง
--  · นำเข้าใหม่ = ชุดใหม่ (ชุดเดิมเป็น superseded ไม่ลบ) · ไม่แตะรายวิชา ชั่วโมง หน่วยกิต หรือ CF
--  · เขียนผ่าน RPC เฉพาะผู้ดูแลหลักสูตร · อ่านตามสิทธิ์ผู้อ่านหลักสูตร · Audit ทุกแถว

create table public.local_content_batches (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  file_name              text not null check (length(btrim(file_name)) between 1 and 300),
  file_sha256            text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  source_label           text check (source_label is null or length(source_label) <= 300),
  source_document_id     uuid,
  row_count              int not null check (row_count >= 0),
  status                 text not null default 'active' check (status in ('active', 'superseded')),
  imported_by            uuid not null default auth.uid() references auth.users (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, school_id),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict
);
create unique index local_content_batches_one_active on public.local_content_batches (curriculum_version_id) where status = 'active';

create table public.local_content_items (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  batch_id        uuid not null,
  table_no        text not null check (length(table_no) <= 20),
  row_no          text not null check (length(row_no) <= 20),
  indicator_code_raw text not null check (length(indicator_code_raw) <= 200),
  core_content    text not null check (length(core_content) <= 8000),
  local_content   text not null check (length(local_content) <= 8000),
  source_status   text check (source_status is null or length(source_status) <= 200),
  source_ref      text check (source_ref is null or length(source_ref) <= 300),
  created_at      timestamptz not null default now(),
  unique (batch_id, table_no, row_no),
  foreign key (batch_id, school_id) references public.local_content_batches (id, school_id) on delete restrict
);
create index local_content_items_batch_idx on public.local_content_items (batch_id);
comment on table public.local_content_items is 'สาระท้องถิ่นตามต้นฉบับ (ข้อความ/รหัสไม่ถูกแก้) — ใช้วิเคราะห์ความเชื่อมโยงกับรายวิชา ไม่ใช่การรับรอง';

do $$
declare t text;
begin
  foreach t in array array['local_content_batches', 'local_content_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
      using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()))', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.audit_row_change()', t);
  end loop;
end $$;
create trigger local_content_batches_set_updated_at before update on public.local_content_batches for each row execute function private.set_updated_at();

-- นำเข้าชุดใหม่ (ทั้งชุดในธุรกรรมเดียว) — ข้อมูลแต่ละแถวเก็บตามที่ส่งมา
create or replace function public.local_content_import(p_version_id uuid, p_file_name text, p_file_sha256 text, p_source_label text, p_rows jsonb, p_source_document_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_batch uuid; v_n int;
begin
  perform private.require_curriculum_admin();
  if not exists (select 1 from public.curriculum_versions where id = p_version_id and school_id = private.current_school_id()) then raise exception 'ไม่พบฉบับหลักสูตร'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then raise exception 'ข้อมูลนำเข้าต้องมี 1–5000 แถว'; end if;
  update public.local_content_batches set status = 'superseded' where curriculum_version_id = p_version_id and school_id = private.current_school_id() and status = 'active';
  insert into public.local_content_batches (curriculum_version_id, file_name, file_sha256, source_label, source_document_id, row_count)
  values (p_version_id, p_file_name, p_file_sha256, nullif(btrim(coalesce(p_source_label, '')), ''), p_source_document_id, jsonb_array_length(p_rows))
  returning id into v_batch;
  insert into public.local_content_items (batch_id, table_no, row_no, indicator_code_raw, core_content, local_content, source_status, source_ref)
  select v_batch, r->>'table', r->>'row', coalesce(r->>'code', ''), coalesce(r->>'core', ''), coalesce(r->>'local', ''), nullif(r->>'status', ''), nullif(r->>'source', '')
    from jsonb_array_elements(p_rows) r;
  get diagnostics v_n = row_count;
  return v_batch;
end $$;

revoke all on function public.local_content_import(uuid, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.local_content_import(uuid, text, text, text, jsonb, uuid) to authenticated;
