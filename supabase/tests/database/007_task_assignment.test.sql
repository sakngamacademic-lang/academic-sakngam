-- pgTAP: มอบหมายภาระงาน (Phase 1.7) — RLS, workflow, กันมอบหมายซ้ำ, ขอบเขตกลุ่มสาระ, ข้ามโรงเรียน, แม่แบบ
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);


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
-- ครูเพิ่ม: T3 คณิตที่ยังไม่ผูกบัญชี, S1 บุคลากรสนับสนุน, ครูโรงเรียน B
insert into public.teachers (id, school_id, profile_id, teacher_code, prefix, first_name, last_name, learning_area_id, position) values
  ('aaaaaaaa-5555-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-000000000000', null, 'T3', 'นาง', 'ครู', 'คณิตสอง', 'aaaaaaaa-1111-4000-a000-000000000001', 'teacher'),
  ('aaaaaaaa-5555-4000-a000-000000000009', 'aaaaaaaa-0000-4000-a000-000000000000', null, 'S1', 'นาง', 'ธุรการ', 'ทดสอบ', null, 'support_staff'),
  ('bbbbbbbb-5555-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000000', null, 'T1', 'นาย', 'ครู', 'บี', null, 'teacher');
create function pg_temp.new_task(p_title text, p_area uuid default null, p_due interval default interval '7 days') returns uuid language sql as $$
  insert into public.tasks (title, learning_area_id, due_at) values (p_title, p_area, now() + p_due) returning id
$$;
grant execute on function pg_temp.new_task(text, uuid, interval) to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
grant execute on function pg_temp.id(text) to authenticated;

-- ---------------------------------------------------------------- schema
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.tasks'::regclass, 'public.task_assignments'::regclass, 'public.assignment_events'::regclass)), 'RLS เปิดทุกตาราง');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'delete') and not has_table_privilege('authenticated', 'public.task_assignments', 'insert')
  and not has_table_privilege('authenticated', 'public.task_assignments', 'update'), 'ลบงาน / เขียน assignment ตรงไม่ได้');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'status', 'update') and not has_column_privilege('authenticated', 'public.tasks', 'published_by', 'insert'),
  'สถานะ / ผู้เผยแพร่ เปลี่ยนผ่าน RPC เท่านั้น');

-- ---------------------------------------------------------------- สร้างงาน
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
insert into ids values ('k1', pg_temp.new_task('งานทั้งโรงเรียน'));
select results_eq($$select status, created_by, school_id from public.tasks where id = pg_temp.id('k1')$$,
  $$values ('draft'::text, 'aaaaaaaa-0000-4000-a000-000000000003'::uuid, 'aaaaaaaa-0000-4000-a000-000000000000'::uuid)$$, 'เจ้าหน้าที่สร้างงาน (draft) + ผู้สร้าง + school_id อัตโนมัติ');
select throws_ok($$insert into public.tasks (title, starts_at, due_at) values ('x', now(), now() - interval '1 day')$$, '23514', null, 'วันครบกำหนดต้องหลังวันเริ่ม');
select throws_ok($$insert into public.tasks (title, due_at, allowed_exts) values ('x', now() + interval '1 day', array['exe'])$$, '23514', null, 'ชนิดไฟล์ต้องอยู่ใน whitelist');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
insert into ids values ('k2', pg_temp.new_task('งานกลุ่มคณิต', 'aaaaaaaa-1111-4000-a000-000000000001'));
select ok(pg_temp.id('k2') is not null, 'หัวหน้ากลุ่มสาระสร้างงานของกลุ่มตนได้');
select throws_ok($$select pg_temp.new_task('ข้ามกลุ่ม', 'aaaaaaaa-1111-4000-a000-000000000002')$$, '42501', null, 'หัวหน้ากลุ่มสาระสร้างงานกลุ่มอื่นไม่ได้');
select throws_ok($$select pg_temp.new_task('ระดับโรงเรียน')$$, '42501', null, 'หัวหน้ากลุ่มสาระสร้างงานระดับโรงเรียนไม่ได้');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$select pg_temp.new_task('ครูสร้าง')$$, '42501', null, 'ครูสร้างงานไม่ได้');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select throws_ok($$select pg_temp.new_task('ผู้บริหารสร้าง')$$, '42501', null, 'ผู้บริหารสร้างงานไม่ได้');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$select pg_temp.new_task('แอดมินสร้าง')$$, '42501', null, 'ผู้ดูแลระบบสร้างงานไม่ได้');

-- ---------------------------------------------------------------- draft มองไม่เห็นโดยครู
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select is((select count(*)::int from public.tasks), 0, 'ครูไม่เห็นงานที่ยังเป็น draft');

-- ---------------------------------------------------------------- เผยแพร่ / มอบหมาย
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select results_eq($$select * from public.task_publish(pg_temp.id('k1'), 'all')$$, $$values (3, 0)$$,
  'มอบหมายทั้งหมด = ครูผู้สอนที่ปฏิบัติงาน 3 คน (ไม่รวมบุคลากรสนับสนุน)');
select results_eq($$select status, published_by from public.tasks where id = pg_temp.id('k1')$$,
  $$values ('published'::text, 'aaaaaaaa-0000-4000-a000-000000000003'::uuid)$$, 'สถานะ published + ผู้เผยแพร่');
select results_eq($$select * from public.task_publish(pg_temp.id('k1'), 'teachers', null, array['aaaaaaaa-5555-4000-a000-000000000001'::uuid, 'aaaaaaaa-5555-4000-a000-000000000009'::uuid])$$,
  $$values (1, 1)$$, 'มอบหมายซ้ำถูกข้าม เพิ่มเฉพาะคนใหม่');
select is((select count(*)::int from public.task_assignments where task_id = pg_temp.id('k1')), 4, 'ไม่มีการมอบหมายซ้ำ');
select throws_ok($$insert into public.task_assignments (school_id, task_id, teacher_id) values ('aaaaaaaa-0000-4000-a000-000000000000', pg_temp.id('k1'), 'aaaaaaaa-5555-4000-a000-000000000001')$$,
  '42501', null, 'เพิ่ม assignment ตรงไม่ได้');
reset role;
select throws_ok($$insert into public.task_assignments (school_id, task_id, teacher_id) values ('aaaaaaaa-0000-4000-a000-000000000000', pg_temp.id('k1'), 'aaaaaaaa-5555-4000-a000-000000000001')$$,
  '23505', null, 'unique (task_id, teacher_id) กันซ้ำระดับฐานข้อมูล');
select throws_ok($$insert into public.task_assignments (school_id, task_id, teacher_id) values ('aaaaaaaa-0000-4000-a000-000000000000', pg_temp.id('k1'), 'bbbbbbbb-5555-4000-a000-000000000001')$$,
  '23503', null, 'มอบหมายครูต่างโรงเรียนไม่ได้ (FK school)');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select * from public.task_publish(pg_temp.id('k1'), 'teachers', null, array['bbbbbbbb-5555-4000-a000-000000000001'::uuid])$$,
  '42501', null, 'RPC ปฏิเสธครูต่างโรงเรียน');
insert into ids values ('k3', pg_temp.new_task('หมดเวลา', null, interval '1 second'));
reset role;
update public.tasks set starts_at = now() - interval '2 days', due_at = now() - interval '1 day' where id = pg_temp.id('k3');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select * from public.task_publish(pg_temp.id('k3'), 'all')$$, 'P0001', null, 'เผยแพร่งานที่เลยกำหนดแล้วไม่ได้');

reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select results_eq($$select * from public.task_publish(pg_temp.id('k2'), 'all')$$, $$values (2, 0)$$,
  'หัวหน้ากลุ่มสาระ "ทั้งหมด" = เฉพาะครูคณิต 2 คน');
select throws_ok($$select * from public.task_publish(pg_temp.id('k2'), 'teachers', null, array['aaaaaaaa-5555-4000-a000-000000000002'::uuid])$$,
  '42501', null, 'หัวหน้ากลุ่มสาระมอบหมายครูนอกกลุ่มไม่ได้');
select throws_ok($$select * from public.task_publish(pg_temp.id('k1'), 'all')$$, '42501', null, 'หัวหน้ากลุ่มสาระจัดการงานระดับโรงเรียนไม่ได้');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select throws_ok($$select * from public.task_publish(pg_temp.id('k1'), 'all')$$, '42501', null, 'ครูเผยแพร่งานไม่ได้');

-- ---------------------------------------------------------------- การมองเห็น
select results_eq($$select title from public.tasks order by title$$, $$values ('งานกลุ่มคณิต'), ('งานทั้งโรงเรียน')$$, 'ครูเห็นเฉพาะงานที่มอบหมายให้ตน');
select is((select count(*)::int from public.task_assignments), 2, 'ครูเห็นเฉพาะการมอบหมายของตนเอง');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000007');
select results_eq($$select title from public.tasks$$, $$values ('งานทั้งโรงเรียน')$$, 'ครูภาษาไทยไม่เห็นงานกลุ่มคณิต');
update public.tasks set title = 'ครูแก้' where id = pg_temp.id('k1');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select is((select count(*)::int from public.task_assignments where task_id = pg_temp.id('k1')), 2, 'หัวหน้ากลุ่มสาระเห็นการมอบหมายเฉพาะครูในกลุ่ม');
select results_eq($$select total from public.task_progress where task_id = pg_temp.id('k1')$$, $$values (2)$$, 'task_progress นับตามขอบเขตผู้เรียก');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000005');
select is((select count(*)::int from public.tasks), 3, 'ผู้บริหารเห็นงานทั้งหมด (อ่านอย่างเดียว)');
update public.tasks set title = 'ผู้บริหารแก้' where id = pg_temp.id('k1');
select throws_ok($$select public.task_cancel(pg_temp.id('k1'), 'x')$$, '42501', null, 'ผู้บริหารยกเลิกงานไม่ได้');
reset role;
select is((select title from public.tasks where id = pg_temp.id('k1')), 'งานทั้งโรงเรียน', 'ครู / ผู้บริหารแก้ไขงานไม่ได้');
reset role;
select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000001');
select is((select count(*)::int from public.tasks) + (select count(*)::int from public.task_assignments), 0, 'โรงเรียนอื่นไม่เห็นงาน/การมอบหมาย');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((select count(*)::int from public.tasks), 0, 'ผู้ดูแลระบบไม่เห็นงานวิชาการ');

-- ---------------------------------------------------------------- เลยกำหนด (คำนวณจาก due_at)
reset role;
update public.tasks set starts_at = now() - interval '10 days', due_at = now() - interval '1 hour' where id = pg_temp.id('k1');
update public.task_assignments set status = 'submitted', current_version = 1, last_submitted_at = now()
 where task_id = pg_temp.id('k1') and teacher_id = 'aaaaaaaa-5555-4000-a000-000000000002';
select results_eq($$select overdue, submitted from public.task_progress where task_id = pg_temp.id('k1')$$, $$values (3, 1)$$,
  'overdue = ยังไม่ส่งและเลย due_at (ไม่เก็บเป็นสถานะ)');

-- ---------------------------------------------------------------- แก้ไข / ยกเลิก
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
update public.tasks set due_at = now() + interval '3 days' where id = pg_temp.id('k1');
reset role;
select ok((select due_at > now() from public.tasks where id = pg_temp.id('k1')), 'หัวหน้าวิชาการขยายวันครบกำหนดได้');
select ok(exists (select 1 from public.audit_logs where table_name = 'tasks' and action = 'UPDATE' and record_id = pg_temp.id('k1')
  and old_data ->> 'due_at' is distinct from new_data ->> 'due_at'), 'ประวัติการแก้ไขอยู่ใน audit_logs');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
select throws_ok($$select public.task_cancel(pg_temp.id('k1'), '  ')$$, 'P0001', 'กรุณาระบุเหตุผลการยกเลิก', 'ยกเลิกต้องมีเหตุผล');
select is(public.task_cancel(pg_temp.id('k1'), 'ฝ่ายวิชาการเปลี่ยนแผน'), 3, 'ยกเลิกงาน: ยกเลิกเฉพาะการมอบหมายที่ยังไม่ส่ง');
reset role;
select results_eq($$select status from public.task_assignments where task_id = pg_temp.id('k1') order by status$$,
  $$values ('cancelled'::text), ('cancelled'), ('cancelled'), ('submitted')$$, 'งานที่ส่งแล้วคงไว้เป็นหลักฐาน ไม่มีการลบ');
select results_eq($$select status, cancel_reason from public.tasks where id = pg_temp.id('k1')$$, $$values ('cancelled'::text, 'ฝ่ายวิชาการเปลี่ยนแผน'::text)$$, 'งานถูกยกเลิกพร้อมเหตุผล');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000003');
update public.tasks set title = 'แก้หลังยกเลิก' where id = pg_temp.id('k1');
select throws_ok($$select * from public.task_publish(pg_temp.id('k1'), 'all')$$, 'P0001', null, 'งานที่ยกเลิกแล้วมอบหมายเพิ่มไม่ได้');
reset role;
select isnt((select title from public.tasks where id = pg_temp.id('k1')), 'แก้หลังยกเลิก', 'งานที่ยกเลิกแล้วแก้ไขไม่ได้');
select is((select count(*)::int from public.assignment_events where task_id = pg_temp.id('k1')), 9,
  'timeline: เผยแพร่ 1 + มอบหมาย 4 + ยกเลิกงาน 1 + ยกเลิกรายคน 3');
select throws_ok($$delete from public.assignment_events$$, '42501', null, 'assignment_events แก้/ลบไม่ได้');

-- ยกเลิกรายคน
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000004');
select lives_ok($$select public.assignment_cancel((select id from public.task_assignments where task_id = pg_temp.id('k2') and teacher_id = 'aaaaaaaa-5555-4000-a000-000000000003'))$$,
  'หัวหน้ากลุ่มสาระยกเลิกการมอบหมายรายคนในงานของกลุ่มได้');

-- ---------------------------------------------------------------- แม่แบบเอกสาร (storage Phase 1.6)
insert into ids select 'tpl', file_id from public.storage_begin_template_upload(pg_temp.id('k2'), 'แบบฟอร์ม.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100);
reset role;
select is(public.storage_complete_upload(pg_temp.id('tpl'), 'aaaaaaaa-0000-4000-a000-000000000004', true, 100, repeat('b', 64), 's3-local', null), 'ready', 'แนบแม่แบบให้งาน');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000006');
select lives_ok($$select * from public.storage_authorize_download(pg_temp.id('tpl'))$$, 'ครูที่ได้รับมอบหมายดาวน์โหลดแม่แบบได้');
select throws_ok($$select * from public.storage_begin_upload((select document_id from public.files where id = pg_temp.id('tpl')), null, null, 'ทับ.pdf', 'application/pdf', 10)$$,
  '42501', null, 'ครูอัปโหลดทับเอกสารแม่แบบไม่ได้ (ปิดช่องโหว่ owner null)');
select throws_ok($$select * from public.storage_begin_template_upload(pg_temp.id('k2'), 'x.pdf', 'application/pdf', 10)$$, '42501', null, 'ครูแนบแม่แบบไม่ได้');
reset role;
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000007');
select throws_ok($$select * from public.storage_authorize_download(pg_temp.id('tpl'))$$, '42501', null, 'ครูที่ไม่ได้รับมอบหมายดาวน์โหลดแม่แบบไม่ได้');

select * from finish();
rollback;
