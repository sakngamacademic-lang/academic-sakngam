-- =============================================================================
-- Migration: audit_logs
-- บันทึกการเปลี่ยนแปลงแบบ append-only (เพิ่มได้เฉพาะผ่าน trigger, แก้/ลบไม่ได้)
--
-- Rollback plan: drop trigger ... on schools/profiles/user_roles;
--                drop table public.audit_logs; drop function private.audit_row_change();
-- =============================================================================

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  school_id   uuid references public.schools (id) on delete set null,
  actor_id    uuid,                 -- auth.uid() ณ เวลาที่เกิดเหตุการณ์ (null = ระบบ/service)
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.audit_logs is 'บันทึกการเปลี่ยนแปลงข้อมูลสำคัญ (append-only)';
create index audit_logs_school_created_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);

-- ห้ามแก้ไข/ลบบันทึก — แม้แต่ service_role
create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_mutation();

-- trigger กลางสำหรับตารางที่มีคอลัมน์ id (uuid) และ school_id (หรือเป็นตาราง schools)
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_school uuid;
begin
  if tg_op = 'UPDATE' and v_old - 'updated_at' = v_new - 'updated_at' then
    return null; -- ไม่มีการเปลี่ยนแปลงจริง
  end if;

  v_school := case when tg_table_name = 'schools'
                   then (v_row ->> 'id')::uuid
                   else (v_row ->> 'school_id')::uuid end;

  insert into public.audit_logs (school_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (v_school, auth.uid(), tg_table_name, (v_row ->> 'id')::uuid, tg_op, v_old, v_new);
  return null;
end;
$$;
revoke all on function private.audit_row_change() from public, anon, authenticated;

create trigger schools_audit after insert or update or delete on public.schools
  for each row execute function private.audit_row_change();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function private.audit_row_change();
