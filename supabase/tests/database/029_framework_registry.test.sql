-- pgTAP: Phase 2 — สาระ · ชนิดตัวชี้วัดไม่สมมติ · ยอมรับหลายรายการได้เฉพาะรายการไม่มีปัญหา · สมรรถนะต้องอ้างหน้า · ค้นหา/สรุป/ประวัติ/ความครบถ้วน
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'admin@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff');
insert into public.documents (id, school_id, title, kind) values ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'แหล่งข้อมูลหลักสูตร', 'curriculum_source');
insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type, size_bytes, upload_expires_at, status, sha256, confirmed_at, uploaded_by) values
  ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 1, 'test/core.pdf', 'core.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('a', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001'),
  ('dddddddd-2222-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 2, 'test/x.docx', 'x.docx', 'docx', 'application/msword', 10, now(), 'ready', repeat('b', 64), now(), 'aaaaaaaa-0000-4000-a000-000000000001');
insert into public.source_documents (id, school_id, register_code, title, doc_type, reliability, file_id, page_count) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-90', 'หลักสูตรแกนกลาง (ทดสอบ)', 'other', 'A', 'dddddddd-2222-4000-a000-000000000001', 3),
  ('eeeeeeee-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'SRC-91', 'Word', 'other', 'A', 'dddddddd-2222-4000-a000-000000000002', null);

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
create temp table t_req as select * from public.document_analysis_request('eeeeeeee-0000-4000-a000-000000000001');
grant select on t_req to authenticated, service_role;
reset role;
set local role service_role;
select public.document_analysis_store((select analysis_id from t_req), $j${"doc_class":"core_curriculum","class_confidence":0.9,"page_count":3,"items":[
 {"item_type":"standard","item_key":"ว 2.1","locator":"pdf:1","extracted":{"code":"ว 2.1","area_code":"ว","area_name":"วิทยาศาสตร์","strand_no":"2","strand_name":"วิทยาศาสตร์กายภาพ","statement":"มาตรฐานทดสอบ"}},
 {"item_type":"indicator","item_key":"ว 2.1 ม.1/1","locator":"pdf:2","extracted":{"full_code":"ว 2.1 ม.1/1","standard_code":"ว 2.1","grade":"ม.1","number":"1","statement":"ข้อหนึ่ง"}},
 {"item_type":"indicator","item_key":"ว 2.1 ม.1/2","locator":"pdf:2","extracted":{"full_code":"ว 2.1 ม.1/2","standard_code":"ว 2.1","grade":"ม.1","number":"2","statement":"ข้อสอง ก"}},
 {"item_type":"indicator","item_key":"ว 2.1 ม.1/2","locator":"pdf:3","extracted":{"full_code":"ว 2.1 ม.1/2","standard_code":"ว 2.1","grade":"ม.1","number":"2","statement":"ข้อสอง ข"}},
 {"item_type":"indicator","item_key":"ว 2.1 ม.2/1","locator":"pdf:3","extracted":{"full_code":"ว 2.1 ม.2/1","standard_code":"ว 2.1","grade":"ม.2","number":"1","statement":"ปลายทางทดสอบ","stage_kind":"final"}}
]}$j$::jsonb);
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((select count(*)::int from public.document_analysis_items_search((select analysis_id from t_req), 'indicator', null, 'ว', null, 'ม.1')), 3, 'กรองตามชนิด/กลุ่มสาระ/ชั้น');
select is((select count(*)::int from public.document_analysis_items_search((select analysis_id from t_req), null, null, null, null, null, 'VARIANT_IN_DOC')), 2, 'กรองรายการขัดแย้ง');
select is((select count(*)::int from public.document_analysis_items_search((select analysis_id from t_req), null, null, null, null, null, null, 'ข้อหนึ่ง')), 1, 'ค้นหาข้อความ');
select throws_ok($$select public.document_analysis_item_decide(array(select id from public.document_analysis_items where analysis_id = (select analysis_id from t_req)), 'accept')$$,
  'P0001', null, 'ยอมรับหลายรายการไม่ได้เมื่อมีรายการขัดแย้งปน');
select is(public.document_analysis_item_decide(array(select id from public.document_analysis_items where analysis_id = (select analysis_id from t_req) and item_key in ('ว 2.1', 'ว 2.1 ม.1/1', 'ว 2.1 ม.2/1')), 'accept'), 3, 'ยอมรับหลายรายการที่ไม่มีปัญหาได้');
select is(public.document_analysis_item_decide(array(select id from public.document_analysis_items where analysis_id = (select analysis_id from t_req) and item_key = 'ว 2.1 ม.1/2' order by seq limit 1), 'accept'), 1, 'รายการขัดแย้งยอมรับทีละรายการได้');
select ok((select count(*) > 0 from public.document_analysis_item_history((select id from public.document_analysis_items where item_key = 'ว 2.1 ม.1/1'))), 'มีประวัติการตรวจ');
select ok((select sum(n) = 5 from public.document_analysis_summary((select analysis_id from t_req))), 'สรุปความคืบหน้าครบทุกรายการ');
create temp table t_c as select public.document_analysis_commit_framework((select analysis_id from t_req), 'CORE51', 'หลักสูตรแกนกลาง (ทดสอบ)', 'ทดสอบ', 2560) r;
select is((select s.name_th from public.learning_standards ls join public.framework_strands s on s.id = ls.strand_id where ls.code = 'ว 2.1'), 'วิทยาศาสตร์กายภาพ', 'มาตรฐานผูกกับสาระตามเอกสาร');
select is((select stage_kind from public.indicators where full_code = 'ว 2.1 ม.1/1'), 'unspecified', 'เอกสารไม่ระบุ → ไม่สมมติระหว่างทาง/ปลายทาง');
select is((select stage_kind from public.indicators where full_code = 'ว 2.1 ม.2/1'), 'final', 'เอกสารระบุปลายทาง → final');
select throws_ok($$select public.framework_competency_add((select (r->>'framework_version_id')::uuid from t_c), 'key_competency', 'C1', 'ความสามารถในการสื่อสาร', null, 'eeeeeeee-0000-4000-a000-000000000001', null)$$,
  'P0001', null, 'สมรรถนะต้องอ้างหน้าเอกสาร');
select lives_ok($$select public.framework_competency_add((select (r->>'framework_version_id')::uuid from t_c), 'key_competency', 'C1', 'ความสามารถในการสื่อสาร', null, 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:6')$$, 'บันทึกสมรรถนะพร้อมหน้าอ้างอิง');
select is((select sum(indicators)::int from public.framework_completeness((select (r->>'framework_version_id')::uuid from t_c))), 3, 'รายงานความครบถ้วนนับตัวชี้วัดที่ยืนยันแล้ว');
reset role;
select * from finish();
rollback;
