-- pgTAP: Assessment foundation — RLS นักเรียน/คะแนน, เกณฑ์ต้องยืนยัน, คำนวณเกรด, ส่ง/อนุมัติ (สองคน), ล็อกหลังอนุมัติ
-- ⚠️ fixture ทดสอบ (ชื่อสมมติ ไม่ใช่ข้อมูลนักเรียนจริง) · rollback
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'), ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'exec@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 't1@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000007', 't2@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'staff@b.test', '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'executive'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('aaaaaaaa-0000-4000-a000-000000000007', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'bbbbbbbb-0000-4000-a000-000000000000', 'academic_staff');
insert into public.teachers (id, school_id, profile_id, teacher_code, prefix, first_name, last_name) values
  ('aaaaaaaa-6666-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000006', 'TT01', 'นาย', 'ทดสอบ', 'หนึ่ง'),
  ('aaaaaaaa-6666-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000007', 'TT02', 'นาง', 'ทดสอบ', 'สอง');
insert into public.learning_areas (id, school_id, code, name_th) values ('aaaaaaaa-1111-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย');
insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values ('aaaaaaaa-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7);
insert into public.academic_years (id, school_id, year_be, starts_on, ends_on) values ('aaaaaaaa-3333-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 2501, '1958-05-16', '1959-05-15');
insert into public.terms (id, school_id, academic_year_id, term_no, starts_on, ends_on) values ('aaaaaaaa-3333-4000-b000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000000001', 1, '1958-05-16', '1958-10-10');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values
  ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'หลักสูตร (ทดสอบ)', 'curriculum_book', 'A'),
  ('dddddddd-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-04', 'ระเบียบวัดผล (ทดสอบ)', 'assessment_regulation', 'B');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label) values ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST');
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
values ('dddddddd-4444-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'T101', 'ไทย 1', 'aaaaaaaa-1111-4000-a000-000000000002', 'basic', 1.5, 60, 'dddddddd-0000-4000-a000-000000000001', 'pdf:39');
insert into public.subject_offerings (id, school_id, curriculum_version_id, subject_id, grade_level_id, term_no, source_document_id, source_locator)
values ('dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'aaaaaaaa-2222-4000-a000-000000000001', 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11');
update public.curriculum_versions set status = 'approved', approved_by = 'aaaaaaaa-0000-4000-a000-000000000002', approved_at = now(),
  announcement_source_id = 'dddddddd-0000-4000-a000-000000000001', announcement_locator = 'pdf:3' where id = 'dddddddd-2222-4000-a000-000000000001';
insert into public.course_sections (id, school_id, curriculum_version_id, subject_offering_id, term_id, periods_per_week) values
  ('dddddddd-8888-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-3333-4000-b000-000000000001', 3),
  ('dddddddd-8888-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-5555-4000-a000-000000000001', 'aaaaaaaa-3333-4000-b000-000000000001', 3);
insert into public.course_section_teachers (school_id, course_section_id, teacher_id) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-8888-4000-a000-000000000001', 'aaaaaaaa-6666-4000-a000-000000000001'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-8888-4000-a000-000000000002', 'aaaaaaaa-6666-4000-a000-000000000002');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ฝ่ายวิชาการ: นักเรียน + ลงทะเบียน (ชื่อสมมติ)
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.students (id, student_code, prefix, first_name, last_name) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'TS001', 'ด.ช.', 'สมมติ', 'หนึ่ง'),
  ('eeeeeeee-0000-4000-a000-000000000002', 'TS002', 'ด.ญ.', 'สมมติ', 'สอง'),
  ('eeeeeeee-0000-4000-a000-000000000003', 'TS003', 'ด.ช.', 'สมมติ', 'สาม');
insert into public.course_enrollments (course_section_id, student_id) values
  ('dddddddd-8888-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000001'),
  ('dddddddd-8888-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000002'),
  ('dddddddd-8888-4000-a000-000000000002', 'eeeeeeee-0000-4000-a000-000000000003');
insert into public.grading_policies (id, curriculum_version_id, academic_year_id, params, source_document_id, source_locator)
values ('dddddddd-9999-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-3333-4000-a000-000000000001',
        '{"bands":[{"min":80,"grade":"4"},{"min":50,"grade":"1"},{"min":0,"grade":"0"}],"attendance_min_percent":80}', 'dddddddd-0000-4000-a000-000000000004', 'pdf:12');
select ok(true, 'ฝ่ายวิชาการเพิ่มนักเรียน ลงทะเบียน และร่างเกณฑ์ (อ้างระเบียบ) ได้');

-- ครู 1: เห็นเฉพาะนักเรียนในกลุ่มที่ตนสอน
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select is((select count(*)::int from public.students), 2, 'ครูเห็นเฉพาะนักเรียนในกลุ่มเรียนที่ตนสอน');
select throws_ok($$insert into public.students (student_code, prefix, first_name, last_name) values ('TS9', 'ด.ช.', 'x', 'y')$$, '42501', null, 'ครูเพิ่มนักเรียนเองไม่ได้');
insert into public.assessment_components (id, course_section_id, name, kind, max_score) values
  ('dddddddd-aaaa-4000-a000-000000000001', 'dddddddd-8888-4000-a000-000000000001', 'คะแนนเก็บ', 'formative', 70),
  ('dddddddd-aaaa-4000-a000-000000000002', 'dddddddd-8888-4000-a000-000000000001', 'สอบปลายภาค', 'final', 30);
insert into public.assessment_scores (component_id, student_id, score) values
  ('dddddddd-aaaa-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000001', 65),
  ('dddddddd-aaaa-4000-a000-000000000002', 'eeeeeeee-0000-4000-a000-000000000001', 25),
  ('dddddddd-aaaa-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000002', 40);
insert into public.assessment_scores (component_id, student_id, status) values ('dddddddd-aaaa-4000-a000-000000000002', 'eeeeeeee-0000-4000-a000-000000000002', 'missing');
select ok(true, 'ครูบันทึกองค์ประกอบคะแนนและคะแนนของกลุ่มตนได้');
select throws_ok($$insert into public.assessment_scores (component_id, student_id, score) values ('dddddddd-aaaa-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000003', 10)$$,
  '42501', null, 'บันทึกคะแนนนักเรียนที่ไม่ได้ลงทะเบียนในกลุ่มไม่ได้');
select throws_ok($$insert into public.assessment_components (course_section_id, name, kind, max_score) values ('dddddddd-8888-4000-a000-000000000002', 'x', 'other', 10)$$,
  '42501', null, 'บันทึกในกลุ่มที่ไม่ได้สอนไม่ได้');
insert into public.attendance_records (course_section_id, student_id, session_date, status) values
  ('dddddddd-8888-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000001', '1958-06-01', 'present'),
  ('dddddddd-8888-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000002', '1958-06-01', 'absent');
select is((select pending_work::int from public.v_section_student_progress where student_id = 'eeeeeeee-0000-4000-a000-000000000002'), 1, 'นับงานค้าง (missing) ได้');

-- เส้นทางที่ UI ใช้: upsert ตามกุญแจเฉพาะ (แก้คะแนน/เวลาเรียนซ้ำได้โดยไม่สร้างแถวซ้ำ)
insert into public.assessment_scores (component_id, student_id, score, status) values ('dddddddd-aaaa-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000002', 45, 'recorded')
  on conflict (component_id, student_id) do update set score = excluded.score, status = excluded.status;
update public.assessment_scores set score = 40 where component_id = 'dddddddd-aaaa-4000-a000-000000000001' and student_id = 'eeeeeeee-0000-4000-a000-000000000002';
select is((select count(*)::int from public.assessment_scores where component_id = 'dddddddd-aaaa-4000-a000-000000000001' and student_id = 'eeeeeeee-0000-4000-a000-000000000002'), 1, 'upsert คะแนนไม่สร้างแถวซ้ำ');
insert into public.attendance_records (course_section_id, student_id, session_date, period_no, status) values ('dddddddd-8888-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000001', '1958-06-01', 1, 'late')
  on conflict (course_section_id, student_id, session_date, period_no) do update set status = excluded.status;
select is((select status from public.attendance_records where student_id = 'eeeeeeee-0000-4000-a000-000000000001' and session_date = '1958-06-01'), 'late', 'upsert เวลาเรียนแก้สถานะเดิม');
update public.attendance_records set status = 'present' where student_id = 'eeeeeeee-0000-4000-a000-000000000001' and session_date = '1958-06-01';

-- เกณฑ์ยังไม่ยืนยัน → คำนวณไม่ได้
select is(public.course_grades_compute('dddddddd-8888-4000-a000-000000000001') ->> 'status', 'insufficient_data', 'ไม่มีเกณฑ์ที่ยืนยัน = insufficient_data');
select throws_ok($$select public.grading_policy_verify('dddddddd-9999-4000-a000-000000000001')$$, '42501', null, 'ครูยืนยันเกณฑ์ไม่ได้');

reset role;
set local role service_role;
select throws_ok($$select public.grading_policy_verify('dddddddd-9999-4000-a000-000000000001')$$, null, null, 'AI/service_role ยืนยันเกณฑ์ไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select lives_ok($$select public.grading_policy_verify('dddddddd-9999-4000-a000-000000000001')$$, 'หัวหน้าฝ่ายวิชาการยืนยันเกณฑ์ที่อ้างระเบียบ');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select is(public.course_grades_compute('dddddddd-8888-4000-a000-000000000001') ->> 'students', '2', 'คำนวณผลจากเกณฑ์ที่ยืนยัน');
select is((select string_agg(grade, ',' order by student_id) from public.course_grades), '4,มส', 'เกรดตามช่วงคะแนน (90/100 → 4) · เวลาเรียนต่ำกว่าเกณฑ์ → มส');
select throws_ok($$select public.course_grade_set_special('dddddddd-8888-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000002', 'ร', '')$$, 'P0001', null, 'ผลพิเศษต้องมีเหตุผล');
select is(public.course_grades_submit('dddddddd-8888-4000-a000-000000000001'), 2, 'ครูส่งผลการเรียน');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select throws_ok($$select public.course_grades_approve('dddddddd-8888-4000-a000-000000000001')$$, '42501', null, 'ผู้บริหารอนุมัติผลไม่ได้ (อ่านอย่างเดียว)');
select is((select count(*)::int from public.course_grades), 2, 'ผู้บริหารเห็นผลการเรียน');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select is(public.course_grades_approve('dddddddd-8888-4000-a000-000000000001'), 2, 'หัวหน้าฝ่ายวิชาการ (คนละคนกับผู้ส่ง) อนุมัติผล');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$update public.assessment_scores set score = 70 where student_id = 'eeeeeeee-0000-4000-a000-000000000001' and component_id = 'dddddddd-aaaa-4000-a000-000000000001'$$,
  '23514', null, 'แก้คะแนนหลังอนุมัติผลไม่ได้');

reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000003');
select is((select count(*)::int from public.students) + (select count(*)::int from public.course_grades), 0, 'โรงเรียนอื่นไม่เห็นนักเรียน/ผลการเรียน');

select * from finish();
rollback;
