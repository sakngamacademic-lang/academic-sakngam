-- pgTAP: การยืนยันของโรงเรียน + วิสัยทัศน์/จุดเน้น — เฉพาะผู้ดูแลหลักสูตร · ผูก sha256 · ไม่แตะข้อมูลหลักสูตร
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
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
select throws_ok($$ select public.curriculum_document_confirm('cccccccc-2222-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000001', 'structure', 'ผู้อำนวยการ', current_date) $$, '42501', null, 'ครูบันทึกการยืนยันไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$ select public.curriculum_document_confirm('cccccccc-2222-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000002', 'structure', 'ผู้อำนวยการ', current_date) $$, 'P0001', null, 'ยืนยันไม่ได้ถ้ายังไม่มีไฟล์ (sha256)');
insert into t_ids select 'c', public.curriculum_document_confirm('cccccccc-2222-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000001', 'structure', 'ผู้อำนวยการโรงเรียน', current_date);
select is((select document_sha256 from public.curriculum_document_confirmations where id = (select id from t_ids where k = 'c')), repeat('a', 64), 'ผูกค่า sha256 ของไฟล์ ณ วันที่ยืนยัน');
select throws_ok($$ select public.curriculum_document_confirm('cccccccc-2222-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000001', 'structure', 'ซ้ำ', current_date) $$, '23505', null, 'การยืนยันที่มีผลซ้ำไม่ได้');
select throws_ok($$ select public.curriculum_document_confirmation_revoke((select id from t_ids where k = 'c'), ' ') $$, '23514', null, 'เพิกถอนต้องมีเหตุผล');
insert into t_ids select 'h', public.curriculum_highlight_save(null, 'cccccccc-2222-4000-a000-000000000001', 'vision', 1, 'ข้อความตัวอย่าง', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:3');
select lives_ok($$ select public.curriculum_highlight_set_status((select id from t_ids where k = 'h'), 'confirmed') $$, 'ยืนยันข้อความจุดเน้นได้');
select throws_ok($$ select public.curriculum_highlight_save((select id from t_ids where k = 'h'), 'cccccccc-2222-4000-a000-000000000001', 'vision', 1, 'แก้', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:3') $$, 'P0001', null, 'ยืนยันแล้วแก้ไม่ได้');
select throws_ok($$ insert into public.curriculum_highlights (curriculum_version_id, kind, text_th, source_document_id, source_locator) values ('cccccccc-2222-4000-a000-000000000001', 'vision', 'x', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1') $$, '42501', null, 'เขียนตารางตรงไม่ได้');
reset role;
select ok((select count(*) from public.audit_logs where table_name in ('curriculum_document_confirmations', 'curriculum_highlights')) >= 3, 'มี Audit Log');
select * from finish();
rollback;
