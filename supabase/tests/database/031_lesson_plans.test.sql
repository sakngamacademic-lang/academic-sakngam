-- pgTAP: Phase 4 — แผนการจัดการเรียนรู้: สร้างจากหน่วย · คัดลอกไม่ทับต้นฉบับ · ส่งตรวจ/ส่งกลับ/เห็นชอบ/อนุมัติ · ไม่อนุมัติของตนเอง · ประวัติ/แจ้งเตือน
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
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
insert into t_ids values ('s1', public.course_syllabus_open('55555555-0000-4000-a000-000000000001'));
insert into public.course_units (syllabus_id, seq, title, hours, objectives, assessment_methods) values ((select id from t_ids where k = 's1'), 1, 'หน่วยการอ่าน', 6, 'อ่านได้', 'สังเกต');
insert into public.course_syllabus_targets (syllabus_id, indicator_id) values ((select id from t_ids where k = 's1'), 'ffffffff-5555-4000-a000-000000000001');
insert into public.course_unit_targets (unit_id, target_id) select u.id, t.id from public.course_units u, public.course_syllabus_targets t where u.syllabus_id = (select id from t_ids where k = 's1') and t.syllabus_id = u.syllabus_id;
insert into t_ids values ('p1', public.lesson_plan_create('55555555-0000-4000-a000-000000000001', (select id from public.course_units where syllabus_id = (select id from t_ids where k = 's1')), null));
select is((select hours from public.lesson_plans where id = (select id from t_ids where k = 'p1')), 6.0, 'ชั่วโมงดึงจากหน่วยการเรียนรู้');
select is((select jsonb_array_length(public.lesson_plan_get((select id from t_ids where k = 'p1')) -> 'targets')), 1, 'ตัวชี้วัดของหน่วยดึงมาให้อัตโนมัติ');
update public.lesson_plans set content = '{"objective_k":"รู้","activities":"อ่าน","post_teaching_note":"สอนแล้ว"}' where id = (select id from t_ids where k = 'p1');
select is((select content ->> 'objective_k' from public.lesson_plans where id = (select id from t_ids where k = 'p1')), 'รู้', 'ผู้จัดทำแก้ร่างได้');
select is(public.lesson_plan_transition((select id from t_ids where k = 'p1'), 'submit'), 'submitted', 'ส่งตรวจ');
select throws_ok($$select public.lesson_plan_transition((select id from t_ids where k = 'p1'), 'area_approve')$$, '42501', null, 'ผู้จัดทำเห็นชอบแผนตนเองไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select throws_ok($$select public.lesson_plan_create('55555555-0000-4000-a000-000000000001', null, 'x')$$, '42501', null, 'ครูต่างกลุ่มสาระสร้างแผนรายวิชานี้ไม่ได้');
select is((select count(*)::int from public.lesson_plans), 0, 'ครูต่างกลุ่มสาระมองไม่เห็นแผน');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select is((select count(*)::int from public.lesson_plan_list('review')), 1, 'หัวหน้ากลุ่มสาระเห็นแผนในคิวตรวจ');
select throws_ok($$select public.lesson_plan_transition((select id from t_ids where k = 'p1'), 'return')$$, 'P0001', 'กรุณาระบุจุดที่ต้องแก้ไข', 'ส่งกลับต้องระบุจุดแก้');
select is(public.lesson_plan_transition((select id from t_ids where k = 'p1'), 'return', 'เพิ่มเกณฑ์ประเมิน', '[{"field":"criteria"}]'), 'returned', 'ส่งกลับพร้อมจุดที่ต้องแก้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select public.lesson_plan_transition((select id from t_ids where k = 'p1'), 'submit');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select is(public.lesson_plan_transition((select id from t_ids where k = 'p1'), 'area_approve', 'ดี'), 'area_approved', 'หัวหน้ากลุ่มสาระเห็นชอบ');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is(public.lesson_plan_transition((select id from t_ids where k = 'p1'), 'approve'), 'approved', 'ผู้ดูแลหลักสูตรอนุมัติ');
select is((select jsonb_array_length(public.lesson_plan_get((select id from t_ids where k = 'p1')) -> 'reviews')), 3, 'ประวัติการตรวจครบทุกขั้น');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
update public.lesson_plans set title = 'แก้หลังอนุมัติ' where id = (select id from t_ids where k = 'p1');
select isnt((select title from public.lesson_plans where id = (select id from t_ids where k = 'p1')), 'แก้หลังอนุมัติ', 'แผนที่อนุมัติแล้วแก้ไม่ได้');
insert into t_ids values ('p2', public.lesson_plan_copy((select id from t_ids where k = 'p1')));
select is((select status || ':' || (content ? 'post_teaching_note')::text || ':' || (copied_from_id = (select id from t_ids where k = 'p1'))::text from public.lesson_plans where id = (select id from t_ids where k = 'p2')), 'draft:false:true', 'คัดลอกเป็นร่างใหม่ ไม่คัดลอกบันทึกหลังสอน');
select is((select status from public.lesson_plans where id = (select id from t_ids where k = 'p1')), 'approved', 'ต้นฉบับไม่ถูกเขียนทับ');
reset role;
select ok((select count(*) >= 3 from public.notifications where user_id = 'aaaaaaaa-0000-4000-a000-000000000003'), 'ครูได้รับแจ้งเตือนผลการตรวจ');
select * from finish();
rollback;
