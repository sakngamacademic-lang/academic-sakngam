-- pgTAP: ทะเบียนนักเรียน — CRUD ตามบทบาท + แยกโรงเรียน (RLS) · ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'), ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'teacher@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'staff@b.test', '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'bbbbbbbb-0000-4000-a000-000000000000', 'academic_staff');
insert into public.academic_years (id, school_id, year_be, starts_on, ends_on) values ('40000000-0000-4000-a000-0000000000aa', 'aaaaaaaa-0000-4000-a000-000000000000', 2569, '2026-05-16', '2027-05-15');
insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values ('50000000-0000-4000-a000-0000000000aa', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7);
insert into public.classrooms (id, school_id, academic_year_id, grade_level_id, room_no) values ('60000000-0000-4000-a000-0000000000aa', 'aaaaaaaa-0000-4000-a000-000000000000', '40000000-0000-4000-a000-0000000000aa', '50000000-0000-4000-a000-0000000000aa', 1);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select lives_ok($$insert into public.students (student_code, prefix, first_name, last_name) values ('S001', 'เด็กชาย', 'ทดสอบ', 'หนึ่ง')$$, 'ฝ่ายวิชาการเพิ่มนักเรียนได้');
select is((select school_id from public.students where student_code = 'S001'), 'aaaaaaaa-0000-4000-a000-000000000000'::uuid, 'school_id ถูกใส่โดยฐานข้อมูล (ไม่ใช่จาก client)');
select lives_ok($$insert into public.classroom_students (classroom_id, student_id) select '60000000-0000-4000-a000-0000000000aa', id from public.students where student_code = 'S001'$$, 'จัดนักเรียนเข้าห้องได้');
select lives_ok($$update public.students set status = 'transferred' where student_code = 'S001'$$, 'เปลี่ยนสถานะนักเรียนได้');
select throws_ok($$insert into public.students (student_code, prefix, first_name, last_name) values ('bad code!', 'x', 'a', 'b')$$, '23514', null, 'รหัสนักเรียนผิดรูปแบบถูกปฏิเสธ (CHECK)');
select throws_ok($$insert into public.students (student_code, prefix, first_name, last_name) values ('S001', 'x', 'a', 'b')$$, '23505', null, 'รหัสซ้ำในโรงเรียนเดียวกันถูกปฏิเสธ');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select is((select count(*)::int from public.students), 0, 'ครูที่ไม่เกี่ยวข้องไม่เห็นนักเรียน');
select throws_ok($$insert into public.students (student_code, prefix, first_name, last_name) values ('S002', 'x', 'a', 'b')$$, '42501', null, 'ครูเพิ่มนักเรียนไม่ได้');

reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000003');
select is((select count(*)::int from public.students), 0, 'โรงเรียนอื่นไม่เห็นนักเรียน (RLS ข้ามโรงเรียน)');
select is((select count(*)::int from public.classroom_students), 0, 'โรงเรียนอื่นไม่เห็นการจัดห้อง');

select * from finish();
rollback;
