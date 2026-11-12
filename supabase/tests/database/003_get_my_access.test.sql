-- pgTAP: RPC get_my_access
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียนทดสอบ A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'a-multi@t.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'a-suspended@t.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('cccccccc-0000-4000-a000-000000000001', 'noschool@t.test',    '{}');
update public.profiles set is_active = false where id = 'aaaaaaaa-0000-4000-a000-000000000002';
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'system_admin');

select ok(not has_function_privilege('anon', 'public.get_my_access()', 'execute'), 'anon เรียก get_my_access ไม่ได้');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(public.get_my_access() -> 'roles', '["academic_head", "teacher"]'::jsonb, 'คืนทุกบทบาทของผู้ใช้');
select is(public.get_my_access() ->> 'account_status', 'active', 'สถานะ active');
select is(public.get_my_access() -> 'school' ->> 'code', 'T-A', 'คืนโรงเรียนของผู้ใช้');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is(public.get_my_access() -> 'roles', '[]'::jsonb, 'บัญชีถูกระงับไม่ได้รับบทบาทใด');
select is(public.get_my_access() ->> 'account_status', 'suspended', 'สถานะ suspended');

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(public.get_my_access() ->> 'account_status', 'no_school', 'ผู้ใช้ที่ไม่ผูกโรงเรียนมีสถานะ no_school');

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-a000-000000000009","role":"authenticated"}', true);
select is(public.get_my_access(), null, 'ไม่มี profile คืนค่า null');

reset role;
select * from finish();
rollback;
