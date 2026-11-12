-- pgTAP: การแยกข้อมูลตามโรงเรียน/บทบาท และการป้องกันการยกระดับสิทธิ์
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ---------------------------------------------------------------- fixtures
insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียนทดสอบ A'),
  ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียนทดสอบ B');

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'a-admin@t.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}', '{}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'a-head@t.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}', '{}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'a-teacher@t.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}', '{"display_name":"ครู A"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'a-teacher2@t.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}', '{}'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'a-exec@t.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}', '{}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'a-inactive@t.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}', '{}'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'b-admin@t.test',    '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}', '{}'),
  -- พยายามกำหนดโรงเรียนผ่าน user_metadata (ผู้ใช้แก้เองได้) → ต้องไม่ถูกใช้
  ('cccccccc-0000-4000-a000-000000000001', 'meta@t.test',       '{}', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('cccccccc-0000-4000-a000-000000000002', 'badid@t.test',      '{"school_id":"not-a-uuid"}', '{}');

update public.profiles set is_active = false where id = 'aaaaaaaa-0000-4000-a000-000000000006';

insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'system_admin'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'executive'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'system_admin'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', 'system_admin');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------------------------------------------------------------- handle_new_user
select is((select school_id from public.profiles where id = 'aaaaaaaa-0000-4000-a000-000000000003'),
  'aaaaaaaa-0000-4000-a000-000000000000'::uuid, 'profile ได้ school_id จาก app_metadata');
select is((select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-a000-000000000003'),
  'ครู A', 'profile ได้ display_name จาก user_metadata');
select is((select school_id from public.profiles where id = 'cccccccc-0000-4000-a000-000000000001'),
  null, 'school_id ใน user_metadata ถูกละเลย (กันยกระดับสิทธิ์)');
select is((select school_id from public.profiles where id = 'cccccccc-0000-4000-a000-000000000002'),
  null, 'school_id ที่ไม่ใช่ UUID ไม่ทำให้สร้างผู้ใช้ล้มเหลว');
select throws_ok(
  $$insert into public.user_roles (user_id, school_id, role)
    values ('aaaaaaaa-0000-4000-a000-000000000003', 'bbbbbbbb-0000-4000-a000-000000000000', 'teacher')$$,
  '23503', null, 'ให้ role ข้ามโรงเรียนไม่ได้ (composite FK)');

-- ---------------------------------------------------------------- anon
set local role anon;
select throws_ok('select * from public.profiles', '42501', null, 'anon อ่าน profiles ไม่ได้');
reset role;

-- ---------------------------------------------------------------- teacher A
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select count(*)::int from public.profiles), 1, 'ครูเห็นเฉพาะ profile ของตนเอง');
select is((select count(*)::int from public.schools), 1, 'ครูเห็นเฉพาะโรงเรียนของตนเอง');
select is((select count(*)::int from public.user_roles), 1, 'ครูเห็นเฉพาะบทบาทของตนเอง');
select is((select count(*)::int from public.audit_logs), 0, 'ครูอ่าน audit_logs ไม่ได้');

select lives_ok($$update public.profiles set display_name = 'ครู A (แก้ไข)' where id = 'aaaaaaaa-0000-4000-a000-000000000003'$$,
  'ครูแก้ display_name ของตนเองได้');
select throws_ok($$update public.profiles set school_id = 'bbbbbbbb-0000-4000-a000-000000000000' where id = 'aaaaaaaa-0000-4000-a000-000000000003'$$,
  '42501', null, 'ครูย้ายโรงเรียนตนเองไม่ได้');
select throws_ok($$update public.profiles set is_active = true where id = 'aaaaaaaa-0000-4000-a000-000000000003'$$,
  '42501', null, 'ครูแก้ is_active ไม่ได้');
update public.profiles set display_name = 'hacked' where id = 'aaaaaaaa-0000-4000-a000-000000000004';
select throws_ok($$insert into public.user_roles (user_id, school_id, role)
    values ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'system_admin')$$,
  '42501', null, 'ครูให้สิทธิ์ system_admin กับตนเองไม่ได้');
select throws_ok($$insert into public.user_roles (user_id, school_id, role)
    values ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head')$$,
  '42501', null, 'ครูให้สิทธิ์ผู้อื่นไม่ได้');
select throws_ok($$update public.user_roles set role = 'system_admin' where user_id = 'aaaaaaaa-0000-4000-a000-000000000003'$$,
  '42501', null, 'ครูแก้บทบาทของตนเองไม่ได้ (ไม่มีสิทธิ์ UPDATE)');
delete from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000003';
reset role;

select is((select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-a000-000000000004'),
  '', 'ครูแก้ profile ของผู้อื่นไม่ได้ (RLS ไม่พบแถว)');
select is((select count(*)::int from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000003'),
  1, 'ครูลบบทบาทของตนเองไม่ได้');

-- ---------------------------------------------------------------- academic head A
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select is((select count(*)::int from public.profiles), 6, 'หัวหน้าวิชาการเห็น profile ทุกคนในโรงเรียน A');
select is((select count(*)::int from public.profiles where school_id = 'bbbbbbbb-0000-4000-a000-000000000000'),
  0, 'หัวหน้าวิชาการไม่เห็น profile โรงเรียน B');
select ok((select count(*) from public.audit_logs) > 0
  and not exists (select 1 from public.audit_logs where school_id is distinct from 'aaaaaaaa-0000-4000-a000-000000000000'),
  'หัวหน้าวิชาการอ่าน audit_logs ได้เฉพาะโรงเรียน A');
select throws_ok($$insert into public.user_roles (user_id, school_id, role)
    values ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff')$$,
  '42501', null, 'หัวหน้าวิชาการกำหนดบทบาทไม่ได้ (เฉพาะ system_admin)');
reset role;

-- ---------------------------------------------------------------- executive A
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select is((select count(*)::int from public.audit_logs), 0, 'ผู้บริหารอ่าน audit_logs ไม่ได้');
update public.schools set name_th = 'เปลี่ยนชื่อ' where id = 'aaaaaaaa-0000-4000-a000-000000000000';
reset role;
select is((select name_th from public.schools where id = 'aaaaaaaa-0000-4000-a000-000000000000'),
  'โรงเรียนทดสอบ A', 'ผู้บริหารแก้ข้อมูลโรงเรียนไม่ได้');

-- ---------------------------------------------------------------- system admin A
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$insert into public.user_roles (user_id, school_id, role)
    values ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff')$$,
  'system_admin ให้บทบาทแก่ครูในโรงเรียนเดียวกันได้');
select throws_ok($$insert into public.user_roles (user_id, school_id, role)
    values ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head')$$,
  '42501', null, 'system_admin ให้บทบาทแก่ตนเองไม่ได้');
select throws_ok($$insert into public.user_roles (user_id, school_id, role)
    values ('bbbbbbbb-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', 'teacher')$$,
  '42501', null, 'system_admin A กำหนดบทบาทในโรงเรียน B ไม่ได้');
select throws_ok($$insert into public.user_roles (user_id, school_id, role, granted_by)
    values ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'executive', 'aaaaaaaa-0000-4000-a000-000000000002')$$,
  '42501', null, 'ปลอม granted_by ไม่ได้');
delete from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000001';
select lives_ok($$update public.schools set name_th = 'โรงเรียนทดสอบ A (แก้ไข)' where id = 'aaaaaaaa-0000-4000-a000-000000000000'$$,
  'system_admin แก้ชื่อโรงเรียนตนเองได้');
reset role;

select is((select count(*)::int from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000001'),
  1, 'system_admin ลบบทบาทของตนเองไม่ได้ (กันล็อกระบบ)');
select is((select granted_by from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000004' and role = 'academic_staff'),
  'aaaaaaaa-0000-4000-a000-000000000001'::uuid, 'granted_by ถูกบันทึกเป็นผู้ให้สิทธิ์จริง');
select ok(exists (select 1 from public.audit_logs where table_name = 'user_roles' and action = 'INSERT'
    and actor_id = 'aaaaaaaa-0000-4000-a000-000000000001'),
  'การให้บทบาทถูกบันทึกใน audit_logs พร้อมผู้กระทำ');

-- ---------------------------------------------------------------- inactive admin A
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select is((select count(*)::int from public.schools), 0, 'ผู้ใช้ที่ถูกระงับไม่เห็นข้อมูลโรงเรียน');
select throws_ok($$insert into public.user_roles (user_id, school_id, role)
    values ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'executive')$$,
  '42501', null, 'system_admin ที่ถูกระงับกำหนดบทบาทไม่ได้');
reset role;

-- ---------------------------------------------------------------- audit append-only
select throws_ok('delete from public.audit_logs', '42501', null, 'ลบ audit_logs ไม่ได้แม้เป็นเจ้าของตาราง');

select * from finish();
rollback;
