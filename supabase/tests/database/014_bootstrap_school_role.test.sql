-- pgTAP: bootstrap บทบาทแรกของโรงเรียน — postgres เท่านั้น, ครั้งแรกเท่านั้น, dry run, audit, ไม่ย้ายโรงเรียน
-- ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-BOOT', 'โรงเรียนทดสอบ bootstrap'),
  ('bbbbbbbb-0000-4000-a000-000000000000', 'T-OTHER', 'โรงเรียนอื่น');
-- บัญชีที่สร้างผ่าน Dashboard โดยไม่มี app_metadata.school_id → profile.school_id = null (สาเหตุที่พบบ่อย)
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000011', 'owner@boot.test', now(), '{"provider":"email"}'),
  ('aaaaaaaa-0000-4000-a000-000000000012', 'second@boot.test', now(), '{}'),
  ('aaaaaaaa-0000-4000-a000-000000000013', 'unconfirmed@boot.test', null, '{}'),
  ('aaaaaaaa-0000-4000-a000-000000000014', 'other@boot.test', now(), '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');

select is((select school_id from public.profiles where id = 'aaaaaaaa-0000-4000-a000-000000000011'), null::uuid,
  'บัญชีที่ไม่มี app_metadata.school_id ตอนสร้าง → profile ไม่ผูกโรงเรียน (เข้าระบบได้แต่ไม่มีสิทธิ์)');

select is(private.bootstrap_school_role('owner@boot.test', 'T-BOOT', array['academic_head']::public.app_role[], 'ทดสอบ dry run บัญชีแรก') ->> 'set_profile_school',
  'true', 'dry run (ค่าเริ่มต้น) คืนแผนงาน');
select is((select count(*)::int from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000011'), 0, 'dry run ไม่เขียนข้อมูล');

select throws_ok($$select private.bootstrap_school_role('owner@boot.test', 'T-BOOT', array['teacher']::public.app_role[], 'ให้บทบาทอื่นไม่ได้', false)$$,
  'P0001', null, 'bootstrap ให้ได้เฉพาะ academic_head / system_admin');
select throws_ok($$select private.bootstrap_school_role('owner@boot.test', 'T-BOOT', array['academic_head']::public.app_role[], 'สั้น', false)$$,
  'P0001', null, 'ต้องมีเหตุผล');
select throws_ok($$select private.bootstrap_school_role('unconfirmed@boot.test', 'T-BOOT', array['academic_head']::public.app_role[], 'บัญชียังไม่ยืนยันอีเมล', false)$$,
  'P0001', null, 'บัญชีที่ยังไม่ยืนยันอีเมลใช้ไม่ได้');
select throws_ok($$select private.bootstrap_school_role('other@boot.test', 'T-BOOT', array['academic_head']::public.app_role[], 'บัญชีของโรงเรียนอื่น', false)$$,
  'P0001', null, 'ไม่ย้ายโรงเรียนของ profile อัตโนมัติ');

select lives_ok($$select private.bootstrap_school_role('owner@boot.test', 'T-BOOT', array['academic_head']::public.app_role[], 'กำหนดเจ้าของระบบเป็นหัวหน้าฝ่ายวิชาการ (ทดสอบ)', false)$$,
  'postgres bootstrap บัญชีแรกได้');
select is((select p.school_id::text || '/' || (u.raw_app_meta_data ->> 'school_id') || '/' || (u.raw_app_meta_data ->> 'provider')
           from public.profiles p join auth.users u on u.id = p.id where p.id = 'aaaaaaaa-0000-4000-a000-000000000011'),
  'aaaaaaaa-0000-4000-a000-000000000000/aaaaaaaa-0000-4000-a000-000000000000/email', 'ผูก profile + app_metadata.school_id (คงค่าเดิมใน app_metadata)');
select is((select string_agg(role::text, ',') from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000011'), 'academic_head', 'ได้บทบาท academic_head');
select ok(exists (select 1 from public.audit_logs where table_name = 'role_bootstrap' and record_id = 'aaaaaaaa-0000-4000-a000-000000000011' and new_data ->> 'reason' like 'กำหนดเจ้าของระบบ%')
  and exists (select 1 from public.audit_logs where table_name = 'user_roles' and (new_data ->> 'user_id') = 'aaaaaaaa-0000-4000-a000-000000000011'),
  'บันทึก audit ทั้งแถวสรุปเหตุผลและการเพิ่มบทบาท');

select throws_ok($$select private.bootstrap_school_role('second@boot.test', 'T-BOOT', array['academic_head']::public.app_role[], 'พยายาม bootstrap ซ้ำ', false)$$,
  '42501', null, 'โรงเรียนที่มีผู้ดูแลแล้ว bootstrap ซ้ำไม่ได้');

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-4000-a000-000000000011', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select (a ->> 'account_status') || '/' || (a -> 'school' ->> 'code') || '/' || (a -> 'roles')::text from public.get_my_access() a),
  'active/T-BOOT/["academic_head"]', 'get_my_access() หลัง bootstrap: active + โรงเรียน + academic_head');
reset role;
set local role service_role;
select throws_ok($$select private.bootstrap_school_role('second@boot.test', 'T-OTHER', array['academic_head']::public.app_role[], 'service role เรียกเอง', false)$$,
  '42501', null, 'service_role (API) เรียก bootstrap ไม่ได้');
reset role;

select * from finish();
rollback;
