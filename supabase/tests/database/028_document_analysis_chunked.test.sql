-- pgTAP: วิเคราะห์แบบแบ่งรอบ (กัน CPU limit) · งานค้าง/ล้มเหลว/ทำต่อ (ไม่สร้างงานซ้ำ) · กันวนไม่สิ้นสุด
--        · เปรียบเทียบหลักสูตร: ผลเท่าเดิมและเร็วพอสำหรับข้อมูลขนาด Staging (statement timeout)
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

-- ---- งานใหม่ + รอบประมวลผล (service_role)
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
create temp table t_req as select * from public.document_analysis_request('eeeeeeee-0000-4000-a000-000000000001');
grant select on t_req to authenticated, service_role;
select throws_ok($$select * from public.document_analysis_claim((select analysis_id from t_req), 0)$$, '42501', null, 'ผู้ใช้จองรอบเองไม่ได้ (service_role เท่านั้น)');
select throws_ok($$select * from public.document_analysis_request('eeeeeeee-0000-4000-a000-000000000001')$$, 'P0001', null, 'มีงานที่ยังไม่เสร็จ → สร้างงานใหม่ไม่ได้ (ต้องทำต่องานเดิม)');
reset role;
set local role service_role;
select is((select chunk_no from public.document_analysis_claim((select analysis_id from t_req), 0)), 1, 'จองรอบที่ 1');
select is((select count(*)::int from public.document_analysis_claim((select analysis_id from t_req), 0)), 0, 'รอบซ้ำ/เก่า (ลำดับไม่ตรง) ไม่ได้งาน → ไม่ทำซ้อน');
select is(public.document_analysis_save_pages((select analysis_id from t_req), 1, array['หน้า 1', 'หน้า 2'], 5), 2, 'บันทึกหน้า 1–2 จาก 5');
select throws_ok($$select public.document_analysis_save_pages((select analysis_id from t_req), 4, array['x'], 5)$$, 'P0001', null, 'บันทึกข้ามหน้าไม่ได้ (หน้าไม่ต่อเนื่อง)');
select is(public.document_analysis_page_texts((select analysis_id from t_req)), array['หน้า 1', 'หน้า 2'], 'ข้อความรายหน้าตามลำดับ');
reset role;
select is((select phase from public.document_analyses where id = (select analysis_id from t_req)), 'extract', 'ยังอ่านไม่ครบ → phase extract');

-- ---- งานค้าง → failed พร้อมเหตุผล · ทำต่องานเดิม
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select throws_ok($$select * from public.document_analysis_retry((select analysis_id from t_req))$$, 'P0001', 'งานนี้กำลังทำงานอยู่ — รอสักครู่', 'งานที่ยังเคลื่อนไหวสั่งทำต่อซ้อนไม่ได้');
reset role;
update public.document_analyses set heartbeat_at = now() - interval '11 minutes' where id = (select analysis_id from t_req);
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000002');
select is(public.document_analysis_reap_stale(), 1, 'ผู้อ่านหลักสูตรเปิดหน้า → งานค้างถูกปิดเป็น failed');
select is((select status from public.document_analyses where id = (select analysis_id from t_req)), 'failed', 'สถานะ failed');
select ok((select error like '%หยุดทำงานกลางคัน%หน้า 2/5%ทำต่อ%' from public.document_analyses where id = (select analysis_id from t_req)), 'เหตุผลระบุหน้าที่ค้างและวิธีทำต่อ');
select throws_ok($$select * from public.document_analysis_retry((select analysis_id from t_req))$$, '42501', null, 'เจ้าหน้าที่สั่งทำต่อไม่ได้');
reset role;
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((select chunk_count from public.document_analysis_retry((select analysis_id from t_req))), 1, 'ผู้ดูแลสั่งทำต่อ → คืนลำดับรอบปัจจุบัน');
reset role;
select is((select count(*)::int from public.document_analyses where source_document_id = 'eeeeeeee-0000-4000-a000-000000000001'), 1, 'ทำต่อไม่สร้างงานใหม่');
select is((select status || ':' || pages_done || ':' || attempts from public.document_analyses where id = (select analysis_id from t_req)), 'queued:2:1', 'กลับเป็นรอคิว เก็บหน้าที่อ่านแล้ว นับครั้งที่สั่ง');
set local role service_role;
select is((select pages_done from public.document_analysis_claim((select analysis_id from t_req), 1)), 2, 'รอบถัดไปเริ่มต่อจากหน้า 3');
select is(public.document_analysis_save_pages((select analysis_id from t_req), 3, array['3', '4', '5'], 5), 5, 'อ่านครบ 5 หน้า');
reset role;
select is((select phase from public.document_analyses where id = (select analysis_id from t_req)), 'analyze', 'ครบแล้ว → phase analyze');
set local role service_role;
-- เพดานรอบ: กันวนไม่สิ้นสุด
select is((select count(*)::int from public.document_analysis_claim((select analysis_id from t_req), 2, 2)), 0, 'เกินเพดานรอบ → ไม่ได้งาน');
reset role;
select ok((select status = 'failed' and error like '%เกิน 2 รอบ%วนไม่สิ้นสุด%' from public.document_analyses where id = (select analysis_id from t_req)), 'เกินเพดาน → failed พร้อมเหตุผล');

-- ---- งานค้างแบบ SRC-02 (running ไม่มี heartbeat เริ่มเกิน 30 นาที) ทำต่อได้โดยตรง ไม่ต้องสร้างใหม่
insert into public.document_analyses (id, school_id, source_document_id, file_id, status, started_at, created_at, created_by)
values ('99999999-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'eeeeeeee-0000-4000-a000-000000000001', 'dddddddd-2222-4000-a000-000000000001',
        'running', now() - interval '40 minutes', now() - interval '40 minutes', 'aaaaaaaa-0000-4000-a000-000000000001');
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
select is((select chunk_count from public.document_analysis_retry('99999999-0000-4000-a000-000000000001')), 0, 'งานค้างแบบ SRC-02 สั่งทำต่อได้ (เริ่มรอบ 0)');
reset role;

-- ---- เปรียบเทียบ: ข้อมูลขนาด Staging (รายวิชา 359 · การจัด 718 · เกณฑ์ 43 · CF 66) ต้องเสร็จก่อน statement timeout
insert into public.learning_areas (id, school_id, code, name_th, sort_order) values ('11111111-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'TH', 'ภาษาไทย', 1);
insert into public.grade_levels (id, school_id, code, name_th, stage, level_order) values ('22222222-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'M1', 'ม.1', 'lower_secondary', 7);
insert into public.school_curricula (id, school_id, name_th) values ('cccccccc-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 't');
insert into public.curriculum_versions (id, school_id, school_curriculum_id, version_label, effective_year_be) values ('cccccccc-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-1111-4000-a000-000000000001', 'V', 2569);
insert into public.study_programs (school_id, curriculum_version_id, code, name_th, stage, source_document_id, source_locator)
  select 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'P' || g, 'แผน' || g, 'lower_secondary', 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1' from generate_series(1, 9) g;
insert into public.subjects (school_id, curriculum_version_id, code, name_th, learning_area_id, subject_type, credits, learning_hours, source_document_id, source_locator)
  select 'aaaaaaaa-0000-4000-a000-000000000000', 'cccccccc-2222-4000-a000-000000000001', 'ท' || (21100 + g), 'วิชา' || g, '11111111-0000-4000-a000-000000000001', 'basic', 1, 40, 'eeeeeeee-0000-4000-a000-000000000001', 'pdf:1' from generate_series(1, 359) g;
insert into public.subject_offerings (school_id, curriculum_version_id, subject_id, grade_level_id, term_no, source_document_id, source_locator)
  select s.school_id, s.curriculum_version_id, s.id, '22222222-0000-4000-a000-000000000001', t, s.source_document_id, 'pdf:1' from public.subjects s cross join generate_series(1, 2) t
   where s.curriculum_version_id = 'cccccccc-2222-4000-a000-000000000001';
insert into public.curriculum_rules (school_id, code, title_th, category, rule_type, params, status)
  select 'aaaaaaaa-0000-4000-a000-000000000000', 'TS-X' || g, 'a', 'learning_hours', 'area_basic_hours', '{"op":"eq","hours":120,"grade_codes":["M1"],"area_code":"TH"}', 'draft' from generate_series(1, 42) g;
insert into public.curriculum_rules (school_id, code, title_th, category, rule_type, params, status) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'TS-OTHER', 'a', 'learning_hours', 'area_basic_hours', '{"op":"eq","hours":120,"grade_codes":["M1"],"area_code":"MA"}', 'draft');
insert into public.source_conflicts (school_id, conflict_code, doc_a_id, description, status, subject_ref, category)
  select 'aaaaaaaa-0000-4000-a000-000000000000', 'CF-' || (100 + g), 'eeeeeeee-0000-4000-a000-000000000001', 'd', 'needs_decision', 'ท' || (21100 + g), 'credits' from generate_series(1, 64) g;
insert into public.source_conflicts (school_id, conflict_code, doc_a_id, description, status, subject_ref, category) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'CF-901', 'eeeeeeee-0000-4000-a000-000000000001', 'd', 'needs_decision', 'โครงสร้างหลักสูตรชั้นปี', 'learning_hours');
insert into public.source_conflicts (school_id, conflict_code, doc_a_id, description, status, subject_ref, category, resolution, resolved_at) values
  ('aaaaaaaa-0000-4000-a000-000000000000', 'CF-902', 'eeeeeeee-0000-4000-a000-000000000001', 'd', 'resolved', 'ท21101', 'credits', 'x', now());
select pg_temp.login('aaaaaaaa-0000-4000-a000-000000000001');
create temp table t_t0 as select clock_timestamp() t0;
create temp table t_rev as select * from public.curriculum_compliance_review('cccccccc-2222-4000-a000-000000000001');
select ok((select clock_timestamp() - t0 < interval '3 seconds' from t_t0), 'เปรียบเทียบเสร็จภายใน 3 วินาที (เดิม ~35 วินาที เกิน statement timeout)');
select is((select cardinality(open_conflicts) from t_rev where rule_code = 'TS-X1'), 65, 'เกณฑ์กลุ่มสาระ TH: CF รายวิชา TH 64 + CF โครงสร้าง 1 (ไม่นับ CF ที่ตัดสินแล้ว)');
select is((select open_conflicts from t_rev where rule_code = 'TS-OTHER'), array['CF-901'], 'เกณฑ์กลุ่มสาระอื่น: เฉพาะ CF โครงสร้าง');
select is((select cardinality(open_conflicts) from t_rev where rule_code = 'SYS-CONFLICT'), 65, 'SYS-CONFLICT: CF ที่ยังไม่ตัดสินทั้งหมด');
reset role;

select * from finish();
rollback;
