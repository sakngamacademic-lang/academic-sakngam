-- pgTAP: หน้าเยี่ยมชมสาธารณะ — อนุมัติเผยแพร่แยกจากการยืนยัน · anon อ่านเฉพาะที่เผยแพร่ · เล่ม ม.ต้น/ม.ปลาย ไม่ทับกัน · PDF ผ่าน service_role เท่านั้น
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'head@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 't1@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher');
insert into public.learning_areas (id, school_id, code, name_th, sort_order) values
  ('11111111-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1),
  ('11111111-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'SC', 'วิทยาศาสตร์', 2);
insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values
  ('22222222-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7),
  ('22222222-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'M4', 'ม.4', 'upper_secondary', 10);
insert into public.documents (id, school_id, title, kind) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'แหล่งข้อมูลหลักสูตร', 'curriculum_source');
insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type, size_bytes, upload_expires_at, status, sha256, confirmed_at, uploaded_by) values
  ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 1, 'k/th-lower.pdf', 'th-lower.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('a', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001'),
  ('dddddddd-2222-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 2, 'k/th-upper.pdf', 'th-upper.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('b', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001'),
  ('dddddddd-2222-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 3, 'k/structure.xlsx', 's.xlsx', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 10, now(), 'ready', repeat('c', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001'),
  ('dddddddd-2222-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 4, 'k/internal.pdf', 'internal.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('d', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability, file_id, page_count) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'ภาษาไทย ม.ต้น', 'learning_area_curriculum', 'A', 'dddddddd-2222-4000-a000-000000000001', 114),
  ('eeeeeeee-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-02', 'ภาษาไทย ม.ปลาย', 'learning_area_curriculum', 'A', 'dddddddd-2222-4000-a000-000000000002', 282),
  ('eeeeeeee-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-03', 'โครงสร้าง', 'structure_workbook', 'A', 'dddddddd-2222-4000-a000-000000000003', null),
  ('eeeeeeee-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-04', 'เอกสารภายใน', 'other', 'A', 'dddddddd-2222-4000-a000-000000000004', 5);
insert into public.school_curricula (id, school_id, name_th) values ('cccccccc-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'หลักสูตร');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be) values ('cccccccc-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-1111-4000-a000-000000000001', 'V2569', 2569);
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, grade_level_id, source_document_id, source_locator) values
  ('55555555-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'ท21201', 'ภาษาถิ่น', '11111111-0000-4000-a000-000000000001', 'additional', 1.0, 40, '22222222-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:12'),
  ('55555555-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'ท31201', 'วรรณกรรมท้องถิ่น', '11111111-0000-4000-a000-000000000001', 'additional', 1.0, 40, '22222222-0000-4000-a000-000000000004', 'eeeeeeee-0000-4000-a000-000000000004', 'pdf:3');
insert into public.curriculum_category_links (school_id, curriculum_version_id, category, target_type, target_id, status, reason, decided_by, decided_at) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'local', 'subject', '55555555-0000-4000-a000-000000000001', 'confirmed', 'เหตุผลภายใน-ลับ', 'aaaaaaaa-0000-4000-a000-000000000001', now()),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'local', 'subject', '55555555-0000-4000-a000-000000000002', 'proposed', 'ข้อเสนอ', null, null);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon'; end $$;
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated, anon;

-- 1) ก่อนเผยแพร่: anon ไม่เห็นอะไร และอ่านตารางตรงไม่ได้
reset role;
select pg_temp.as_anon();
select is((select public.public_visit_data() -> 'version'), 'null'::jsonb, 'ยังไม่เผยแพร่: ไม่มีฉบับหลักสูตร');
select is(jsonb_array_length(public.public_visit_data() -> 'books'), 0, 'ยังไม่เผยแพร่: ไม่มีเล่ม');
select throws_ok($$ select count(*) from public.subjects $$, '42501', null, 'anon อ่านตาราง subjects ตรงไม่ได้');
select throws_ok($$ select count(*) from public.public_releases $$, '42501', null, 'anon อ่านตาราง public_releases ตรงไม่ได้');
select throws_ok($$ select public.public_release_publish('curriculum_version', 'cccccccc-2222-4000-a000-000000000001') $$, '42501', null, 'anon เผยแพร่ไม่ได้');
select throws_ok($$ select * from public.public_document_authorize('eeeeeeee-0000-4000-a000-000000000001') $$, '42501', null, 'anon ขอไฟล์ตรงไม่ได้ (เฉพาะ service_role)');

-- 2) ครูเผยแพร่ไม่ได้
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$ select public.public_release_publish('curriculum_version', 'cccccccc-2222-4000-a000-000000000001') $$, '42501', null, 'ครูเผยแพร่ไม่ได้');

-- 3) ผู้ดูแลหลักสูตรเผยแพร่ฉบับหลักสูตร + เล่ม ม.ต้น / ม.ปลาย
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
insert into t_ids select 'v', public.public_release_publish('curriculum_version', 'cccccccc-2222-4000-a000-000000000001');
insert into t_ids select 'lower', public.public_release_publish('source_document', 'eeeeeeee-0000-4000-a000-000000000001', '11111111-0000-4000-a000-000000000001', 'lower');
insert into t_ids select 'upper', public.public_release_publish('source_document', 'eeeeeeee-0000-4000-a000-000000000002', '11111111-0000-4000-a000-000000000001', 'upper');
select throws_ok($$ select public.public_release_publish('source_document', 'eeeeeeee-0000-4000-a000-000000000004', '11111111-0000-4000-a000-000000000001', 'lower') $$, '23505', null, 'เล่ม ม.ต้น กลุ่มเดิมซ้ำไม่ได้ (ไม่ทับของเดิม)');
select throws_ok($$ select public.public_release_publish('source_document', 'eeeeeeee-0000-4000-a000-000000000003') $$, 'P0001', null, 'ไฟล์ที่ไม่ใช่ PDF เผยแพร่ไม่ได้');
select throws_ok($$ select public.public_release_publish('source_document', 'eeeeeeee-0000-4000-a000-000000000004', '11111111-0000-4000-a000-000000000002', null) $$, 'P0001', null, 'เล่มกลุ่มสาระต้องเลือกระดับ');
select throws_ok($$ insert into public.public_releases (target_type, target_id) values ('source_document', 'eeeeeeee-0000-4000-a000-000000000004') $$, '42501', null, 'เขียนตารางตรงไม่ได้');

-- 4) anon เห็นเฉพาะที่เผยแพร่ + ยืนยันแล้ว
reset role;
select pg_temp.as_anon();
select is((public.public_visit_data() -> 'version' ->> 'label'), 'V2569', 'เห็นฉบับที่เผยแพร่');
select is(jsonb_array_length(public.public_visit_data() -> 'items'), 1, 'เห็นเฉพาะรายการที่ยืนยันแล้ว (ไม่เห็นข้อเสนอ)');
select is((public.public_visit_data() -> 'items' -> 0 ->> 'code'), 'ท21201', 'รายการที่ยืนยันคือ ท21201');
select ok(not (public.public_visit_data() -> 'items' -> 0 ? 'reason') and position('เหตุผลภายใน' in public.public_visit_data()::text) = 0, 'ไม่เปิดเหตุผลภายใน');
select is((public.public_visit_data() -> 'items' -> 0 ->> 'document_id'), 'eeeeeeee-0000-4000-a000-000000000001', 'อ้างอิง PDF ที่เผยแพร่ได้');
select is(jsonb_array_length(public.public_visit_data() -> 'books'), 2, 'เล่ม ม.ต้น และ ม.ปลาย อยู่คู่กัน ไม่ทับกัน');
select is((select array_agg(b ->> 'stage' order by b ->> 'stage') from jsonb_array_elements(public.public_visit_data() -> 'books') b), array['lower', 'upper'], 'แยกระดับถูกต้อง');
select ok(position('object_key' in public.public_visit_data()::text) = 0 and position('k/th' in public.public_visit_data()::text) = 0, 'ไม่เปิด object_key');

-- 5) service_role: ขอไฟล์ได้เฉพาะเอกสารที่เผยแพร่
reset role; set local role service_role;
select is((select object_key from public.public_document_authorize('eeeeeeee-0000-4000-a000-000000000002')), 'k/th-upper.pdf', 'เล่มที่เผยแพร่ออก URL ได้');
select throws_ok($$ select * from public.public_document_authorize('eeeeeeee-0000-4000-a000-000000000004') $$, '42501', null, 'เอกสารที่ไม่เผยแพร่ออก URL ไม่ได้');

-- 6) ถอนการเผยแพร่ → หายจากหน้าสาธารณะ
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$ select public.public_release_withdraw((select id from t_ids where k = 'lower'), 'แก้ไขเล่ม') $$, 'ถอนการเผยแพร่ได้');
reset role; set local role service_role;
select throws_ok($$ select * from public.public_document_authorize('eeeeeeee-0000-4000-a000-000000000001') $$, '42501', null, 'ถอนแล้วออก URL ไม่ได้');
reset role;
select pg_temp.as_anon();
select is(jsonb_array_length(public.public_visit_data() -> 'books'), 1, 'ถอนแล้วเหลือเฉพาะ ม.ปลาย');
reset role;
select ok((select count(*) from public.audit_logs where table_name = 'public_releases') >= 4, 'มี Audit Log');
select * from finish();
rollback;
