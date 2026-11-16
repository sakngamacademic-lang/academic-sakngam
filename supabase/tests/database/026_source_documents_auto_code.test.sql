-- pgTAP: รหัสทะเบียนเอกสารสร้างอัตโนมัติที่ฐานข้อมูล ไม่ซ้ำ · ความน่าเชื่อถือไม่บังคับ (null = รอตรวจสอบ) · สิทธิ์เดิม
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into public.schools (id, code, name_th) values ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'), ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'admin@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'teacher@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_head'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher');
insert into public.source_documents (school_id, register_code, title, doc_type, reliability) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'SRC-01', 'เดิม', 'curriculum_book', 'A'),
  ('aaaaaaaa-0000-4000-a000-000000000000', 'SRC-03-P1', 'ส่วนย่อย', 'curriculum_book', 'A'),
  ('bbbbbbbb-0000-4000-a000-000000000000', 'SRC-50', 'โรงเรียนอื่น', 'other', 'B');
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $$;

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select lives_ok($$insert into public.source_documents (title) values ('ไฟล์ใหม่.pdf')$$, 'ผู้ดูแลอัปโหลดได้โดยไม่กรอกรหัส/ประเภท/ความน่าเชื่อถือ');
select is((select register_code from public.source_documents where title = 'ไฟล์ใหม่.pdf'), 'SRC-04', 'ออกเลขถัดจากรหัสสูงสุดของโรงเรียน (รวมรหัสลูก) ไม่ดูโรงเรียนอื่น');
select lives_ok($$insert into public.source_documents (title, register_code) values ('ไฟล์ที่สอง', '')$$, 'รหัสว่างก็สร้างให้');
select is((select register_code from public.source_documents where title = 'ไฟล์ที่สอง'), 'SRC-05', 'ไม่ซ้ำกับรหัสก่อนหน้า');
select is((select reliability from public.source_documents where title = 'ไฟล์ใหม่.pdf'), null, 'ความน่าเชื่อถือว่าง = รอตรวจสอบ (ระบบไม่ตั้ง A เอง)');
select is((select doc_type from public.source_documents where title = 'ไฟล์ใหม่.pdf'), 'other', 'ประเภทเริ่มต้น other');
select lives_ok($$insert into public.source_documents (title, register_code, doc_type) values ('ระบุรหัสเอง', 'src-07', 'announcement')$$, 'ยังระบุรหัสเองได้');
select throws_ok($$insert into public.source_documents (title, register_code) values ('ซ้ำ', 'SRC-07')$$, '23505', null, 'รหัสซ้ำถูกปฏิเสธ');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$insert into public.source_documents (title) values ('ครูอัปโหลด')$$, '42501', null, 'สิทธิ์เดิม: ครูลงทะเบียนเอกสารไม่ได้');
select * from finish();
rollback;
