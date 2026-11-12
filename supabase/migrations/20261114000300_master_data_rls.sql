-- =============================================================================
-- Migration: master_data_rls
-- GRANT (ระดับคอลัมน์) + RLS + RPC สำหรับข้อมูลพื้นฐาน
--
-- สิทธิ์
--   อ่าน   : สมาชิกโรงเรียนทุกบทบาท (ปี/ภาค/ระดับชั้น/ห้องเรียน)
--            learning_areas: system_admin/academic_head/academic_staff/executive เห็นทั้งหมด,
--            learning_area_head เห็นเฉพาะกลุ่มสาระของตน, teacher ไม่เห็น
--   เขียน  : system_admin, academic_head, academic_staff (ปี/ภาค/ระดับชั้น/ห้องเรียน)
--            system_admin, academic_head (กลุ่มสาระ)
--   ลบ     : ไม่มี (ปิดใช้งานแทน) — ไม่มี DELETE grant
--   school_id / is_current / คีย์ธรรมชาติ (year_be, code) แก้ผ่าน API ไม่ได้
--
-- Rollback plan: drop policies, revoke grants, drop functions public.set_current_*,
--                public.copy_classrooms
-- =============================================================================

alter table public.learning_areas enable row level security;
alter table public.academic_years enable row level security;
alter table public.terms          enable row level security;
alter table public.grade_levels   enable row level security;
alter table public.classrooms     enable row level security;

revoke all on public.learning_areas, public.academic_years, public.terms, public.grade_levels, public.classrooms
  from anon, authenticated;

grant select on public.learning_areas, public.academic_years, public.terms, public.grade_levels, public.classrooms
  to authenticated;

grant insert (id, code, name_th, sort_order, is_active) on public.learning_areas to authenticated;
grant update (name_th, sort_order, is_active)       on public.learning_areas to authenticated;

grant insert (id, year_be, starts_on, ends_on, note) on public.academic_years to authenticated;
grant update (starts_on, ends_on, note)          on public.academic_years to authenticated;

grant insert (id, academic_year_id, term_no, starts_on, ends_on) on public.terms to authenticated;
grant update (term_no, starts_on, ends_on)                   on public.terms to authenticated;

grant insert (id, code, name_th, stage, level_order, is_active) on public.grade_levels to authenticated;
grant update (name_th, stage, level_order, is_active)       on public.grade_levels to authenticated;

grant insert (id, academic_year_id, grade_level_id, room_no, is_active) on public.classrooms to authenticated;
grant update (grade_level_id, room_no, is_active)                   on public.classrooms to authenticated;

grant select, insert, update on public.learning_areas, public.academic_years, public.terms,
  public.grade_levels, public.classrooms to service_role;

-- ---------------------------------------------------------------------------
-- learning_areas
-- ---------------------------------------------------------------------------
create policy learning_areas_select on public.learning_areas for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.has_school_wide_access()) or id in (select private.my_learning_area_ids()))
  );
create policy learning_areas_insert on public.learning_areas for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.can_manage_learning_areas()));
create policy learning_areas_update on public.learning_areas for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.can_manage_learning_areas()))
  with check (school_id = (select private.current_school_id()));

-- ---------------------------------------------------------------------------
-- academic_years / terms / grade_levels / classrooms (รูปแบบเดียวกัน)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['academic_years', 'terms', 'grade_levels', 'classrooms'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (school_id = (select private.current_school_id()) and (select private.is_school_member()));
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (school_id = (select private.current_school_id()) and (select private.can_manage_master_data()));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (school_id = (select private.current_school_id()) and (select private.can_manage_master_data()))
        with check (school_id = (select private.current_school_id()));
    $f$, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: ตั้งปีการศึกษาปัจจุบัน (atomic — มีปีปัจจุบันได้ปีเดียว)
--   ภาคเรียนปัจจุบันที่อยู่คนละปีจะถูกยกเลิก
-- ---------------------------------------------------------------------------
create or replace function public.set_current_academic_year(p_year_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
begin
  if not private.can_manage_master_data() then
    raise exception 'ไม่มีสิทธิ์ตั้งค่าปีการศึกษาปัจจุบัน' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.academic_years where id = p_year_id and school_id = v_school) then
    raise exception 'ไม่พบปีการศึกษาที่เลือก';
  end if;

  update public.terms set is_current = false
   where school_id = v_school and is_current and academic_year_id <> p_year_id;
  update public.academic_years set is_current = false
   where school_id = v_school and is_current and id <> p_year_id;
  update public.academic_years set is_current = true
   where id = p_year_id and not is_current;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: ตั้งภาคเรียนปัจจุบัน (ตั้งปีการศึกษาของภาคนั้นเป็นปีปัจจุบันด้วย)
-- ---------------------------------------------------------------------------
create or replace function public.set_current_term(p_term_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_year uuid;
begin
  if not private.can_manage_master_data() then
    raise exception 'ไม่มีสิทธิ์ตั้งค่าภาคเรียนปัจจุบัน' using errcode = 'insufficient_privilege';
  end if;
  select academic_year_id into v_year from public.terms where id = p_term_id and school_id = v_school;
  if v_year is null then
    raise exception 'ไม่พบภาคเรียนที่เลือก';
  end if;

  perform public.set_current_academic_year(v_year);
  update public.terms set is_current = false where school_id = v_school and is_current and id <> p_term_id;
  update public.terms set is_current = true where id = p_term_id and not is_current;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: คัดลอกห้องเรียนจากปีหนึ่งไปอีกปี (ใช้ตอนขึ้นปีการศึกษาใหม่)
--   ข้ามห้องที่มีอยู่แล้ว คืนจำนวนห้องที่สร้างใหม่
-- ---------------------------------------------------------------------------
create or replace function public.copy_classrooms(p_from_year uuid, p_to_year uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_count int;
begin
  if not private.can_manage_master_data() then
    raise exception 'ไม่มีสิทธิ์จัดการห้องเรียน' using errcode = 'insufficient_privilege';
  end if;
  if p_from_year = p_to_year then
    raise exception 'ปีต้นทางและปีปลายทางต้องไม่ใช่ปีเดียวกัน';
  end if;
  if (select count(*) from public.academic_years
       where id in (p_from_year, p_to_year) and school_id = v_school) <> 2 then
    raise exception 'ไม่พบปีการศึกษาที่เลือก';
  end if;

  insert into public.classrooms (school_id, academic_year_id, grade_level_id, room_no)
  select v_school, p_to_year, c.grade_level_id, c.room_no
  from public.classrooms c
  join public.grade_levels g on g.id = c.grade_level_id and g.is_active
  where c.academic_year_id = p_from_year and c.is_active
  on conflict (academic_year_id, grade_level_id, room_no) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.set_current_academic_year(uuid), public.set_current_term(uuid),
  public.copy_classrooms(uuid, uuid) from public, anon;
grant execute on function public.set_current_academic_year(uuid), public.set_current_term(uuid),
  public.copy_classrooms(uuid, uuid) to authenticated;
