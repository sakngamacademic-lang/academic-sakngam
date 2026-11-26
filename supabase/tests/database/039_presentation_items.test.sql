-- pgTAP: เล่มนำเสนอหลักสูตรแบบถาวร — ม.ต้น/ม.ปลาย ไม่ทับกัน · เปลี่ยนไฟล์ไม่ลบของเดิม · สิทธิ์ตามบทบาท · ไม่ลบเอกสารต้นทาง
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'head@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'lah@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
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


insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', '11111111-0000-4000-a000-000000000002');
-- ไฟล์ที่ยังไม่ได้ลงทะเบียน (เหมือนเพิ่งอัปโหลดจากหน้านำเสนอ)
insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type, size_bytes, upload_expires_at, status, sha256, confirmed_at, uploaded_by) values
  ('dddddddd-2222-4000-a000-000000000011', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 11, 'k/sc-lower.pdf', 'วิทย์ต้น.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('e', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001'),
  ('dddddddd-2222-4000-a000-000000000012', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 12, 'k/sc-upper.pdf', 'วิทย์ปลาย.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('f', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001'),
  ('dddddddd-2222-4000-a000-000000000013', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 13, 'k/sc-lower-v2.pdf', 'วิทย์ต้น-ใหม่.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('1', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001'),
  ('dddddddd-2222-4000-a000-000000000014', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 14, 'k/plan.pdf', 'แผน1.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('2', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000002');

-- 1) สิทธิ์: anon / ครู ทำไม่ได้ · เขียนตารางตรงไม่ได้
reset role;
select pg_temp.as_anon();
select throws_ok($$ select count(*) from public.presentation_items $$, '42501', null, 'anon อ่านตารางไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$ select public.presentation_item_attach('area_book', '11111111-0000-4000-a000-000000000002', 'lower', 'วิทย์ ม.ต้น', 'dddddddd-2222-4000-a000-000000000011') $$, '42501', null, 'ครูแนบเล่มไม่ได้');
select is((select count(*)::int from public.presentation_items), 0, 'ครูไม่เห็นรายการ (RLS)');

-- 2) ผู้ดูแลหลักสูตรแนบ ม.ต้น แล้ว ม.ปลาย — ไม่ทับกัน · ลงทะเบียนเอกสารต้นทางให้
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
insert into t_ids select 'lower', public.presentation_item_attach('area_book', '11111111-0000-4000-a000-000000000002', 'lower', 'วิทยาศาสตร์ ม.ต้น', 'dddddddd-2222-4000-a000-000000000011', null, 114);
insert into t_ids select 'upper', public.presentation_item_attach('area_book', '11111111-0000-4000-a000-000000000002', 'upper', 'วิทยาศาสตร์ ม.ปลาย', 'dddddddd-2222-4000-a000-000000000012', null, 282);
select is((select count(*)::int from public.presentation_items where status = 'active' and learning_area_id = '11111111-0000-4000-a000-000000000002'), 2, 'ม.ต้น และ ม.ปลาย อยู่คู่กัน');
select is((select d.page_count from public.source_documents d join public.presentation_items i on i.source_document_id = d.id where i.id = (select id from t_ids where k = 'lower')), 114, 'ลงทะเบียนเอกสารต้นทางพร้อมจำนวนหน้า');
select is((select d.file_id from public.source_documents d join public.presentation_items i on i.source_document_id = d.id where i.id = (select id from t_ids where k = 'upper')), 'dddddddd-2222-4000-a000-000000000012'::uuid, 'ชี้ไฟล์ใน storage ถูกไฟล์');
select throws_ok($$ select public.presentation_item_attach('area_book', '11111111-0000-4000-a000-000000000002', 'lower', 'ซ้ำ', 'dddddddd-2222-4000-a000-000000000013') $$, '23505', null, 'แนบซ้ำช่องเดิมไม่ได้ถ้าไม่สั่งเปลี่ยนไฟล์');
select throws_ok($$ select public.presentation_item_attach('area_book', '11111111-0000-4000-a000-000000000002', null, 'ไม่มีระดับ', 'dddddddd-2222-4000-a000-000000000013') $$, 'P0001', null, 'เล่มกลุ่มสาระต้องเลือกระดับ');
select throws_ok($$ insert into public.presentation_items (kind, source_document_id, title) values ('school_book', 'eeeeeeee-0000-4000-a000-000000000004', 'x') $$, '42501', null, 'เขียนตารางตรงไม่ได้');

-- 3) เปลี่ยนไฟล์ ม.ต้น: ของเดิมไม่ถูกลบ (replaced) · ม.ปลาย ไม่ถูกแตะ
insert into t_ids select 'lower2', public.presentation_item_attach('area_book', '11111111-0000-4000-a000-000000000002', 'lower', 'วิทยาศาสตร์ ม.ต้น', 'dddddddd-2222-4000-a000-000000000013', null, 120, null, true);
select is((select status from public.presentation_items where id = (select id from t_ids where k = 'lower')), 'replaced', 'เล่มเดิมเป็น replaced (ไม่ลบ)');
select is((select status from public.presentation_items where id = (select id from t_ids where k = 'upper')), 'active', 'เปลี่ยน ม.ต้น ไม่กระทบ ม.ปลาย');
select is((select count(*)::int from public.source_documents where file_id = 'dddddddd-2222-4000-a000-000000000011'), 1, 'ทะเบียนเอกสารของไฟล์เดิมยังอยู่');

-- 4) ผูกเอกสารที่อยู่ในระบบแล้ว (เล่มโรงเรียน) · เผยแพร่แล้วนำออก/เปลี่ยนไม่ได้จนกว่าจะถอน
insert into t_ids select 'school', public.presentation_item_attach('school_book', null, null, 'หลักสูตรสถานศึกษา', null, 'eeeeeeee-0000-4000-a000-000000000004');
select lives_ok($$ select public.public_release_publish('source_document', (select source_document_id from public.presentation_items where id = (select id from t_ids where k = 'upper')), '11111111-0000-4000-a000-000000000002', 'upper') $$, 'เผยแพร่เล่ม ม.ปลาย ได้');
select throws_ok($$ select public.presentation_item_remove((select id from t_ids where k = 'upper'), 'ทดสอบ') $$, 'P0001', null, 'เล่มที่เผยแพร่อยู่นำออกไม่ได้');
select throws_ok($$ select public.presentation_item_remove((select id from t_ids where k = 'school'), ' ') $$, '23514', null, 'นำออกต้องมีเหตุผล');
select lives_ok($$ select public.presentation_item_remove((select id from t_ids where k = 'school'), 'แนบผิดเล่ม') $$, 'นำออกได้ (ไม่ลบไฟล์)');
select is((select count(*)::int from public.source_documents where id = 'eeeeeeee-0000-4000-a000-000000000004'), 1, 'นำออกแล้วเอกสารต้นทางยังอยู่');

-- 5) หัวหน้ากลุ่มสาระ: จัดการได้เฉพาะกลุ่มของตน · เล่มโรงเรียนไม่ได้
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select lives_ok($$ select public.presentation_item_attach('lesson_plan', '11111111-0000-4000-a000-000000000002', null, 'แผนที่ 1', 'dddddddd-2222-4000-a000-000000000014', null, 5, '{"code":"ว21101"}') $$, 'หัวหน้ากลุ่มสาระแนบแผนของกลุ่มตนได้');
select throws_ok($$ select public.presentation_item_attach('lesson_plan', '11111111-0000-4000-a000-000000000001', null, 'แผนไทย', null, 'eeeeeeee-0000-4000-a000-000000000001') $$, '42501', null, 'หัวหน้ากลุ่มสาระแนบกลุ่มอื่นไม่ได้');
reset role;
select ok((select count(*) from public.audit_logs where table_name = 'presentation_items') >= 6, 'มี Audit Log');
select * from finish();
rollback;
