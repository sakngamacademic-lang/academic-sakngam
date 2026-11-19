-- pgTAP: เก็บเข้าคลัง/ลบทะเบียนเอกสารต้นทาง — เฉพาะผู้ดูแลหลักสูตร · ลบได้เฉพาะเมื่อไม่มีการอ้างอิง (ตรวจซ้ำฝั่งฐานข้อมูล)
-- · เก็บเข้าคลังไม่ทำลายความสัมพันธ์ · ไม่ลบไฟล์ · บันทึกเหตุการณ์ทั้งสำเร็จและถูกปฏิเสธ · SRC-01-P* ตรวจแยกรายการ
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'head@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 't@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.learning_areas (id, school_id, code, name_th, sort_order) values ('11111111-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1);
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher');
insert into public.documents (id, school_id, title, kind) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'แหล่งข้อมูลหลักสูตร', 'curriculum_source');
insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type, size_bytes, upload_expires_at, status, sha256, confirmed_at, uploaded_by) values
  ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 1, 'test/x.pdf', 'x.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('a', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001');
-- SRC-01 (แม่) · SRC-01-P1 (ลูก มีรายวิชาอ้างอิง) · SRC-01-P2 (ลูก ไม่มีการอ้างอิง) · SRC-09 (ไม่มีการอ้างอิง มีไฟล์)
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'เล่มหลักสูตร (ทดสอบ)', 'curriculum_book', 'A');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability, parent_id) values
  ('eeeeeeee-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01-P1', 'ส่วนที่ 1 (ทดสอบ)', 'curriculum_book', 'A', 'eeeeeeee-0000-4000-a000-000000000001'),
  ('eeeeeeee-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01-P2', 'ส่วนที่ 2 (ทดสอบ)', 'curriculum_book', 'A', 'eeeeeeee-0000-4000-a000-000000000001');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability, file_id) values
  ('eeeeeeee-0000-4000-a000-000000000009', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-09', 'เอกสารทดสอบ', 'other', 'B', 'dddddddd-2222-4000-a000-000000000001');
insert into public.school_curricula (id, school_id, name_th) values ('cccccccc-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 't');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be) values ('cccccccc-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-1111-4000-a000-000000000001', 'V2569', 2569);
insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator) values
  ('55555555-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'ท21101', 'ภาษาไทย 1', '11111111-0000-4000-a000-000000000001', 'basic', 1.5, 60, 'eeeeeeee-0000-4000-a000-000000000002', 'pdf:1');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;
create temp table t_res (k text primary key, v jsonb);
grant all on t_res to authenticated;

-- ---- สิทธิ์: ครู / เจ้าหน้าที่ / service ทำไม่ได้ · ไม่มี DELETE ตรง · แก้ status ตรงไม่ได้
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$ select public.source_document_archive('eeeeeeee-0000-4000-a000-000000000009', 'x') $$, '42501', null, 'ครูเก็บเข้าคลังไม่ได้');
select throws_ok($$ select public.source_document_delete('eeeeeeee-0000-4000-a000-000000000009', 'x') $$, '42501', null, 'ครูลบไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$ select public.source_document_delete('eeeeeeee-0000-4000-a000-000000000009', 'x') $$, '42501', null, 'เจ้าหน้าที่วิชาการลบไม่ได้ (ผู้ดูแลหลักสูตรเท่านั้น)');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$ delete from public.source_documents where id = 'eeeeeeee-0000-4000-a000-000000000009' $$, '42501', null, 'ไม่มี DELETE ตรงบนตาราง');
select throws_ok($$ update public.source_documents set status = 'archived' where id = 'eeeeeeee-0000-4000-a000-000000000009' $$, '42501', null, 'แก้ status ตรงไม่ได้');
select throws_ok($$ select public.source_document_delete('eeeeeeee-0000-4000-a000-000000000009', '  ') $$, 'P0001', 'กรุณาระบุเหตุผลการลบ', 'ต้องมีเหตุผล');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ select public.source_document_delete('eeeeeeee-0000-4000-a000-000000000009', 'x') $$, '42501', null, 'ไม่มีผู้ใช้ (service/ระบบ) ลบไม่ได้');

-- ---- สรุปการอ้างอิง (ตรวจจาก catalog)
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
insert into t_res select 'sum01', public.source_document_reference_summary('eeeeeeee-0000-4000-a000-000000000001');
select is((select v -> 'references' -> 0 ->> 'column' from t_res where k = 'sum01'), 'parent_id', 'SRC-01: เอกสารย่อยนับเป็นการอ้างอิง');
select is((select (v -> 'references' -> 0 ->> 'count')::int from t_res where k = 'sum01'), 2, 'SRC-01: มีเอกสารย่อย 2 รายการ');

-- ---- ลบถาวร: มีการอ้างอิง → ปฏิเสธ (ไม่ลบ) + บันทึกเหตุการณ์
insert into t_res select 'del01', public.source_document_delete('eeeeeeee-0000-4000-a000-000000000001', 'ทดสอบลบแม่');
select is((select v ->> 'result' from t_res where k = 'del01'), 'rejected', 'SRC-01 ที่มีเอกสารย่อยลบไม่ได้');
insert into t_res select 'delP1', public.source_document_delete('eeeeeeee-0000-4000-a000-000000000002', 'ทดสอบลบ P1');
select is((select v ->> 'cause' from t_res where k = 'delP1'), 'referenced', 'SRC-01-P1 มีรายวิชาอ้างอิง → ปฏิเสธ (ไม่ถูกลบเพราะเป็นส่วนย่อย)');
reset role;
select is((select count(*)::int from public.source_documents where id in ('eeeeeeee-0000-4000-a000-000000000001', 'eeeeeeee-0000-4000-a000-000000000002')), 2, 'รายการที่ถูกปฏิเสธยังอยู่ครบ');
select is((select count(*)::int from public.source_document_events where event = 'delete_rejected'), 2, 'บันทึกเหตุการณ์ delete_rejected ทั้งสองครั้ง');

-- ---- เก็บเข้าคลัง: ความสัมพันธ์เดิมคงอยู่
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
insert into t_res select 'arcP1', public.source_document_archive('eeeeeeee-0000-4000-a000-000000000002', 'เลิกใช้ ส่วนที่ 1');
select is((select v ->> 'result' from t_res where k = 'arcP1'), 'archived', 'เก็บเข้าคลังได้แม้มีการอ้างอิง');
select is((select status from public.source_documents where id = 'eeeeeeee-0000-4000-a000-000000000002'), 'archived', 'สถานะเป็น archived (แยกจาก superseded)');
select is((select source_document_id from public.subjects where id = '55555555-0000-4000-a000-000000000001'), 'eeeeeeee-0000-4000-a000-000000000002'::uuid, 'รายวิชายังอ้างเอกสารเดิม (หลักฐานไม่สูญหาย)');
select is((select parent_id from public.source_documents where id = 'eeeeeeee-0000-4000-a000-000000000002'), 'eeeeeeee-0000-4000-a000-000000000001'::uuid, 'ความสัมพันธ์แม่–ลูกคงเดิม');
insert into t_res select 'arcP1b', public.source_document_archive('eeeeeeee-0000-4000-a000-000000000002', 'ซ้ำ');
select is((select v ->> 'cause' from t_res where k = 'arcP1b'), 'already_archived', 'เก็บเข้าคลังซ้ำ → ปฏิเสธ');

-- ---- ลบถาวร: ไม่มีการอ้างอิง → ลบเฉพาะรายการทะเบียน ไม่ลบไฟล์
insert into t_res select 'del09', public.source_document_delete('eeeeeeee-0000-4000-a000-000000000009', 'ลงทะเบียนผิด');
select is((select v ->> 'result' from t_res where k = 'del09'), 'deleted', 'SRC-09 ไม่มีการอ้างอิง → ลบได้');
insert into t_res select 'delP2', public.source_document_delete('eeeeeeee-0000-4000-a000-000000000003', 'ส่วนย่อยไม่ได้ใช้');
select is((select v ->> 'result' from t_res where k = 'delP2'), 'deleted', 'SRC-01-P2 ไม่มีการอ้างอิง → ลบได้ (ตรวจแยกรายการ)');
reset role;
select is((select count(*)::int from public.files where id = 'dddddddd-2222-4000-a000-000000000001' and deleted_at is null), 1, 'ไฟล์ใน files ไม่ถูกลบ/ไม่ถูกแตะ');
select is((select count(*)::int from public.source_documents where id = 'eeeeeeee-0000-4000-a000-000000000001'), 1, 'ลบลูกแล้ว แม่ยังอยู่');

-- ---- Audit
select ok((select count(*) from public.audit_logs where table_name = 'source_documents' and action = 'DELETE' and record_id = 'eeeeeeee-0000-4000-a000-000000000009') = 1, 'audit_logs เก็บข้อมูลเดิมของแถวที่ลบ');
select is((select actor_id from public.source_document_events where event = 'deleted' and register_code = 'SRC-09'), 'aaaaaaaa-0000-4000-a000-000000000001'::uuid, 'เหตุการณ์ระบุผู้ลบ');
select throws_ok($$ delete from public.source_document_events $$, '42501', null, 'บันทึกเหตุการณ์แก้/ลบไม่ได้ (append-only)');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select count(*)::int from public.source_document_events), 0, 'ครูอ่านบันทึกเหตุการณ์ไม่ได้');
select * from finish();
rollback;
