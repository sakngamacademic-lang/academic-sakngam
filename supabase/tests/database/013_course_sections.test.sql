-- pgTAP: C2 Course sections & teaching load — เปิดได้เฉพาะฉบับที่อนุมัติ, ครูหลายคน, RLS ครูเห็นเฉพาะของตน, แยกคาบ/ชั่วโมง/หน่วยกิต
-- ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 't1@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000007', 't2@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('aaaaaaaa-0000-4000-a000-000000000007', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher');
insert into public.teachers (id, school_id, profile_id, teacher_code, prefix, first_name, last_name) values
  ('aaaaaaaa-6666-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000006', 'TT01', 'นาย', 'ทดสอบ', 'หนึ่ง'),
  ('aaaaaaaa-6666-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000007', 'TT02', 'นาง', 'ทดสอบ', 'สอง');
insert into public.learning_areas (id, school_id, code, name_th) values ('aaaaaaaa-1111-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย');
insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values
  ('aaaaaaaa-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7);
insert into public.academic_years (id, school_id, year_be, starts_on, ends_on) values
  ('aaaaaaaa-3333-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 2501, '1958-05-16', '1959-05-15');
insert into public.terms (id, school_id, academic_year_id, term_no, starts_on, ends_on) values
  ('aaaaaaaa-3333-4000-b000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000000001', 1, '1958-05-16', '1958-10-10'),
  ('aaaaaaaa-3333-4000-b000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000000001', 2, '1958-11-01', '1959-03-31');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability)
values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label) values
  ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST-APPROVED'),
  ('dddddddd-2222-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST-DRAFT');
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator) values
  ('dddddddd-4444-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'T101', 'ไทย 1', 'aaaaaaaa-1111-4000-a000-000000000002', 'basic', 1.5, 60, 'dddddddd-0000-4000-a000-000000000001', 'pdf:39'),
  ('dddddddd-4444-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000002', 'T101', 'ไทย 1', 'aaaaaaaa-1111-4000-a000-000000000002', 'basic', 1.5, 60, 'dddddddd-0000-4000-a000-000000000001', 'pdf:39');
insert into public.subject_offerings (id, school_id, curriculum_version_id, subject_id, grade_level_id, term_no, source_document_id, source_locator) values
  ('dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'aaaaaaaa-2222-4000-a000-000000000001', 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11'),
  ('dddddddd-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000002', 'dddddddd-4444-4000-a000-000000000002', 'aaaaaaaa-2222-4000-a000-000000000001', 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11');
insert into public.learning_activities (id, school_id, curriculum_version_id, activity_type, name_th, grade_level_id, term_no, activity_hours, source_document_id, source_locator) values
  ('dddddddd-5555-4000-b000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'กิจกรรมแนะแนว', 'แนะแนว', 'aaaaaaaa-2222-4000-a000-000000000001', 1, 20, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11');
update public.curriculum_versions set status = 'approved', approved_by = 'aaaaaaaa-0000-4000-a000-000000000002', approved_at = now(),
  announcement_source_id = 'dddddddd-0000-4000-a000-000000000001', announcement_locator = 'pdf:3' where id = 'dddddddd-2222-4000-a000-000000000001';

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.course_sections (id, curriculum_version_id, subject_offering_id, term_id, periods_per_week, hours_per_week, hours_per_term)
values ('dddddddd-8888-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-3333-4000-b000-000000000001', 3, 3, 60);
insert into public.course_sections (id, curriculum_version_id, learning_activity_id, term_id)
values ('dddddddd-8888-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-5555-4000-b000-000000000001', 'aaaaaaaa-3333-4000-b000-000000000001');
select ok(true, 'ฝ่ายวิชาการเปิดกลุ่มเรียน (รายวิชา + กิจกรรม) ของฉบับที่อนุมัติได้');
select throws_ok($$insert into public.course_sections (curriculum_version_id, subject_offering_id, term_id)
  values ('dddddddd-2222-4000-a000-000000000002', 'dddddddd-5555-4000-a000-000000000002', 'aaaaaaaa-3333-4000-b000-000000000001')$$,
  '23514', null, 'ฉบับร่าง (ยังไม่อนุมัติ) เปิดกลุ่มเรียนไม่ได้');
select throws_ok($$insert into public.course_sections (curriculum_version_id, subject_offering_id, term_id)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-5555-4000-a000-000000000002', 'aaaaaaaa-3333-4000-b000-000000000001')$$,
  '23503', null, 'offering ต้องอยู่ในฉบับเดียวกับกลุ่มเรียน');
select throws_ok($$insert into public.course_sections (curriculum_version_id, subject_offering_id, term_id)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-3333-4000-b000-000000000002')$$,
  '23514', null, 'ภาคเรียนต้องตรงกับโครงสร้างหลักสูตร');
select throws_ok($$insert into public.course_sections (curriculum_version_id, subject_offering_id, learning_activity_id, term_id)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-5555-4000-a000-000000000001', 'dddddddd-5555-4000-b000-000000000001', 'aaaaaaaa-3333-4000-b000-000000000001')$$,
  '23514', null, 'กลุ่มเรียนอ้างได้อย่างใดอย่างหนึ่ง (รายวิชา หรือ กิจกรรม)');
insert into public.course_section_teachers (course_section_id, teacher_id, role, periods_per_week, hours_per_term) values
  ('dddddddd-8888-4000-a000-000000000001', 'aaaaaaaa-6666-4000-a000-000000000001', 'lead', 2, 40),
  ('dddddddd-8888-4000-a000-000000000001', 'aaaaaaaa-6666-4000-a000-000000000002', 'co_teacher', 1, 20),
  ('dddddddd-8888-4000-a000-000000000002', 'aaaaaaaa-6666-4000-a000-000000000002', 'lead', null, null);
select is((select count(*)::int from public.course_section_teachers where course_section_id = 'dddddddd-8888-4000-a000-000000000001'), 2, 'ครูสอนร่วมหลายคนได้');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select is((select count(*)::int from public.course_sections), 1, 'ครูเห็นเฉพาะกลุ่มเรียนที่ตนสอน');
select throws_ok($$insert into public.course_sections (curriculum_version_id, subject_offering_id, term_id)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-3333-4000-b000-000000000001')$$,
  '42501', null, 'ครูเปิดกลุ่มเรียนเองไม่ได้');
select is((select periods_per_week || '/' || teaching_hours_per_term || '/' || credits_reference from public.v_teacher_load), '2/40/1.5',
  'ภาระงานครู: คาบ/สัปดาห์ และชั่วโมง/ภาค ตามส่วนที่สอนจริง — หน่วยกิตแยกเป็นข้อมูลประกอบ');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000007');
select is((select coalesce(periods_per_week, 0) || '/' || teaching_hours_per_term || '/' || activity_hours_per_term from public.v_teacher_load), '1/20/20',
  'ชั่วโมงกิจกรรมแยกจากชั่วโมงสอน (ใช้ชั่วโมงกิจกรรมจากโครงสร้างเมื่อไม่ระบุ)');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select is((select count(*)::int from public.v_teacher_load), 2, 'หัวหน้าฝ่ายวิชาการเห็นภาระงานครูทุกคน');

select * from finish();
rollback;
