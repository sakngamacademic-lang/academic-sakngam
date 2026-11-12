-- =============================================================================
-- Migration: core_identity
-- ตาราง schools, profiles, user_roles + สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่
--
-- Rollback plan: drop trigger on_auth_user_created on auth.users;
--                drop table public.user_roles, public.profiles, public.schools;
--                drop function private.handle_new_user();
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schools — รองรับหลายโรงเรียน (tenant) ทุกข้อมูลอ้างอิง school_id
-- ---------------------------------------------------------------------------
create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  name_th     text not null,
  name_en     text,
  province    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint schools_code_key unique (code),
  constraint schools_code_format check (code ~ '^[A-Za-z0-9_-]{2,32}$'),
  constraint schools_name_th_not_blank check (length(btrim(name_th)) > 0)
);
comment on table public.schools is 'โรงเรียน (tenant)';

create trigger schools_set_updated_at
  before update on public.schools
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles — 1:1 กับ auth.users
--   school_id มาจาก app_metadata (ผู้ใช้แก้เองไม่ได้) เท่านั้น
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  school_id     uuid references public.schools (id) on delete restrict,
  email         text,
  display_name  text not null default '',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- ใช้เป็นเป้าหมายของ composite FK จาก user_roles (บังคับให้ role อยู่โรงเรียนเดียวกับผู้ใช้)
  constraint profiles_id_school_key unique (id, school_id),
  constraint profiles_display_name_len check (length(display_name) <= 200)
);
comment on table public.profiles is 'ข้อมูลผู้ใช้ระบบ (ครู/บุคลากร) — ไม่ใช่ทะเบียนครู (Phase 1.5)';
create index profiles_school_id_idx on public.profiles (school_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_roles — ผู้ใช้หนึ่งคนมีได้หลายบทบาท (ภายในโรงเรียนของตนเท่านั้น)
-- ---------------------------------------------------------------------------
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  school_id   uuid not null references public.schools (id) on delete restrict,
  role        public.app_role not null,
  granted_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  constraint user_roles_unique unique (user_id, school_id, role),
  -- role ต้องอยู่โรงเรียนเดียวกับ profile ของผู้ใช้; ย้ายโรงเรียนต้องลบ role ก่อน
  constraint user_roles_user_school_fkey foreign key (user_id, school_id)
    references public.profiles (id, school_id) on update restrict on delete cascade
);
comment on table public.user_roles is 'บทบาทของผู้ใช้ — แก้ไขได้เฉพาะ system_admin และห้ามแก้บทบาทของตนเอง';
create index user_roles_school_role_idx on public.user_roles (school_id, role);
create index user_roles_granted_by_idx on public.user_roles (granted_by);

-- ---------------------------------------------------------------------------
-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใน auth.users
--   * school_id อ่านจาก raw_app_meta_data เท่านั้น (ตั้งโดย admin/service role)
--   * ห้ามอ่านจาก raw_user_meta_data เพราะผู้ใช้กำหนดเองได้
--   * ไม่มีการให้ role อัตโนมัติ — ต้องให้ system_admin กำหนด
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
begin
  begin
    v_school_id := nullif(new.raw_app_meta_data ->> 'school_id', '')::uuid;
  exception when invalid_text_representation then
    v_school_id := null;
  end;

  if v_school_id is not null
     and not exists (select 1 from public.schools s where s.id = v_school_id and s.is_active) then
    v_school_id := null;
  end if;

  insert into public.profiles (id, school_id, email, display_name)
  values (
    new.id,
    v_school_id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''), 200)
  );
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- อีเมลใน profile ต้องตรงกับ auth.users เสมอ
create or replace function private.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
revoke all on function private.sync_user_email() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_user_email();
