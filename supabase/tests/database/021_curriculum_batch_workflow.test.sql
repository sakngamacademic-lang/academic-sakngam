-- pgTAP: Unified Review — ชั้นแถว, อนุมัติกลุ่ม, ป้องกัน error/conflict, Two-person · ⚠️ fixture (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000001', 'head@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label) values ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST');
insert into public.import_batches (id, school_id, source_document_id, curriculum_version_id, kind, status, created_by) values
  ('dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'study_programs', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003');
insert into public.import_rows (id, school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw, issues) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 1, 11, '{"code":"P1","name_th":"ผ่าน","stage":"lower_secondary"}', 'needs_review', 'parser', '{}', '[]'),
  ('eeeeeeee-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 2, 12, '{"code":"P2","name_th":"เตือน","stage":"lower_secondary"}', 'needs_review', 'parser', '{"parser_issues":[{"code":"WRAPPED_TEXT","field":"name_th","severity":"warning","message_th":"x"}]}', '[{"code":"WRAPPED_TEXT","field":"name_th","severity":"warning","message_th":"x"}]'),
  ('eeeeeeee-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 3, 13, '{"code":"P3","name_th":"ขัดแย้ง","stage":"lower_secondary"}', 'needs_review', 'parser', '{"parser_issues":[{"code":"SOURCE_CONFLICT","field":"code","severity":"warning","message_th":"x"}]}', '[{"code":"SOURCE_CONFLICT","field":"code","severity":"warning","message_th":"x"}]'),
  ('eeeeeeee-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 4, 14, '{"code":"P4","name_th":"พลาด","stage":"bogus"}', 'error', 'parser', '{}', '[{"code":"V30","field":"stage","severity":"error","message_th":"x"}]');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;

select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select pass::text||'/'||warning||'/'||conflict||'/'||error from public.curriculum_import_batch_report('dddddddd-5555-4000-a000-000000000001')), '1/1/1/1', 'รายงานก่อนอนุมัติ: ผ่าน/เตือน/ขัดแย้ง/ผิดพลาด');
select is((select count(*)::int from public.curriculum_import_batch_rows('dddddddd-5555-4000-a000-000000000001', 'conflict')), 1, 'ดึงรายการตามชั้น (conflict)');
reset role;
select throws_ok($$update public.import_rows set status = 'approved', decision_by = 'aaaaaaaa-0000-4000-a000-000000000003' where id = 'eeeeeeee-0000-4000-a000-000000000003'$$, 'แถวที่ผิดพลาดหรือมีข้อขัดแย้งที่ยังไม่ตัดสิน อนุมัติไม่ได้', 'อนุมัติแถว conflict โดยตรงไม่ได้ (trigger ป้องกันทุกเส้นทาง แม้เป็นเจ้าของตาราง)');
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((public.curriculum_import_rows_approve_clean('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001','eeeeeeee-0000-4000-a000-000000000002','eeeeeeee-0000-4000-a000-000000000003','eeeeeeee-0000-4000-a000-000000000004']::uuid[]) ->> 'approved')::int, 1, 'อนุมัติกลุ่มผ่าน: เฉพาะแถวผ่าน');
select throws_ok($$select public.curriculum_import_rows_approve_warnings('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000002']::uuid[], 'สั้น')$$, 'ต้องระบุหมายเหตุอย่างน้อย 10 ตัวอักษร (เหตุผลที่รับคำเตือน)', 'อนุมัติกลุ่มเตือนต้องมีหมายเหตุ');
select is((public.curriculum_import_rows_approve_warnings('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000002','eeeeeeee-0000-4000-a000-000000000003','eeeeeeee-0000-4000-a000-000000000004']::uuid[], 'ชื่อถูกตัดบรรทัด ตรวจเทียบ PDF แล้ว') ->> 'approved')::int, 1, 'อนุมัติกลุ่มเตือน: ไม่รวม conflict/error');
select is((select status from public.import_rows where id = 'eeeeeeee-0000-4000-a000-000000000003'), 'needs_review', 'แถว conflict ไม่ถูกอนุมัติ');
select is((select status from public.import_rows where id = 'eeeeeeee-0000-4000-a000-000000000004'), 'error', 'แถว error ไม่ถูกอนุมัติ');
select is((public.curriculum_import_rows_bulk_set('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000004']::uuid[], 'grade_code', 'M1', 'ตั้งระดับชั้นตามต้นฉบับ') ->> 'rejected_still_invalid')::int, 1, 'แก้กลุ่ม: แถวที่ยังผิดหลังแก้ไม่ถูกเขียน');
select throws_ok($$select public.curriculum_import_rows_bulk_set('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001']::uuid[], 'credits', '9', 'ลองแก้ช่องต้องห้าม')$$, 'ช่องนี้แก้เป็นกลุ่มไม่ได้', 'แก้ได้เฉพาะช่องที่อนุญาต');
select throws_ok($$select public.curriculum_import_batch_approve('dddddddd-5555-4000-a000-000000000001')$$, 'เฉพาะหัวหน้าฝ่ายวิชาการอนุมัติชุดนำเข้าได้', 'เจ้าหน้าที่อนุมัติชุดไม่ได้');
reset role; select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$select public.curriculum_import_batch_approve('dddddddd-5555-4000-a000-000000000001')$$, 'หัวหน้า (≠ผู้สร้าง) อนุมัติชุดได้แม้เหลือแถว error/conflict');
reset role;
select is((select count(*)::int from public.import_rows where status = 'approved'), 2, 'มีแถว approved เฉพาะที่คนกดอนุมัติ 2 แถว');
select is((select status from public.import_batches where id = 'dddddddd-5555-4000-a000-000000000001'), 'approved', 'ชุดเป็น approved โดยหัวหน้า');
select * from finish();
rollback;
