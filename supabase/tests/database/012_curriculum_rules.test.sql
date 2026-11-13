-- pgTAP: C3 Compliance rules — เกณฑ์ต้องมีแหล่งที่มา, ยืนยันโดยมนุษย์, insufficient_data เมื่อข้อมูล/เกณฑ์ไม่ครบ
-- ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff');
insert into public.learning_areas (id, school_id, code, name_th) values ('aaaaaaaa-1111-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย');
insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values
  ('aaaaaaaa-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7);
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability)
values ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ทดสอบ', 'curriculum_book', 'A');
insert into public.school_curricula (id, school_id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label)
values ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 'TEST');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.res(p_code text) returns text language sql as $$
  select string_agg(status, ',' order by scope) from public.curriculum_compliance_check('dddddddd-2222-4000-a000-000000000001') where rule_code = p_code
$$;
grant execute on function pg_temp.res(text) to authenticated;

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.curriculum_rules (id, code, title_th, category, rule_type, params, source_document_id, source_locator, proposed_by)
values ('dddddddd-7777-4000-a000-000000000001', 'TS-TH-M1', 'ภาษาไทย ม.1 ตามโครงสร้างเวลาเรียน', 'learning_hours', 'area_basic_hours',
        '{"area_code":"TH","grade_codes":["M1"],"op":"eq","hours":120}', 'dddddddd-0000-4000-a000-000000000001', 'pdf:10', 'parser'),
       ('dddddddd-7777-4000-a000-000000000002', 'TS-NOSRC', 'เกณฑ์ไม่มีที่มา', 'learning_hours', 'activity_hours', '{"grade_codes":["M1"],"op":"eq","hours":120}', null, null, 'ai');
select is(pg_temp.res('TS-TH-M1'), 'insufficient_data', 'เกณฑ์ร่าง (ยังไม่ยืนยัน) ไม่ใช้ตัดสิน → insufficient_data');
select is(pg_temp.res('SYS-DATA'), 'insufficient_data', 'ไม่มีข้อมูลที่บันทึกแล้ว → insufficient_data ไม่ใช่ pass');
select is(pg_temp.res('SYS-FRAMEWORK'), 'insufficient_data', 'ไม่มีกรอบแกนกลางที่ยืนยัน → ไม่รายงาน coverage');
select is((select count(*)::int from public.curriculum_compliance_check('dddddddd-2222-4000-a000-000000000001') where rule_code = 'SYS-COVERAGE'), 0,
  'ไม่แสดงผล coverage เมื่อชุดตัวชี้วัดไม่ครบ');
select throws_ok($$select public.curriculum_rule_verify('dddddddd-7777-4000-a000-000000000001', 'verified')$$, '42501', null, 'เจ้าหน้าที่ยืนยันเกณฑ์ไม่ได้');
select throws_ok($$insert into public.curriculum_rules (code, title_th, category, rule_type, status) values ('TS-X', 'x', 'learning_hours', 'activity_hours', 'verified')$$,
  '42501', null, 'ตั้งสถานะ verified ตอนเพิ่มไม่ได้');

reset role;
set local role service_role;
select throws_ok($$select public.curriculum_rule_verify('dddddddd-7777-4000-a000-000000000001', 'verified')$$, null, null, 'AI/service_role ยืนยันเกณฑ์ไม่ได้');
reset role;

select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$select public.curriculum_rule_verify('dddddddd-7777-4000-a000-000000000002', 'verified')$$, 'P0001', null, 'เกณฑ์ที่ไม่อ้างเอกสารยืนยันไม่ได้');
select lives_ok($$select public.curriculum_rule_verify('dddddddd-7777-4000-a000-000000000001', 'verified')$$, 'หัวหน้าฝ่ายวิชาการยืนยันเกณฑ์ที่มีแหล่งที่มาได้');

-- ข้อมูลที่บันทึกแล้ว (fixture ตรง) — 1.0 หน่วยกิต = 20 ชม. ตามต้นฉบับ (ไม่บังคับ 40)
reset role;
insert into public.study_programs (id, school_id, curriculum_version_id, code, name_th, stage, source_document_id, source_locator)
values ('dddddddd-3333-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'P1', 'แผน', 'lower_secondary', 'dddddddd-0000-4000-a000-000000000001', 'pdf:11');
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, description_th, source_document_id, source_locator) values
  ('dddddddd-4444-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'T101', 'ไทย 1', 'aaaaaaaa-1111-4000-a000-000000000002', 'basic', 1.5, 60, 'x', 'dddddddd-0000-4000-a000-000000000001', 'pdf:39'),
  ('dddddddd-4444-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'T102', 'ไทย 2', 'aaaaaaaa-1111-4000-a000-000000000002', 'basic', 1.0, 20, null, 'dddddddd-0000-4000-a000-000000000001', 'pdf:40');
insert into public.subject_offerings (school_id, curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, source_document_id, source_locator) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'dddddddd-3333-4000-a000-000000000001', 'aaaaaaaa-2222-4000-a000-000000000001', 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000002', null, 'aaaaaaaa-2222-4000-a000-000000000001', 2, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11');
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select actual || '/' || status from public.curriculum_compliance_check('dddddddd-2222-4000-a000-000000000001') where rule_code = 'TS-TH-M1'),
  '80 ชม./warning', 'นับชั่วโมงตามต้นฉบับ (60 + 20 = 80) และรายวิชาที่ใช้ทุกแผน · ไม่ตรงเกณฑ์ = warning');
select is(pg_temp.res('SYS-DESC'), 'warning', 'รายวิชาที่ไม่มีคำอธิบาย = warning');
update public.curriculum_rules set params = '{"area_code":"TH","grade_codes":["M1"],"op":"eq","hours":80}' where id = 'dddddddd-7777-4000-a000-000000000001';
select is((select params ->> 'hours' from public.curriculum_rules where id = 'dddddddd-7777-4000-a000-000000000001'), '120', 'เกณฑ์ที่ยืนยันแล้วแก้ไม่ได้ (ต้องออกเวอร์ชันใหม่)');
select is(pg_temp.res('SYS-DATA'), 'pass', 'มีข้อมูลที่บันทึกแล้ว → SYS-DATA pass');

select * from finish();
rollback;
