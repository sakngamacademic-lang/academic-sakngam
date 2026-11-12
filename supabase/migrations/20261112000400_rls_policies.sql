-- =============================================================================
-- Migration: rls_policies
-- Helper functions ตรวจสิทธิ์ + เปิด RLS + GRANT แบบระบุชัด + Policies
--
-- หลักการ
--   * ทุกตารางใน public เปิด RLS และไม่มีสิทธิ์ใด ๆ สำหรับ anon
--   * แยกข้อมูลตามโรงเรียน (school_id = โรงเรียนของผู้ใช้)
--   * ผู้ใช้ที่ is_active = false ไม่มีสิทธิ์ใด ๆ นอกจากอ่าน profile ตนเอง
--   * ผู้ใช้แก้ profile ตนเองได้เฉพาะ display_name (column-level grant)
--   * user_roles: เขียนได้เฉพาะ system_admin ในโรงเรียนเดียวกัน และห้ามแก้แถวของตนเอง
--
-- Rollback plan: drop policies / revoke grants / drop functions private.*
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER เพื่อเลี่ยง RLS recursion; search_path ว่าง)
-- ---------------------------------------------------------------------------
create or replace function private.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function private.has_any_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.school_id = ur.school_id
    join public.schools s on s.id = ur.school_id
    where ur.user_id = (select auth.uid())
      and ur.role = any (p_roles)
      and p.is_active
      and s.is_active
  )
$$;

create or replace function private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array[p_role])
$$;

-- ฝ่ายวิชาการ (จัดการข้อมูลได้)
create or replace function private.is_office_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['academic_head', 'academic_staff']::public.app_role[])
$$;

-- ผู้ที่ดูข้อมูลบุคลากรทั้งโรงเรียนได้
create or replace function private.can_view_school_people()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(
    array['system_admin', 'academic_head', 'academic_staff', 'learning_area_head', 'executive']::public.app_role[]
  )
$$;

revoke all on function
  private.current_school_id(),
  private.has_any_role(public.app_role[]),
  private.has_role(public.app_role),
  private.is_office_staff(),
  private.can_view_school_people()
from public, anon;
grant execute on function
  private.current_school_id(),
  private.has_any_role(public.app_role[]),
  private.has_role(public.app_role),
  private.is_office_staff(),
  private.can_view_school_people()
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- กันการแก้คอลัมน์สำคัญของ profiles (ชั้นที่สอง ต่อจาก column grant)
-- ---------------------------------------------------------------------------
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.id is distinct from old.id
          or new.school_id is distinct from old.school_id
          or new.email is distinct from old.email
          or new.is_active is distinct from old.is_active
          or new.created_at is distinct from old.created_at) then
    raise exception 'not allowed to change protected profile fields'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ---------------------------------------------------------------------------
-- เปิด RLS (helper functions เป็น SECURITY DEFINER ของเจ้าของตาราง จึงอ่านได้โดยไม่วน RLS)
-- ---------------------------------------------------------------------------
alter table public.schools    enable row level security;
alter table public.profiles   enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- GRANT แบบระบุชัด (anon ไม่ได้อะไรเลย)
-- ---------------------------------------------------------------------------
revoke all on public.schools, public.profiles, public.user_roles, public.audit_logs from anon, authenticated;

grant select on public.schools to authenticated;
grant update (name_th, name_en, province) on public.schools to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.user_roles to authenticated;
grant insert (user_id, school_id, role) on public.user_roles to authenticated;
grant delete on public.user_roles to authenticated;

grant select on public.audit_logs to authenticated;

-- service_role ใช้เฉพาะฝั่ง server (Edge Functions / งานดูแลระบบ) — ห้ามใช้ใน frontend
grant all on public.schools, public.profiles, public.user_roles to service_role;
grant select, insert on public.audit_logs to service_role;

-- ---------------------------------------------------------------------------
-- Policies: schools
-- ---------------------------------------------------------------------------
create policy schools_select_own
  on public.schools for select to authenticated
  using (id = (select private.current_school_id()));

create policy schools_update_by_admin
  on public.schools for update to authenticated
  using (id = (select private.current_school_id()) and (select private.has_role('system_admin')))
  with check (id = (select private.current_school_id()));

-- ---------------------------------------------------------------------------
-- Policies: profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_school_staff
  on public.profiles for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.can_view_school_people())
  );

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Policies: user_roles
-- ---------------------------------------------------------------------------
create policy user_roles_select_self
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_roles_select_admin
  on public.user_roles for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.has_any_role(array['system_admin', 'academic_head']::public.app_role[]))
  );

create policy user_roles_insert_admin
  on public.user_roles for insert to authenticated
  with check (
    school_id = (select private.current_school_id())
    and (select private.has_role('system_admin'))
    and user_id <> (select auth.uid())                 -- ห้ามให้สิทธิ์ตนเอง
    and granted_by is not distinct from (select auth.uid())
  );

create policy user_roles_delete_admin
  on public.user_roles for delete to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.has_role('system_admin'))
    and user_id <> (select auth.uid())                 -- ห้ามลบสิทธิ์ตนเอง (กันล็อกระบบ)
  );
-- ไม่มี policy UPDATE: เปลี่ยนบทบาท = ลบแล้วเพิ่มใหม่ (มี audit ครบ)

-- ---------------------------------------------------------------------------
-- Policies: audit_logs (อ่านได้เฉพาะ system_admin / academic_head ในโรงเรียนตน)
-- ---------------------------------------------------------------------------
create policy audit_logs_select_admin
  on public.audit_logs for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.has_any_role(array['system_admin', 'academic_head']::public.app_role[]))
  );
