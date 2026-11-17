-- pgTAP: Phase 3 — คำอธิบาย/โครงสร้างรายวิชา: สิทธิ์ตามกลุ่มสาระ · เปิดของเดิม · workflow ไม่อนุมัติตนเอง · ตรวจชั่วโมง/คะแนน/ตัวชี้วัด · ฉบับใหม่ไม่ทับฉบับเดิม
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'head@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'lah@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 't1@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 't2@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.learning_areas (id, school_id, code, name_th, sort_order) values
  ('11111111-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1),
  ('11111111-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'MA', 'คณิตศาสตร์', 2);
insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', '11111111-0000-4000-a000-000000000001'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null);
insert into public.teachers (id, school_id, profile_id, teacher_code, prefix, first_name, last_name, learning_area_id) values
  ('66666666-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000003', 'T01', 'นาย', 'ครู', 'ไทย', '11111111-0000-4000-a000-000000000001'),
  ('66666666-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000004', 'T02', 'นาง', 'ครู', 'คณิต', '11111111-0000-4000-a000-000000000002');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'x', 'other', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('cccccccc-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 't');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be) values ('cccccccc-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-1111-4000-a000-000000000001', 'V2569', 2569);
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator) values
  ('55555555-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'ท21101', 'ภาษาไทย 1', '11111111-0000-4000-a000-000000000001', 'basic', 1.5, 60, 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1');
insert into public.curriculum_frameworks (id, code, name_th, source_citation) values ('ffffffff-0000-4000-a000-000000000001', 'CORE', 'แกนกลาง', 't');
insert into public.framework_versions (id, framework_id, version_label, status, source_citation) values ('ffffffff-1111-4000-a000-000000000001', 'ffffffff-0000-4000-a000-000000000001', 'v', 'draft', 't');
insert into public.framework_learning_areas (id, framework_version_id, code, name_th) values ('ffffffff-2222-4000-a000-000000000001', 'ffffffff-1111-4000-a000-000000000001', 'ท', 'ภาษาไทย');
insert into public.framework_grade_levels (id, framework_version_id, code, name_th, level_order) values ('ffffffff-3333-4000-a000-000000000001', 'ffffffff-1111-4000-a000-000000000001', 'ม.1', 'ม1', 7);
insert into public.learning_standards (id, framework_version_id, framework_learning_area_id, code, statement_th, source_citation) values ('ffffffff-4444-4000-a000-000000000001', 'ffffffff-1111-4000-a000-000000000001', 'ffffffff-2222-4000-a000-000000000001', 'ท 1.1', 's', 't');
insert into public.indicators (id, framework_version_id, standard_id, framework_grade_level_id, code, full_code, indicator_kind, statement_th, source_citation) values
  ('ffffffff-5555-4000-a000-000000000001', 'ffffffff-1111-4000-a000-000000000001', 'ffffffff-4444-4000-a000-000000000001', 'ffffffff-3333-4000-a000-000000000001', '1', 'ท 1.1 ม.1/1', 'grade', 'อ่านออกเสียง', 't'),
  ('ffffffff-5555-4000-a000-000000000002', 'ffffffff-1111-4000-a000-000000000001', 'ffffffff-4444-4000-a000-000000000001', 'ffffffff-3333-4000-a000-000000000001', '2', 'ท 1.1 ม.1/2', 'grade', 'จับใจความ', 't');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select count(*)::int from public.my_course_subjects()), 1, 'ครูกลุ่มสาระเห็นรายวิชาของกลุ่มสาระตน (หลักสูตรยังเป็นร่าง)');
select is((select count(*)::int from public.subjects), 0, 'RLS ของทะเบียนรายวิชาไม่ถูกผ่อน');
insert into t_ids values ('s1', public.course_syllabus_open('55555555-0000-4000-a000-000000000001'));
select is(public.course_syllabus_open('55555555-0000-4000-a000-000000000001'), (select id from t_ids where k = 's1'), 'เปิดซ้ำได้ฉบับเดิม ไม่สร้างใหม่');
select lives_ok($$update public.course_syllabi set essence = 'สาระสำคัญ' where id = (select id from t_ids where k = 's1')$$, 'ผู้จัดทำแก้เนื้อหาได้');
select lives_ok($$insert into public.course_syllabus_targets (syllabus_id, indicator_id) values ((select id from t_ids where k = 's1'), 'ffffffff-5555-4000-a000-000000000001'), ((select id from t_ids where k = 's1'), 'ffffffff-5555-4000-a000-000000000002')$$, 'เลือกตัวชี้วัดจากฐาน');
insert into public.course_units (syllabus_id, seq, title, hours, max_score, objectives) values ((select id from t_ids where k = 's1'), 1, 'หน่วยที่ 1 การอ่าน', 40, 50, 'อ่านได้');
insert into public.course_unit_targets (unit_id, target_id) select u.id, t.id from public.course_units u, public.course_syllabus_targets t where u.syllabus_id = (select id from t_ids where k = 's1') and t.indicator_id = 'ffffffff-5555-4000-a000-000000000001';
select is((select status from public.course_syllabus_check((select id from t_ids where k = 's1')) where check_code = 'HOURS'), 'warning', 'ชั่วโมงรวม 40 ≠ 60 → เตือน (ไม่ปรับค่าให้)');
select is((select status from public.course_syllabus_check((select id from t_ids where k = 's1')) where check_code = 'SCORE'), 'insufficient', 'ยังไม่มีเกณฑ์คะแนนที่โรงเรียนยืนยัน → ข้อมูลไม่พอ');
select ok(exists (select 1 from public.course_syllabus_check((select id from t_ids where k = 's1')) where check_code = 'UNASSIGNED' and message_th like 'ท 1.1 ม.1/2%'), 'แจ้งตัวชี้วัดที่ยังไม่จัดลงหน่วย');
select ok(exists (select 1 from public.course_syllabus_check((select id from t_ids where k = 's1')) where check_code = 'UNIT_INCOMPLETE'), 'แจ้งหน่วยที่ไม่มีวิธีประเมิน');
select ok(exists (select 1 from public.course_syllabus_check((select id from t_ids where k = 's1')) where check_code = 'UNVERIFIED'), 'แจ้งตัวชี้วัดจากกรอบที่ยังไม่ยืนยัน');
select is(public.course_syllabus_transition((select id from t_ids where k = 's1'), 'submit'), 'submitted', 'ส่งตรวจ');
update public.course_syllabi set essence = 'แก้หลังส่ง' where id = (select id from t_ids where k = 's1');
select is((select essence from public.course_syllabi where id = (select id from t_ids where k = 's1')), 'สาระสำคัญ', 'ส่งตรวจแล้วแก้เนื้อหาไม่ได้');
select throws_ok($$select public.course_syllabus_transition((select id from t_ids where k = 's1'), 'review')$$, '42501', null, 'ผู้จัดทำตรวจงานตนเองไม่ได้');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select is((select count(*)::int from public.my_course_subjects()), 0, 'ครูต่างกลุ่มสาระไม่เห็นรายวิชา');
select is((select count(*)::int from public.course_syllabi), 0, 'ครูต่างกลุ่มสาระอ่านคำอธิบายรายวิชาไม่ได้');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$select public.course_syllabus_transition((select id from t_ids where k = 's1'), 'return')$$, 'P0001', 'กรุณาระบุจุดที่ต้องแก้ไข', 'ส่งกลับต้องระบุจุดแก้');
select is(public.course_syllabus_transition((select id from t_ids where k = 's1'), 'return', 'เพิ่มวิธีประเมิน'), 'returned', 'หัวหน้ากลุ่มสาระส่งกลับแก้ไข');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
update public.course_units set assessment_methods = 'สังเกต' where syllabus_id = (select id from t_ids where k = 's1');
select public.course_syllabus_transition((select id from t_ids where k = 's1'), 'submit');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select is(public.course_syllabus_transition((select id from t_ids where k = 's1'), 'review'), 'reviewed', 'หัวหน้ากลุ่มสาระเห็นชอบ');
select throws_ok($$select public.course_syllabus_transition((select id from t_ids where k = 's1'), 'approve')$$, '42501', null, 'หัวหน้ากลุ่มสาระอนุมัติขั้นสุดท้ายไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is(public.course_syllabus_transition((select id from t_ids where k = 's1'), 'approve'), 'approved', 'ผู้ดูแลหลักสูตรอนุมัติ');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into t_ids values ('s2', public.course_syllabus_open('55555555-0000-4000-a000-000000000001'));
select is((select version_no || ':' || status || ':' || (select count(*) from public.course_units u where u.syllabus_id = c.id) from public.course_syllabi c where c.id = (select id from t_ids where k = 's2')), '2:draft:1', 'ฉบับใหม่คัดลอกหน่วยจากฉบับที่อนุมัติ');
select is((select status from public.course_syllabi where id = (select id from t_ids where k = 's1')), 'approved', 'ฉบับที่อนุมัติไม่ถูกเขียนทับ');
reset role;
select * from finish();
rollback;
