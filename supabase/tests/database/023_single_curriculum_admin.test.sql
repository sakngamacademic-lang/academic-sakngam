-- pgTAP: บัญชีผู้ดูแลหลักสูตรบัญชีเดียว — เฉพาะ academic_head แก้/ตัดสิน/อนุมัติทะเบียนได้ · ผู้ใช้อื่นแก้ไม่ได้ · ผู้สร้างอนุมัติชุดเองได้ · Audit คงอยู่ (⚠️ fixture rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'admin@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'areahead@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'teacher@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.learning_areas (id, school_id, code, name_th, sort_order) values
  ('30000000-0000-4000-a000-0000000000a1', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1),
  ('30000000-0000-4000-a000-0000000000a2', 'aaaaaaaa-0000-4000-a000-000000000000', 'MA', 'คณิตศาสตร์', 2);
insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff', null),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', '30000000-0000-4000-a000-0000000000a1'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null);
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label) values ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST');
insert into public.import_batches (id, school_id, source_document_id, curriculum_version_id, kind, status, created_by) values
  ('dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'study_programs', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000001');
insert into public.import_rows (id, school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw, issues, decision_by, decision_at) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 1, 11, '{"code":"P1","name_th":"แผนทดสอบ","stage":"lower_secondary"}', 'needs_review', 'parser', '{}', '[]', null, null);
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;

-- ผู้ใช้อื่นแก้ไม่ได้
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$insert into public.curriculum_versions (school_curriculum_id, version_label) values ('dddddddd-1111-4000-a000-000000000001', 'STAFF')$$, '42501', null, 'เจ้าหน้าที่ (academic_staff) สร้างฉบับหลักสูตรไม่ได้');
select throws_ok($$select public.curriculum_registry_build('dddddddd-2222-4000-a000-000000000001')$$, '42501', null, 'เจ้าหน้าที่สร้างทะเบียนไม่ได้');
select throws_ok($$select public.curriculum_import_rows_approve_clean('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001']::uuid[])$$, '42501', null, 'เจ้าหน้าที่อนุมัติแถวไม่ได้');
select is(private.can_edit_curriculum_area('30000000-0000-4000-a000-0000000000a1'), false, 'เจ้าหน้าที่แก้รายวิชาไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$select public.curriculum_registry_build('dddddddd-2222-4000-a000-000000000001')$$, '42501', null, 'ครูสร้างทะเบียนไม่ได้');
-- การมอบหมายเฉพาะกลุ่มสาระ (กลไกเดิม)
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select is(private.can_edit_curriculum_area('30000000-0000-4000-a000-0000000000a1'), true, 'หัวหน้ากลุ่มสาระแก้ได้เฉพาะกลุ่มที่ได้รับมอบหมาย');
select is(private.can_edit_curriculum_area('30000000-0000-4000-a000-0000000000a2'), false, 'หัวหน้ากลุ่มสาระแก้กลุ่มสาระอื่นไม่ได้');
-- บัญชีผู้ดูแลหลักสูตรบัญชีเดียว
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is(private.can_edit_curriculum_area('30000000-0000-4000-a000-0000000000a2'), true, 'ผู้ดูแลหลักสูตรแก้ได้ทุกกลุ่มสาระ');
select is((public.curriculum_import_rows_approve_clean('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001']::uuid[]) ->> 'approved')::int, 1, 'ผู้ดูแลอนุมัติแถวผ่านการตรวจได้');
select lives_ok($$select public.curriculum_import_batch_approve('dddddddd-5555-4000-a000-000000000001')$$, 'ผู้สร้างชุดที่เป็นผู้ดูแลหลักสูตรอนุมัติชุดเองได้ (ไม่ต้องสลับบัญชี)');
reset role;
select is((select approved_by from public.import_batches where id = 'dddddddd-5555-4000-a000-000000000001'), 'aaaaaaaa-0000-4000-a000-000000000001'::uuid, 'บันทึกผู้อนุมัติ');
select cmp_ok((select count(*)::int from public.audit_logs where table_name = 'import_batches' and record_id = 'dddddddd-5555-4000-a000-000000000001'), '>', 0, 'Audit log บันทึกการเปลี่ยนสถานะชุดนำเข้า');
select * from finish();
rollback;
