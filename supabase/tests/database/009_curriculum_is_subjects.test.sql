-- pgTAP: C1.5 รายวิชา IS (ไม่สังกัดกลุ่มสาระ · แยก ม.ต้น/ม.ปลาย) — constraint, สิทธิ์, import lookup, clone
-- ⚠️ fixture เป็นข้อมูลทดสอบที่สร้างขึ้น (รหัส TEST-*) ไม่ใช่ข้อมูลหลักสูตรจริง และถูก rollback
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'area@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.learning_areas (id, school_id, code, name_th) values
  ('aaaaaaaa-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'MA', 'คณิตศาสตร์');
insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff', null),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', 'aaaaaaaa-1111-4000-a000-000000000001');
insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values
  ('aaaaaaaa-2222-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'M2', 'ม.2', 'lower_secondary', 8),
  ('aaaaaaaa-2222-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'M5', 'ม.5', 'upper_secondary', 11);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------------------------------------------------------------- schema
select is((select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'subjects' and column_name = 'learning_area_id'),
  'YES', 'learning_area_id เป็น NULL ได้ (ควบคุมด้วย check ตามหมวด)');
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'subjects' and column_name = 'subject_category'),
  '''regular''::text', 'หมวดค่าเริ่มต้น = regular (แถวเดิมไม่เปลี่ยนความหมาย)');
select ok(has_column_privilege('authenticated', 'public.subjects', 'subject_category', 'insert')
  and has_column_privilege('authenticated', 'public.subjects', 'education_stage', 'update'), 'ผู้มีสิทธิ์แก้รายวิชากำหนดหมวด/ช่วงชั้นได้ (ยังอยู่ใต้ RLS)');

-- fixture: เอกสาร / หลักสูตร / ฉบับร่าง
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.source_documents (id, register_code, title, doc_type, reliability)
values ('dddddddd-0000-4000-a000-000000000001', 'SRC-01', 'เอกสารทดสอบ', 'curriculum_book', 'A');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
insert into public.school_curricula (id, name_th) values ('dddddddd-1111-4000-a000-000000000001', 'หลักสูตรทดสอบ');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.curriculum_versions (id, school_curriculum_id, version_label)
values ('dddddddd-2222-4000-a000-000000000001', 'dddddddd-1111-4000-a000-000000000001', 'TEST-2501');

-- ---------------------------------------------------------------- รายวิชาปกติ: เหมือนเดิม
insert into public.subjects (id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
values ('dddddddd-4444-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'TEST101', 'วิชาปกติ', 'aaaaaaaa-1111-4000-a000-000000000001',
        'basic', 1.0, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:10');
select is((select subject_category || '/' || coalesce(education_stage, '-') from public.subjects where id = 'dddddddd-4444-4000-a000-000000000001'),
  'regular/-', 'รายวิชาที่ไม่ระบุหมวด = regular ไม่มีช่วงชั้น');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST102', 'ไม่มีกลุ่มสาระ', 'basic', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11')$$,
  '23514', null, 'รายวิชาปกติยังบังคับกลุ่มสาระ');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator, education_stage)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST103', 'ปกติ+ช่วงชั้น', 'aaaaaaaa-1111-4000-a000-000000000001', 'basic', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:11', 'lower_secondary')$$,
  '23514', null, 'รายวิชาปกติใช้ education_stage ไม่ได้');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST101', 'ซ้ำ', 'aaaaaaaa-1111-4000-a000-000000000001', 'basic', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:12')$$,
  '23505', null, 'รหัสรายวิชาปกติซ้ำในฉบับเดียวกันไม่ได้ (เหมือนเดิม)');

-- ---------------------------------------------------------------- IS
insert into public.subjects (id, curriculum_version_id, code, name_th, subject_category, education_stage, subject_type, credits, learning_hours, description_th, source_document_id, source_locator)
values ('dddddddd-4444-4000-a000-000000000011', 'dddddddd-2222-4000-a000-000000000001', 'TEST-IS1', 'IS ม.ต้น', 'is', 'lower_secondary', 'additional', 1, 40, 'คำอธิบาย ม.ต้น', 'dddddddd-0000-4000-a000-000000000001', 'pdf:20'),
       ('dddddddd-4444-4000-a000-000000000012', 'dddddddd-2222-4000-a000-000000000001', 'TEST-IS1', 'IS ม.ปลาย', 'is', 'upper_secondary', 'additional', 1, 40, 'คำอธิบาย ม.ปลาย', 'dddddddd-0000-4000-a000-000000000001', 'pdf:21');
select is((select count(*)::int from public.subjects where code = 'TEST-IS1' and learning_area_id is null), 2,
  'IS ไม่มีกลุ่มสาระ · รหัสเดียวกันได้เมื่อช่วงชั้นต่างกัน');
select is((select string_agg(description_th, '|' order by education_stage) from public.subjects where code = 'TEST-IS1'),
  'คำอธิบาย ม.ต้น|คำอธิบาย ม.ปลาย', 'IS ม.ต้น/ม.ปลาย เก็บคำอธิบายต่างกันได้');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, subject_category, education_stage, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST-IS1', 'ซ้ำช่วงชั้น', 'is', 'lower_secondary', 'additional', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:22')$$,
  '23505', null, 'IS รหัส+ช่วงชั้นเดียวกันซ้ำไม่ได้');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, subject_category, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST-IS2', 'ไม่ระบุช่วงชั้น', 'is', 'additional', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:23')$$,
  '23514', null, 'IS ต้องระบุช่วงชั้น');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, subject_category, education_stage, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST101', 'ชนรหัสวิชาปกติ', 'is', 'upper_secondary', 'additional', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:24')$$,
  '23505', null, 'IS ใช้รหัสที่เป็นรายวิชาปกติอยู่แล้วไม่ได้');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST-IS1', 'ปกติชนรหัส IS', 'aaaaaaaa-1111-4000-a000-000000000001', 'additional', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:25')$$,
  '23505', null, 'รายวิชาปกติใช้รหัสที่เป็น IS อยู่แล้วไม่ได้');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, subject_category, education_stage, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST-IS3', 'สถานะผิด', 'is', 'primary', 'additional', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:26')$$,
  '23514', null, 'ช่วงชั้น IS ต้องเป็น lower_secondary/upper_secondary');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select throws_ok($$insert into public.subjects (curriculum_version_id, code, name_th, subject_category, education_stage, subject_type, credits, learning_hours, source_document_id, source_locator)
  values ('dddddddd-2222-4000-a000-000000000001', 'TEST-IS9', 'โดยหัวหน้ากลุ่มสาระ', 'is', 'lower_secondary', 'additional', 1, 40, 'dddddddd-0000-4000-a000-000000000001', 'pdf:27')$$,
  '42501', null, 'หัวหน้ากลุ่มสาระเพิ่ม IS (ไม่มีกลุ่มสาระ) ไม่ได้ — เฉพาะฝ่ายวิชาการ');

-- ---------------------------------------------------------------- lookup + import validate
reset role;
select is(private.curriculum_find_subject('dddddddd-2222-4000-a000-000000000001', 'TEST101', null), 'dddddddd-4444-4000-a000-000000000001'::uuid,
  'ค้นรายวิชาปกติด้วยรหัสอย่างเดียวได้เหมือนเดิม');
select is(private.curriculum_find_subject('dddddddd-2222-4000-a000-000000000001', 'TEST-IS1', 'upper_secondary'), 'dddddddd-4444-4000-a000-000000000012'::uuid,
  'ค้น IS ด้วยรหัส + ช่วงชั้น');
select is(private.curriculum_find_subject('dddddddd-2222-4000-a000-000000000001', 'TEST-IS1', null), null::uuid, 'IS ไม่ระบุช่วงชั้น = กำกวม → ไม่จับคู่');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.import_batches (id, source_document_id, curriculum_version_id, kind) values
  ('dddddddd-5555-4000-a000-000000000001', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subjects'),
  ('dddddddd-5555-4000-a000-000000000002', 'dddddddd-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001', 'subject_offerings');
reset role;
create function pg_temp.codes(p_batch uuid, p_n jsonb) returns text language sql as $$
  select coalesce(string_agg((e ->> 'code') || ':' || (e ->> 'severity'), ',' order by e ->> 'code'), '')
  from jsonb_array_elements(private.curriculum_validate(p_batch, null, p_n)) e
$$;
select is(pg_temp.codes('dddddddd-5555-4000-a000-000000000001',
  '{"code":"TEST-IS2","name_th":"IS ใหม่","subject_category":"is","education_stage":"lower_secondary","subject_type":"additional","credits":"1","learning_hours":"40"}'),
  'V13:info', 'นำเข้า IS ไม่มีกลุ่มสาระ = info ไม่ใช่ error');
select is(pg_temp.codes('dddddddd-5555-4000-a000-000000000001',
  '{"code":"TEST-IS2","name_th":"IS ใหม่","subject_category":"is","subject_type":"additional","credits":"1","learning_hours":"40"}'),
  'V13:info,V17:error', 'นำเข้า IS ไม่ระบุช่วงชั้น = error');
select is(pg_temp.codes('dddddddd-5555-4000-a000-000000000001',
  '{"code":"TEST-IS1","name_th":"IS ม.ปลายซ้ำ","subject_category":"is","education_stage":"upper_secondary","subject_type":"additional","credits":"1","learning_hours":"40"}'),
  'V11:error,V13:info', 'นำเข้า IS ซ้ำรหัส+ช่วงชั้นที่มีอยู่ = error');
select is(pg_temp.codes('dddddddd-5555-4000-a000-000000000001',
  '{"code":"TEST102","name_th":"ปกติไม่มีกลุ่มสาระ","subject_type":"basic","credits":"1","learning_hours":"40"}'),
  'V13:error', 'นำเข้ารายวิชาปกติไม่มีกลุ่มสาระยังเป็น error (เหมือนเดิม)');
select is(pg_temp.codes('dddddddd-5555-4000-a000-000000000002', '{"subject_code":"TEST-IS1","grade_code":"M5","term_no":"2"}'), '',
  'การจัดรายวิชา IS จับคู่ตามช่วงชั้นของระดับชั้น (ม.5 → IS ม.ปลาย)');

-- ---------------------------------------------------------------- clone
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select lives_ok($$select public.curriculum_version_clone('dddddddd-2222-4000-a000-000000000001', 'TEST-CLONE')$$, 'clone ฉบับที่มี IS ได้');
select is((select string_agg(s.code || '/' || s.subject_category || '/' || coalesce(s.education_stage, '-'), ',' order by s.code, s.education_stage)
  from public.subjects s join public.curriculum_versions v on v.id = s.curriculum_version_id where v.version_label = 'TEST-CLONE'),
  'TEST-IS1/is/lower_secondary,TEST-IS1/is/upper_secondary,TEST101/regular/-', 'clone คงหมวด/ช่วงชั้นของรายวิชา');

select * from finish();
rollback;
