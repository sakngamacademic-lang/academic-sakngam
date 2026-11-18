-- pgTAP: ประเภทหลักสูตร + ทะเบียนเกณฑ์ + หลักฐาน — เฉพาะผู้ดูแลหลักสูตรเขียนได้ · ยืนยันเกณฑ์ต้องมีต้นฉบับ · หลักฐานตรงเกณฑ์ต้องคนยืนยัน · ไม่แตะรายวิชา
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
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
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'x', 'other', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('cccccccc-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 't');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be) values ('cccccccc-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-1111-4000-a000-000000000001', 'V2569', 2569);
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator) values
  ('55555555-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'ท21101', 'ภาษาไทย 1', '11111111-0000-4000-a000-000000000001', 'basic', 1.5, 60, 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;
set local session_replication_role = replica;
insert into public.study_programs (id, school_id, curriculum_version_id, code, name_th, stage, source_document_id, source_locator) values
  ('77777777-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'DVE-X', 'ทวิศึกษา (ทดสอบ)', 'upper_secondary', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:5');
set local session_replication_role = origin;

-- 1-2 ครู/หัวหน้ากลุ่มสาระเขียนไม่ได้
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$ select public.curriculum_category_set('cccccccc-2222-4000-a000-000000000001', 'vocational', 'program', '77777777-0000-4000-a000-000000000001', 'confirmed', 'ทวิศึกษา') $$,
  '42501', null, 'ครูจัดหมวดหลักสูตรไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$ select public.assessment_criterion_save(null, '{"code":"K5-1","title_th":"x"}') $$, '42501', null, 'หัวหน้ากลุ่มสาระบันทึกเกณฑ์ไม่ได้');

-- 3-5 ผู้ดูแลหลักสูตร: จัดหมวดหลายหมวด + เหตุผลบังคับ + เป้าหมายต้องมีจริง
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$ select public.curriculum_category_set('cccccccc-2222-4000-a000-000000000001', 'vocational', 'program', '77777777-0000-4000-a000-000000000001', 'confirmed', 'แผนทวิศึกษา', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:5');
                   select public.curriculum_category_set('cccccccc-2222-4000-a000-000000000001', 'specialized', 'program', '77777777-0000-4000-a000-000000000001', 'proposed', 'แผนการเรียนเฉพาะ') $$,
  'หนึ่งแผนอยู่ได้หลายหมวด');
select throws_ok($$ select public.curriculum_category_set('cccccccc-2222-4000-a000-000000000001', 'local', 'subject', '55555555-0000-4000-a000-000000000001', 'confirmed', ' ') $$,
  'P0001', 'กรุณาระบุเหตุผลการจัดหมวด', 'ต้องมีเหตุผล');
select throws_ok($$ select public.curriculum_category_set('cccccccc-2222-4000-a000-000000000001', 'local', 'subject', gen_random_uuid(), 'confirmed', 'x') $$,
  'P0001', 'ไม่พบรายวิชา/แผนการเรียน/กิจกรรมในฉบับหลักสูตรนี้', 'ไม่สร้างรายวิชาปลอม');

-- 5b หลักฐานตรงเกณฑ์บนเกณฑ์ร่างไม่ได้ (ต้องยืนยันเกณฑ์ก่อน)
insert into t_ids select 'c0', public.assessment_criterion_save(null, '{"code":"K5-0","title_th":"เกณฑ์ร่าง","categories":["vocational"]}');
select throws_ok($$ select public.criteria_evidence_set((select id from t_ids where k = 'c0'), 'cccccccc-2222-4000-a000-000000000001', 'program', '77777777-0000-4000-a000-000000000001', 'direct', 'confirmed', 'x', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:5') $$,
  'P0001', 'ต้องยืนยันเกณฑ์กับเอกสารต้นฉบับก่อนบันทึกว่าหลักฐานตรงเกณฑ์', 'หลักฐานตรงเกณฑ์ต้องอ้างเกณฑ์ที่ยืนยันแล้ว');

-- 6-8 เกณฑ์: ยืนยันไม่ได้ถ้าไม่มีต้นฉบับ · มีต้นฉบับแล้วยืนยันได้ · ยืนยันแล้วแก้ไม่ได้
insert into t_ids select 'c1', public.assessment_criterion_save(null, '{"code":"K5-1","title_th":"เกณฑ์ทดสอบ","categories":["vocational"],"report_section":"vocational"}');
select throws_ok($$ select public.assessment_criterion_verify((select id from t_ids where k = 'c1'), 'verified') $$, '23514', null, 'ยืนยันเกณฑ์ไม่ได้ถ้าไม่มีเอกสาร+เลขหน้า');
select lives_ok($$ select public.assessment_criterion_save((select id from t_ids where k = 'c1'), '{"code":"K5-1","title_th":"เกณฑ์ทดสอบ","categories":["vocational"],"source_document_id":"eeeeeeee-0000-4000-a000-000000000001","source_locator":"pdf:9"}');
                   select public.assessment_criterion_verify((select id from t_ids where k = 'c1'), 'verified') $$, 'ยืนยันเกณฑ์เมื่อมีต้นฉบับ');
select throws_ok($$ select public.assessment_criterion_save((select id from t_ids where k = 'c1'), '{"code":"K5-1","title_th":"แก้"}') $$, 'P0001', null, 'เกณฑ์ที่ยืนยันแล้วแก้ไม่ได้');

-- 9-11 หลักฐาน: ระบบเสนอ = รอตรวจ · ตรงเกณฑ์ต้องยืนยัน+มีที่มา · ปฏิเสธต้องมีเหตุผล
select lives_ok($$ select public.criteria_evidence_set((select id from t_ids where k = 'c1'), 'cccccccc-2222-4000-a000-000000000001', 'program', '77777777-0000-4000-a000-000000000001', 'pending', 'proposed') $$, 'บันทึกรอตรวจได้');
select throws_ok($$ select public.criteria_evidence_set((select id from t_ids where k = 'c1'), 'cccccccc-2222-4000-a000-000000000001', 'program', '77777777-0000-4000-a000-000000000001', 'direct', 'proposed') $$,
  '23514', null, 'ตรงเกณฑ์ต้องยืนยันโดยคนและมีที่มา');
select throws_ok($$ select public.criteria_evidence_set((select id from t_ids where k = 'c1'), 'cccccccc-2222-4000-a000-000000000001', 'program', '77777777-0000-4000-a000-000000000001', 'none', 'rejected') $$,
  '23514', null, 'ปฏิเสธต้องมีเหตุผล');

-- 12b หลักฐานตรงเกณฑ์เมื่อเกณฑ์ยืนยันแล้ว + มีที่มา
select lives_ok($$ select public.criteria_evidence_set((select id from t_ids where k = 'c1'), 'cccccccc-2222-4000-a000-000000000001', 'program', '77777777-0000-4000-a000-000000000001', 'direct', 'confirmed', 'ตรวจกับ PDF', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:5') $$, 'ยืนยันหลักฐานตรงเกณฑ์ได้เมื่อครบเงื่อนไข');
-- 13-15 ตารางเขียนตรงไม่ได้ · helper ส่วนตัวเรียกตรงไม่ได้ · มี Audit Log
select throws_ok($$ insert into public.assessment_criteria (code, title_th) values ('X', 'y') $$, '42501', null, 'เขียนตารางเกณฑ์ตรงไม่ได้ (ต้องผ่าน RPC)');
select throws_ok($$ select private.require_curriculum_admin() $$, '42501', null, 'helper ส่วนตัวไม่เปิดให้เรียกตรง');
reset role;
select ok((select count(*) from public.audit_logs where table_name in ('curriculum_category_links', 'assessment_criteria', 'criteria_evidence')) >= 5, 'ทุกการเปลี่ยนแปลงมี Audit Log');
-- 12 ไม่แตะรายวิชาทางการ
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((select subject_type from public.subjects where id = '55555555-0000-4000-a000-000000000001'), 'basic', 'ประเภทรายวิชาทางการไม่เปลี่ยน');
select * from finish();
rollback;
