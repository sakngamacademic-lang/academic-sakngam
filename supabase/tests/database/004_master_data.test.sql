-- pgTAP: Master Data — constraints, RPC, สิทธิ์ 6 บทบาท, scope กลุ่มสาระ, ข้ามโรงเรียน
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- ---------------------------------------------------------------- fixtures
insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'),
  ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');

insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'admin@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'area@a.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'exec@a.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'teacher@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'admin@b.test',    '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');

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

insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values
  ('aaaaaaaa-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7),
  ('bbbbbbbb-2222-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7);

insert into public.academic_years (id, school_id, year_be, starts_on, ends_on) values
  ('aaaaaaaa-3333-4000-a000-000000002568', 'aaaaaaaa-0000-4000-a000-000000000000', 2568, '2025-05-16', '2026-05-15'),
  ('bbbbbbbb-3333-4000-a000-000000002569', 'bbbbbbbb-0000-4000-a000-000000000000', 2569, '2026-05-16', '2027-05-15');

insert into public.terms (id, school_id, academic_year_id, term_no, starts_on, ends_on) values
  ('aaaaaaaa-4444-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 1, '2025-05-16', '2025-10-10');

insert into public.classrooms (school_id, academic_year_id, grade_level_id, room_no) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 'aaaaaaaa-2222-4000-a000-000000000001', 1),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 'aaaaaaaa-2222-4000-a000-000000000001', 2);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------------------------------------------------------------- constraints (เจ้าของตาราง)
select throws_ok($$insert into public.academic_years (school_id, year_be, starts_on, ends_on)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 2568, '2030-05-16', '2031-05-15')$$, '23505', null, 'ปีการศึกษาซ้ำในโรงเรียนเดียวกันไม่ได้');
select throws_ok($$insert into public.academic_years (school_id, year_be, starts_on, ends_on)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 2580, '2037-05-16', '2037-05-01')$$, '23514', null, 'วันสิ้นสุดก่อนวันเริ่มไม่ได้');
select throws_ok($$insert into public.academic_years (school_id, year_be, starts_on, ends_on)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 2567, '2024-06-01', '2025-06-01')$$, 'P0001', null, 'ช่วงวันที่ปีการศึกษาทับซ้อนไม่ได้');
select lives_ok($$insert into public.academic_years (school_id, year_be, starts_on, ends_on)
  values ('bbbbbbbb-0000-4000-a000-000000000000', 2568, '2025-05-16', '2026-05-15')$$, 'ปีเดียวกันในโรงเรียนอื่นได้');
select throws_ok($$insert into public.terms (school_id, academic_year_id, term_no, starts_on, ends_on)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 2, '2025-11-01', '2026-06-30')$$,
  'P0001', null, 'ภาคเรียนอยู่นอกปีการศึกษาไม่ได้');
select throws_ok($$insert into public.terms (school_id, academic_year_id, term_no, starts_on, ends_on)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 2, '2025-10-01', '2026-03-31')$$,
  'P0001', null, 'ภาคเรียนทับซ้อนกันไม่ได้');
select throws_ok($$insert into public.terms (school_id, academic_year_id, term_no, starts_on, ends_on)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 3, '2026-04-01', '2026-05-10')$$,
  '23514', null, 'มีเฉพาะภาคเรียนที่ 1 และ 2');
update public.terms set term_no = 2 where id = 'aaaaaaaa-4444-4000-a000-000000000001';
select throws_ok($$insert into public.terms (school_id, academic_year_id, term_no, starts_on, ends_on)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 1, '2025-11-01', '2026-03-31')$$,
  'P0001', null, 'ภาคเรียนที่ 1 ต้องอยู่ก่อนภาคเรียนที่ 2');
update public.terms set term_no = 1 where id = 'aaaaaaaa-4444-4000-a000-000000000001';
select throws_ok($$update public.academic_years set ends_on = '2025-09-30' where id = 'aaaaaaaa-3333-4000-a000-000000002568'$$,
  'P0001', null, 'แก้วันที่ปีจนภาคเรียนหลุดช่วงไม่ได้');
select throws_ok($$insert into public.classrooms (school_id, academic_year_id, grade_level_id, room_no)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 'aaaaaaaa-2222-4000-a000-000000000001', 1)$$,
  '23505', null, 'ห้องเรียนซ้ำในปีเดียวกันไม่ได้');
select throws_ok($$insert into public.classrooms (school_id, academic_year_id, grade_level_id, room_no)
  values ('aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000002568', 'bbbbbbbb-2222-4000-a000-000000000001', 3)$$,
  '23503', null, 'ห้องเรียนอ้างระดับชั้นของโรงเรียนอื่นไม่ได้ (composite FK)');
select throws_ok($$insert into public.user_roles (user_id, school_id, role, learning_area_id)
  values ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', 'bbbbbbbb-1111-4000-a000-000000000001')$$,
  '23503', null, 'scope กลุ่มสาระของโรงเรียนอื่นไม่ได้');

-- ---------------------------------------------------------------- academic_head
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select lives_ok($$insert into public.academic_years (id, year_be, starts_on, ends_on)
  values ('aaaaaaaa-3333-4000-a000-000000002569', 2569, '2026-05-16', '2027-05-15')$$, 'หัวหน้าวิชาการเพิ่มปีการศึกษาได้ (school_id ใส่ให้อัตโนมัติ)');
select is((select school_id from public.academic_years where id = 'aaaaaaaa-3333-4000-a000-000000002569'),
  'aaaaaaaa-0000-4000-a000-000000000000'::uuid, 'school_id เป็นโรงเรียนของผู้ใช้');
select throws_ok($$insert into public.academic_years (school_id, year_be, starts_on, ends_on)
  values ('bbbbbbbb-0000-4000-a000-000000000000', 2570, '2027-05-16', '2028-05-15')$$, '42501', null, 'กำหนด school_id เองไม่ได้');
select lives_ok($$insert into public.terms (id, academic_year_id, term_no, starts_on, ends_on)
  values ('aaaaaaaa-4444-4000-a000-000000000003', 'aaaaaaaa-3333-4000-a000-000000002569', 1, '2026-05-16', '2026-10-10')$$, 'เพิ่มภาคเรียนได้');
select lives_ok($$select public.set_current_academic_year('aaaaaaaa-3333-4000-a000-000000002568')$$, 'ตั้งปีปัจจุบันได้');
select lives_ok($$select public.set_current_term('aaaaaaaa-4444-4000-a000-000000000003')$$, 'ตั้งภาคเรียนปัจจุบันได้');
select is((select array_agg(year_be) from public.academic_years where is_current), array[2569],
  'ตั้งภาคเรียนปัจจุบันแล้วปีของภาคนั้นเป็นปีปัจจุบันเพียงปีเดียว');
select is((select count(*)::int from public.terms where is_current), 1, 'ภาคเรียนปัจจุบันมีเพียงภาคเดียว');
select lives_ok($$select public.set_current_academic_year('aaaaaaaa-3333-4000-a000-000000002568')$$, 'ย้ายปีปัจจุบันกลับ');
select is((select count(*)::int from public.terms where is_current), 0, 'ภาคเรียนปัจจุบันของปีอื่นถูกยกเลิก');
select throws_ok($$update public.academic_years set is_current = true where id = 'aaaaaaaa-3333-4000-a000-000000002569'$$,
  '42501', null, 'แก้ is_current โดยตรงไม่ได้ (ต้องใช้ RPC)');
select is(public.copy_classrooms('aaaaaaaa-3333-4000-a000-000000002568', 'aaaaaaaa-3333-4000-a000-000000002569'), 2,
  'คัดลอกห้องเรียนไปปีใหม่ได้');
select is(public.copy_classrooms('aaaaaaaa-3333-4000-a000-000000002568', 'aaaaaaaa-3333-4000-a000-000000002569'), 0,
  'คัดลอกซ้ำไม่สร้างห้องซ้ำ');
select lives_ok($$update public.classrooms set is_active = false where room_no = 2
  and academic_year_id = 'aaaaaaaa-3333-4000-a000-000000002569'$$, 'ปิดใช้งานห้องเรียนได้');
select throws_ok($$delete from public.classrooms$$, '42501', null, 'ลบห้องเรียนไม่ได้ (ใช้ปิดใช้งานแทน)');
select throws_ok($$update public.terms set academic_year_id = 'aaaaaaaa-3333-4000-a000-000000002568'
  where id = 'aaaaaaaa-4444-4000-a000-000000000003'$$, '42501', null, 'ย้ายภาคเรียนข้ามปีไม่ได้');
select lives_ok($$insert into public.learning_areas (code, name_th) values ('SC', 'วิทยาศาสตร์')$$, 'หัวหน้าวิชาการเพิ่มกลุ่มสาระได้');
select throws_ok($$select public.set_current_academic_year('bbbbbbbb-3333-4000-a000-000000002569')$$,
  'P0001', null, 'ตั้งปีปัจจุบันของโรงเรียนอื่นไม่ได้');

-- ---------------------------------------------------------------- academic_staff
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select lives_ok($$insert into public.grade_levels (code, name_th, stage, level_order) values ('M2', 'ม.2', 'lower_secondary', 8)$$,
  'เจ้าหน้าที่วิชาการเพิ่มระดับชั้นได้');
select throws_ok($$insert into public.learning_areas (code, name_th) values ('AR', 'ศิลปะ')$$,
  '42501', null, 'เจ้าหน้าที่วิชาการเพิ่มกลุ่มสาระไม่ได้');
select is((select count(*)::int from public.learning_areas), 3, 'เจ้าหน้าที่วิชาการเห็นกลุ่มสาระทั้งโรงเรียน');

-- ---------------------------------------------------------------- system_admin
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$insert into public.user_roles (user_id, school_id, role, learning_area_id)
  values ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', 'aaaaaaaa-1111-4000-a000-000000000002')$$,
  'system_admin มอบหมายหัวหน้ากลุ่มสาระได้');
select throws_ok($$insert into public.user_roles (user_id, school_id, role)
  values ('aaaaaaaa-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head')$$,
  '23514', null, 'หัวหน้ากลุ่มสาระต้องระบุกลุ่มสาระ');
select throws_ok($$insert into public.user_roles (user_id, school_id, role, learning_area_id)
  values ('aaaaaaaa-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff', 'aaaaaaaa-1111-4000-a000-000000000001')$$,
  '23514', null, 'บทบาทอื่นมี scope กลุ่มสาระไม่ได้');
select lives_ok($$delete from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000006' and role = 'learning_area_head'$$,
  'system_admin ถอนหัวหน้ากลุ่มสาระได้');

-- ---------------------------------------------------------------- learning_area_head (คณิตศาสตร์)
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select is((select array_agg(code) from public.learning_areas), array['MA'], 'หัวหน้ากลุ่มสาระเห็นเฉพาะกลุ่มสาระของตน');
select ok(not private.can_access_learning_area('aaaaaaaa-1111-4000-a000-000000000002'), 'เข้าถึงกลุ่มสาระอื่นไม่ได้');
select ok(private.can_access_learning_area('aaaaaaaa-1111-4000-a000-000000000001'), 'เข้าถึงกลุ่มสาระของตนได้');
select is(public.get_my_access() -> 'learning_area_ids', '["aaaaaaaa-1111-4000-a000-000000000001"]'::jsonb, 'get_my_access คืน scope');
select throws_ok($$insert into public.user_roles (user_id, school_id, role, learning_area_id)
  values ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', 'aaaaaaaa-1111-4000-a000-000000000002')$$,
  '42501', null, 'หัวหน้ากลุ่มสาระเพิ่ม scope ให้ตนเองไม่ได้');
select throws_ok($$update public.user_roles set learning_area_id = 'aaaaaaaa-1111-4000-a000-000000000002'
  where user_id = 'aaaaaaaa-0000-4000-a000-000000000004'$$, '42501', null, 'แก้ scope ของตนเองไม่ได้');
update public.learning_areas set name_th = 'x' where code = 'MA';
select is((select name_th from public.learning_areas where code = 'MA'), 'คณิตศาสตร์', 'หัวหน้ากลุ่มสาระแก้กลุ่มสาระไม่ได้ (RLS)');
select ok((select count(*) from public.academic_years) > 0, 'หัวหน้ากลุ่มสาระอ่านปีการศึกษาได้');

-- ---------------------------------------------------------------- executive
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select is((select count(*)::int from public.learning_areas), 3, 'ผู้บริหารเห็นกลุ่มสาระทั้งหมด');
select throws_ok($$insert into public.academic_years (year_be, starts_on, ends_on) values (2575, '2032-05-16', '2033-05-15')$$,
  '42501', null, 'ผู้บริหารเพิ่มปีการศึกษาไม่ได้');
select throws_ok($$select public.set_current_academic_year('aaaaaaaa-3333-4000-a000-000000002569')$$,
  '42501', null, 'ผู้บริหารตั้งปีปัจจุบันไม่ได้');
update public.grade_levels set name_th = 'แก้ไข' where code = 'M1';
select is((select name_th from public.grade_levels where code = 'M1'), 'ม.1', 'ผู้บริหารแก้ระดับชั้นไม่ได้ (RLS)');

-- ---------------------------------------------------------------- teacher
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select ok((select count(*) from public.terms) > 0, 'ครูอ่านภาคเรียนได้');
select is((select count(*)::int from public.learning_areas), 0, 'ครูไม่เห็นรายการกลุ่มสาระ (ยังไม่ถึง Phase 1.5)');
select throws_ok($$insert into public.classrooms (academic_year_id, grade_level_id, room_no)
  values ('aaaaaaaa-3333-4000-a000-000000002569', 'aaaaaaaa-2222-4000-a000-000000000001', 9)$$, '42501', null, 'ครูเพิ่มห้องเรียนไม่ได้');

-- ---------------------------------------------------------------- โรงเรียน B
reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000001');
select is((select count(*)::int from public.academic_years where school_id = 'aaaaaaaa-0000-4000-a000-000000000000'), 0,
  'ผู้ดูแลโรงเรียน B ไม่เห็นปีการศึกษาของโรงเรียน A');
select is((select count(*)::int from public.learning_areas), 1, 'ผู้ดูแลโรงเรียน B เห็นเฉพาะกลุ่มสาระของตน');

-- ---------------------------------------------------------------- anon
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
reset role;
set local role anon;
select throws_ok('select * from public.learning_areas', '42501', null, 'anon อ่าน master data ไม่ได้');
reset role;

select * from finish();
rollback;
