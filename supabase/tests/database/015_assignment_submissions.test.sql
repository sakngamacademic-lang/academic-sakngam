-- pgTAP: ส่งงาน / ตรวจรับ / ขอแก้ไข / เวอร์ชัน / แจ้งเตือน — สิทธิ์ครูเฉพาะงานตน, ผู้ตรวจตามขอบเขต, AI ทำแทนไม่ได้
-- ⚠️ fixture ทดสอบ (rollback)
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into public.schools (id, code, name_th) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'T-A', 'โรงเรียน A'), ('bbbbbbbb-0000-4000-a000-000000000000', 'T-B', 'โรงเรียน B');
insert into auth.users (id, email, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'staff@a.test', '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'exec@a.test',  '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 't1@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('aaaaaaaa-0000-4000-a000-000000000007', 't2@a.test',    '{"school_id":"aaaaaaaa-0000-4000-a000-000000000000"}'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'staff@b.test', '{"school_id":"bbbbbbbb-0000-4000-a000-000000000000"}');
insert into public.user_roles (user_id, school_id, role) values
  ('aaaaaaaa-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'academic_staff'),
  ('aaaaaaaa-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-000000000000', 'executive'),
  ('aaaaaaaa-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('aaaaaaaa-0000-4000-a000-000000000007', 'aaaaaaaa-0000-4000-a000-000000000000', 'teacher'),
  ('bbbbbbbb-0000-4000-a000-000000000003', 'bbbbbbbb-0000-4000-a000-000000000000', 'academic_staff');
insert into public.teachers (id, school_id, profile_id, teacher_code, prefix, first_name, last_name) values
  ('aaaaaaaa-6666-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000006', 'TT01', 'นาย', 'ทดสอบ', 'หนึ่ง'),
  ('aaaaaaaa-6666-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000007', 'TT02', 'นาง', 'ทดสอบ', 'สอง');
-- เอกสารของครู 1 (ไฟล์อัปโหลดสมบูรณ์ 2 เวอร์ชัน + 1 ไฟล์ค้างอัปโหลด) และของครู 2
insert into public.documents (id, school_id, owner_teacher_id, title) values
  ('dddddddd-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-6666-4000-a000-000000000001', 'แผนการสอน (ทดสอบ)'),
  ('dddddddd-1111-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'aaaaaaaa-6666-4000-a000-000000000002', 'เอกสารครู 2');
insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type, size_bytes, upload_expires_at, status, sha256, uploaded_by, confirmed_at) values
  ('dddddddd-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 1, 'test/1', 'plan-v1.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('a', 64), 'aaaaaaaa-0000-4000-a000-000000000006', now()),
  ('dddddddd-2222-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 2, 'test/2', 'plan-v2.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('b', 64), 'aaaaaaaa-0000-4000-a000-000000000006', now()),
  ('dddddddd-2222-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000001', 3, 'test/3', 'plan-v3.pdf', 'pdf', 'application/pdf', 10, now() + interval '1 hour', 'pending', null, 'aaaaaaaa-0000-4000-a000-000000000006', null),
  ('dddddddd-2222-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-000000000000', 'dddddddd-1111-4000-a000-000000000002', 1, 'test/4', 'other.pdf', 'pdf', 'application/pdf', 10, now(), 'ready', repeat('c', 64), 'aaaaaaaa-0000-4000-a000-000000000007', now());

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ฝ่ายวิชาการสร้างงานและมอบหมาย → ครูได้งานอัตโนมัติ + แจ้งเตือน
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into public.tasks (id, title, due_at) values ('dddddddd-3333-4000-a000-000000000001', 'ส่งแผนการสอนประจำปี 2569 (ทดสอบ)', now() + interval '7 days');
select lives_ok($$select public.task_publish('dddddddd-3333-4000-a000-000000000001', 'teachers', null, array['aaaaaaaa-6666-4000-a000-000000000001','aaaaaaaa-6666-4000-a000-000000000002']::uuid[])$$, 'เผยแพร่และมอบหมายงาน');
create temp table ids as select a.id, a.teacher_id from public.task_assignments a where a.task_id = 'dddddddd-3333-4000-a000-000000000001';
grant select on ids to authenticated, service_role;

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select is((select count(*)::int from public.task_assignments), 1, 'ครูเห็นเฉพาะงานที่มอบหมายให้ตน (My Assignments)');
select is((select kind || '|' || link from public.notifications), 'assigned|/teacher/assignments', 'ครูได้รับแจ้งเตือนงานใหม่');
select throws_ok($$select public.assignment_submit((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'dddddddd-2222-4000-a000-000000000003')$$,
  'P0001', null, 'ส่งไฟล์ที่ยังอัปโหลดไม่สมบูรณ์ไม่ได้');
select throws_ok($$select public.assignment_submit((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'dddddddd-2222-4000-a000-000000000004')$$,
  '42501', null, 'ส่งไฟล์ของครูคนอื่นไม่ได้');
select throws_ok($$select public.assignment_submit((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000002'), 'dddddddd-2222-4000-a000-000000000004')$$,
  '42501', null, 'ส่งงานแทนครูคนอื่นไม่ได้');
select is(public.assignment_submit((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'dddddddd-2222-4000-a000-000000000001', 'ฉบับแรก'), 1, 'ครูส่งงาน = เวอร์ชัน 1');
select ok((select locked_at is not null from public.files where id = 'dddddddd-2222-4000-a000-000000000001'), 'ไฟล์ที่ส่งถูกล็อกเป็นหลักฐาน');
select throws_ok($$select public.assignment_submit((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'dddddddd-2222-4000-a000-000000000002')$$,
  'P0001', null, 'ส่งซ้ำระหว่างรอตรวจไม่ได้');

-- service_role (AI) ตรวจแทนไม่ได้
reset role;
set local role service_role;
select throws_ok($$select public.assignment_review((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'approve')$$, null, null, 'AI/service_role ตรวจรับแทนคนไม่ได้');
reset role;

select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select throws_ok($$select public.assignment_review((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'approve')$$, '42501', null, 'ผู้บริหาร (อ่านอย่างเดียว) ตรวจรับไม่ได้');
select is((select count(*)::int from public.assignment_submissions), 1, 'ผู้บริหารเห็นประวัติการส่ง');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select is((select count(*)::int from public.notifications where kind = 'submitted'), 1, 'ผู้สร้างงานได้รับแจ้งเตือนเมื่อมีการส่ง');
select throws_ok($$select public.assignment_review((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'revision', 'สั้น')$$,
  'P0001', null, 'ขอแก้ไขต้องมีเหตุผล');
select lives_ok($$select public.assignment_review((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'revision', 'กรุณาเพิ่มหน่วยการเรียนรู้ที่ 3')$$, 'ฝ่ายวิชาการขอแก้ไขได้');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select is((select body from public.notifications where kind = 'revision_requested'), 'กรุณาเพิ่มหน่วยการเรียนรู้ที่ 3', 'ครูได้รับเหตุผลที่ขอแก้ไข');
select is(public.assignment_submit((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'dddddddd-2222-4000-a000-000000000002', 'แก้แล้ว'), 2, 'ส่งฉบับแก้ = เวอร์ชัน 2');

reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select lives_ok($$select public.assignment_review((select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001'), 'approve')$$, 'ตรวจรับเวอร์ชัน 2');
select is((select string_agg(version || ':' || review_status, ',' order by version) from public.assignment_submissions), '1:revision_requested,2:approved',
  'เก็บประวัติทุกเวอร์ชันพร้อมผลตรวจ');
select is((select string_agg(event, ',' order by id) from public.assignment_events where assignment_id = (select id from ids where teacher_id = 'aaaaaaaa-6666-4000-a000-000000000001')),
  'assigned,submitted,revision_requested,submitted,approved', 'timeline ครบ (Approval History)');

reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000003');
select is((select count(*)::int from public.assignment_submissions), 0, 'โรงเรียนอื่นไม่เห็นการส่งงาน');

select * from finish();
rollback;
