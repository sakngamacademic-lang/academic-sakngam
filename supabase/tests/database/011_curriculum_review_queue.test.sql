-- pgTAP: C1.5 Review Queue ข้ามชุด + ยอดโครงสร้างจากข้อมูลรอตรวจ (อ่านอย่างเดียว · RLS ผู้เรียก)
-- ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'), ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'staff@b.test', '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'bbbbbbbb-0000-4000-a000-000000000000', 'academic_staff');
insert into public.grade_levels (school_id, code, name_th, stage, level_order) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'M2', 'ม.2', 'lower_secondary', 8), ('aaaaaaaa-0000-4000-a000-000000000000', 'M5', 'ม.5', 'upper_secondary', 11);
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability)
values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label)
values ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST');
insert into public.import_batches (id, school_id, source_document_id, curriculum_version_id, kind, status, created_by) values
  ('dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'study_programs', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003'),
  ('dddddddd-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subjects', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003'),
  ('dddddddd-5555-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subject_offerings', 'needs_review', 'aaaaaaaa-0000-4000-a000-000000000003');
insert into public.import_rows (school_id, batch_id, row_no, source_page, normalized, status, proposed_by, raw) select v.*, '{}'::jsonb from (values
  ('aaaaaaaa-0000-4000-a000-000000000000'::uuid, 'dddddddd-5555-4000-a000-000000000001'::uuid, 1, 11, '{"code":"P1","name_th":"แผน","stage":"lower_secondary"}'::jsonb, 'needs_review', 'parser'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 1, 39, '{"code":"T101","subject_type":"basic","credits":1.5,"learning_hours":60}', 'needs_review', 'parser'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 2, 477, '{"code":"IS1","subject_type":"additional","subject_category":"is","education_stage":"lower_secondary","credits":1,"learning_hours":40}', 'needs_review', 'parser'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000002', 3, 50, '{"code":"T999","subject_type":"basic","credits":1,"learning_hours":40}', 'error', 'parser'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 1, 13, '{"subject_code":"T101","program_code":"P1","grade_code":"M2","term_no":"1"}', 'error', 'parser'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 2, 13, '{"subject_code":"IS1","program_code":"P1","grade_code":"M2","term_no":"1"}', 'error', 'parser'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 3, 24, '{"subject_code":"IS1","program_code":"P1","grade_code":"M5","term_no":"2"}', 'error', 'parser'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-5555-4000-a000-000000000003', 4, 13, '{"subject_code":"T999","program_code":"PX","grade_code":"M2","term_no":"2"}', 'error', 'parser')) v(school_id, batch_id, row_no, source_page, normalized, status, proposed_by);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');

select is((select resolution from public.curriculum_review_queue('dddddddd-2222-4000-a000-000000000001') where row_no = 1 and kind = 'subject_offerings' and ref_kind = 'subject'),
  'staged', 'อ้างรายวิชาที่รอตรวจในชุดอื่น = staged');
select is((select resolution from public.curriculum_review_queue('dddddddd-2222-4000-a000-000000000001') where row_no = 2 and ref_kind = 'subject'),
  'staged', 'IS ม.2 จับคู่ IS ม.ต้น');
select is((select resolution from public.curriculum_review_queue('dddddddd-2222-4000-a000-000000000001') where row_no = 3 and ref_kind = 'subject'),
  'missing', 'IS ม.5 ไม่จับคู่ IS ม.ต้น (ต่างช่วงชั้น)');
select is((select resolution from public.curriculum_review_queue('dddddddd-2222-4000-a000-000000000001') where row_no = 4 and ref_kind = 'subject'),
  'staged_error', 'อ้างรายวิชาที่มีแต่แถวผิดพลาด = staged_error');
select is((select resolution from public.curriculum_review_queue('dddddddd-2222-4000-a000-000000000001') where row_no = 4 and ref_kind = 'program'),
  'missing', 'อ้างแผนการเรียนที่ไม่มี = missing (ระบบไม่สร้างแผนให้)');
select is((select subjects || '/' || credits || '/' || learning_hours from public.curriculum_staged_structure('dddddddd-2222-4000-a000-000000000001')
           where grade_code = 'M2' and term_no = 1 and subject_type = 'basic'), '1/1.5/60', 'ยอดจากข้อมูลรอตรวจตามชั้น/ภาค/แผน');
select is((select sum(unresolved)::int from public.curriculum_staged_structure('dddddddd-2222-4000-a000-000000000001')), 2,
  'นับรายการที่ยังจับคู่รายวิชาไม่ได้แยกไว้ (ไม่รวมในยอดหน่วยกิต)');
select is((select count(*)::int from public.import_rows where status = 'error'), 5, 'ฟังก์ชันอ่านอย่างเดียว — สถานะแถวไม่เปลี่ยน');

reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000003');
select is((select count(*)::int from public.curriculum_review_queue('dddddddd-2222-4000-a000-000000000001')), 0, 'โรงเรียนอื่นไม่เห็นข้อมูล (RLS)');

select * from finish();
rollback;
