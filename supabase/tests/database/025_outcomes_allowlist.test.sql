-- pgTAP: นำเข้าผลการเรียนรู้ที่มีคำเตือนตาม Allowlist — เฉพาะผู้ดูแล, ต้องมาจากหน้าเดียวกับรายวิชา, IS จับคู่ตามหน้า, กันซ้ำ, มี Audit
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'admin@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff');
insert into public.learning_areas (id, school_id, code, name_th, sort_order) values ('30000000-0000-4000-a000-0000000000a1', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1);
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label) values
  ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'แหล่งหลักฐาน'),
  ('dddddddd-2222-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'ทะเบียนกลาง');
insert into public.import_batches (id, school_id, source_document_id, curriculum_version_id, kind, status, created_by) values
  ('dddddddd-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'learning_outcomes', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000001');
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator, subject_category, education_stage) values
  ('bbbbbbbb-0000-4000-a000-00000000000a', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000002', 'ท31201', 'วิชา A', '30000000-0000-4000-a000-0000000000a1', 'additional', 1.0, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:10', 'regular', null),
  ('bbbbbbbb-0000-4000-a000-00000000000c', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000002', 'IS1', 'IS ม.ต้น', null, 'additional', 1.0, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:477', 'is', 'lower_secondary'),
  ('bbbbbbbb-0000-4000-a000-00000000000d', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000002', 'IS1', 'IS ม.ปลาย', null, 'additional', 1.0, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:480', 'is', 'upper_secondary');
insert into public.import_rows (id, school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw, issues) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 1, 10, '{"subject_code":"ท31201","outcome_kind":"learning_outcome","code":"1","statement_th":"หน้าเดียวกับรายวิชา"}', 'error', 'parser', '{"parser_issues":[{"code":"DUPLICATE_DESCRIPTION","field":"code","severity":"warning","message_th":"หลายหน้า"}]}', '[]'),
  ('eeeeeeee-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 2, 11, '{"subject_code":"ท31201","outcome_kind":"learning_outcome","code":"2","statement_th":"คนละหน้ากับรายวิชา"}', 'error', 'parser', '{"parser_issues":[{"code":"DUPLICATE_DESCRIPTION","field":"code","severity":"warning","message_th":"หลายหน้า"}]}', '[]'),
  ('eeeeeeee-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 3, 477, '{"subject_code":"IS1","outcome_kind":"learning_outcome","code":"1","statement_th":"IS ม.ต้น"}', 'error', 'parser', '{"parser_issues":[{"code":"DUPLICATE_DESCRIPTION","field":"code","severity":"warning","message_th":"หลายหน้า"}]}', '[]'),
  ('eeeeeeee-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 4, 10, '{"subject_code":"ท31201","outcome_kind":"learning_outcome","code":"1","statement_th":"รหัสซ้ำ"}', 'error', 'parser', '{"parser_issues":[{"code":"DUPLICATE_DESCRIPTION","field":"code","severity":"warning","message_th":"หลายหน้า"}]}', '[]');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select public.curriculum_registry_build_outcomes_allowlist('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001']::uuid[], 'ตรวจ PDF แล้วถูกต้อง')$$, '42501', null, 'เจ้าหน้าที่ใช้ไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$select public.curriculum_registry_build_outcomes_allowlist('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001']::uuid[], 'สั้น')$$, null, 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร', 'ต้องมีเหตุผล');
select throws_ok($$select public.curriculum_registry_build_outcomes_allowlist('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001', '{}'::uuid[], 'ตรวจ PDF แล้วถูกต้อง')$$, null, 'ระบุแถวได้ครั้งละ 1–500 แถว', 'ต้องระบุรายการ');
select is((public.curriculum_registry_build_outcomes('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001') ->> 'built')::int, 0, 'ปุ่มสร้างแบบเหมารวมไม่นำแถวที่มีคำเตือนเข้า');
create temp table t_r as select public.curriculum_registry_build_outcomes_allowlist('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001',
  array['eeeeeeee-0000-4000-a000-000000000001','eeeeeeee-0000-4000-a000-000000000002','eeeeeeee-0000-4000-a000-000000000003','eeeeeeee-0000-4000-a000-000000000004']::uuid[], 'ตรวจ PDF หน้าอ้างอิงแล้ว เนื้อหาตรงกัน') as r;
grant select on t_r to authenticated;
select is((select (r ->> 'built')::int from t_r), 2, 'นำเข้าเฉพาะแถวที่ผ่าน (รวม IS)');
select is((select (r ->> 'skipped_page_mismatch')::int from t_r), 1, 'ปฏิเสธแถวที่มาจากคนละหน้ากับรายวิชา');
select is((select (r ->> 'skipped_duplicate')::int from t_r), 1, 'กันรหัสผลการเรียนรู้ซ้ำ');
reset role;
select is((select subject_id from public.subject_learning_outcomes where import_row_id = 'eeeeeeee-0000-4000-a000-000000000003'), 'bbbbbbbb-0000-4000-a000-00000000000c'::uuid, 'IS จับคู่ช่วงชั้นตามหน้า PDF (ม.ต้น)');
select cmp_ok((select count(*)::int from public.audit_logs where table_name = 'curriculum_outcomes_allowlist'), '>=', 1, 'บันทึก Audit Log');
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((public.curriculum_registry_build_outcomes_allowlist('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001','eeeeeeee-0000-4000-a000-000000000003']::uuid[], 'รันซ้ำเพื่อทดสอบ') ->> 'skipped_existing')::int, 2, 'รันซ้ำไม่สร้างซ้ำ');
reset role;
select is((select count(*)::int from public.subjects where curriculum_version_id = 'dddddddd-2222-4000-a000-000000000002'), 3, 'ไม่สร้างรายวิชาใหม่');
select * from finish();
rollback;
