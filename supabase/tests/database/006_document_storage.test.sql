-- pgTAP: Document Storage (Phase 1.6) — RLS, RPC ตรวจสิทธิ์, กติกาไฟล์, หลักฐานที่ล็อก, ไฟล์ค้าง
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'),
  ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'admin@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'head@a.test',   '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'area@a.test',   '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'exec@a.test',   '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 't1@a.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000007', 't2@a.test',     '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000008', 'nolink@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'head@b.test',   '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');
insert into public.learning_areas (id, school_id, code, name_th) values
  ('aaaaaaaa-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'MA', 'คณิตศาสตร์'),
  ('aaaaaaaa-1111-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย');
insert into public.user_roles (user_id, school_id, role, learning_area_id) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'system_admin', null),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head', null),
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff', null),
  ('aaaaaaaa-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'learning_area_head', 'aaaaaaaa-1111-4000-a000-000000000001'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'executive', null),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null),
  ('aaaaaaaa-0000-4000-a000-000000000007', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null),
  ('aaaaaaaa-0000-4000-a000-000000000008', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', 'academic_head', null);
insert into public.teachers (id, school_id, profile_id, teacher_code, prefix, first_name, last_name, learning_area_id) values
  ('aaaaaaaa-5555-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000006', 'T1', 'นาย', 'ครู', 'คณิต', 'aaaaaaaa-1111-4000-a000-000000000001'),
  ('aaaaaaaa-5555-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000007', 'T2', 'นาง', 'ครู', 'ไทย', 'aaaaaaaa-1111-4000-a000-000000000002');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

-- ---------------------------------------------------------------- schema / privileges
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.documents'::regclass, 'public.files'::regclass, 'public.file_events'::regclass)), 'RLS เปิดทุกตาราง');
select ok(not has_table_privilege('authenticated', 'public.files', 'insert') and not has_table_privilege('authenticated', 'public.files', 'update')
  and not has_table_privilege('authenticated', 'public.files', 'delete'), 'ผู้ใช้เขียน files ตรงไม่ได้');
select ok(not has_function_privilege('authenticated', 'public.storage_complete_upload(uuid,uuid,boolean,bigint,text,text,text)', 'execute'),
  'ผู้ใช้เรียก storage_complete_upload (ยืนยันผลตรวจ) เองไม่ได้');
select ok(not has_function_privilege('authenticated', 'public.storage_expire_stale_uploads(interval)', 'execute'), 'ผู้ใช้เรียกงานล้างไฟล์ค้างไม่ได้');
select ok(not has_function_privilege('anon', 'public.storage_begin_upload(uuid,text,text,text,text,bigint)', 'execute'), 'anon ขออัปโหลดไม่ได้');

-- ---------------------------------------------------------------- เริ่มอัปโหลด
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
insert into ids select 'f1', file_id from public.storage_begin_upload(null, 'แผนการสอน', 'lesson_plan', 'แผน.pdf', 'application/pdf', 1000);
insert into ids select 'd1', document_id from public.files where id = (select v from ids where k = 'f1');
select results_eq($$select object_key ~ '^schools/aaaaaaaa-0000-4000-a000-000000000000/documents/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$', version, status
  from public.files where id = (select v from ids where k = 'f1')$$, $$values (true, 1, 'pending'::text)$$,
  'object key สร้างโดยระบบ (ไม่มีชื่อไฟล์ผู้ใช้) เวอร์ชัน 1 สถานะ pending');
select throws_ok($$select * from public.storage_begin_upload(null, 'x', 'general', 'virus.exe', 'application/octet-stream', 10)$$,
  'P0001', 'รองรับเฉพาะไฟล์ PDF, Word (.doc/.docx) และ Excel (.xls/.xlsx)', 'ปฏิเสธนามสกุลที่ไม่อนุญาต');
select throws_ok($$select * from public.storage_begin_upload(null, 'x', 'general', 'a.pdf', 'application/msword', 10)$$,
  'P0001', 'ชนิดไฟล์ (MIME) ไม่ตรงกับนามสกุลไฟล์', 'ปฏิเสธ MIME ไม่ตรงนามสกุล');
select throws_ok($$select * from public.storage_begin_upload(null, 'x', 'general', 'a.pdf', 'application/pdf', 20971521)$$,
  'P0001', 'ขนาดไฟล์ต้องไม่เกิน 20 MB', 'ปฏิเสธไฟล์เกิน 20 MB');
select throws_ok($$select * from public.storage_begin_upload(null, 'x', 'general', '../../etc/x.pdf', 'application/pdf', 10)$$,
  'P0001', 'ชื่อไฟล์ไม่ถูกต้อง', 'ปฏิเสธชื่อไฟล์ที่มี path');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000007');
select throws_ok($$select * from public.storage_begin_upload((select v from ids where k = 'd1'), null, null, 'b.pdf', 'application/pdf', 10)$$,
  '42501', null, 'ครูคนอื่นอัปโหลดเวอร์ชันใหม่ลงเอกสารของครูอื่นไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000008');
select throws_ok($$select * from public.storage_begin_upload(null, 'x', 'general', 'a.pdf', 'application/pdf', 10)$$,
  '42501', null, 'ครูที่ยังไม่ผูกทะเบียนอัปโหลดไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select * from public.storage_begin_upload(null, 'x', 'general', 'a.pdf', 'application/pdf', 10)$$,
  '42501', null, 'เจ้าหน้าที่ (ไม่มีบทบาทครู) อัปโหลดเอกสารครูไม่ได้');

-- ยืนยันผล (เสมือน Edge Function ด้วย service_role)
reset role;
select throws_ok($$select public.storage_complete_upload((select v from ids where k = 'f1'), 'aaaaaaaa-0000-4000-a000-000000000007', true, 1000, repeat('a', 64), 's3-local', null)$$,
  'P0001', 'ไม่พบไฟล์ที่รอยืนยัน', 'ยืนยันแทนผู้อัปโหลดคนอื่นไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000007');
select is((select count(*)::int from public.storage_pending_upload((select v from ids where k = 'f1'))), 0, 'ครูคนอื่นดูข้อมูลไฟล์ที่รอยืนยันไม่ได้');
reset role;
select is(public.storage_complete_upload((select v from ids where k = 'f1'), 'aaaaaaaa-0000-4000-a000-000000000006', true, 1000, repeat('a', 64), 's3-local', null),
  'ready', 'ไฟล์ผ่านการตรวจ → ready');
select is((select latest_version from public.documents where id = (select v from ids where k = 'd1')), 1, 'latest_version อัปเดต');

-- เวอร์ชันที่ 2 (เอกสารเดิม) และไฟล์ไม่ผ่าน magic bytes
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
insert into ids select 'f2', file_id from public.storage_begin_upload((select v from ids where k = 'd1'), null, null, 'แผน-v2.pdf', 'application/pdf', 500);
select is((select version from public.files where id = (select v from ids where k = 'f2')), 2, 'อัปโหลดเวอร์ชันใหม่ = 2 (ไม่ทับของเดิม)');
reset role;
select is(public.storage_complete_upload((select v from ids where k = 'f2'), 'aaaaaaaa-0000-4000-a000-000000000006', false, 500, null, 's3-local', 'เนื้อไฟล์ไม่ตรงกับชนิดที่อนุญาต'),
  'rejected', 'ไฟล์ไม่ผ่านการตรวจ → rejected');

-- ---------------------------------------------------------------- สิทธิ์อ่าน / ดาวน์โหลด
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select lives_ok($$select * from public.storage_authorize_download((select v from ids where k = 'f1'))$$, 'ครูเจ้าของดาวน์โหลดได้');
select throws_ok($$select * from public.storage_authorize_download((select v from ids where k = 'f2'))$$, 'P0001', 'ไฟล์นี้ยังไม่พร้อมให้ดาวน์โหลด', 'ไฟล์ rejected ดาวน์โหลดไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000007');
select is((select count(*)::int from public.files), 0, 'ครูคนอื่นมองไม่เห็นไฟล์ (RLS)');
select throws_ok($$select * from public.storage_authorize_download((select v from ids where k = 'f1'))$$, '42501', null, 'ครูคนอื่นดาวน์โหลดไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select lives_ok($$select * from public.storage_authorize_download((select v from ids where k = 'f1'))$$, 'เจ้าหน้าที่วิชาการดาวน์โหลดได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select is((select count(*)::int from public.files), 2, 'หัวหน้ากลุ่มสาระคณิตเห็นไฟล์ของครูคณิต');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select throws_ok($$select * from public.storage_authorize_download((select v from ids where k = 'f1'))$$, '42501', null, 'ผู้บริหารดาวน์โหลดไฟล์ครูไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((select count(*)::int from public.files), 0, 'ผู้ดูแลระบบไม่เห็นไฟล์เอกสาร');
reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000001');
select throws_ok($$select * from public.storage_authorize_download((select v from ids where k = 'f1'))$$, '42501', null, 'โรงเรียนอื่นดาวน์โหลดไม่ได้');
reset role;
select is((select count(*)::int from public.file_events where event = 'download_url_issued' and file_id = (select v from ids where k = 'f1')), 2, 'บันทึกการออก URL ดาวน์โหลดทุกครั้ง');

-- ---------------------------------------------------------------- ล็อกหลักฐาน / ลบ
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$select public.storage_lock_file((select v from ids where k = 'f1'))$$, '42501', null, 'ครูล็อกไฟล์ตนเองไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select lives_ok($$select public.storage_lock_file((select v from ids where k = 'f1'))$$, 'หัวหน้ากลุ่มสาระ (scope) ตรวจรับ/ล็อกได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$select public.storage_delete_file((select v from ids where k = 'f1'))$$, '42501',
  'ไฟล์นี้ผ่านการตรวจรับเป็นหลักฐานแล้ว ลบได้ผ่านขั้นตอนอนุมัติเท่านั้น', 'ลบหลักฐานที่ตรวจรับแล้วไม่ได้ (เจ้าของ)');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select throws_ok($$select public.storage_delete_file((select v from ids where k = 'f1'))$$, '42501', null, 'ลบหลักฐานที่ตรวจรับแล้วไม่ได้ (หัวหน้าวิชาการ)');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select public.storage_delete_file((select v from ids where k = 'f2'))$$, '42501', null, 'เจ้าหน้าที่ลบไฟล์ครูไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select ok((select public.storage_delete_file((select v from ids where k = 'f2'))) like 'schools/%', 'ผู้อัปโหลดลบไฟล์ที่ยังไม่ล็อกได้');

-- ---------------------------------------------------------------- ไฟล์ที่อัปโหลดไม่สำเร็จ
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000007');
insert into ids select 'f3', file_id from public.storage_begin_upload(null, 'ไม่ได้ยืนยัน', 'general', 'x.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 100);
reset role;
update public.files set upload_expires_at = now() - interval '1 hour' where id = (select v from ids where k = 'f3');
select is((select count(*)::int from public.storage_expire_stale_uploads()), 1, 'ตรวจพบไฟล์ค้าง 1 รายการ');
select is((select status from public.files where id = (select v from ids where k = 'f3')), 'expired', 'ไฟล์ค้างถูกเปลี่ยนเป็น expired');
select throws_ok($$delete from public.file_events$$, '42501', 'audit_logs is append-only', 'file_events แก้/ลบไม่ได้');
select ok(exists (select 1 from public.audit_logs where table_name = 'files' and action = 'UPDATE'), 'การเปลี่ยนสถานะไฟล์บันทึก audit_logs');

select * from finish();
rollback;
