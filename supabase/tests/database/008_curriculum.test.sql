-- pgTAP: Curriculum Intelligence (C1.1–C2) — RLS ทุกบทบาท, version lock, cohort, import two-person, AI/service bypass, mapping
-- ⚠️ fixture ทั้งหมดเป็นข้อมูลทดสอบที่สร้างขึ้น (รหัส TEST-*) ไม่ใช่ข้อมูลหลักสูตรจริง และถูก rollback
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'),
  ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'admin@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'area@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'exec@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 't@a.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000009', 'head2@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'head@b.test',  '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'system_admin', null),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000009', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff', null),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'executive', null),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', 'academic_head', null);
insert into public.learning_areas (id, school_id, code, name_th, national_area_code) values
  ('aaaaaaaa-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'MA', 'คณิตศาสตร์', 'TEST-MA'),
  ('aaaaaaaa-1111-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 'TEST-TH');
insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', 'aaaaaaaa-1111-4000-a000-000000000001');
insert into public.grade_levels (id, school_id, code, name_th, stage, level_order, national_grade_code) values
  ('aaaaaaaa-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7, 'TEST-G7'),
  ('aaaaaaaa-2222-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'M2', 'ม.2', 'lower_secondary', 8, 'TEST-G8'),
  ('aaaaaaaa-2222-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'M4', 'ม.4', 'upper_secondary', 10, 'TEST-G10');
insert into public.academic_years (id, school_id, year_be, starts_on, ends_on) values
  ('aaaaaaaa-3333-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 2501, '1958-05-16', '1959-05-15'),
  ('aaaaaaaa-3333-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 2502, '1959-05-16', '1960-05-15');
insert into public.classrooms (id, school_id, academic_year_id, grade_level_id, room_no) values
  ('aaaaaaaa-4444-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000000001', 'aaaaaaaa-2222-4000-a000-000000000001', 1),
  ('aaaaaaaa-4444-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-3333-4000-a000-000000000002', 'aaaaaaaa-2222-4000-a000-000000000002', 1);

-- national framework (test fixture, global) — 2 versions เพื่อทดสอบ mapping ข้ามกรอบ
insert into public.curriculum_frameworks (id, code, name_th, source_citation) values ('cccccccc-0000-4000-a000-000000000001', 'TEST-FW', 'กรอบทดสอบ', 'test fixture');
insert into public.framework_versions (id, framework_id, version_label, source_citation) values
  ('cccccccc-1111-4000-a000-000000000001', 'cccccccc-0000-4000-a000-000000000001', 'TEST-V1', 'test fixture'),
  ('cccccccc-1111-4000-a000-000000000002', 'cccccccc-0000-4000-a000-000000000001', 'TEST-V2', 'test fixture');
insert into public.framework_learning_areas (id, framework_version_id, code, name_th) values
  ('cccccccc-2222-4000-a000-000000000001', 'cccccccc-1111-4000-a000-000000000001', 'TEST-MA', 'กลุ่มทดสอบ MA'),
  ('cccccccc-2222-4000-a000-000000000002', 'cccccccc-1111-4000-a000-000000000001', 'TEST-TH', 'กลุ่มทดสอบ TH'),
  ('cccccccc-2222-4000-a000-000000000003', 'cccccccc-1111-4000-a000-000000000002', 'TEST-MA', 'กลุ่มทดสอบ MA v2');
insert into public.framework_grade_levels (id, framework_version_id, code, name_th, level_order) values
  ('cccccccc-3333-4000-a000-000000000001', 'cccccccc-1111-4000-a000-000000000001', 'TEST-G7', 'ชั้นทดสอบ 7', 7),
  ('cccccccc-3333-4000-a000-000000000002', 'cccccccc-1111-4000-a000-000000000001', 'TEST-G8', 'ชั้นทดสอบ 8', 8),
  ('cccccccc-3333-4000-a000-000000000003', 'cccccccc-1111-4000-a000-000000000002', 'TEST-G7', 'ชั้นทดสอบ 7 v2', 7);
insert into public.learning_standards (id, framework_version_id, framework_learning_area_id, code, statement_th, source_citation) values
  ('cccccccc-4444-4000-a000-000000000001', 'cccccccc-1111-4000-a000-000000000001', 'cccccccc-2222-4000-a000-000000000001', 'S1', 'มาตรฐานทดสอบ', 'test'),
  ('cccccccc-4444-4000-a000-000000000002', 'cccccccc-1111-4000-a000-000000000001', 'cccccccc-2222-4000-a000-000000000002', 'S2', 'มาตรฐานทดสอบ', 'test'),
  ('cccccccc-4444-4000-a000-000000000003', 'cccccccc-1111-4000-a000-000000000002', 'cccccccc-2222-4000-a000-000000000003', 'S1', 'มาตรฐานทดสอบ v2', 'test');
insert into public.indicators (id, framework_version_id, standard_id, framework_grade_level_id, code, full_code, indicator_kind, statement_th, source_citation) values
  ('cccccccc-5555-4000-a000-000000000001', 'cccccccc-1111-4000-a000-000000000001', 'cccccccc-4444-4000-a000-000000000001', 'cccccccc-3333-4000-a000-000000000001', '1', 'TEST S1 G7/1', 'grade', 'ตัวชี้วัดทดสอบ', 'test'),
  ('cccccccc-5555-4000-a000-000000000002', 'cccccccc-1111-4000-a000-000000000001', 'cccccccc-4444-4000-a000-000000000001', 'cccccccc-3333-4000-a000-000000000002', '1', 'TEST S1 G8/1', 'grade', 'ตัวชี้วัดทดสอบ', 'test'),
  ('cccccccc-5555-4000-a000-000000000003', 'cccccccc-1111-4000-a000-000000000001', 'cccccccc-4444-4000-a000-000000000002', 'cccccccc-3333-4000-a000-000000000001', '1', 'TEST S2 G7/1', 'grade', 'ตัวชี้วัดทดสอบ', 'test'),
  ('cccccccc-5555-4000-a000-000000000004', 'cccccccc-1111-4000-a000-000000000002', 'cccccccc-4444-4000-a000-000000000003', 'cccccccc-3333-4000-a000-000000000003', '1', 'TEST S1 G7/1', 'grade', 'ตัวชี้วัดทดสอบ v2', 'test');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
grant execute on function pg_temp.id(text) to authenticated, service_role;

-- ---------------------------------------------------------------- schema / grants
select ok((select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in (
  'curriculum_frameworks', 'indicators', 'source_documents', 'curriculum_versions', 'subjects', 'subject_offerings', 'import_batches', 'import_rows',
  'curriculum_indicator_mappings', 'curriculum_implementations')), 'RLS เปิดทุกตารางหลักสูตร');
select ok(not has_table_privilege('authenticated', 'public.indicators', 'insert') and not has_table_privilege('authenticated', 'public.learning_standards', 'update'),
  'ผู้ใช้เขียนกรอบแกนกลาง (global) ไม่ได้ — D1');
select ok(not has_table_privilege('authenticated', 'public.import_rows', 'insert') and not has_table_privilege('authenticated', 'public.subjects', 'delete')
  and not has_column_privilege('authenticated', 'public.curriculum_versions', 'status', 'update'), 'staging/สถานะ/ลบ ผ่าน RPC เท่านั้น');
select ok(not has_function_privilege('service_role', 'public.curriculum_import_batch_approve(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.curriculum_import_batch_commit(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.curriculum_version_approve(uuid)', 'execute'), 'service_role (AI/parser) อนุมัติ/commit ไม่ได้');
select ok(not has_function_privilege('authenticated', 'public.curriculum_import_store_rows(uuid,uuid,text,jsonb)', 'execute'), 'ผู้ใช้เขียนแถว parser เองไม่ได้');

-- ---------------------------------------------------------------- source / curriculum / version
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.source_documents (id, register_code, title, doc_type, reliability, page_offset)
values ('dddddddd-0000-4000-a000-000000000001', 'SRC-01', 'เอกสารทดสอบ', 'curriculum_book', 'A', 1);
insert into public.source_documents (id, register_code, title, doc_type, reliability, content_status)
values ('dddddddd-0000-4000-a000-000000000002', 'SRC-03-SC', 'แฟ้มว่าง (ทดสอบ)', 'learning_area_curriculum', 'D', 'empty');
select ok(true, 'เจ้าหน้าที่ลงทะเบียนเอกสารต้นทางได้');
select throws_ok($$insert into public.school_curricula (name_th) values ('ทดสอบ')$$, '42501', null, 'เจ้าหน้าที่สร้างหลักสูตรสถานศึกษาไม่ได้ (หัวหน้าฯ เท่านั้น)');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
insert into public.school_curricula (id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'หลักสูตรทดสอบ');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.curriculum_versions (id, school_curriculum_id, framework_version_id, version_label, hours_per_credit)
values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-1111-4000-a000-000000000001', 'cccccccc-1111-4000-a000-000000000001', 'TEST-2501', 40);
select is((select status || '/' || framework_status from public.curriculum_versions where id = 'dddddddd-2222-4000-a000-000000000001'),
  'draft/provisional', 'ฉบับใหม่ = draft + framework provisional (D2)');
select throws_ok($$insert into public.study_programs (curriculum_version_id, code, name_th, stage, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'P1', 'แผนทดสอบ', 'lower_secondary', 'dddddddd-0000-4000-a000-000000000001', 'หน้า 5')$$,
  '23514', null, 'locator ต้องอยู่ในรูปแบบ pdf:/book:/sheet:/file:');
insert into public.study_programs (id, curriculum_version_id, code, name_th, stage, source_document_id, source_locator)
values ('dddddddd-3333-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'P1', 'แผนทดสอบ', 'lower_secondary', 'dddddddd-0000-4000-a000-000000000001', 'pdf:5;book:4');
select ok(true, 'เจ้าหน้าที่เพิ่มแผนการเรียนใน draft ได้ (พร้อม provenance)');
select throws_ok($$select public.curriculum_version_approve('dddddddd-2222-4000-a000-000000000001')$$, '42501', null, 'เจ้าหน้าที่อนุมัติหลักสูตรไม่ได้');

-- รายวิชา: หัวหน้ากลุ่มสาระเฉพาะกลุ่มตน
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
insert into public.subjects (id, curriculum_version_id, code, name_th, learning_area_id, subject_type, grade_level_id, credits, learning_hours, source_document_id, source_locator)
values ('dddddddd-4444-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'TEST101', 'วิชาทดสอบ', 'aaaaaaaa-1111-4000-a000-000000000001',
        'basic', 'aaaaaaaa-2222-4000-a000-000000000001', 1.0, 20, 'dddddddd-0000-4000-a000-000000000001', 'pdf:10');
select is((select learning_hours from public.subjects where id = 'dddddddd-4444-4000-a000-000000000001'), 20,
  '1.0 หน่วยกิต = 20 ชม. บันทึกตามต้นฉบับ (ไม่บังคับ 40 ชม./หน่วยกิต)');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST201', 'ข้ามกลุ่ม', 'aaaaaaaa-1111-4000-a000-000000000002', 'basic', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11')$$,
  '42501', null, 'หัวหน้ากลุ่มสาระเพิ่มรายวิชากลุ่มอื่นไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST101', 'ซ้ำ', 'aaaaaaaa-1111-4000-a000-000000000001', 'basic', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:12')$$,
  '23505', null, 'รหัสวิชาซ้ำในฉบับเดียวกันไม่ได้');
insert into public.subject_offerings (curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, source_document_id, source_locator)
values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'dddddddd-3333-4000-a000-000000000001',
        'aaaaaaaa-2222-4000-a000-000000000001', 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:20');
select throws_ok($$insert into public.subject_offerings (curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'dddddddd-3333-4000-a000-000000000001',
          'aaaaaaaa-2222-4000-a000-000000000001', 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:20')$$, '23505', null, 'วางรายวิชาซ้ำในชั้น/ภาค/แผนเดียวกันไม่ได้');
select throws_ok($$insert into public.subject_offerings (curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'dddddddd-3333-4000-a000-000000000001',
          'aaaaaaaa-2222-4000-a000-000000000004', 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:20')$$, 'P0001', 'ช่วงชั้นของแผนการเรียนไม่ตรงกับระดับชั้น', 'แผน ม.ต้น วาง ม.4 ไม่ได้');

-- ---------------------------------------------------------------- mapping (C2)
insert into public.curriculum_indicator_mappings (id, curriculum_version_id, subject_id, indicator_id, source_document_id, source_locator)
values ('dddddddd-5555-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001',
        'cccccccc-5555-4000-a000-000000000001', 'dddddddd-0000-4000-a000-000000000001', 'pdf:30');
select is((select status from public.curriculum_indicator_mappings where id = 'dddddddd-5555-4000-a000-000000000001'), 'pending_review', 'mapping ใหม่ = pending_review');
select throws_ok($$insert into public.curriculum_indicator_mappings (curriculum_version_id, subject_id, indicator_id, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'cccccccc-5555-4000-a000-000000000004', 'dddddddd-0000-4000-a000-000000000001', 'pdf:30')$$,
  '23514', 'ตัวชี้วัดไม่อยู่ในกรอบหลักสูตรแกนกลางฉบับที่หลักสูตรนี้อ้างอิง', 'ห้าม mapping ข้าม framework version');
select throws_ok($$insert into public.curriculum_indicator_mappings (curriculum_version_id, subject_id, indicator_id, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'cccccccc-5555-4000-a000-000000000003', 'dddddddd-0000-4000-a000-000000000001', 'pdf:30')$$,
  '23514', 'ตัวชี้วัดอยู่คนละกลุ่มสาระกับรายวิชา', 'ห้าม mapping ข้ามกลุ่มสาระ');
select throws_ok($$insert into public.curriculum_indicator_mappings (curriculum_version_id, subject_id, indicator_id, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-4444-4000-a000-000000000001', 'cccccccc-5555-4000-a000-000000000002', 'dddddddd-0000-4000-a000-000000000001', 'pdf:30')$$,
  '23514', 'ตัวชี้วัดชั้นปีไม่ตรงกับระดับชั้นของรายวิชา', 'ตัวชี้วัดชั้นปีต้องตรงชั้นของรายวิชา');
select throws_ok($$update public.curriculum_indicator_mappings set status = 'verified' where id = 'dddddddd-5555-4000-a000-000000000001'$$,
  '42501', null, 'เปลี่ยนสถานะ mapping ตรงไม่ได้');
select lives_ok($$select public.curriculum_mapping_review('dddddddd-5555-4000-a000-000000000001', 'verified', 'ตรวจกับ pdf:30')$$, 'ตรวจ mapping ผ่าน RPC');
select results_eq($$select coverage_status, framework_complete from public.v_indicator_coverage
  where curriculum_version_id = 'dddddddd-2222-4000-a000-000000000001' order by full_code$$,
  $$values ('verified'::text, false), ('unmapped', false), ('unmapped', false)$$, 'coverage แยกสถานะ + บอกว่า reference dataset ยังไม่ครบ');
select ok((select evidence_incomplete from public.v_indicator_coverage where indicator_id = 'cccccccc-5555-4000-a000-000000000001'),
  'หลักฐานยังไม่ผ่านการทบทวน (source status registered) → evidence_incomplete');

-- ---------------------------------------------------------------- import: two-person + bypass
insert into public.import_batches (id, source_document_id, curriculum_version_id, kind)
values ('eeeeeeee-0000-4000-a000-000000000001', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subjects');
select throws_ok($$insert into public.import_batches (source_document_id, curriculum_version_id, kind)
  values ('dddddddd-0000-4000-a000-000000000002', 'dddddddd-2222-4000-a000-000000000001', 'subjects')$$, 'P0001', null, 'นำเข้าจากแหล่งที่ว่างไม่ได้ (V64)');
select throws_ok($$select public.curriculum_import_store_rows('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000003', 'x', '[]')$$,
  '42501', null, 'ผู้ใช้เรียก store_rows (parser) เองไม่ได้');
-- parser (service_role) เขียนแถว: ถูกต้อง / ซ้ำในฉบับ / ไม่มีค่า / เสนอโดย AI
reset role;
set local role service_role;
select is(public.curriculum_import_store_rows('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000003', 'test-parser',
  '[{"row_no":1,"source_sheet":"S1","source_cell_range":"A2:H2","raw":{"c":"TEST102"},"normalized":{"code":"TEST102","name_th":"วิชาทดสอบ 2","learning_area_code":"MA","subject_type":"additional","credits":"1.5","learning_hours":"40","grade_code":"M1"}},
    {"row_no":2,"source_sheet":"S1","source_cell_range":"A3:H3","raw":{"c":"TEST101"},"normalized":{"code":"TEST101","name_th":"ซ้ำ","learning_area_code":"MA","subject_type":"basic","credits":"1","learning_hours":"20"}},
    {"row_no":3,"source_page":15,"raw":{"text":"ข้อความเสีย"},"normalized":{}},
    {"row_no":4,"source_sheet":"S1","source_cell_range":"A5:H5","proposed_by":"ai","raw":{},"normalized":{"code":"TEST103","name_th":"AI เสนอ","learning_area_code":"TH","subject_type":"basic","credits":"1","learning_hours":"40"}}]'::jsonb),
  4, 'parser (service_role) เขียนแถว staging ได้');
select throws_ok($$select public.curriculum_import_row_decide((select id from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 1), 'approve')$$,
  '42501', null, 'service_role / AI ตัดสินแถวไม่ได้');
reset role;
select results_eq($$select status from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' order by row_no$$,
  $$values ('valid'::text), ('error'), ('needs_review'), ('needs_review')$$, 'สถานะแถว: ถูกต้อง / รหัสซ้ำ (V11) / หน้า PDF รอถอดค่า / AI → needs_review');
select ok((select issues @> '[{"code":"V22","severity":"info"}]' from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 1),
  'V22 แจ้งชั่วโมง≠หน่วยกิต×40 เป็น info เท่านั้น ไม่แก้ค่า');
select is((select normalized ->> 'learning_hours' from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 1), '40', 'ค่าต้นฉบับไม่ถูกเขียนทับ');
select is((select status from public.import_batches where id = 'eeeeeeee-0000-4000-a000-000000000001'), 'needs_review', 'ชุดนำเข้าไปขั้นตรวจ');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select is((select count(*)::int from public.import_batches), 0, 'หัวหน้ากลุ่มสาระไม่เห็นชุดนำเข้าระดับโรงเรียน');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select public.curriculum_import_row_decide((select id from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 2), 'approve')$$,
  'P0001', 'แถวนี้ยังมีข้อผิดพลาด อนุมัติไม่ได้', 'แถว error อนุมัติไม่ได้');
select throws_ok($$select public.curriculum_import_row_decide((select id from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 3), 'approve')$$,
  'P0001', 'ยังไม่ได้กรอกค่าจากต้นฉบับ อนุมัติไม่ได้', 'แถว PDF ที่ยังไม่ถอดค่า อนุมัติไม่ได้');
select is(public.curriculum_import_row_decide((select id from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 1), 'approve'), 'approved', 'เจ้าหน้าที่อนุมัติแถว valid');
select is(public.curriculum_import_row_decide((select id from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 2), 'skip', null, 'มีอยู่แล้ว'), 'skipped', 'ข้ามแถวซ้ำ');
select is(public.curriculum_import_row_decide((select id from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 3), 'approve',
  '{"code":"TEST104","name_th":"กรอกจาก pdf หน้า 15","learning_area_code":"MA","subject_type":"basic","credits":"0.5","learning_hours":"20"}'::jsonb), 'approved',
  'กรอกค่าจากหน้า PDF แล้วอนุมัติ (ตรวจซ้ำอัตโนมัติ)');
select is(public.curriculum_import_row_decide((select id from public.import_rows where batch_id = 'eeeeeeee-0000-4000-a000-000000000001' and row_no = 4), 'skip', null, 'AI เสนอผิดกลุ่ม'), 'skipped', 'ข้ามแถวที่ AI เสนอ');
select throws_ok($$select public.curriculum_import_batch_approve('eeeeeeee-0000-4000-a000-000000000001')$$, '42501', null, 'เจ้าหน้าที่อนุมัติชุดนำเข้าไม่ได้');
select throws_ok($$select public.curriculum_import_batch_commit('eeeeeeee-0000-4000-a000-000000000001')$$, '42501', null, 'commit ก่อนอนุมัติ/ไม่มีสิทธิ์ไม่ได้');

-- ผู้สร้างชุด (เป็นหัวหน้าฯ) อนุมัติชุดของตนเองไม่ได้
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
insert into public.import_batches (id, source_document_id, curriculum_version_id, kind)
values ('eeeeeeee-0000-4000-a000-000000000002', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'study_programs');
reset role;
update public.import_batches set status = 'needs_review' where id = 'eeeeeeee-0000-4000-a000-000000000002';
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$select public.curriculum_import_batch_approve('eeeeeeee-0000-4000-a000-000000000002')$$, '42501',
  'ผู้สร้างชุดนำเข้าอนุมัติชุดของตนเองไม่ได้ (ต้องเป็นอีกคนหนึ่ง)', 'two-person: ผู้สร้างอนุมัติเองไม่ได้');
-- blocking conflict กันการอนุมัติ
insert into public.source_conflicts (id, conflict_code, doc_a_id, description, impact)
values ('ffffffff-0000-4000-a000-000000000001', 'CF-90', 'dddddddd-0000-4000-a000-000000000001', 'ข้อขัดแย้งทดสอบ', 'blocking');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000009');
select throws_ok($$select public.curriculum_import_batch_approve('eeeeeeee-0000-4000-a000-000000000001')$$, 'P0001',
  'เอกสารต้นทางมีข้อขัดแย้งระดับ blocking ที่ยังไม่ได้ตัดสิน', 'ข้อขัดแย้ง blocking ห้ามอนุมัติ (V65)');
select lives_ok($$select public.source_conflict_resolve('ffffffff-0000-4000-a000-000000000001', 'ตัดสินตามเอกสารระดับ A (ทดสอบ)')$$, 'หัวหน้าฯ ตัดสินข้อขัดแย้ง');
select lives_ok($$select public.curriculum_import_batch_approve('eeeeeeee-0000-4000-a000-000000000001')$$, 'หัวหน้าฯ อีกคนอนุมัติชุด');
select is(public.curriculum_import_batch_commit('eeeeeeee-0000-4000-a000-000000000001'), 2, 'commit 2 แถวที่อนุมัติ');
select results_eq($$select code, source_locator, import_row_id is not null from public.subjects where code in ('TEST102', 'TEST104') order by code$$,
  $$values ('TEST102'::text, 'sheet:S1!A2:H2'::text, true), ('TEST104', 'pdf:15;book:14', true)$$, 'ข้อมูลหลักมี provenance ครบ (แหล่ง + ตำแหน่ง + import row)');

-- ---------------------------------------------------------------- version lock + cohort
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select public.curriculum_version_submit('dddddddd-2222-4000-a000-000000000001')$$, 'P0001', null, 'ส่งตรวจต้องมีประกาศ + เลขหน้า');
update public.curriculum_versions set announcement_source_id = 'dddddddd-0000-4000-a000-000000000001', announcement_locator = 'pdf:4;book:3'
 where id = 'dddddddd-2222-4000-a000-000000000001';
select lives_ok($$select public.curriculum_version_submit('dddddddd-2222-4000-a000-000000000001')$$, 'ส่งตรวจ');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select lives_ok($$select public.curriculum_version_approve('dddddddd-2222-4000-a000-000000000001')$$, 'หัวหน้าฯ อนุมัติฉบับ');
select throws_ok($$update public.subjects set name_th = 'แก้หลังอนุมัติ' where id = 'dddddddd-4444-4000-a000-000000000001'$$, '42501', null, 'ฉบับอนุมัติแล้วแก้รายวิชาไม่ได้');
update public.curriculum_versions set version_label = 'x' where id = 'dddddddd-2222-4000-a000-000000000001';
select is((select version_label from public.curriculum_versions where id = 'dddddddd-2222-4000-a000-000000000001'), 'TEST-2501', 'ฉบับอนุมัติแล้วแก้ข้อมูลฉบับไม่ได้');
insert into ids values ('v2', public.curriculum_version_clone('dddddddd-2222-4000-a000-000000000001', 'TEST-2502'));
select results_eq($$select status, (select count(*)::int from public.subjects where curriculum_version_id = pg_temp.id('v2')),
  (select count(*)::int from public.curriculum_indicator_mappings where curriculum_version_id = pg_temp.id('v2') and status = 'pending_review')
  from public.curriculum_versions where id = pg_temp.id('v2')$$, $$values ('draft'::text, 3, 1)$$, 'แก้ = สร้างฉบับใหม่ (clone) · mapping ต้องตรวจซ้ำ');
select lives_ok($$select public.curriculum_implementation_set('dddddddd-2222-4000-a000-000000000001', null, 'aaaaaaaa-3333-4000-a000-000000000001',
  'aaaaaaaa-2222-4000-a000-000000000001', 'dddddddd-0000-4000-a000-000000000001', 'pdf:4;book:3')$$, 'กำหนดรุ่น ม.1 ปี 2501');
select throws_ok($$select public.curriculum_implementation_set('dddddddd-2222-4000-a000-000000000001', 'dddddddd-3333-4000-a000-000000000001',
  'aaaaaaaa-3333-4000-a000-000000000001', 'aaaaaaaa-2222-4000-a000-000000000001', 'dddddddd-0000-4000-a000-000000000001', 'pdf:4')$$,
  '23505', null, 'รุ่นซ้อนกัน (ทุกแผน + รายแผน) ไม่ได้');
select throws_ok($$select public.curriculum_implementation_set(pg_temp.id('v2'), null, 'aaaaaaaa-3333-4000-a000-000000000002',
  'aaaaaaaa-2222-4000-a000-000000000001', 'dddddddd-0000-4000-a000-000000000001', 'pdf:4')$$, 'P0001', 'ใช้ได้เฉพาะหลักสูตรฉบับที่อนุมัติแล้ว', 'ใช้ฉบับ draft กับรุ่นไม่ได้');
select results_eq($$select resolution, curriculum_version_id from public.v_classroom_curriculum order by academic_year_id$$,
  $$values ('resolved'::text, 'dddddddd-2222-4000-a000-000000000001'::uuid), ('resolved', 'dddddddd-2222-4000-a000-000000000001'::uuid)$$,
  'ม.2 ปี 2502 = รุ่นเข้า ม.1 ปี 2501 → ใช้ฉบับเดียวกัน (ไม่ใช้ปีปัจจุบัน)');
select results_eq($$select resolution from public.curriculum_resolve('aaaaaaaa-3333-4000-a000-000000000002', 'aaaaaaaa-2222-4000-a000-000000000001')$$,
  $$values ('unresolved'::text)$$, 'รุ่นที่ยังไม่มีเอกสารยืนยัน = unresolved (ไม่เดา)');

-- ---------------------------------------------------------------- อ่านตามบทบาท / ข้ามโรงเรียน
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select results_eq($$select version_label from public.curriculum_versions$$, $$values ('TEST-2501'::text)$$, 'ครูเห็นเฉพาะฉบับที่อนุมัติ (ไม่เห็น draft)');
select is((select count(*)::int from public.source_documents) + (select count(*)::int from public.import_batches), 0, 'ครูไม่เห็นเอกสารต้นทาง/ชุดนำเข้า');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select is((select count(*)::int from public.curriculum_versions), 2, 'ผู้บริหารอ่านได้ทุกฉบับ');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
  values (pg_temp.id('v2'), 'X', 'x', 'aaaaaaaa-1111-4000-a000-000000000001', 'basic', 1, 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:1')$$, '42501', null, 'ผู้บริหารแก้ไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
  values (pg_temp.id('v2'), 'X', 'x', 'aaaaaaaa-1111-4000-a000-000000000001', 'basic', 1, 1, 'dddddddd-0000-4000-a000-000000000001', 'pdf:1')$$, '42501', null, 'ผู้ดูแลระบบไม่แก้เนื้อหาหลักสูตร');
reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000001');
select is((select count(*)::int from public.curriculum_versions) + (select count(*)::int from public.subjects) + (select count(*)::int from public.source_documents), 0,
  'โรงเรียนอื่นไม่เห็นข้อมูลหลักสูตร');
select throws_ok($$insert into public.import_batches (source_document_id, curriculum_version_id, kind)
  values ('dddddddd-0000-4000-a000-000000000001', pg_temp.id('v2'), 'subjects')$$, '23503', null, 'อ้างเอกสาร/ฉบับของโรงเรียนอื่นไม่ได้');

select * from finish();
rollback;
