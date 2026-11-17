-- pgTAP: Phase 5 — กิจกรรมไม่มีเกณฑ์ผ่านเริ่มต้น · ข้อมูลตารางสอนไม่คำนวณคาบ · ข้อมูลเล่มหลักสูตรไม่สร้างประกาศ · Dashboard ตามสิทธิ์
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
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

insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values ('22222222-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7);
insert into public.academic_years (id, school_id, year_be, starts_on, ends_on) values ('33333333-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 2569, '2026-05-16', '2027-03-31');
insert into public.terms (id, school_id, academic_year_id, term_no, starts_on, ends_on) values ('33333333-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', '33333333-0000-4000-a000-000000000001', 1, '2026-05-16', '2026-10-10');
-- ฉบับที่อนุมัติแล้ว (กติกาเดิม: เปิดกลุ่มเรียนได้เฉพาะฉบับอนุมัติ/ใช้งาน) — fixture ปิด trigger ชั่วคราวเพื่อวางข้อมูลฉบับอนุมัติ
set local session_replication_role = replica;
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be, status, announcement_source_id, announcement_locator, approved_by, approved_at, submitted_by, submitted_at)
  values ('cccccccc-2222-4000-a000-000000000009', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-1111-4000-a000-000000000001', 'V2568', 2568, 'approved', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1', 'aaaaaaaa-0000-4000-a000-000000000001', now(), 'aaaaaaaa-0000-4000-a000-000000000001', now());
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator) values
  ('55555555-0000-4000-a000-000000000009', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000009', 'ท21101', 'ภาษาไทย 1', '11111111-0000-4000-a000-000000000001', 'basic', 1.5, 60, 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1');
insert into public.subject_offerings (id, school_id, curriculum_version_id, subject_id, grade_level_id, term_no, source_document_id, source_locator) values
  ('44444444-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000009', '55555555-0000-4000-a000-000000000009', '22222222-0000-4000-a000-000000000001', 1, 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1');
set local session_replication_role = origin;
insert into public.course_sections (id, school_id, curriculum_version_id, subject_offering_id, term_id) values
  ('44444444-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000009', '44444444-0000-4000-a000-000000000001', '33333333-1111-4000-a000-000000000001');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$insert into public.activity_groups (academic_year_id, kind, name_th) values ('33333333-0000-4000-a000-000000000001', 'club', 'ชุมนุม')$$, '42501', null, 'ครูสร้างกลุ่มกิจกรรมเองไม่ได้');
select throws_ok($$select public.academic_readiness_summary()$$, '42501', null, 'ครูเปิด Dashboard ฝ่ายวิชาการไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$insert into public.activity_groups (academic_year_id, kind, name_th, teacher_id, hours) values ('33333333-0000-4000-a000-000000000001', 'club', 'ชุมนุมดนตรี', '66666666-0000-4000-a000-000000000003', 20)$$, 'ผู้ดูแลสร้างกลุ่มกิจกรรม');
select is((select criteria_note from public.activity_groups where name_th = 'ชุมนุมดนตรี'), null, 'ไม่มีเกณฑ์ผ่านเริ่มต้น (ต้องกรอกตามนโยบายโรงเรียน)');
select throws_ok($$insert into public.activity_groups (academic_year_id, kind, name_th, policy_document_id) values ('33333333-0000-4000-a000-000000000001', 'scout', 'ลูกเสือ', 'eeeeeeee-0000-4000-a000-000000000001')$$, '23514', null, 'อ้างนโยบายต้องมีหน้าอ้างอิง');
select is((select periods_per_week from public.v_timetable_feed), null, 'ไม่คำนวณคาบต่อสัปดาห์จากหน่วยกิต');
select ok((select missing @> array['ยังไม่กำหนดจำนวนคาบต่อสัปดาห์', 'ยังไม่มีครูผู้สอน'] from public.v_timetable_feed), 'แจ้งข้อมูลที่ยังขาดสำหรับจัดตารางสอน');
select is((select public.curriculum_book_data('cccccccc-2222-4000-a000-000000000001') -> 'version' -> 'announcement'), 'null'::jsonb, 'ไม่มีเอกสารประกาศ → ไม่สร้างข้อความประกาศ');
select is((select public.curriculum_book_data('cccccccc-2222-4000-a000-000000000001') -> 'version' ->> 'status'), 'draft', 'เล่มหลักสูตรระบุสถานะร่าง');
select is((select (public.academic_readiness_summary() -> 'timetable' ->> 'ready')::int), 0, 'Dashboard นับความพร้อมจากข้อมูลจริง');
reset role;
select * from finish();
rollback;
