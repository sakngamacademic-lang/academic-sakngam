-- pgTAP: อนุมัติกลุ่มแถวที่ไม่มีข้อสังเกต — เฉพาะแถวสะอาด, บันทึกผู้ตัดสิน, ไม่แตะ error/warning · ⚠️ fixture (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'), ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'staff@b.test', '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'bbbbbbbb-0000-4000-a000-000000000000', 'academic_staff');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label) values ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST');
insert into public.import_batches (id, school_id, source_document_id, curriculum_version_id, kind, status, created_by) values
  ('dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'study_programs', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003');
insert into public.import_rows (id, school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw, issues) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 1, 11, '{"code":"P1","name_th":"แผน 1","stage":"lower_secondary"}', 'needs_review', 'parser', '{}', '[]'),
  ('eeeeeeee-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 2, 12, '{"code":"P2","name_th":"แผน 2","stage":"bogus"}', 'needs_review', 'parser', '{}', '[]'),
  ('eeeeeeee-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000001', 3, 13, '{"code":"P3","name_th":"แผน 3","stage":"lower_secondary"}', 'error', 'parser', '{}', '[{"code":"X","severity":"error","message_th":"x"}]');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((public.curriculum_import_rows_approve_clean('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001','eeeeeeee-0000-4000-a000-000000000002','eeeeeeee-0000-4000-a000-000000000003']::uuid[]) ->> 'approved')::int, 1, 'อนุมัติเฉพาะแถวที่สะอาด 1 แถว');
select is((select status from public.import_rows where id = 'eeeeeeee-0000-4000-a000-000000000001'), 'approved', 'แถวสะอาดเป็น approved');
select is((select decision_by from public.import_rows where id = 'eeeeeeee-0000-4000-a000-000000000001'), 'aaaaaaaa-0000-4000-a000-000000000003'::uuid, 'บันทึกผู้ตัดสินเป็นผู้กด');
select isnt((select status from public.import_rows where id = 'eeeeeeee-0000-4000-a000-000000000002'), 'approved', 'แถวที่ validator พบข้อสังเกต/ผิดพลาดไม่ถูกอนุมัติ');
select is((select status from public.import_rows where id = 'eeeeeeee-0000-4000-a000-000000000003'), 'error', 'แถว error เดิมไม่ถูกแตะ');
select is((select status from public.import_batches where id = 'dddddddd-5555-4000-a000-000000000001'), 'needs_review', 'ชุดไม่ถูกอนุมัติ (ต้องหัวหน้าอีกคน)');
select throws_ok($$select public.curriculum_import_rows_approve_clean('dddddddd-5555-4000-a000-000000000001', array[]::uuid[])$$, 'ระบุแถวได้ครั้งละ 1–500 แถว', 'ส่งรายการว่างไม่ได้');
reset role; select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000003');
select throws_ok($$select public.curriculum_import_rows_approve_clean('dddddddd-5555-4000-a000-000000000001', array['eeeeeeee-0000-4000-a000-000000000001']::uuid[])$$, 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์', 'โรงเรียนอื่นอนุมัติไม่ได้');
reset role;
select is((select count(*)::int from public.import_rows where status = 'approved'), 1, 'มีแถว approved เพียง 1 แถวหลังทดสอบทั้งหมด');
select * from finish();
rollback;
