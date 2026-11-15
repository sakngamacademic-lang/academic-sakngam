-- Preflight ก่อน `supabase db push` (22–24) — อ่านอย่างเดียว · รันใน SQL Editor ของ Staging
-- ผลที่คาดหวัง: ทุกแถว ok = true
begin read only;
select 'history: 21 migration ล่าสุด = 20261119000100' as check_item,
       (select count(*) = 21 and max(version) = '20261119000100' from supabase_migrations.schema_migrations) as ok;
select 'ยังไม่มี 20261120000100 / 20261121000100 / 20261122000100' as check_item,
       not exists (select 1 from supabase_migrations.schema_migrations where version in ('20261120000100','20261121000100','20261122000100')) as ok;
select 'ไม่มีชื่อตาราง/ฟังก์ชันชนกัน' as check_item,
       not exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname in ('assignment_submissions','notifications','students','classroom_students','course_enrollments','grading_policies','assessment_components','assessment_scores','attendance_records','course_grades','v_section_student_progress'))
       and not exists (select 1 from pg_proc where pronamespace in ('public'::regnamespace, 'private'::regnamespace) and proname in ('assignment_submit','assignment_review','notify_from_assignment_event','teaches_section','can_view_section','can_record_section','can_view_student','assessment_lock_after_approval','grading_policy_verify','course_grades_compute','course_grades_submit','course_grades_approve','course_grade_set_special','grant_school_role')) as ok;
select 'assignment_events: constraint เดิมมี 4 ค่า (migration 22 แทนที่ด้วย 7 ค่า — ข้อมูลเดิมไม่ขัด)' as check_item,
       (select pg_get_constraintdef(oid) like '%assignment_cancelled%' and pg_get_constraintdef(oid) not like '%submitted%' from pg_constraint where conname = 'assignment_events_event_check') as ok;
select 'ตารางที่ migration อ้างถึงมีครบ' as check_item,
       (select count(*) = 15 from pg_class where relnamespace = 'public'::regnamespace and relname in ('course_sections','course_section_teachers','v_teacher_load','subject_offerings','learning_activities','terms','classrooms','teachers','files','documents','task_assignments','tasks','source_documents','curriculum_versions','academic_years')) as ok;
select 'ข้อมูลที่ constraint ใหม่จะตรวจ: assignment_events ' || count(*) as check_item, true as ok from public.assignment_events;
rollback;
