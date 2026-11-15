-- pgTAP: Master Curriculum Registry — build จากหลักฐาน, ข้อเสนอทวิศึกษา, ประวัติ, คัดลอกปีใหม่, เปรียบเทียบ · ⚠️ fixture (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head');
insert into public.learning_areas (school_id, code, name_th, sort_order) values ('aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1), ('aaaaaaaa-0000-4000-a000-000000000000', 'CT', 'การงานอาชีพ', 2);
insert into public.grade_levels (school_id, code, name_th, stage, level_order) values ('aaaaaaaa-0000-4000-a000-000000000000', 'M4', 'ม.4', 'upper_secondary', 10);
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be) values ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST-2569', 2569);
insert into public.import_batches (id, school_id, source_document_id, curriculum_version_id, kind, status, created_by) values
  ('dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'study_programs', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003'),
  ('dddddddd-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subjects', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003'),
  ('dddddddd-5555-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subject_offerings', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003');
insert into public.import_rows (school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw, issues) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 1, 19, '{"code":"DVE-AUTO","name_th":"แผนการเรียนทวิศึกษา (ช่างยนต์)","stage":"upper_secondary"}', 'needs_review', 'parser', '{}', '[]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 2, 17, '{"code":"SCI-MATH","name_th":"แผนวิทย์-คณิต","stage":"upper_secondary"}', 'needs_review', 'parser', '{}', '[]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 3, 20, '{"code":"APP","name_th":"แผนที่อนุมัติแล้ว","stage":"lower_secondary"}', 'needs_review', 'parser', '{}', '[]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 1, 40, '{"code":"ท31101","name_th":"ภาษาไทย 1","learning_area_code":"TH","subject_type":"basic","credits":1.0,"learning_hours":40,"grade_code":"M4"}', 'needs_review', 'parser', '{}', '[]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 2, 41, '{"code":"ง31201","name_th":"งานช่าง","learning_area_code":"CT","subject_type":"additional","credits":1.0,"learning_hours":40,"grade_code":"M4"}', 'needs_review', 'parser', '{"text":"รายวิชาทวิศึกษา งานช่าง"}', '[]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 3, 42, '{"code":"X99999","name_th":"ไม่มีกลุ่มสาระ","learning_area_code":"ZZ","subject_type":"basic","credits":1.0,"learning_hours":40}', 'error', 'parser', '{}', '[]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 1, 43, '{"subject_code":"ท31101","program_code":"SCI-MATH","grade_code":"M4","term_no":"1","offering_kind":"required"}', 'error', 'parser', '{}', '[{"code":"V33","severity":"error","message_th":"x"}]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 2, 44, '{"subject_code":"ง31201","program_code":"DVE-AUTO","grade_code":"M4","term_no":"1","offering_kind":"required"}', 'error', 'parser', '{}', '[{"code":"V33","severity":"error","message_th":"x"}]');
update public.import_rows set status = 'approved', decision_by = 'aaaaaaaa-0000-4000-a000-000000000003', decision_at = now() where normalized ->> 'code' = 'APP' and batch_id::text like 'dddddddd%';
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');

select is((public.curriculum_registry_build('dddddddd-2222-4000-a000-000000000001') #>> '{subjects,created}')::int, 2, 'build: สร้างรายวิชาจากหลักฐานที่ผ่าน (error ถูกข้าม)');
select is((public.curriculum_registry_build('dddddddd-2222-4000-a000-000000000001') #>> '{subjects,created}')::int, 0, 'build ซ้ำ: ไม่สร้างซ้ำ (idempotent)');
reset role;
select is((select count(*)::int from public.study_programs), 3, 'สร้างแผนการเรียน 3 แผน (รวมแถวที่มนุษย์อนุมัติแล้ว)');
select is((select status from public.import_rows where normalized ->> 'code' = 'APP' and batch_id::text like 'dddddddd%'), 'approved', 'แถวที่อนุมัติแล้วคงสถานะเดิม (ไม่ถูกแก้)');
select is((select count(*)::int from public.subject_offerings), 2, 'dependency อัตโนมัติ: จัดวิชา 2 รายการ แม้หลักฐานเดิมเคยเป็น error (V33)');
select is((select count(*)::int from public.import_rows where batch_id::text like 'dddddddd%' and status = 'error'), 3, 'import_rows ไม่ถูกแก้ (สถานะเดิมคงอยู่)');
select is((select count(*)::int from public.import_rows where batch_id::text like 'dddddddd%' and status in ('approved', 'committed')), 1, 'มีเพียงแถวที่มนุษย์อนุมัติ (APP) เท่านั้นที่ approved — build ไม่อนุมัติ/committed เพิ่ม');
select ok((select bool_and(source_locator like 'pdf:%' and import_row_id is not null) from public.subjects), 'ทุกวิชาเก็บหน้า PDF + แถวหลักฐาน');
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is(public.curriculum_registry_propose('dddddddd-2222-4000-a000-000000000001'), 1, 'เสนอทวิศึกษา: วิชาที่จัดเฉพาะแผนทวิศึกษา 1 วิชา');
select is((select confidence from public.curriculum_match_proposals limit 1), 0.90::numeric, 'ความมั่นใจ 0.90 เมื่อมีข้อความต้นฉบับยืนยัน');
select is((select subject_category from public.subjects where code = 'ง31201'), 'regular', 'ข้อเสนอยังไม่เปลี่ยนวิชาจนกว่าคนตัดสิน');
select is(public.curriculum_proposals_decide(array(select id from public.curriculum_match_proposals), true), 1, 'คนรับข้อเสนอ');
select is((select subject_category from public.subjects where code = 'ง31201'), 'dual_study', 'หมวดเป็น dual_study หลังรับ');
select is((select learning_area_id is not null from public.subjects where code = 'ง31201'), true, 'ไม่แตะกลุ่มสาระ');
create temp table t_new as select public.curriculum_version_clone('dddddddd-2222-4000-a000-000000000001', 'TEST-2570') id;
reset role; select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select count(*)::int from public.subjects s join t_new on s.curriculum_version_id = t_new.id), 2, 'คัดลอกปีใหม่: ได้รายวิชาครบ 2 วิชา');
select is((select carried_from_id is not null and subject_category = 'dual_study' from public.subjects s join t_new on s.curriculum_version_id = t_new.id where s.code = 'ง31201'), true, 'สืบทอด carried_from_id และคงหมวดทวิศึกษา');
select lives_ok($$select public.curriculum_subject_set_active((select s.id from public.subjects s join t_new on s.curriculum_version_id = t_new.id where s.code = 'ท31101'), false, 'ยกเลิกรายวิชาในปีถัดไปตามมติ')$$, 'ยกเลิกรายวิชาในฉบับใหม่ (เก็บประวัติ)');
select is((select count(*)::int from public.subjects s join t_new on s.curriculum_version_id = t_new.id where s.code = 'ท31101' and not s.is_active and s.change_note is not null), 1, 'ยกเลิกแล้วยังอยู่ในทะเบียนพร้อมเหตุผล');
select is((select string_agg(code || ':' || change_kind, ',' order by code) from public.curriculum_compare_versions('dddddddd-2222-4000-a000-000000000001', (select id from t_new)) where change_kind <> 'same'), 'ท31101:cancelled', 'เปรียบเทียบปี: วิชาที่ยกเลิกแสดงเป็น cancelled');
reset role;
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label) values ('dddddddd-2222-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST-B');
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((public.curriculum_registry_build('dddddddd-2222-4000-a000-000000000002', false, 'dddddddd-2222-4000-a000-000000000001') #>> '{subject_offerings,created}')::int, 2, 'สร้างทะเบียนฉบับใหม่จากหลักฐานของฉบับอื่น (dependency ตรวจกับฉบับปลายทาง)');
select is((select count(*)::int from public.subjects where curriculum_version_id = 'dddddddd-2222-4000-a000-000000000002'), 2, 'ได้รายวิชาในฉบับปลายทาง หลักฐานเดิมไม่ถูกย้าย');
select * from finish();
rollback;
