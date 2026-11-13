-- pgTAP: C1.5 Conflict Register — หมวด/ค่า A-B, สถานะ open → needs_decision → resolved, สิทธิ์, AI ปิดไม่ได้
-- ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 't@a.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff', null),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null);
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.source_documents (id, register_code, title, doc_type, reliability)
values ('dddddddd-0000-4000-a000-000000000001', 'SRC-01', 'เอกสารทดสอบ', 'curriculum_book', 'A');
insert into public.source_conflicts (id, conflict_code, doc_a_id, description, category, value_a, value_b, difference, recommendation, decision_authority, locator_a, locator_b)
values ('dddddddd-9999-4000-a000-000000000001', 'CF-90', 'dddddddd-0000-4000-a000-000000000001', 'ทดสอบ', 'learning_hours',
        'TEST 1.0(20)', 'TEST 1.0(40)', '20 ชม.', 'ตรวจกับต้นฉบับ', 'academic_head', 'pdf:17', 'pdf:105');
select is((select category || '/' || status || '/' || decision_authority from public.source_conflicts where conflict_code = 'CF-90'),
  'learning_hours/open/academic_head', 'บันทึกหมวด ค่า A/B และผู้มีอำนาจตัดสินได้ เริ่มที่ open');
select throws_ok($$insert into public.source_conflicts (conflict_code, doc_a_id, description, category) values ('CF-91', 'dddddddd-0000-4000-a000-000000000001', 'x', 'bogus')$$,
  '23514', null, 'หมวดต้องอยู่ในรายการที่กำหนด');
select throws_ok($$update public.source_conflicts set status = 'resolved' where conflict_code = 'CF-90'$$, '42501', null, 'แก้สถานะตรงไม่ได้ (ไม่มีสิทธิ์ update ตาราง)');

select lives_ok($$select public.source_conflict_annotate('dddddddd-9999-4000-a000-000000000001', '{"impact_note":"กระทบยอดรวม ม.4","category":"program_total"}')$$,
  'ฝ่ายวิชาการบันทึกผลวิเคราะห์ได้');
select throws_ok($$select public.source_conflict_annotate('dddddddd-9999-4000-a000-000000000001', '{"status":"resolved"}')$$,
  'P0001', null, 'บันทึกผลวิเคราะห์เปลี่ยนสถานะไม่ได้');
select lives_ok($$select public.source_conflict_set_status('dddddddd-9999-4000-a000-000000000001', 'needs_decision')$$, 'คัดกรองเป็น needs_decision ได้');
select throws_ok($$select public.source_conflict_set_status('dddddddd-9999-4000-a000-000000000001', 'resolved')$$,
  'P0001', null, 'เจ้าหน้าที่ปิดข้อขัดแย้งผ่านการคัดกรองไม่ได้');
select throws_ok($$select public.source_conflict_resolve('dddddddd-9999-4000-a000-000000000001', 'ตัดสินเอง')$$, '42501', null, 'เจ้าหน้าที่ตัดสินไม่ได้');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$select public.source_conflict_set_status('dddddddd-9999-4000-a000-000000000001', 'open')$$, '42501', null, 'ครูคัดกรองไม่ได้');

-- service_role (AI/parser) ปิด/คัดกรองไม่ได้
reset role;
set local role service_role;
select throws_ok($$select public.source_conflict_resolve('dddddddd-9999-4000-a000-000000000001', 'AI ปิด')$$, null, null, 'AI/service_role ปิดข้อขัดแย้งไม่ได้');
reset role;

select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select lives_ok($$select public.source_conflict_resolve('dddddddd-9999-4000-a000-000000000001', 'ใช้ค่า 40 ชม. ตามคำอธิบายรายวิชา (ทดสอบ)')$$,
  'หัวหน้าฝ่ายวิชาการตัดสิน needs_decision ได้');
select throws_ok($$select public.source_conflict_annotate('dddddddd-9999-4000-a000-000000000001', '{"recommendation":"แก้หลังปิด"}')$$,
  'P0001', null, 'ข้อที่ปิดแล้วแก้ผลวิเคราะห์ไม่ได้');

select * from finish();
rollback;
