-- pgTAP: ทะเบียนครู (Phase 1.5) — constraints, สิทธิ์ 6 บทบาท, scope กลุ่มสาระ, ผูกบัญชี, ข้ามโรงเรียน
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ---------------------------------------------------------------- fixtures
insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'),
  ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');

insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'admin@a.test',   '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test',   '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'area@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'exec@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'teacher@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000007', 'new@a.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'admin@b.test',   '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000002', 'user@b.test',    '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');

insert into public.learning_areas (id, school_id, code, name_th) values
  ('aaaaaaaa-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'MA', 'คณิตศาสตร์'),
  ('aaaaaaaa-1111-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย'),
  ('bbbbbbbb-1111-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', 'MA', 'คณิตศาสตร์');

insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'system_admin', null),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff', null),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', 'aaaaaaaa-1111-4000-a000-000000000001'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'executive', null),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', 'system_admin', null);

insert into public.teachers (id, school_id, profile_id, teacher_code, prefix, first_name, last_name, learning_area_id) values
  ('aaaaaaaa-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000006', 'T1', 'นาย', 'ครู', 'คณิต', 'aaaaaaaa-1111-4000-a000-000000000001'),
  ('aaaaaaaa-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', null, 'T2', 'นาง', 'ครู', 'ไทย', 'aaaaaaaa-1111-4000-a000-000000000002'),
  ('aaaaaaaa-5555-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', null, 'T3', 'นาง', 'ครู', 'คณิตสอง', 'aaaaaaaa-1111-4000-a000-000000000001'),
  ('bbbbbbbb-5555-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', null, 'T1', 'นาย', 'ครู', 'โรงเรียนบี', 'bbbbbbbb-1111-4000-a000-000000000001');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------------------------------------------------------------- schema / constraints (เจ้าของตาราง)
select has_table('public', 'teachers', 'มีตาราง teachers');
select ok((select relrowsecurity from pg_class where oid = 'public.teachers'::regclass), 'teachers เปิด RLS');
select ok(not has_table_privilege('anon', 'public.teachers', 'select'), 'anon อ่าน teachers ไม่ได้');
select ok(not has_table_privilege('authenticated', 'public.teachers', 'delete'), 'ไม่มีสิทธิ์ลบ (ใช้สถานะแทน)');
select ok(not has_column_privilege('authenticated', 'public.teachers', 'profile_id', 'update'), 'แก้ profile_id ตรงไม่ได้');
select ok(not has_column_privilege('authenticated', 'public.teachers', 'school_id', 'insert'), 'กำหนด school_id เองไม่ได้');

select throws_ok($$insert into public.teachers (school_id, teacher_code, prefix, first_name, last_name)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'T1', 'นาย', 'ซ้ำ', 'รหัส')$$, '23505', null, 'รหัสครูซ้ำในโรงเรียนเดียวกันไม่ได้');
select lives_ok($$insert into public.teachers (school_id, teacher_code, prefix, first_name, last_name)
  values ('bbbbbbbb-0000-4000-a000-000000000000', 'T2', 'นาย', 'รหัส', 'เดียวกันต่างโรงเรียน')$$, 'รหัสเดียวกันต่างโรงเรียนได้');
select throws_ok($$insert into public.teachers (school_id, teacher_code, prefix, first_name, last_name, position)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'X1', 'นาย', 'ก', 'ข', 'ceo')$$, '23514', null, 'ตำแหน่งต้องอยู่ในรายการ');
select throws_ok($$insert into public.teachers (school_id, teacher_code, prefix, first_name, last_name, employment_status)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'X2', 'นาย', 'ก', 'ข', 'fired')$$, '23514', null, 'สถานะต้องอยู่ในรายการ');
select throws_ok($$insert into public.teachers (school_id, teacher_code, prefix, first_name, last_name)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'X3', 'นาย', '   ', 'ข')$$, '23514', null, 'ชื่อว่างไม่ได้');
select throws_ok($$insert into public.teachers (school_id, teacher_code, prefix, first_name, last_name, learning_area_id)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'X4', 'นาย', 'ก', 'ข', 'bbbbbbbb-1111-4000-a000-000000000001')$$, '23503', null, 'กลุ่มสาระต้องเป็นของโรงเรียนเดียวกัน');
select throws_ok($$insert into public.teachers (school_id, profile_id, teacher_code, prefix, first_name, last_name)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000002', 'X5', 'นาย', 'ก', 'ข')$$, '23503', null, 'บัญชีต้องอยู่โรงเรียนเดียวกัน');
select throws_ok($$insert into public.teachers (school_id, profile_id, teacher_code, prefix, first_name, last_name)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000006', 'X6', 'นาย', 'ก', 'ข')$$, '23505', null, 'บัญชีเดียวผูกได้ระเบียนเดียว (ไม่ซ้ำ)');
select lives_ok($$insert into public.teachers (school_id, teacher_code, prefix, first_name, last_name, email)
  values ('aaaaaaaa-0000-4000-a000-000000000000', ' X7 ', ' นาง ', ' ไม่มี ', ' บัญชี ', ' New.Person@A.Test ')$$, 'เพิ่มครูที่ยังไม่มีบัญชีได้');
select results_eq($$select teacher_code || '|' || first_name || '|' || email from public.teachers where teacher_code = 'X7'$$,
  $$values ('X7|ไม่มี|new.person@a.test')$$, 'ตัดช่องว่างและอีเมลเป็นตัวพิมพ์เล็ก');

-- ---------------------------------------------------------------- SELECT ตามบทบาท
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((select count(*)::int from public.teachers), 4, 'system_admin เห็นครูทั้งโรงเรียน (4)');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select is((select count(*)::int from public.teachers), 4, 'academic_head เห็นทั้งโรงเรียน');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select count(*)::int from public.teachers), 4, 'academic_staff เห็นทั้งโรงเรียน');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select is((select count(*)::int from public.teachers), 4, 'executive เห็นทั้งโรงเรียน');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select results_eq($$select teacher_code from public.teachers order by teacher_code$$, $$values ('T1'), ('T3')$$,
  'หัวหน้ากลุ่มสาระคณิตเห็นเฉพาะครูคณิต');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select results_eq($$select teacher_code from public.teachers$$, $$values ('T1')$$, 'ครูเห็นเฉพาะระเบียนของตนเอง');
select is(private.my_teacher_id(), 'aaaaaaaa-5555-4000-a000-000000000001'::uuid, 'my_teacher_id() ของครู');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000007');
select is((select count(*)::int from public.teachers), 0, 'ผู้ใช้ที่ไม่มีบทบาทไม่เห็นอะไร');
reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000001');
select results_eq($$select first_name || last_name from public.teachers order by teacher_code$$,
  $$values ('ครูโรงเรียนบี'), ('รหัสเดียวกันต่างโรงเรียน')$$, 'โรงเรียน B เห็นเฉพาะครูของตน');

-- ---------------------------------------------------------------- INSERT / UPDATE ตามบทบาท
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select lives_ok($$insert into public.teachers (teacher_code, prefix, first_name, last_name, learning_area_id)
  values ('N1', 'นาย', 'ใหม่', 'โดยเจ้าหน้าที่', 'aaaaaaaa-1111-4000-a000-000000000002')$$, 'academic_staff เพิ่มครูได้');
select is((select school_id from public.teachers where teacher_code = 'N1'), 'aaaaaaaa-0000-4000-a000-000000000000'::uuid,
  'school_id ใส่ให้อัตโนมัติจากผู้ใช้');
select lives_ok($$update public.teachers set employment_status = 'on_leave' where teacher_code = 'T2'$$, 'academic_staff แก้สถานะได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select lives_ok($$update public.teachers set position = 'assistant_teacher' where teacher_code = 'T3'$$, 'academic_head แก้ไขได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$insert into public.teachers (teacher_code, prefix, first_name, last_name) values ('N2', 'นาง', 'ใหม่', 'โดยแอดมิน')$$,
  'system_admin เพิ่มครูได้');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select throws_ok($$insert into public.teachers (teacher_code, prefix, first_name, last_name, learning_area_id)
  values ('N3', 'นาย', 'ก', 'ข', 'aaaaaaaa-1111-4000-a000-000000000001')$$, '42501', null, 'หัวหน้ากลุ่มสาระเพิ่มครูไม่ได้ (แม้กลุ่มตนเอง)');
update public.teachers set first_name = 'แก้' where teacher_code = 'T1';
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select throws_ok($$insert into public.teachers (teacher_code, prefix, first_name, last_name) values ('N4', 'นาย', 'ก', 'ข')$$,
  '42501', null, 'ผู้บริหารเพิ่มครูไม่ได้');
update public.teachers set first_name = 'แก้' where teacher_code = 'T1';
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
update public.teachers set first_name = 'แก้' where teacher_code = 'T1';
select throws_ok($$insert into public.teachers (teacher_code, prefix, first_name, last_name) values ('N5', 'นาย', 'ก', 'ข')$$,
  '42501', null, 'ครูเพิ่มระเบียนไม่ได้');
reset role;
select is((select first_name from public.teachers where id = 'aaaaaaaa-5555-4000-a000-000000000001'), 'ครู', 'หัวหน้ากลุ่มสาระ / ผู้บริหาร / ครู แก้ระเบียนไม่ได้');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$update public.teachers set profile_id = 'aaaaaaaa-0000-4000-a000-000000000007' where teacher_code = 'T2'$$,
  '42501', null, 'แก้ profile_id ตรงไม่ได้ (ต้องใช้ RPC)');
select throws_ok($$delete from public.teachers where teacher_code = 'T2'$$, '42501', null, 'ลบระเบียนครูไม่ได้');
reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000001');
update public.teachers set first_name = 'ข้ามโรงเรียน' where id = 'aaaaaaaa-5555-4000-a000-000000000002';
reset role;
select isnt((select first_name from public.teachers where id = 'aaaaaaaa-5555-4000-a000-000000000002'), 'ข้ามโรงเรียน',
  'แอดมินโรงเรียนอื่นแก้ครูโรงเรียน A ไม่ได้');

-- ---------------------------------------------------------------- ผูกบัญชี (RPC)
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select public.link_teacher_account('aaaaaaaa-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000007')$$,
  '42501', null, 'academic_staff ผูกบัญชีไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$select public.link_teacher_account('aaaaaaaa-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000006')$$,
  '42501', null, 'ครูผูกบัญชีตนเองกับระเบียนอื่นไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select lives_ok($$select public.link_teacher_account('aaaaaaaa-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000007')$$,
  'academic_head ผูกบัญชีที่มีอยู่แล้วได้');
select throws_ok($$select public.link_teacher_account('aaaaaaaa-5555-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000007')$$,
  'P0001', 'บัญชีนี้ผูกกับระเบียนครูคนอื่นอยู่แล้ว', 'บัญชีเดียวผูกสองระเบียนไม่ได้');
select throws_ok($$select public.link_teacher_account('aaaaaaaa-5555-4000-a000-000000000003', 'bbbbbbbb-0000-4000-a000-000000000002')$$,
  'P0001', 'ไม่พบบัญชีผู้ใช้ในโรงเรียนนี้', 'ผูกบัญชีโรงเรียนอื่นไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$select public.unlink_teacher_account('aaaaaaaa-5555-4000-a000-000000000002')$$, 'system_admin ยกเลิกการผูกได้');
reset role;
select is((select count(*)::int from auth.users), (select count(*)::int from public.profiles), 'ไม่มีการสร้างบัญชีเพิ่มจากการผูก');
select ok(exists (select 1 from public.audit_logs where table_name = 'teachers' and action = 'UPDATE'
  and old_data ->> 'profile_id' = 'aaaaaaaa-0000-4000-a000-000000000007'), 'การยกเลิกผูกบัญชีถูกบันทึก audit log');
select ok(exists (select 1 from public.audit_logs where table_name = 'teachers' and action = 'INSERT'), 'การเพิ่มครูถูกบันทึก audit log');

select * from finish();
rollback;
