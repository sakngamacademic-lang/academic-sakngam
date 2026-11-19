-- =============================================================================
-- Migration: curriculum_v2  (เตรียมไว้ · ยังไม่รันบน Staging/Production)
-- หลักสูตรสถานศึกษา V2 — ตารางใหม่ทั้งหมดใน namespace cv2_* แยกจากตารางหลักสูตรเดิม
--   · ไม่แก้/ไม่ลบ/ไม่อ่านข้อมูลตารางหลักสูตรเดิม (subjects, subject_offerings, study_programs ...)
--   · เขียนผ่าน RPC เท่านั้น (ผู้ดูแลหลักสูตร: private.require_curriculum_admin) · ไม่มี insert/update/delete ตรง
--   · อ่าน: บทบาทหลักสูตรเดิม (curriculum_reader_role) เห็นทุกสถานะ · สมาชิกโรงเรียนทั่วไปเห็นเฉพาะ approved/active
--   · นำเข้าไฟล์เดิมซ้ำ (sha256 เดียวกันในปีเดียวกัน) = แทนที่แถวของไฟล์นั้น ไม่เกิดข้อมูลซ้ำ · ไฟล์ต่างกันเก็บแยก
--   · บันทึกประวัติการนำเข้าแบบ append-only + audit_row_change บนตารางหลัก
-- forward-only · แผนย้อนกลับ: supabase/rollback/20261207000100_curriculum_v2.down.sql
-- =============================================================================

create table public.cv2_curricula (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  year_be            int not null check (year_be between 2500 and 2700),
  label              text not null default '' check (length(label) <= 200),
  status             text not null default 'draft' check (status in ('draft', 'approved', 'active', 'archived')),
  primary_source_id  uuid,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (school_id, year_be),
  unique (id, school_id)
);
create table public.cv2_sources (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_id  uuid not null,
  kind           text not null check (kind in ('xlsx', 'pdf', 'docx')),
  file_name      text not null check (length(btrim(file_name)) between 1 and 300),
  sha256         text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_id        uuid,                       -- ไฟล์ต้นฉบับในคลังไฟล์เดิม (ถ้ามี) — ไม่ลบไฟล์เมื่อนำแหล่งออก
  row_count      int not null default 0,
  issues         jsonb not null default '[]'::jsonb,
  declared       jsonb not null default '[]'::jsonb,
  activities     jsonb not null default '[]'::jsonb,
  notes          jsonb not null default '[]'::jsonb,
  imported_by    uuid default auth.uid(),
  imported_at    timestamptz not null default now(),
  unique (curriculum_id, sha256),
  unique (id, school_id),
  foreign key (curriculum_id, school_id) references public.cv2_curricula (id, school_id) on delete restrict,
  foreign key (file_id, school_id) references public.files (id, school_id) on delete restrict
);
alter table public.cv2_curricula add constraint cv2_curricula_primary_fk foreign key (primary_source_id) references public.cv2_sources (id) on delete restrict;
create table public.cv2_rows (
  id          bigint generated always as identity primary key,
  school_id   uuid not null,
  source_id   uuid not null,
  grade       text check (grade is null or grade ~ '^M[1-6]$'),
  plan        text,
  plan_key    text,
  room        text,
  term        smallint check (term is null or term in (1, 2)),
  section     text check (section is null or section in ('basic', 'additional')),
  code        text not null,
  code_raw    text not null,
  name        text not null,
  credits     numeric(5, 2),
  hours       numeric(6, 1),
  raw         text not null default '',
  refs        jsonb not null default '[]'::jsonb,   -- [{file, sheet, cell, page, table, row}]
  foreign key (source_id, school_id) references public.cv2_sources (id, school_id) on delete restrict
);
create index cv2_rows_source_idx on public.cv2_rows (source_id);
create index cv2_rows_lookup_idx on public.cv2_rows (source_id, grade, plan_key, term);
create table public.cv2_descriptions (
  id         bigint generated always as identity primary key,
  school_id  uuid not null,
  source_id  uuid not null,
  code       text not null,
  name       text not null,
  body       text not null,
  ref        jsonb not null default '{}'::jsonb,
  foreign key (source_id, school_id) references public.cv2_sources (id, school_id) on delete restrict
);
create index cv2_descriptions_source_idx on public.cv2_descriptions (source_id, code);
create table public.cv2_import_log (
  id             bigint generated always as identity primary key,
  school_id      uuid not null references public.schools (id) on delete restrict,
  actor_id       uuid not null,
  action         text not null check (action in ('import', 'replace', 'remove', 'set_primary')),
  curriculum_id  uuid,
  year_be        int,
  source_id      uuid,
  file_name      text,
  sha256         text,
  row_count      int,
  reason         text,
  created_at     timestamptz not null default now()
);
create trigger cv2_import_log_no_update_delete before update or delete on public.cv2_import_log for each row execute function private.prevent_audit_mutation();
create trigger cv2_curricula_set_updated_at before update on public.cv2_curricula for each row execute function private.set_updated_at();
create trigger cv2_curricula_audit after insert or update or delete on public.cv2_curricula for each row execute function private.audit_row_change();
create trigger cv2_sources_audit after insert or update or delete on public.cv2_sources for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- RLS (อ่านอย่างเดียว · เขียนผ่าน RPC)
create or replace function private.cv2_can_read(p_curriculum_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cv2_curricula c where c.id = p_curriculum_id and c.school_id = private.current_school_id()
                   and (private.curriculum_reader_role() or (private.is_school_member() and c.status in ('approved', 'active'))))
$$;
revoke all on function private.cv2_can_read(uuid) from public, anon;
grant execute on function private.cv2_can_read(uuid) to authenticated;

alter table public.cv2_curricula enable row level security;
alter table public.cv2_sources enable row level security;
alter table public.cv2_rows enable row level security;
alter table public.cv2_descriptions enable row level security;
alter table public.cv2_import_log enable row level security;
revoke all on public.cv2_curricula, public.cv2_sources, public.cv2_rows, public.cv2_descriptions, public.cv2_import_log from anon, authenticated;
grant select on public.cv2_curricula, public.cv2_sources, public.cv2_rows, public.cv2_descriptions, public.cv2_import_log to authenticated;
create policy cv2_curricula_select on public.cv2_curricula for select to authenticated using ((select private.cv2_can_read(id)));
create policy cv2_sources_select on public.cv2_sources for select to authenticated using ((select private.cv2_can_read(curriculum_id)));
create policy cv2_rows_select on public.cv2_rows for select to authenticated
  using (exists (select 1 from public.cv2_sources s where s.id = source_id and (select private.cv2_can_read(s.curriculum_id))));
create policy cv2_descriptions_select on public.cv2_descriptions for select to authenticated
  using (exists (select 1 from public.cv2_sources s where s.id = source_id and (select private.cv2_can_read(s.curriculum_id))));
create policy cv2_import_log_select on public.cv2_import_log for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()));

-- ---------------------------------------------------------------- RPC
-- นำเข้าหนึ่งไฟล์ (ทั้งชุดในธุรกรรมเดียว) · sha256 เดิมในปีเดียวกัน = แทนที่แถวของไฟล์นั้น
create or replace function public.cv2_import_source(p_year int, p_label text, p_source jsonb, p_rows jsonb, p_descriptions jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_school uuid := private.current_school_id(); v_uid uuid := auth.uid(); v_cur uuid; v_src uuid; v_action text := 'import'; v_n int;
begin
  perform private.require_curriculum_admin();
  if p_year is null or p_year not between 2500 and 2700 then raise exception 'ปีหลักสูตรไม่ถูกต้อง'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then raise exception 'ข้อมูลรายวิชาต้องมี 1–5000 แถว'; end if;
  if coalesce(p_source ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then raise exception 'ไม่มีลายนิ้วมือไฟล์ (sha256)'; end if;
  insert into public.cv2_curricula (school_id, year_be, label) values (v_school, p_year, coalesce(nullif(btrim(p_label), ''), ''))
    on conflict (school_id, year_be) do update set label = case when btrim(coalesce(p_label, '')) = '' then public.cv2_curricula.label else btrim(p_label) end
    returning id into v_cur;
  select id into v_src from public.cv2_sources where curriculum_id = v_cur and sha256 = p_source ->> 'sha256' for update;
  if found then
    v_action := 'replace';
    delete from public.cv2_rows where source_id = v_src;            -- เฉพาะข้อมูล V2 ของไฟล์นี้ (ไม่ cascade)
    delete from public.cv2_descriptions where source_id = v_src;
    update public.cv2_sources set file_name = p_source ->> 'file_name', kind = p_source ->> 'kind', issues = coalesce(p_source -> 'issues', '[]'), declared = coalesce(p_source -> 'declared', '[]'),
      activities = coalesce(p_source -> 'activities', '[]'), notes = coalesce(p_source -> 'notes', '[]'), imported_by = v_uid, imported_at = now() where id = v_src;
  else
    insert into public.cv2_sources (school_id, curriculum_id, kind, file_name, sha256, issues, declared, activities, notes)
    values (v_school, v_cur, p_source ->> 'kind', p_source ->> 'file_name', p_source ->> 'sha256', coalesce(p_source -> 'issues', '[]'), coalesce(p_source -> 'declared', '[]'),
            coalesce(p_source -> 'activities', '[]'), coalesce(p_source -> 'notes', '[]'))
    returning id into v_src;
  end if;
  insert into public.cv2_rows (school_id, source_id, grade, plan, plan_key, room, term, section, code, code_raw, name, credits, hours, raw, refs)
  select v_school, v_src, r ->> 'grade', r ->> 'plan', r ->> 'plan_key', r ->> 'room', (r ->> 'term')::smallint, r ->> 'section', r ->> 'code', coalesce(r ->> 'code_raw', r ->> 'code'),
         coalesce(r ->> 'name', ''), (r ->> 'credits')::numeric, (r ->> 'hours')::numeric, coalesce(r ->> 'raw', ''), coalesce(r -> 'refs', '[]')
    from jsonb_array_elements(p_rows) r;
  get diagnostics v_n = row_count;
  insert into public.cv2_descriptions (school_id, source_id, code, name, body, ref)
  select v_school, v_src, d ->> 'code', coalesce(d ->> 'name', ''), coalesce(d ->> 'text', ''), coalesce(d -> 'ref', '{}') from jsonb_array_elements(coalesce(p_descriptions, '[]')) d;
  update public.cv2_sources set row_count = v_n where id = v_src;
  update public.cv2_curricula set primary_source_id = coalesce(primary_source_id, v_src) where id = v_cur;
  insert into public.cv2_import_log (school_id, actor_id, action, curriculum_id, year_be, source_id, file_name, sha256, row_count)
  values (v_school, v_uid, v_action, v_cur, p_year, v_src, p_source ->> 'file_name', p_source ->> 'sha256', v_n);
  return jsonb_build_object('result', v_action, 'curriculum_id', v_cur, 'source_id', v_src, 'rows', v_n);
end $$;

create or replace function public.cv2_set_primary(p_curriculum_id uuid, p_source_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_curriculum_admin();
  if not exists (select 1 from public.cv2_sources where id = p_source_id and curriculum_id = p_curriculum_id and school_id = private.current_school_id()) then raise exception 'ไม่พบไฟล์ในหลักสูตรนี้'; end if;
  update public.cv2_curricula set primary_source_id = p_source_id where id = p_curriculum_id;
  insert into public.cv2_import_log (school_id, actor_id, action, curriculum_id, source_id) values (private.current_school_id(), auth.uid(), 'set_primary', p_curriculum_id, p_source_id);
end $$;

-- นำไฟล์ออกจากหลักสูตร V2 (ข้อมูล V2 ของไฟล์นั้นเท่านั้น · ไม่ลบไฟล์ต้นฉบับในคลัง) — ห้ามนำแหล่งที่ใช้แสดงผลอยู่ออกถ้ายังมีแหล่งอื่นไม่ได้เลือกแทน
create or replace function public.cv2_remove_source(p_source_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.cv2_sources; v_status text;
begin
  perform private.require_curriculum_admin();
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'กรุณาระบุเหตุผล'; end if;
  select * into v from public.cv2_sources where id = p_source_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบไฟล์'; end if;
  select status into v_status from public.cv2_curricula where id = v.curriculum_id;
  if v_status in ('approved', 'active') then raise exception 'หลักสูตรที่อนุมัติ/ใช้งานแล้วนำไฟล์ออกไม่ได้'; end if;
  update public.cv2_curricula set primary_source_id = (select id from public.cv2_sources where curriculum_id = v.curriculum_id and id <> v.id order by imported_at limit 1)
   where id = v.curriculum_id and primary_source_id = v.id;
  delete from public.cv2_rows where source_id = v.id;
  delete from public.cv2_descriptions where source_id = v.id;
  delete from public.cv2_sources where id = v.id;
  insert into public.cv2_import_log (school_id, actor_id, action, curriculum_id, source_id, file_name, sha256, row_count, reason)
  values (v.school_id, auth.uid(), 'remove', v.curriculum_id, v.id, v.file_name, v.sha256, v.row_count, btrim(p_reason));
end $$;

revoke all on function public.cv2_import_source(int, text, jsonb, jsonb, jsonb), public.cv2_set_primary(uuid, uuid), public.cv2_remove_source(uuid, text) from public, anon;
grant execute on function public.cv2_import_source(int, text, jsonb, jsonb, jsonb), public.cv2_set_primary(uuid, uuid), public.cv2_remove_source(uuid, text) to authenticated;
-- หมายเหตุ: การอนุมัติ/เปิดใช้หลักสูตร V2 (status approved/active) ยังไม่มีในไฟล์นี้ — ต้องออกแบบขั้นตอนอนุมัติแยกและขออนุมัติ
