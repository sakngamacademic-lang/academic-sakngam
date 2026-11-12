-- =============================================================================
-- Migration: master_data_tables
-- Phase 1.4 — ข้อมูลพื้นฐานของโรงเรียน
--   learning_areas, academic_years, terms, grade_levels, classrooms
--
-- หลักการ
--   * ทุกตารางมี school_id (ค่าเริ่มต้น = โรงเรียนของผู้ใช้) และ composite FK
--     (x_id, school_id) เพื่อกันการอ้างอิงข้ามโรงเรียนในระดับโครงสร้าง
--   * ไม่ลบข้อมูลจริง: ใช้ is_active (ปีการศึกษา/ภาคเรียนเก็บถาวรเสมอ)
--   * is_current เปลี่ยนผ่าน RPC เท่านั้น (migration ถัดไป)
--
-- Rollback plan: drop table classrooms, terms, grade_levels, academic_years,
--                learning_areas; drop function private.validate_*()
-- =============================================================================

-- ---------------------------------------------------------------------------
-- learning_areas — กลุ่มสาระการเรียนรู้
-- ---------------------------------------------------------------------------
create table public.learning_areas (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  code        text not null,
  name_th     text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint learning_areas_code_key unique (school_id, code),
  constraint learning_areas_name_key unique (school_id, name_th),
  constraint learning_areas_id_school_key unique (id, school_id),
  constraint learning_areas_code_format check (code ~ '^[A-Za-z0-9_-]{1,16}$'),
  constraint learning_areas_name_not_blank check (length(btrim(name_th)) between 1 and 200)
);
comment on table public.learning_areas is 'กลุ่มสาระการเรียนรู้ (8 กลุ่มตามหลักสูตรแกนกลาง + กำหนดเองได้)';

-- ---------------------------------------------------------------------------
-- academic_years — ปีการศึกษา (เก็บถาวร ไม่ลบ)
-- ---------------------------------------------------------------------------
create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  year_be     int not null,
  starts_on   date not null,
  ends_on     date not null,
  is_current  boolean not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint academic_years_year_key unique (school_id, year_be),
  constraint academic_years_id_school_key unique (id, school_id),
  constraint academic_years_year_range check (year_be between 2500 and 2700),
  constraint academic_years_dates_order check (ends_on > starts_on),
  constraint academic_years_max_length check (ends_on - starts_on <= 400)
);
comment on table public.academic_years is 'ปีการศึกษา (พ.ศ.) — ไม่ลบ เก็บประวัติถาวร';
-- ปีปัจจุบันได้เพียงปีเดียวต่อโรงเรียน
create unique index academic_years_one_current_idx on public.academic_years (school_id) where is_current;

-- ---------------------------------------------------------------------------
-- terms — ภาคเรียน (1, 2)
-- ---------------------------------------------------------------------------
create table public.terms (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  term_no           smallint not null,
  starts_on         date not null,
  ends_on           date not null,
  is_current        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint terms_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint terms_year_term_key unique (academic_year_id, term_no),
  constraint terms_id_school_key unique (id, school_id),
  constraint terms_term_no_range check (term_no in (1, 2)),
  constraint terms_dates_order check (ends_on > starts_on)
);
comment on table public.terms is 'ภาคเรียน — วันที่ต้องอยู่ภายในปีการศึกษาและไม่ทับซ้อนกัน';
create unique index terms_one_current_idx on public.terms (school_id) where is_current;
create index terms_academic_year_idx on public.terms (academic_year_id);

-- ---------------------------------------------------------------------------
-- grade_levels — ระดับชั้น (ป.1–ป.6, ม.1–ม.6, หรือกำหนดเอง)
-- ---------------------------------------------------------------------------
create table public.grade_levels (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  code         text not null,
  name_th      text not null,
  stage        text not null default 'other',
  level_order  int not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint grade_levels_code_key unique (school_id, code),
  constraint grade_levels_name_key unique (school_id, name_th),
  constraint grade_levels_id_school_key unique (id, school_id),
  constraint grade_levels_code_format check (code ~ '^[A-Za-z0-9_-]{1,16}$'),
  constraint grade_levels_name_not_blank check (length(btrim(name_th)) between 1 and 50),
  constraint grade_levels_stage_check check (stage in ('primary', 'lower_secondary', 'upper_secondary', 'other')),
  constraint grade_levels_order_range check (level_order between 0 and 999)
);
comment on table public.grade_levels is 'ระดับชั้น';

-- ---------------------------------------------------------------------------
-- classrooms — ห้องเรียนต่อปีการศึกษา (เช่น ม.1/1) เก็บประวัติตามปี
-- ---------------------------------------------------------------------------
create table public.classrooms (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  grade_level_id    uuid not null,
  room_no           int not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint classrooms_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint classrooms_grade_fkey foreign key (grade_level_id, school_id)
    references public.grade_levels (id, school_id) on delete restrict,
  constraint classrooms_room_key unique (academic_year_id, grade_level_id, room_no),
  constraint classrooms_id_school_key unique (id, school_id),
  constraint classrooms_room_range check (room_no between 1 and 99)
);
comment on table public.classrooms is 'ห้องเรียนรายปีการศึกษา — ปิดใช้งานแทนการลบ';
create index classrooms_grade_level_idx on public.classrooms (grade_level_id);
create index classrooms_school_year_idx on public.classrooms (school_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- กฎวันที่: ปีการศึกษาไม่ทับซ้อนกัน / ภาคเรียนอยู่ในปีและไม่ทับซ้อนกัน
-- ข้อความ error เป็นภาษาไทย (errcode P0001) เพื่อแสดงต่อผู้ใช้ได้ทันที
-- ---------------------------------------------------------------------------
create or replace function private.validate_academic_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ปล่อยให้ check constraint (dates_order) แจ้งข้อผิดพลาดเรื่องลำดับวันที่
  if new.ends_on <= new.starts_on then
    return new;
  end if;
  if exists (
    select 1 from public.academic_years y
    where y.school_id = new.school_id and y.id <> new.id
      and daterange(y.starts_on, y.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception 'ช่วงวันที่ของปีการศึกษาทับซ้อนกับปีการศึกษาอื่น';
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1 from public.terms t
    where t.academic_year_id = new.id
      and (t.starts_on < new.starts_on or t.ends_on > new.ends_on)
  ) then
    raise exception 'มีภาคเรียนที่อยู่นอกช่วงวันที่ใหม่ของปีการศึกษา กรุณาแก้ไขวันที่ภาคเรียนก่อน';
  end if;
  return new;
end;
$$;

create trigger academic_years_validate
  before insert or update of starts_on, ends_on on public.academic_years
  for each row execute function private.validate_academic_year();

create or replace function private.validate_term()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  y public.academic_years%rowtype;
begin
  -- ปล่อยให้ check constraint (dates_order) แจ้งข้อผิดพลาดเรื่องลำดับวันที่
  if new.ends_on <= new.starts_on then
    return new;
  end if;
  select * into y from public.academic_years where id = new.academic_year_id;
  if new.starts_on < y.starts_on or new.ends_on > y.ends_on then
    raise exception 'วันที่ภาคเรียนต้องอยู่ภายในปีการศึกษา % (% ถึง %)', y.year_be, y.starts_on, y.ends_on;
  end if;
  if exists (
    select 1 from public.terms t
    where t.academic_year_id = new.academic_year_id and t.id <> new.id
      and daterange(t.starts_on, t.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception 'ช่วงวันที่ของภาคเรียนทับซ้อนกับภาคเรียนอื่นในปีเดียวกัน';
  end if;
  if exists (
    select 1 from public.terms t
    where t.academic_year_id = new.academic_year_id and t.id <> new.id
      and ((t.term_no < new.term_no and t.starts_on > new.starts_on)
        or (t.term_no > new.term_no and t.starts_on < new.starts_on))
  ) then
    raise exception 'ภาคเรียนที่ 1 ต้องอยู่ก่อนภาคเรียนที่ 2';
  end if;
  return new;
end;
$$;

create trigger terms_validate
  before insert or update of academic_year_id, term_no, starts_on, ends_on on public.terms
  for each row execute function private.validate_term();

-- ภาคเรียนย้ายปีการศึกษาไม่ได้ (ป้องกันประวัติเพี้ยน)
create or replace function private.lock_columns_after_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception 'ไม่สามารถย้ายข้อมูลข้ามโรงเรียนได้' using errcode = 'insufficient_privilege';
  end if;
  if tg_table_name in ('terms', 'classrooms')
     and (to_jsonb(new) ->> 'academic_year_id') is distinct from (to_jsonb(old) ->> 'academic_year_id') then
    raise exception 'ไม่สามารถย้ายข้อมูลไปปีการศึกษาอื่นได้ กรุณาสร้างรายการใหม่';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- triggers ร่วม: updated_at, lock, audit
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['learning_areas', 'academic_years', 'terms', 'grade_levels', 'classrooms'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I
                    for each row execute function private.set_updated_at()', t);
    execute format('create trigger %1$s_lock_columns before update on public.%1$I
                    for each row execute function private.lock_columns_after_insert()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function private.audit_row_change()', t);
  end loop;
end;
$$;
