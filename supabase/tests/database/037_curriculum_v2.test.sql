-- pgTAP: Curriculum V2 — แยกจากตารางเดิม · เขียนผ่าน RPC เฉพาะผู้ดูแลหลักสูตร · draft ไม่เปิดเผยครู · นำเข้าซ้ำไม่เกิดข้อมูลซ้ำ · มีประวัติ
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'head@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 't@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create temp table t_res (k text primary key, v jsonb); grant all on t_res to authenticated;
-- ข้อมูลสังเคราะห์
create temp table t_in (k text primary key, v jsonb); grant all on t_in to authenticated;
insert into t_in values
 ('src', '{"kind":"xlsx","file_name":"test.xlsx","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'),
 ('rows', '[{"grade":"M1","plan":"แผน ก","plan_key":"ก","term":1,"section":"basic","code":"ท21101","name":"ภาษาไทย 1","credits":1.5,"hours":60,"raw":"1.5(60)","refs":[{"file":"test.xlsx","sheet":"11","cell":"B6"}]},{"grade":"M1","plan":"แผน ก","plan_key":"ก","term":1,"section":"basic","code":"ค21101","name":"คณิต 1","credits":1.5,"hours":60,"raw":"1.5(60)","refs":[]}]'),
 ('desc', '[{"code":"ท21101","name":"ภาษาไทย 1","text":"ศึกษา…","ref":{"file":"test.docx","table":0,"row":3}}]');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$ select public.cv2_import_source(2569, '', (select v from t_in where k='src'), (select v from t_in where k='rows')) $$, '42501', null, 'ครูนำเข้าไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$ select public.cv2_import_source(2569, '', (select v from t_in where k='src'), (select v from t_in where k='rows')) $$, '42501', null, 'เจ้าหน้าที่วิชาการนำเข้าไม่ได้ (ผู้ดูแลหลักสูตรเท่านั้น)');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
insert into t_res select 'i1', public.cv2_import_source(2569, 'ทดสอบ', (select v from t_in where k='src'), (select v from t_in where k='rows'), (select v from t_in where k='desc'));
select is((select v ->> 'result' from t_res where k = 'i1'), 'import', 'ผู้ดูแลหลักสูตรนำเข้าได้');
insert into t_res select 'i2', public.cv2_import_source(2569, '', (select v from t_in where k='src'), (select v from t_in where k='rows'), (select v from t_in where k='desc'));
select is((select v ->> 'result' from t_res where k = 'i2'), 'replace', 'ไฟล์เดิมซ้ำ → แทนที่');
select is((select count(*)::int from public.cv2_rows), 2, 'นำเข้าซ้ำไม่เกิดแถวซ้ำ');
select is((select count(*)::int from public.cv2_descriptions), 1, 'คำอธิบายไม่ซ้ำ');
select is((select label from public.cv2_curricula where year_be = 2569), 'ทดสอบ', 'ชื่อเรียกเดิมคงอยู่เมื่อไม่ระบุใหม่');
select is((select refs -> 0 ->> 'cell' from public.cv2_rows where code = 'ท21101'), 'B6', 'เก็บอ้างอิงเซลล์');
select throws_ok($$ insert into public.cv2_rows (school_id, source_id, code, code_raw, name) values ('aaaaaaaa-0000-4000-a000-000000000000', (select id from public.cv2_sources limit 1), 'x', 'x', 'x') $$, '42501', null, 'เขียนตารางตรงไม่ได้');
select throws_ok($$ update public.cv2_curricula set status = 'active' $$, '42501', null, 'เปลี่ยนสถานะตรงไม่ได้');
-- draft: ครูไม่เห็น · บทบาทหลักสูตรเห็น
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select count(*)::int from public.cv2_rows), 0, 'ครูไม่เห็นรายวิชาของ draft');
select is((select count(*)::int from public.cv2_curricula), 0, 'ครูไม่เห็นหลักสูตร draft');
reset role;
update public.cv2_curricula set status = 'approved' where year_be = 2569;   -- จำลองหลังอนุมัติ (ทำในฐานทดสอบเท่านั้น)
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select count(*)::int from public.cv2_rows), 2, 'หลักสูตร approved: ครูอ่านได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$ select public.cv2_remove_source((select id from public.cv2_sources limit 1), 'x') $$, 'P0001', 'หลักสูตรที่อนุมัติ/ใช้งานแล้วนำไฟล์ออกไม่ได้', 'หลักสูตรที่อนุมัติแล้วนำไฟล์ออกไม่ได้');
reset role;
select is((select array_agg(action order by id) from public.cv2_import_log), array['import', 'replace'], 'บันทึกประวัติการนำเข้า');
select is((select count(*)::int from public.subjects) + (select count(*)::int from public.subject_offerings), 0, 'ไม่แตะตารางหลักสูตรเดิม');
select * from finish();
rollback;
