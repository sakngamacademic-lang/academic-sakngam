-- pgTAP: ให้บทบาทเพิ่มแก่บัญชีที่มีอยู่ (ผู้ตรวจคนที่สอง)
-- ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-G', 'โรงเรียนทดสอบ grant');
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000011', 'head@g.test', now(), '{}'),
  ('aaaaaaaa-0000-4000-a000-000000000012', 'rev@g.test', now(), '{}'),
  ('aaaaaaaa-0000-4000-a000-000000000013', 'new@g.test', null, '{}');
select throws_ok($$select private.grant_school_role('rev@g.test', 'T-G', 'academic_staff', 'ผู้ตรวจคนที่สอง (ทดสอบ)', false)$$, 'P0001', null, 'ก่อน bootstrap ผู้ดูแลคนแรก ใช้ไม่ได้');
select private.bootstrap_school_role('head@g.test', 'T-G', array['academic_head']::public.app_role[], 'bootstrap หัวหน้าฝ่ายวิชาการ (ทดสอบ)', false);
select is(private.grant_school_role('rev@g.test', 'T-G', 'academic_staff', 'ผู้ตรวจคนที่สอง (ทดสอบ)') ->> 'dry_run', 'true', 'dry run เป็นค่าเริ่มต้น');
select is((select count(*)::int from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000012'), 0, 'dry run ไม่เขียนข้อมูล');
select throws_ok($$select private.grant_school_role('rev@g.test', 'T-G', 'academic_head', 'ขอสิทธิ์หัวหน้า (ต้องไม่ได้)', false)$$, 'P0001', null, 'ให้ academic_head ผ่านฟังก์ชันนี้ไม่ได้');
select throws_ok($$select private.grant_school_role('new@g.test', 'T-G', 'academic_staff', 'บัญชียังไม่ยืนยันอีเมล', false)$$, 'P0001', null, 'บัญชีที่ยังไม่ยืนยันอีเมลไม่ได้');
select throws_ok($$select private.grant_school_role('head@g.test', 'T-G', 'academic_staff', 'ใช้บัญชีหัวหน้าซ้ำ (ต้องไม่ได้)', false)$$, 'P0001', null, 'ไม่ใช้บัญชี academic_head เดิมเป็นผู้ตรวจ (Two-person)');
select lives_ok($$select private.grant_school_role('rev@g.test', 'T-G', 'academic_staff', 'ผู้ตรวจคนที่สอง (ทดสอบ)', false)$$, 'ให้ academic_staff แก่บัญชีที่มีอยู่ได้');
select ok(exists (select 1 from public.audit_logs where table_name = 'role_grant' and record_id = 'aaaaaaaa-0000-4000-a000-000000000012' and new_data ->> 'reason' like 'ผู้ตรวจ%')
  and (select school_id from public.profiles where id = 'aaaaaaaa-0000-4000-a000-000000000012') = 'aaaaaaaa-0000-4000-a000-000000000000', 'บันทึก audit และผูกโรงเรียน');
set local role service_role;
select throws_ok($$select private.grant_school_role('rev@g.test', 'T-G', 'teacher', 'service role เรียกเอง', false)$$, '42501', null, 'service_role เรียกไม่ได้');
reset role;
select * from finish();
rollback;
