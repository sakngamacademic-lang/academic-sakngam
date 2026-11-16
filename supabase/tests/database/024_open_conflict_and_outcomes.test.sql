-- pgTAP: CF ที่ยังเปิดกันแถว/คัดลอกฉบับ + สร้างผลการเรียนรู้เข้าทะเบียน (เฉพาะผู้ดูแลหลักสูตร, ไม่สร้างวิชาเอง, รันซ้ำปลอดภัย)
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
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
  ('dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subjects', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000001'),
  ('dddddddd-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'learning_outcomes', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000001');
-- รายวิชาในทะเบียนปลายทาง 3 รายวิชา (A ปกติ / B มี CF เปิด / C ไม่มีแถวผลการเรียนรู้)
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator) values
  ('bbbbbbbb-0000-4000-a000-00000000000a', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000002', 'ท31101', 'ภาษาไทย 1', '30000000-0000-4000-a000-0000000000a1', 'basic', 1.0, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:5'),
  ('bbbbbbbb-0000-4000-a000-00000000000b', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000002', 'ท31102', 'ภาษาไทย 2', '30000000-0000-4000-a000-0000000000a1', 'basic', 1.0, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:6');
insert into public.import_rows (school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw, issues) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 1, 5, '{"code":"ท31201","name_th":"ภาษาไทย 3","learning_area_code":"TH","subject_type":"basic","credits":1.0,"learning_hours":60}', 'needs_review', 'parser', '{}', '[{"code":"WRAPPED_TEXT","severity":"warning","message_th":"x"}]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 1, 5, '{"subject_code":"ท31101","outcome_kind":"learning_outcome","code":"1","statement_th":"ผลการเรียนรู้ A"}', 'needs_review', 'parser', '{}', '[]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 2, 6, '{"subject_code":"ท31102","outcome_kind":"learning_outcome","code":"1","statement_th":"ผลการเรียนรู้ B"}', 'needs_review', 'parser', '{}', '[]'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 3, 7, '{"subject_code":"ZZ99999","outcome_kind":"learning_outcome","code":"1","statement_th":"ไม่มีวิชา"}', 'needs_review', 'parser', '{}', '[]');
insert into public.source_conflicts (school_id, conflict_code, doc_a_id, description, status, subject_ref) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'CF-01', 'dddddddd-0000-4000-a000-000000000001', 'ทดสอบ', 'needs_decision', 'ท31102'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'CF-02', 'dddddddd-0000-4000-a000-000000000001', 'ทดสอบ', 'needs_decision', 'ท31201');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;

-- 1) ฟังก์ชันจัดชั้นแถว: CF เปิดตามรหัส => conflict แม้ไม่มี SOURCE_CONFLICT; ปิด CF แล้ว => warning
reset role;
select is(private.curriculum_row_class('needs_review', '[{"code":"WRAPPED_TEXT","severity":"warning"}]'::jsonb, 'aaaaaaaa-0000-4000-a000-000000000000', '{"code":"ท31201"}'::jsonb), 'conflict', 'CF เปิดตามรหัสวิชา => ขัดแย้ง');
select is(private.curriculum_row_class('needs_review', '[{"code":"WRAPPED_TEXT","severity":"warning"}]'::jsonb, 'aaaaaaaa-0000-4000-a000-000000000000', '{"code":"ท31301"}'::jsonb), 'warning', 'ไม่มี CF => warning');
select is(private.curriculum_row_class('approved', '[]'::jsonb, 'aaaaaaaa-0000-4000-a000-000000000000', '{"code":"ท31201"}'::jsonb), 'approved', 'แถวที่อนุมัติแล้วไม่ถูกกระทบ');
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$select public.curriculum_import_rows_approve_clean('dddddddd-5555-4000-a000-000000000001', array(select id from public.import_rows where batch_id = 'dddddddd-5555-4000-a000-000000000001'))$$, null, 'แถวที่ผิดพลาดหรือมีข้อขัดแย้งที่ยังไม่ตัดสิน อนุมัติไม่ได้', 'อนุมัติไม่ผ่านเมื่อมี CF เปิด (ฝั่งเซิร์ฟเวอร์ ตรวจตอนบันทึกจริง)');
reset role;
update public.source_conflicts set status = 'resolved', resolution = 'ทดสอบมติ', resolved_at = now() where conflict_code = 'CF-02';
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((public.curriculum_import_rows_approve_clean('dddddddd-5555-4000-a000-000000000001', array(select id from public.import_rows where batch_id = 'dddddddd-5555-4000-a000-000000000001')) ->> 'approved')::int, 1, 'ปิด CF แล้วอนุมัติได้');

-- 2) สร้างผลการเรียนรู้เข้าทะเบียน
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select public.curriculum_registry_build_outcomes('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001')$$, '42501', null, 'เจ้าหน้าที่สร้างผลการเรียนรู้ไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
create temp table t_out as select public.curriculum_registry_build_outcomes('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001') as r;
grant select on t_out to authenticated;
select is((select (r ->> 'built')::int from t_out), 1, 'สร้างเฉพาะผลการเรียนรู้ของรายวิชาที่ไม่มี CF เปิด');
select is((select (r ->> 'skipped_blocked')::int from t_out), 1, 'ข้ามแถวของรายวิชาที่มี CF เปิด');
select is((select (r ->> 'skipped_no_subject')::int from t_out), 1, 'ข้ามแถวที่ไม่มีรายวิชาในทะเบียน (ไม่สร้างวิชาเอง)');
reset role;
select is((select count(*)::int from public.subjects where curriculum_version_id = 'dddddddd-2222-4000-a000-000000000002'), 2, 'ไม่สร้างรายวิชาใหม่');
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((public.curriculum_registry_build_outcomes('dddddddd-2222-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001') ->> 'built')::int, 0, 'รันซ้ำไม่สร้างซ้ำ');

-- 3) คัดลอกฉบับ: บล็อกเมื่อรายวิชาผูก CF เปิด
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$select public.curriculum_version_clone('dddddddd-2222-4000-a000-000000000002', 'ปีถัดไป')$$, '23514', null, 'คัดลอกฉบับที่ยังมีรายวิชาผูก CF เปิดไม่ได้');
reset role;
update public.source_conflicts set status = 'resolved', resolution = 'ทดสอบมติ', resolved_at = now() where conflict_code = 'CF-01';
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$select public.curriculum_version_clone('dddddddd-2222-4000-a000-000000000002', 'ปีถัดไป')$$, 'ปิด CF แล้วคัดลอกได้');
select * from finish();
rollback;
