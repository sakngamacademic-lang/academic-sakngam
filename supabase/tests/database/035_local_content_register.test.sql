-- pgTAP: ทะเบียนสาระท้องถิ่น — เฉพาะผู้ดูแลหลักสูตร · เก็บข้อความตามต้นฉบับ · นำเข้าใหม่ไม่ลบชุดเดิม
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'head@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'lah@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 't1@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 't2@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.learning_areas (id, school_id, code, name_th, sort_order) values
  ('11111111-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1),
  ('11111111-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'MA', 'คณิตศาสตร์', 2);
insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', '11111111-0000-4000-a000-000000000001'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null);
insert into public.teachers (id, school_id, profile_id, teacher_code, prefix, first_name, last_name, learning_area_id) values
  ('66666666-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000003', 'T01', 'นาย', 'ครู', 'ไทย', '11111111-0000-4000-a000-000000000001'),
  ('66666666-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000004', 'T02', 'นาง', 'ครู', 'คณิต', '11111111-0000-4000-a000-000000000002');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability, sha256) values ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'x', 'structure_workbook', 'A', repeat('a', 64)), ('eeeeeeee-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-02', 'y', 'other', 'A', null);
insert into public.school_curricula (id, school_id, name_th) values ('cccccccc-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 't');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be) values ('cccccccc-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-1111-4000-a000-000000000001', 'V2569', 2569);
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator) values
  ('55555555-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'ท21101', 'ภาษาไทย 1', '11111111-0000-4000-a000-000000000001', 'basic', 1.5, 60, 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$ select public.local_content_import('cccccccc-2222-4000-a000-000000000001', 'x.csv', repeat('a',64), null, '[{"table":"1","row":"2","code":"ท 1.1","core":"a","local":"b"}]') $$, '42501', null, 'ครูนำเข้าไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
insert into t_ids select 'b1', public.local_content_import('cccccccc-2222-4000-a000-000000000001', 'local.csv', repeat('a',64), 'ต้นฉบับ: ตัวอย่าง.docx',
  '[{"table":"1","row":"2","code":"ท 1.1\nม. 1/1","core":"- การอ่าน","local":"- บทร้อยกรอง \"ตัวอย่าง\"","status":"รอตรวจ","source":"ต้นฉบับ: ตัวอย่าง.docx"}]');
select is((select indicator_code_raw from public.local_content_items where batch_id = (select id from t_ids where k = 'b1')), E'ท 1.1\nม. 1/1', 'เก็บรหัสตามต้นฉบับทุกตัวอักษร');
select is((select local_content from public.local_content_items where batch_id = (select id from t_ids where k = 'b1')), '- บทร้อยกรอง "ตัวอย่าง"', 'เก็บข้อความตามต้นฉบับ');
insert into t_ids select 'b2', public.local_content_import('cccccccc-2222-4000-a000-000000000001', 'local2.csv', repeat('b',64), null, '[{"table":"1","row":"2","code":"x","core":"a","local":"b"}]');
select is((select status from public.local_content_batches where id = (select id from t_ids where k = 'b1')), 'superseded', 'นำเข้าใหม่: ชุดเดิมเป็น superseded ไม่ถูกลบ');
select is((select count(*)::int from public.local_content_items), 2, 'แถวชุดเดิมยังอยู่');
select throws_ok($$ insert into public.local_content_items (batch_id, table_no, row_no, indicator_code_raw, core_content, local_content) values ((select id from t_ids where k = 'b2'), '9', '9', 'x', 'y', 'z') $$, '42501', null, 'เขียนตารางตรงไม่ได้');
reset role;
select ok((select count(*) from public.audit_logs where table_name in ('local_content_batches', 'local_content_items')) >= 4, 'มี Audit Log');
select * from finish();
rollback;
