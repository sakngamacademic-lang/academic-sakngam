-- =============================================================================
-- Phase 1.5 — ทะเบียนครูและบุคลากร (Teacher Registry)
-- - teachers แยกจาก profiles: ครูที่ยังไม่มีบัญชีเข้าระบบมี profile_id = null
-- - ผูกบัญชีผ่าน RPC เท่านั้น (1 บัญชี ↔ 1 ระเบียน, โรงเรียนเดียวกัน) ไม่สร้างบัญชีใหม่
-- - สิทธิ์ตาม Permission Matrix (PHASE-0.md §5): ทะเบียนครู
--     system_admin / academic_head / academic_staff = F (ไม่มีการลบ ใช้สถานะแทน)
--     learning_area_head = R(S) เฉพาะกลุ่มสาระที่ได้รับมอบหมาย
--     executive = R · teacher = O (อ่านระเบียนของตนเอง)
-- =============================================================================

create table public.teachers (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  profile_id         uuid,
  teacher_code       text not null,
  prefix             text not null,
  first_name         text not null,
  last_name          text not null,
  position           text not null default 'teacher',
  learning_area_id   uuid,
  employment_status  text not null default 'active',
  email              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint teachers_id_school_key unique (id, school_id),
  constraint teachers_code_key unique (school_id, teacher_code),
  -- บัญชีต้องอยู่โรงเรียนเดียวกัน; ลบบัญชีแล้วระเบียนครูยังอยู่ (ตัดการผูกเท่านั้น)
  constraint teachers_profile_fkey foreign key (profile_id, school_id)
    references public.profiles (id, school_id) on update restrict on delete set null (profile_id),
  constraint teachers_learning_area_fkey foreign key (learning_area_id, school_id)
    references public.learning_areas (id, school_id) on delete restrict,
  constraint teachers_code_format check (teacher_code ~ '^[A-Za-z0-9_-]{1,32}$'),
  constraint teachers_prefix_len check (length(btrim(prefix)) between 1 and 50),
  constraint teachers_first_name_len check (length(btrim(first_name)) between 1 and 100),
  constraint teachers_last_name_len check (length(btrim(last_name)) between 1 and 100),
  constraint teachers_position_check check (position in (
    'executive',            -- ผู้บริหารสถานศึกษา
    'teacher',              -- ครู
    'assistant_teacher',    -- ครูผู้ช่วย
    'government_employee',  -- พนักงานราชการ
    'contract_teacher',     -- ครูอัตราจ้าง
    'support_staff'         -- บุคลากรสนับสนุน / เจ้าหน้าที่
  )),
  constraint teachers_status_check check (employment_status in ('active', 'on_leave', 'transferred', 'retired', 'resigned')),
  constraint teachers_email_format check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
comment on table public.teachers is 'ทะเบียนครูและบุคลากร — แยกจากบัญชีผู้ใช้ (profiles) ผูกบัญชีผ่าน link_teacher_account เท่านั้น';
comment on column public.teachers.profile_id is 'บัญชีเข้าระบบ (null = ยังไม่มีบัญชี)';

create unique index teachers_profile_key on public.teachers (profile_id) where profile_id is not null;
create unique index teachers_email_key on public.teachers (school_id, lower(email)) where email is not null;
create index teachers_school_area_idx on public.teachers (school_id, learning_area_id);
create index teachers_school_status_idx on public.teachers (school_id, employment_status);
create index teachers_created_by_idx on public.teachers (created_by);

-- normalize ข้อความก่อนบันทึก (ตัดช่องว่าง, อีเมลตัวพิมพ์เล็ก)
create or replace function private.normalize_teacher()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.teacher_code := btrim(new.teacher_code);
  new.prefix := btrim(new.prefix);
  new.first_name := btrim(new.first_name);
  new.last_name := btrim(new.last_name);
  new.email := nullif(lower(btrim(new.email)), '');
  return new;
end;
$$;

-- ห้ามเปลี่ยน profile_id / created_by โดยตรง (ต้องผ่าน RPC ซึ่งรันเป็นเจ้าของตาราง)
create or replace function private.guard_teacher_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.profile_id is distinct from old.profile_id or new.created_by is distinct from old.created_by) then
    raise exception 'ผูก/ยกเลิกบัญชีผู้ใช้ต้องทำผ่านเมนูผูกบัญชีเท่านั้น' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger teachers_normalize before insert or update on public.teachers
  for each row execute function private.normalize_teacher();
create trigger teachers_guard_update before update on public.teachers
  for each row execute function private.guard_teacher_update();
create trigger teachers_set_updated_at before update on public.teachers
  for each row execute function private.set_updated_at();
create trigger teachers_lock_columns before update on public.teachers
  for each row execute function private.lock_columns_after_insert();
create trigger teachers_audit after insert or update or delete on public.teachers
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- helpers
create or replace function private.can_manage_teachers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['system_admin', 'academic_head', 'academic_staff']::public.app_role[])
$$;

-- ผูกบัญชี = งานด้านบัญชีผู้ใช้ (ผู้ใช้ & บทบาท: system_admin F, academic_head R → อนุญาตเพิ่มเพื่อให้ฝ่ายวิชาการทำงานได้)
create or replace function private.can_link_teacher_accounts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['system_admin', 'academic_head']::public.app_role[])
$$;

-- ระเบียนครูของผู้ใช้ปัจจุบัน (ใช้ใน RLS ของ Phase ถัดไป เช่น งานที่มอบหมาย)
create or replace function private.my_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.teachers t
  where t.profile_id = (select auth.uid())
    and t.school_id = private.current_school_id()
$$;

revoke all on function private.normalize_teacher(), private.guard_teacher_update() from public, anon, authenticated;
revoke all on function private.can_manage_teachers(), private.can_link_teacher_accounts(), private.my_teacher_id() from public, anon;
grant execute on function private.can_manage_teachers(), private.can_link_teacher_accounts(), private.my_teacher_id()
  to authenticated, service_role;

-- ---------------------------------------------------------------- RLS + grants
alter table public.teachers enable row level security;
revoke all on public.teachers from anon, authenticated;

grant select on public.teachers to authenticated;
grant insert (id, teacher_code, prefix, first_name, last_name, position, learning_area_id, employment_status, email)
  on public.teachers to authenticated;
grant update (teacher_code, prefix, first_name, last_name, position, learning_area_id, employment_status, email)
  on public.teachers to authenticated;
-- ไม่มี DELETE: ใช้ employment_status แทน เพื่อเก็บประวัติ
grant select, insert, update on public.teachers to service_role;

create policy teachers_select on public.teachers for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.has_school_wide_access())                          -- admin / head / staff / executive
      or learning_area_id in (select private.my_learning_area_ids())     -- หัวหน้ากลุ่มสาระ: เฉพาะกลุ่มของตน
      or profile_id = (select auth.uid())                                -- ครู: ระเบียนของตนเอง
    )
  );

create policy teachers_insert on public.teachers for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.can_manage_teachers()));

create policy teachers_update on public.teachers for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.can_manage_teachers()))
  with check (school_id = (select private.current_school_id()));

-- ---------------------------------------------------------------- RPC: ผูก / ยกเลิกการผูกบัญชี
create or replace function public.link_teacher_account(p_teacher_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_current uuid;
begin
  if not private.can_link_teacher_accounts() then
    raise exception 'ไม่มีสิทธิ์ผูกบัญชีผู้ใช้กับทะเบียนครู' using errcode = 'insufficient_privilege';
  end if;
  select profile_id into v_current from public.teachers where id = p_teacher_id and school_id = v_school for update;
  if not found then
    raise exception 'ไม่พบระเบียนครูที่เลือก';
  end if;
  if v_current is not null then
    raise exception 'ระเบียนนี้ผูกบัญชีอยู่แล้ว กรุณายกเลิกการผูกก่อน';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.school_id = v_school) then
    raise exception 'ไม่พบบัญชีผู้ใช้ในโรงเรียนนี้';
  end if;
  if exists (select 1 from public.teachers t where t.profile_id = p_profile_id) then
    raise exception 'บัญชีนี้ผูกกับระเบียนครูคนอื่นอยู่แล้ว';
  end if;
  update public.teachers set profile_id = p_profile_id where id = p_teacher_id;
end;
$$;

create or replace function public.unlink_teacher_account(p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
begin
  if not private.can_link_teacher_accounts() then
    raise exception 'ไม่มีสิทธิ์ยกเลิกการผูกบัญชีผู้ใช้' using errcode = 'insufficient_privilege';
  end if;
  update public.teachers set profile_id = null
   where id = p_teacher_id and school_id = v_school and profile_id is not null;
  if not found then
    raise exception 'ไม่พบระเบียนครูที่ผูกบัญชีไว้';
  end if;
end;
$$;

revoke all on function public.link_teacher_account(uuid, uuid), public.unlink_teacher_account(uuid) from public, anon;
grant execute on function public.link_teacher_account(uuid, uuid), public.unlink_teacher_account(uuid) to authenticated;
