-- pgTAP: วิเคราะห์เอกสารอัตโนมัติ — แยกการอ่านออกจากการอนุมัติ · ข้อมูลซ้ำ · ตัวชี้วัดต่างฉบับ · ปฏิเสธข้อมูลผิด
--        · บันทึกเข้ากรอบแกนกลางไม่เขียนทับ · เปรียบเทียบ 4 สถานะ (CF ที่ยังไม่ตัดสินไม่นับว่าผ่าน)
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

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

-- ---- สิทธิ์ขอวิเคราะห์
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$select * from public.document_analysis_request('eeeeeeee-0000-4000-a000-000000000001')$$, '42501', null, 'เจ้าหน้าที่ (ไม่ใช่ผู้ดูแลหลักสูตร) สั่งวิเคราะห์ไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$select * from public.document_analysis_request('eeeeeeee-0000-4000-a000-000000000002')$$, 'P0001', 'วิเคราะห์อัตโนมัติได้เฉพาะ PDF และ Excel (.xlsx)', 'ไฟล์ Word ไม่รองรับ');
create temp table t_req as select * from public.document_analysis_request('eeeeeeee-0000-4000-a000-000000000001', false);
grant select on t_req to authenticated, service_role;
select is((select object_key from t_req), 'test/core.pdf', 'คืน object_key ให้ Edge Function (bucket ยัง private)');
select throws_ok($$select * from public.document_analysis_request('eeeeeeee-0000-4000-a000-000000000001')$$, 'P0001', 'เอกสารนี้มีงานวิเคราะห์ที่ยังไม่เสร็จ — กด “ทำต่อ” ที่งานเดิมแทนการสร้างงานใหม่', 'วิเคราะห์ซ้ำซ้อนพร้อมกันไม่ได้');
select throws_ok($$select public.document_analysis_store((select analysis_id from t_req), '{"items":[]}')$$, '42501', null, 'ผู้ใช้เขียนผลวิเคราะห์เองไม่ได้ (service_role เท่านั้น)');
select throws_ok($$insert into public.document_analysis_items (school_id, analysis_id, seq, item_type, item_key, locator) values ('aaaaaaaa-0000-4000-a000-000000000000', (select analysis_id from t_req), 1, 'standard', 'x', 'pdf:1')$$, '42501', null, 'เขียนตารางผลวิเคราะห์ตรงไม่ได้');

-- ---- service_role เก็บผล: PDF หลายหน้า · ซ้ำ · ค่าต่างในเอกสาร · ข้อมูลไม่พอ
reset role;
insert into public.curriculum_frameworks (id, code, name_th, source_citation) values ('ffffffff-0000-4000-a000-000000000001', 'OLD', 'กรอบเดิม', 'ทดสอบ');
insert into public.framework_versions (id, framework_id, version_label, status, is_complete, source_citation) values ('ffffffff-1111-4000-a000-000000000001', 'ffffffff-0000-4000-a000-000000000001', 'เดิม', 'published', true, 'ทดสอบ');
insert into public.framework_learning_areas (id, framework_version_id, code, name_th) values ('ffffffff-2222-4000-a000-000000000001', 'ffffffff-1111-4000-a000-000000000001', 'ว', 'วิทยาศาสตร์');
insert into public.framework_grade_levels (id, framework_version_id, code, name_th, level_order) values ('ffffffff-3333-4000-a000-000000000001', 'ffffffff-1111-4000-a000-000000000001', 'ม.1', 'มัธยมศึกษาปีที่ 1', 7);
insert into public.learning_standards (id, framework_version_id, framework_learning_area_id, code, statement_th, source_citation) values ('ffffffff-4444-4000-a000-000000000001', 'ffffffff-1111-4000-a000-000000000001', 'ffffffff-2222-4000-a000-000000000001', 'ว 1.1', 'มาตรฐานเดิม', 'ทดสอบ');
insert into public.indicators (framework_version_id, standard_id, framework_grade_level_id, code, full_code, indicator_kind, statement_th, source_citation) values
  ('ffffffff-1111-4000-a000-000000000001', 'ffffffff-4444-4000-a000-000000000001', 'ffffffff-3333-4000-a000-000000000001', '1', 'ว 1.1 ม.1/1', 'grade', 'ข้อความฉบับเก่า', 'ทดสอบ');
set local role service_role;
select is(public.document_analysis_store((select analysis_id from t_req), $j${
  "doc_class": "core_curriculum", "class_confidence": 0.9, "engine": "rule-based@1", "page_count": 3, "ai_status": "not_requested",
  "meta": {"year_be": 2551},
  "items": [
    {"item_type":"standard","item_key":"ว 1.1","locator":"pdf:1","excerpt":"มาตรฐาน ว 1.1 ...","confidence":0.9,
     "extracted":{"code":"ว 1.1","area_code":"ว","area_name":"วิทยาศาสตร์และเทคโนโลยี","statement":"มาตรฐานเดิม"}},
    {"item_type":"indicator","item_key":"ว 1.1 ม.1/1","locator":"pdf:2","confidence":0.8,
     "extracted":{"full_code":"ว 1.1 ม.1/1","standard_code":"ว 1.1","grade":"ม.1","number":"1","statement":"ข้อความฉบับใหม่"}},
    {"item_type":"indicator","item_key":"ว 1.1 ม.1/2","locator":"pdf:2","confidence":0.8,
     "extracted":{"full_code":"ว 1.1 ม.1/2","standard_code":"ว 1.1","grade":"ม.1","number":"2","statement":"อธิบายโครงสร้างเซลล์"}},
    {"item_type":"indicator","item_key":"ว 1.1 ม.1/2","locator":"pdf:3","confidence":0.8,
     "extracted":{"full_code":"ว 1.1 ม.1/2","standard_code":"ว 1.1","grade":"ม.1","number":"2","statement":"อธิบายโครงสร้างเซลล์"}},
    {"item_type":"indicator","item_key":"ว 1.1 ม.1/3","locator":"pdf:2","confidence":0.8,
     "extracted":{"full_code":"ว 1.1 ม.1/3","standard_code":"ว 1.1","grade":"ม.1","number":"3","statement":"ข้อความ ก"}},
    {"item_type":"indicator","item_key":"ว 1.1 ม.1/3","locator":"pdf:3","confidence":0.8,
     "extracted":{"full_code":"ว 1.1 ม.1/3","standard_code":"ว 1.1","grade":"ม.1","number":"3","statement":"ข้อความ ข"}},
    {"item_type":"indicator","item_key":"ว 1.1 ม.1/4","locator":"pdf:3","confidence":0.3,"insufficient":true,
     "extracted":{"full_code":"ว 1.1 ม.1/4","standard_code":"ว 1.1","grade":"ม.1","number":"4","statement":null}},
    {"item_type":"unreadable","item_key":"pdf:4","locator":null,"insufficient":true,"extracted":{"reason":"ไม่มีข้อความ"}}
  ]}$j$::jsonb), 8, 'เก็บ 8 รายการ (3 หน้า)');
reset role;
select is((select status from public.document_analyses where id = (select analysis_id from t_req)), 'done', 'สถานะงาน = เสร็จ');
select is((select count(*)::int from public.document_analysis_items where analysis_id = (select analysis_id from t_req) and status = 'duplicate'), 1, 'รายการซ้ำ (ค่าเดียวกัน) ถูกแยกเป็น duplicate');
select is((select count(*)::int from public.document_analysis_items where analysis_id = (select analysis_id from t_req) and flags @> '[{"code":"VARIANT_IN_DOC"}]'), 2, 'คีย์เดียวกันค่าต่าง → ติดธงทั้งสองรายการ');
select ok((select flags @> '[{"code":"VARIANT_FRAMEWORK"}]' from public.document_analysis_items where item_key = 'ว 1.1 ม.1/1'), 'ตัวชี้วัดต่างฉบับกับกรอบเดิม → ติดธง VARIANT_FRAMEWORK');
select is((select count(*)::int from public.document_analysis_items where analysis_id = (select analysis_id from t_req) and status = 'insufficient'), 2, 'อ่านไม่ได้ / ไม่มีข้อความ → ข้อมูลไม่พอ');
select is((select statement_th from public.indicators where full_code = 'ว 1.1 ม.1/1'), 'ข้อความฉบับเก่า', 'การอ่านเอกสารไม่แตะกรอบแกนกลาง');

-- ---- ผู้ดูแลตรวจ
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$select public.document_analysis_item_decide(array(select id from public.document_analysis_items where item_key = 'ว 1.1'), 'accept')$$, '42501', null, 'เจ้าหน้าที่ยอมรับรายการไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$select public.document_analysis_item_decide(array(select id from public.document_analysis_items where item_key = 'ว 1.1 ม.1/3' order by seq limit 1), 'reject')$$,
  'P0001', 'กรุณาระบุเหตุผลที่ปฏิเสธ', 'ปฏิเสธต้องมีเหตุผล');
select is(public.document_analysis_item_decide(array(select id from public.document_analysis_items where item_key = 'ว 1.1 ม.1/3' order by seq limit 1), 'reject', null, null, 'อ่านผิดบรรทัด'), 1, 'ปฏิเสธข้อมูลผิดพร้อมเหตุผล');
select throws_ok($$select public.document_analysis_item_decide(array(select id from public.document_analysis_items where item_key = 'ว 1.1 ม.1/4'), 'accept')$$,
  'P0001', null, 'ยอมรับรายการ “ข้อมูลไม่พอ” โดยไม่กรอกข้อความไม่ได้');
select is(public.document_analysis_item_decide(array(select id from public.document_analysis_items where item_key = 'ว 1.1 ม.1/4'), 'accept',
  '{"full_code":"ว 1.1 ม.1/4","standard_code":"ว 1.1","grade":"ม.1","number":"4","statement":"กรอกจากต้นฉบับ"}'::jsonb, 'pdf:3', 'กรอกจากภาพหน้า 3'), 1, 'แก้ค่าแล้วยอมรับได้ (มีพิกัด)');
-- รายการที่ติดธงขัดแย้งต้องยอมรับทีละรายการ (Phase 2) · ที่เหลือยอมรับพร้อมกันได้
select public.document_analysis_item_decide(array[i.id], 'accept') from public.document_analysis_items i
 where i.analysis_id = (select analysis_id from t_req) and i.status = 'extracted' and i.item_type in ('standard', 'indicator')
   and (i.flags @> '[{"code":"VARIANT_IN_DOC"}]' or i.flags @> '[{"code":"VARIANT_FRAMEWORK"}]');
select public.document_analysis_item_decide(array(select id from public.document_analysis_items where analysis_id = (select analysis_id from t_req)
  and status = 'extracted' and item_type in ('standard', 'indicator')), 'accept');

-- ---- บันทึกเข้ากรอบแกนกลาง (ฉบับใหม่ draft) · ไม่เขียนทับ
create temp table t_commit as select public.document_analysis_commit_framework((select analysis_id from t_req), 'CORE51', 'หลักสูตรแกนกลาง (ทดสอบ)', 'ทดสอบ 2560', 2560) r;
select is((select (r ->> 'standards_inserted')::int from t_commit), 1, 'เพิ่มมาตรฐานในฉบับใหม่');
select is((select (r ->> 'indicators_inserted')::int from t_commit), 4, 'เพิ่มตัวชี้วัดที่ยอมรับ (ม.1/1, ม.1/2, ม.1/3 ข, ม.1/4 ที่แก้แล้ว)');
select is((select statement_th from public.indicators where full_code = 'ว 1.1 ม.1/1' and framework_version_id = 'ffffffff-1111-4000-a000-000000000001'), 'ข้อความฉบับเก่า', 'ฉบับเดิมไม่ถูกเขียนทับ');
select is((select count(*)::int from public.document_analysis_items where analysis_id = (select analysis_id from t_req) and status = 'rejected'), 1, 'รายการที่ปฏิเสธไม่ถูกบันทึก');
select is((select status from public.framework_versions where version_label = 'ทดสอบ 2560'), 'draft', 'ฉบับที่บันทึกยังเป็นร่าง (ยังไม่ยืนยัน)');
select throws_ok($$select public.document_analysis_item_decide(array(select id from public.document_analysis_items where item_key = 'ว 1.1'), 'reject', null, null, 'x')$$,
  'P0001', null, 'รายการที่บันทึกแล้วแก้ไม่ได้');
-- รอบสอง: ไม่มีอะไรเพิ่ม และไม่ซ้ำ
select is((select (public.document_analysis_commit_framework((select analysis_id from t_req), 'CORE51', 'หลักสูตรแกนกลาง (ทดสอบ)', 'ทดสอบ 2560') ->> 'indicators_inserted')::int), 0, 'บันทึกซ้ำไม่เพิ่มข้อมูลซ้ำ');
select lives_ok($$select public.framework_version_confirm((select id from public.framework_versions where version_label = 'ทดสอบ 2560'), false)$$, 'ผู้ดูแลยืนยันฉบับกรอบแกนกลาง');
select throws_ok($$select public.document_analysis_commit_framework((select analysis_id from t_req), 'CORE51', 'หลักสูตรแกนกลาง (ทดสอบ)', 'ทดสอบ 2560')$$,
  'P0001', null, 'ฉบับที่ยืนยันแล้วเพิ่ม/แก้ไม่ได้');
reset role;
select ok(exists (select 1 from public.audit_logs where table_name = 'indicators' and action = 'INSERT'), 'บันทึก Audit Log ของตัวชี้วัด');

-- ---- เปรียบเทียบ: ข้อมูลไม่พอ / รอตรวจข้อขัดแย้ง / ผ่าน
reset role;
insert into public.school_curricula (id, school_id, name_th) values ('cccccccc-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'ทดสอบ');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be, announcement_source_id)
  values ('cccccccc-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-1111-4000-a000-000000000001', 'TEST-2569', 2569, 'eeeeeeee-0000-4000-a000-000000000001');
insert into public.source_conflicts (id, school_id, conflict_code, doc_a_id, description, status) values
  ('cccccccc-3333-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'CF-901', 'eeeeeeee-0000-4000-a000-000000000001', 'ทดสอบ', 'needs_decision');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((select verdict from public.curriculum_compliance_review('cccccccc-2222-4000-a000-000000000001') where rule_code = 'SYS-DATA'), 'insufficient_data', 'ไม่มีข้อมูลที่บันทึกแล้ว → ข้อมูลไม่พอ (ไม่ใช่ผ่าน)');
select is((select verdict from public.curriculum_compliance_review('cccccccc-2222-4000-a000-000000000001') where rule_code = 'SYS-CONFLICT'), 'conflict_pending', 'CF ที่ยังไม่ตัดสิน → รอตรวจข้อขัดแย้ง');
select is((select open_conflicts from public.curriculum_compliance_review('cccccccc-2222-4000-a000-000000000001') where rule_code = 'SYS-CONFLICT'), array['CF-901'], 'แสดงรหัส CF ที่เปิดอยู่');
select is((select verdict from public.curriculum_compliance_review('cccccccc-2222-4000-a000-000000000001') where rule_code = 'SYS-FRAMEWORK'), 'insufficient_data', 'ฉบับยังไม่อ้างกรอบแกนกลางที่ยืนยัน → ข้อมูลไม่พอ');
select is((select status from public.source_conflicts where conflict_code = 'CF-901'), 'needs_decision', 'ระบบไม่ปิด CF เอง');

select * from finish();
rollback;
