-- pgTAP: โครงสร้างและการป้องกันระดับ schema
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'schools', 'มีตาราง schools');
select has_table('public', 'profiles', 'มีตาราง profiles');
select has_table('public', 'user_roles', 'มีตาราง user_roles');
select has_table('public', 'audit_logs', 'มีตาราง audit_logs');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'ทุกตารางใน public เปิด RLS');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  0, 'anon ไม่มีสิทธิ์บนตารางใด ๆ ใน public');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and 'anon' = any (roles)),
  0, 'ไม่มี policy สำหรับ anon');

select ok(not has_function_privilege('anon', 'private.has_role(public.app_role)', 'execute'),
  'anon เรียก private.has_role ไม่ได้');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon ไม่มีสิทธิ์ใช้ schema private');

select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'insert,update,delete'),
  'authenticated เขียน audit_logs โดยตรงไม่ได้');

-- ตารางใหม่ต้องไม่ถูกเปิดให้ Data API อัตโนมัติ
create table public.__expose_probe (id int);
select ok(
  not has_table_privilege('anon', 'public.__expose_probe', 'select')
  and not has_table_privilege('authenticated', 'public.__expose_probe', 'select'),
  'ตารางที่สร้างใหม่ไม่ถูก GRANT ให้ anon/authenticated อัตโนมัติ');

create function public.__expose_probe_fn() returns int language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public.__expose_probe_fn()', 'execute'),
  'ฟังก์ชันที่สร้างใหม่ไม่ถูกเปิดให้ anon อัตโนมัติ');

select * from finish();
rollback;
