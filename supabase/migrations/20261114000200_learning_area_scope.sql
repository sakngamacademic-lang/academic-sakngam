-- =============================================================================
-- Migration: learning_area_scope
-- ขอบเขตกลุ่มสาระสำหรับบทบาท learning_area_head
--   * user_roles.learning_area_id (composite FK กันข้ามโรงเรียน)
--   * learning_area_head ต้องมี scope / บทบาทอื่นต้องไม่มี scope
--   * หัวหน้าหลายกลุ่มสาระได้ (1 แถวต่อ 1 กลุ่มสาระ)
--   * ไม่มีสิทธิ์ UPDATE บน user_roles → เปลี่ยน scope = ลบแล้วเพิ่มใหม่โดย system_admin
--
-- หมายเหตุ: check constraint เป็น NOT VALID เพื่อไม่ให้ migration ล้มกับข้อมูลเดิม
--   (หัวหน้ากลุ่มสาระเดิมที่ยังไม่มี scope จะ "ไม่เห็นกลุ่มสาระใด" จนกว่าจะกำหนด)
--   แถวใหม่/ที่แก้ไขถูกตรวจทุกครั้ง
--
-- Rollback plan: drop constraints/column ที่เพิ่ม, คืน unique เดิม,
--                create or replace get_my_access ตาม 20261113000100
-- =============================================================================

alter table public.user_roles add column learning_area_id uuid;

alter table public.user_roles
  add constraint user_roles_learning_area_fkey foreign key (learning_area_id, school_id)
    references public.learning_areas (id, school_id) on delete restrict;

alter table public.user_roles
  add constraint user_roles_scope_check check (
    (role = 'learning_area_head') = (learning_area_id is not null)
  ) not valid;

alter table public.user_roles drop constraint user_roles_unique;
alter table public.user_roles
  add constraint user_roles_unique unique nulls not distinct (user_id, school_id, role, learning_area_id);

create index user_roles_learning_area_idx on public.user_roles (learning_area_id) where learning_area_id is not null;

-- system_admin กำหนด scope ได้ตอนเพิ่มแถว (policy insert เดิมยังบังคับ: admin เท่านั้น, ไม่ใช่ตนเอง)
grant insert (learning_area_id) on public.user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- บทบาทที่เห็นข้อมูลทุกกลุ่มสาระของโรงเรียน
create or replace function private.has_school_wide_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['system_admin', 'academic_head', 'academic_staff', 'executive']::public.app_role[])
$$;

-- กลุ่มสาระที่ผู้ใช้เป็นหัวหน้า (เฉพาะบัญชี/โรงเรียนที่ใช้งานได้)
create or replace function private.my_learning_area_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ur.learning_area_id
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.school_id = ur.school_id and p.is_active
  join public.schools s on s.id = ur.school_id and s.is_active
  where ur.user_id = (select auth.uid())
    and ur.role = 'learning_area_head'
    and ur.learning_area_id is not null
$$;

-- ใช้ใน RLS ของตารางที่ผูกกลุ่มสาระ (ปัจจุบันและอนาคต เช่น ครู รายวิชา)
create or replace function private.can_access_learning_area(p_learning_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.learning_areas la
    where la.id = p_learning_area_id
      and la.school_id = private.current_school_id()
      and (private.has_school_wide_access()
           or la.id in (select private.my_learning_area_ids()))
  )
$$;

-- ผู้จัดการข้อมูลพื้นฐาน (ปี/ภาค/ระดับชั้น/ห้องเรียน)
create or replace function private.can_manage_master_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['system_admin', 'academic_head', 'academic_staff']::public.app_role[])
$$;

-- ผู้จัดการโครงสร้างกลุ่มสาระ
create or replace function private.can_manage_learning_areas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['system_admin', 'academic_head']::public.app_role[])
$$;

-- ผู้ใช้ที่ใช้งานได้ในโรงเรียน (มีอย่างน้อย 1 บทบาท)
create or replace function private.is_school_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(enum_range(null::public.app_role))
$$;

revoke all on function
  private.has_school_wide_access(), private.my_learning_area_ids(), private.can_access_learning_area(uuid),
  private.can_manage_master_data(), private.can_manage_learning_areas(), private.is_school_member()
from public, anon;
grant execute on function
  private.has_school_wide_access(), private.my_learning_area_ids(), private.can_access_learning_area(uuid),
  private.can_manage_master_data(), private.can_manage_learning_areas(), private.is_school_member()
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_my_access: เพิ่ม learning_area_ids (สำหรับ UI)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id',      p.id,
    'email',        p.email,
    'display_name', p.display_name,
    'is_active',    p.is_active and coalesce(s.is_active, false),
    'account_status', case
                        when not p.is_active then 'suspended'
                        when s.id is null then 'no_school'
                        when not s.is_active then 'school_inactive'
                        else 'active'
                      end,
    'school', case when s.id is not null and s.is_active
                   then jsonb_build_object('id', s.id, 'code', s.code, 'name_th', s.name_th)
              end,
    'roles', case when p.is_active and coalesce(s.is_active, false)
                  then coalesce((
                    select jsonb_agg(distinct ur.role)
                    from public.user_roles ur
                    where ur.user_id = p.id and ur.school_id = p.school_id
                  ), '[]'::jsonb)
                  else '[]'::jsonb
             end,
    'learning_area_ids', case when p.is_active and coalesce(s.is_active, false)
                  then coalesce((
                    select jsonb_agg(ur.learning_area_id order by ur.learning_area_id)
                    from public.user_roles ur
                    where ur.user_id = p.id and ur.school_id = p.school_id
                      and ur.role = 'learning_area_head' and ur.learning_area_id is not null
                  ), '[]'::jsonb)
                  else '[]'::jsonb
             end
  )
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  where p.id = (select auth.uid())
$$;
