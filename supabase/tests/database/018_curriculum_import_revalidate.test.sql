-- pgTAP: C1.7 ตรวจซ้ำทั้งชุดนำเข้า (revalidate) + สรุป error — ไม่อนุมัติ/ไม่เขียนทับการตัดสินใจของคน
-- ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'), ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'staff@b.test', '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'bbbbbbbb-0000-4000-a000-000000000000', 'academic_head');
insert into public.grade_levels (school_id, code, name_th, stage, level_order) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'M2', 'ม.2', 'lower_secondary', 8);
insert into public.learning_areas (id, school_id, code, name_th, sort_order) values ('30000000-0000-4000-a000-0000000000aa', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1);
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability)
values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label)
values ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST');
insert into public.import_batches (id, school_id, source_document_id, curriculum_version_id, kind, status, created_by) values
  ('dddddddd-5555-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subject_offerings', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003'),
  ('dddddddd-5555-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subjects', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003');
update public.import_batches set status = 'approved', approved_by = 'bbbbbbbb-0000-4000-a000-000000000003', approved_at = now() where id = 'dddddddd-5555-4000-a000-000000000004';

-- แถวผิดพลาดเพราะยังไม่มีแผน/รายวิชาในฉบับ (dependency) + แถวที่คนตัดสินแล้ว
insert into public.import_rows (school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw, issues, decision_by) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 1, 13, '{"subject_code":"T101","program_code":"P1","grade_code":"M2","term_no":"1"}', 'error', 'parser', '{}',
    '[{"code":"V32","field":"program_code","severity":"error","message_th":"x"},{"code":"V33","field":"subject_code","severity":"error","message_th":"x"}]', null),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 2, 13, '{"subject_code":"T999","program_code":"P1","grade_code":"M2","term_no":"1"}', 'error', 'parser', '{}',
    '[{"code":"V33","field":"subject_code","severity":"error","message_th":"x"}]', null),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 3, 14, '{"subject_code":"T101","program_code":"P1","grade_code":"M2","term_no":"2"}', 'skipped', 'parser', '{}', '[]', 'aaaaaaaa-0000-4000-a000-000000000003');
insert into public.import_rows (school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw, issues, decision_by, decision_at) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000004', 1, 13, '{"code":"T101"}', 'approved', 'parser', '{}', '[]', 'bbbbbbbb-0000-4000-a000-000000000003', now());
-- ข้อมูลหลักที่ "บันทึกแล้ว" (จำลองว่าชุดแผน/รายวิชาถูกอนุมัติและ commit แล้ว)
insert into public.study_programs (school_id, curriculum_version_id, code, name_th, stage, source_document_id, source_locator)
values ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'P1', 'แผน', 'lower_secondary', 'dddddddd-0000-4000-a000-000000000001', 'pdf:11');
insert into public.subjects (school_id, curriculum_version_id, code, name_th, subject_type, learning_area_id, credits, learning_hours, source_document_id, source_locator)
values ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'T101', 'วิชา', 'basic', '30000000-0000-4000-a000-0000000000aa', 1.5, 60, 'dddddddd-0000-4000-a000-000000000001', 'pdf:39');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');

select is((select count(*)::int from public.curriculum_import_error_summary('dddddddd-5555-4000-a000-000000000003') where cause = 'dependency'), 2, 'สรุป error: V32 + V33 นับเป็น dependency');
select is((select sum(rows)::int from public.curriculum_import_error_summary('dddddddd-5555-4000-a000-000000000003') where code = 'V33'), 2, 'สรุป error: V33 สองแถว');

select is((public.curriculum_import_batch_revalidate('dddddddd-5555-4000-a000-000000000003') ->> 'checked')::int, 2, 'ตรวจซ้ำเฉพาะแถวที่ยังไม่มีการตัดสิน (ข้ามแถว skipped)');
select is((select status from public.import_rows where batch_id = 'dddddddd-5555-4000-a000-000000000003' and row_no = 1), 'needs_review',
  'dependency ครบแล้ว → error เป็น needs_review (ไม่ใช่ approved)');
select is((select status from public.import_rows where batch_id = 'dddddddd-5555-4000-a000-000000000003' and row_no = 2), 'error',
  'รายวิชาที่ไม่มีจริงยังเป็น error');
select is((select status from public.import_rows where batch_id = 'dddddddd-5555-4000-a000-000000000003' and row_no = 3), 'skipped',
  'แถว skipped ไม่ถูกแตะ');
select is((select count(*)::int from public.import_rows where batch_id = 'dddddddd-5555-4000-a000-000000000003' and status = 'approved'), 0,
  'ตรวจซ้ำไม่ทำให้มีแถว approved');
select is((select normalized ->> 'subject_code' from public.import_rows where batch_id = 'dddddddd-5555-4000-a000-000000000003' and row_no = 2), 'T999',
  'ค่าต้นฉบับ (normalized) ไม่ถูกแก้');
select throws_ok($$select public.curriculum_import_batch_revalidate('dddddddd-5555-4000-a000-000000000004')$$, 'ชุดนำเข้านี้ไม่อยู่ในขั้นตรวจ',
  'ชุดที่อนุมัติแล้วตรวจซ้ำไม่ได้');

reset role;
select is((select status from public.import_rows where batch_id = 'dddddddd-5555-4000-a000-000000000004'), 'approved', 'แถว approved ในชุดอื่นไม่เปลี่ยน');
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000003');
select throws_ok($$select public.curriculum_import_batch_revalidate('dddddddd-5555-4000-a000-000000000003')$$, 'ไม่พบชุดนำเข้า หรือคุณไม่มีสิทธิ์',
  'โรงเรียนอื่นตรวจซ้ำชุดนี้ไม่ได้');
select is((select count(*)::int from public.curriculum_import_error_summary('dddddddd-5555-4000-a000-000000000003')), 0, 'โรงเรียนอื่นไม่เห็นสรุป (RLS)');

select * from finish();
rollback;
