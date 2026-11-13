-- =============================================================================
-- C1.1 — Curriculum Intelligence: Security (RLS) + Version / Cohort / Mapping RPC
-- Permission matrix (PHASE-0 §5 + sprint brief):
--   academic_head  : จัดการ + อนุมัติ version / implementation / conflict
--   academic_staff : สร้าง/แก้ฉบับ draft (ไม่อนุมัติ)
--   learning_area_head : แก้รายวิชาเฉพาะกลุ่มสาระตน
--   executive / system_admin : อ่าน (admin ไม่แก้เนื้อหาเชิงวิชาการ)
--   teacher : อ่านเฉพาะฉบับ approved / active
--   AI / service : ไม่มีสิทธิ์อนุมัติ (private.require_human)
-- =============================================================================

-- ---------------------------------------------------------------- helpers
create or replace function private.require_human()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    raise exception 'การอนุมัติต้องเป็นการกระทำของผู้ใช้ที่เข้าสู่ระบบเท่านั้น' using errcode = 'insufficient_privilege';
  end if;
  return auth.uid();
end;
$$;

create or replace function private.curriculum_reader_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['system_admin', 'academic_head', 'academic_staff', 'learning_area_head', 'executive']::public.app_role[])
$$;

create or replace function private.can_read_curriculum_version_row(p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.curriculum_reader_role() or (private.is_school_member() and p_status in ('approved', 'active')), false)
$$;

create or replace function private.can_read_curriculum_version(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.curriculum_versions v
    where v.id = p_version_id and v.school_id = private.current_school_id()
      and private.can_read_curriculum_version_row(v.status)
  )
$$;

-- แก้เนื้อหารายกลุ่มสาระ: ฝ่ายวิชาการทั้งหมด หรือหัวหน้ากลุ่มสาระเฉพาะกลุ่มตน (null-safe)
create or replace function private.can_edit_curriculum_area(p_learning_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_office_staff()
    or (private.has_role('learning_area_head') and p_learning_area_id in (select private.my_learning_area_ids())), false)
$$;

create or replace function private.can_edit_subject(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.subjects s where s.id = p_subject_id and private.can_edit_curriculum_area(s.learning_area_id))
$$;

revoke all on function private.require_human(), private.curriculum_reader_role(), private.can_read_curriculum_version_row(text),
  private.can_read_curriculum_version(uuid), private.can_edit_curriculum_area(uuid), private.can_edit_subject(uuid) from public, anon;
grant execute on function private.require_human(), private.curriculum_reader_role(), private.can_read_curriculum_version_row(text),
  private.can_read_curriculum_version(uuid), private.can_edit_curriculum_area(uuid), private.can_edit_subject(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------- RLS: national (global, อ่านอย่างเดียว)
do $$
declare t text;
begin
  foreach t in array array['curriculum_frameworks', 'framework_versions', 'framework_learning_areas', 'framework_grade_levels',
                           'learning_standards', 'indicators'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (true)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- RLS: school
do $$
declare t text;
begin
  foreach t in array array['source_documents', 'source_conflicts', 'school_curricula', 'curriculum_versions', 'study_programs',
                           'curriculum_implementations', 'classroom_programs', 'subjects', 'subject_offerings', 'learning_activities',
                           'subject_learning_outcomes', 'curriculum_indicator_mappings', 'import_batches', 'import_rows'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
  end loop;
end;
$$;

-- source documents / conflicts: บทบาทหลักสูตรอ่าน · ฝ่ายวิชาการลงทะเบียน · ตัดสินข้อขัดแย้งผ่าน RPC
grant insert (id, register_code, title, doc_type, file_id, parent_id, sha256, page_count, page_offset, declared_curriculum_ref,
  content_status, duplicate_of_id, reliability, learning_area_id, grade_scope, issued_year_be, notes) on public.source_documents to authenticated;
grant update (title, doc_type, page_count, page_offset, declared_curriculum_ref, content_status, duplicate_of_id, reliability,
  learning_area_id, grade_scope, issued_year_be, notes) on public.source_documents to authenticated;
create policy source_documents_select on public.source_documents for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()));
create policy source_documents_insert on public.source_documents for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));
create policy source_documents_update on public.source_documents for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()))
  with check (school_id = (select private.current_school_id()));

grant insert (id, conflict_code, doc_a_id, doc_b_id, subject_ref, locator_a, locator_b, description, impact) on public.source_conflicts to authenticated;
create policy source_conflicts_select on public.source_conflicts for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()));
create policy source_conflicts_insert on public.source_conflicts for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));

-- school curricula: หัวหน้าฝ่ายวิชาการสร้าง
grant insert (id, name_th) on public.school_curricula to authenticated;
grant update (name_th) on public.school_curricula to authenticated;
create policy school_curricula_select on public.school_curricula for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_member()));
create policy school_curricula_insert on public.school_curricula for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.has_role('academic_head')));
create policy school_curricula_update on public.school_curricula for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.has_role('academic_head')))
  with check (school_id = (select private.current_school_id()));

-- curriculum versions: ฝ่ายวิชาการสร้าง/แก้ draft · สถานะผ่าน RPC
grant insert (id, school_curriculum_id, framework_version_id, version_label, effective_year_be, hours_per_credit,
  subject_code_pattern, announcement_source_id, announcement_locator) on public.curriculum_versions to authenticated;
grant update (framework_version_id, version_label, effective_year_be, hours_per_credit, subject_code_pattern,
  announcement_source_id, announcement_locator) on public.curriculum_versions to authenticated;
create policy curriculum_versions_select on public.curriculum_versions for select to authenticated
  using (school_id = (select private.current_school_id()) and private.can_read_curriculum_version_row(status));
create policy curriculum_versions_insert on public.curriculum_versions for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));
create policy curriculum_versions_update on public.curriculum_versions for update to authenticated
  using (school_id = (select private.current_school_id()) and status = 'draft' and (select private.is_office_staff()))
  with check (school_id = (select private.current_school_id()));

-- เนื้อหาของฉบับ: อ่านตามสิทธิ์ของฉบับ
do $$
declare t text;
begin
  foreach t in array array['study_programs', 'curriculum_implementations', 'subjects', 'subject_offerings', 'learning_activities',
                           'subject_learning_outcomes', 'curriculum_indicator_mappings'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
      using (school_id = (select private.current_school_id()) and private.can_read_curriculum_version(curriculum_version_id))', t);
  end loop;
end;
$$;

-- แผนการเรียน / กิจกรรม: ฝ่ายวิชาการ (ทั้งฉบับ)
grant insert (id, curriculum_version_id, code, name_th, stage, is_active, source_document_id, source_locator) on public.study_programs to authenticated;
grant update (name_th, stage, is_active, source_document_id, source_locator) on public.study_programs to authenticated;
grant insert (id, curriculum_version_id, study_program_id, activity_type, name_th, grade_level_id, term_no, activity_hours,
  source_document_id, source_locator) on public.learning_activities to authenticated;
grant update (activity_type, name_th, grade_level_id, term_no, activity_hours, source_document_id, source_locator)
  on public.learning_activities to authenticated;
do $$
declare t text;
begin
  foreach t in array array['study_programs', 'learning_activities'] loop
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
      using (school_id = (select private.current_school_id()) and (select private.is_office_staff()))
      with check (school_id = (select private.current_school_id()))', t);
  end loop;
end;
$$;

-- รายวิชา: ตามกลุ่มสาระ (หัวหน้ากลุ่มสาระเฉพาะกลุ่มตน)
grant insert (id, curriculum_version_id, code, name_th, name_en, learning_area_id, subject_type, grade_level_id, credits,
  learning_hours, description_th, source_document_id, source_locator) on public.subjects to authenticated;
grant update (code, name_th, name_en, learning_area_id, subject_type, grade_level_id, credits, learning_hours, description_th,
  source_document_id, source_locator) on public.subjects to authenticated;
create policy subjects_insert on public.subjects for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_edit_curriculum_area(learning_area_id));
create policy subjects_update on public.subjects for update to authenticated
  using (school_id = (select private.current_school_id()) and private.can_edit_curriculum_area(learning_area_id))
  with check (school_id = (select private.current_school_id()) and private.can_edit_curriculum_area(learning_area_id));

-- โครงสร้าง / ผลการเรียนรู้ / mapping: ตามสิทธิ์ของรายวิชา · สถานะ mapping ผ่าน RPC
grant insert (id, curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, offering_kind, hours_per_week,
  sort_order, source_document_id, source_locator) on public.subject_offerings to authenticated;
grant update (study_program_id, grade_level_id, term_no, offering_kind, hours_per_week, sort_order, source_document_id, source_locator)
  on public.subject_offerings to authenticated;
grant insert (id, curriculum_version_id, subject_id, outcome_kind, code, statement_th, indicator_id, source_document_id, source_locator)
  on public.subject_learning_outcomes to authenticated;
grant update (code, statement_th, indicator_id, source_document_id, source_locator) on public.subject_learning_outcomes to authenticated;
grant insert (id, curriculum_version_id, subject_id, indicator_id, learning_outcome_id, coverage, source_document_id, source_locator)
  on public.curriculum_indicator_mappings to authenticated;
grant update (coverage, source_document_id, source_locator) on public.curriculum_indicator_mappings to authenticated;
do $$
declare t text;
begin
  foreach t in array array['subject_offerings', 'subject_learning_outcomes', 'curriculum_indicator_mappings'] loop
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (school_id = (select private.current_school_id()) and private.can_edit_subject(subject_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
      using (school_id = (select private.current_school_id()) and private.can_edit_subject(subject_id))
      with check (school_id = (select private.current_school_id()))', t);
  end loop;
end;
$$;

-- ห้องเรียน ↔ แผนการเรียน
grant insert (classroom_id, study_program_id) on public.classroom_programs to authenticated;
grant update (study_program_id) on public.classroom_programs to authenticated;
create policy classroom_programs_select on public.classroom_programs for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_member()));
create policy classroom_programs_insert on public.classroom_programs for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));
create policy classroom_programs_update on public.classroom_programs for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()))
  with check (school_id = (select private.current_school_id()));

-- import staging: เขียนผ่าน RPC เท่านั้น (สร้าง batch ได้ตรงตามขอบเขต)
grant insert (id, source_document_id, curriculum_version_id, kind, learning_area_id, column_mapping) on public.import_batches to authenticated;
create policy import_batches_select on public.import_batches for select to authenticated
  using (school_id = (select private.current_school_id())
         and ((select private.has_any_role(array['system_admin', 'academic_head', 'academic_staff', 'executive']::public.app_role[]))
              or ((select private.has_role('learning_area_head')) and learning_area_id in (select private.my_learning_area_ids()))));
create policy import_batches_insert on public.import_batches for insert to authenticated
  with check (school_id = (select private.current_school_id()) and created_by = auth.uid()
              and (private.is_office_staff()
                   or (private.has_role('learning_area_head') and learning_area_id in (select private.my_learning_area_ids()))));
create policy import_rows_select on public.import_rows for select to authenticated
  using (school_id = (select private.current_school_id())
         and exists (select 1 from public.import_batches b where b.id = batch_id));

-- ---------------------------------------------------------------- เอกสารต้นทางใน storage (Phase 1.6)
create or replace function private.can_read_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    left join public.teachers t on t.id = d.owner_teacher_id
    where d.id = p_document_id
      and d.school_id = private.current_school_id()
      and (
        (d.kind = 'teacher_document' and (
          t.profile_id = (select auth.uid())
          or private.is_office_staff()
          or (private.has_role('learning_area_head') and t.learning_area_id in (select private.my_learning_area_ids()))))
        or (d.kind = 'task_template' and private.can_view_task(d.task_id))
        -- C1.1: เอกสารต้นทางหลักสูตร — เฉพาะบทบาทที่ทำงานหลักสูตร (ไม่เปิดให้ครู / ไม่ public)
        or (d.kind = 'curriculum_source' and private.curriculum_reader_role())
      )
  )
$$;
-- เอกสารต้นทางหลักสูตรอาจใหญ่กว่าเอกสารครู (547 หน้า) — ขยายเพดานตาราง files เป็น 100 MB
-- เพดาน 20 MB ของเอกสารครู/แม่แบบยังบังคับใน RPC เดิม (storage_begin_upload / storage_begin_template_upload)
alter table public.files drop constraint files_size_range;
alter table public.files add constraint files_size_range check (size_bytes between 1 and 104857600);

create or replace function public.storage_begin_curriculum_source_upload(p_original_name text, p_mime_type text, p_size_bytes bigint)
returns table (file_id uuid, document_id uuid, version int, object_key text, mime_type text, size_bytes bigint, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_name text := btrim(coalesce(p_original_name, ''));
  v_ext text := lower(substring(btrim(coalesce(p_original_name, '')) from '\.([A-Za-z0-9]{1,5})$'));
  v_doc public.documents;
  v_file public.files;
begin
  perform private.require_human();
  if not private.is_office_staff() then
    raise exception 'เฉพาะฝ่ายวิชาการที่อัปโหลดเอกสารต้นทางหลักสูตรได้' using errcode = 'insufficient_privilege';
  end if;
  if v_ext not in ('pdf', 'xlsx', 'xls') or p_mime_type is distinct from private.mime_for_ext(v_ext) then
    raise exception 'เอกสารต้นทางหลักสูตรรองรับเฉพาะ PDF และ Excel';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 104857600 then
    raise exception 'ขนาดไฟล์ต้องไม่เกิน 100 MB';
  end if;
  if length(v_name) > 255 or v_name ~ '[\x00-\x1f/\\]' then
    raise exception 'ชื่อไฟล์ไม่ถูกต้อง';
  end if;
  insert into public.documents (school_id, kind, title, category) values (v_school, 'curriculum_source', left(v_name, 200), 'general')
  returning * into v_doc;
  v_file.id := gen_random_uuid();
  insert into public.files (id, school_id, document_id, version, object_key, original_name, file_ext, mime_type, size_bytes, uploaded_by, upload_expires_at)
  values (v_file.id, v_school, v_doc.id, 1, format('schools/%s/curriculum-sources/%s.%s', v_school, v_file.id, v_ext),
          v_name, v_ext, p_mime_type, p_size_bytes, auth.uid(), now() + interval '5 minutes')
  returning * into v_file;
  perform private.log_file_event(v_file, 'upload_requested', jsonb_build_object('size', p_size_bytes, 'ext', v_ext, 'kind', 'curriculum_source'));
  return query select v_file.id, v_doc.id, v_file.version, v_file.object_key, v_file.mime_type, v_file.size_bytes, v_file.upload_expires_at;
end;
$$;

-- ---------------------------------------------------------------- Version workflow
create or replace function private.curriculum_transition(p_id uuid, p_from text[], p_to text, p_head_only boolean)
returns public.curriculum_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.curriculum_versions;
begin
  perform private.require_human();
  select * into v from public.curriculum_versions where id = p_id and school_id = private.current_school_id() for update;
  if not found then
    raise exception 'ไม่พบหลักสูตรฉบับนี้';
  end if;
  if p_head_only and not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการเท่านั้น' using errcode = 'insufficient_privilege';
  end if;
  if not p_head_only and not private.is_office_staff() then
    raise exception 'คุณไม่มีสิทธิ์ดำเนินการกับหลักสูตร' using errcode = 'insufficient_privilege';
  end if;
  if not (v.status = any (p_from)) then
    raise exception 'เปลี่ยนสถานะจาก % เป็น % ไม่ได้', v.status, p_to;
  end if;
  return v;
end;
$$;

create or replace function public.curriculum_version_submit(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.curriculum_versions;
begin
  v := private.curriculum_transition(p_id, array['draft'], 'under_review', false);
  if v.announcement_source_id is null or v.announcement_locator is null then
    raise exception 'ต้องระบุเอกสารประกาศใช้หลักสูตรและเลขหน้าก่อนส่งตรวจ';
  end if;
  update public.curriculum_versions set status = 'under_review', submitted_by = auth.uid(), submitted_at = now() where id = p_id;
end $$;

create or replace function public.curriculum_version_return(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.curriculum_transition(p_id, array['under_review'], 'draft', true);
  update public.curriculum_versions set status = 'draft', submitted_by = null, submitted_at = null where id = p_id;
end $$;

create or replace function public.curriculum_version_approve(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.curriculum_transition(p_id, array['under_review'], 'approved', true);
  update public.curriculum_versions set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
end $$;

create or replace function public.curriculum_version_activate(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.curriculum_transition(p_id, array['approved'], 'active', true);
  update public.curriculum_versions set status = 'active', activated_at = now() where id = p_id;
end $$;

create or replace function public.curriculum_version_retire(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.curriculum_transition(p_id, array['approved', 'active'], 'retired', true);
  update public.curriculum_versions set status = 'retired', retired_at = now() where id = p_id;
end $$;

-- สถานะความเชื่อมั่นของกรอบแกนกลาง (D2) — ไม่ใช่เนื้อหาหลักสูตร จึงเปลี่ยนได้หลังอนุมัติ (หัวหน้าฯ)
create or replace function public.curriculum_version_set_framework_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.curriculum_transition(p_id, array['draft', 'under_review', 'approved', 'active'], p_status, true);
  if p_status not in ('confirmed', 'provisional') then
    raise exception 'สถานะกรอบหลักสูตรไม่ถูกต้อง';
  end if;
  update public.curriculum_versions set framework_status = p_status where id = p_id;
end $$;

-- แก้หลักสูตรที่อนุมัติแล้ว = สร้างฉบับใหม่ (draft) โดยคัดลอกเนื้อหาทั้งหมดพร้อม provenance
create or replace function public.curriculum_version_clone(p_source_id uuid, p_version_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.curriculum_versions;
  v_new uuid := gen_random_uuid();
begin
  perform private.require_human();
  if not private.is_office_staff() then
    raise exception 'คุณไม่มีสิทธิ์สร้างหลักสูตรฉบับใหม่' using errcode = 'insufficient_privilege';
  end if;
  select * into v_src from public.curriculum_versions where id = p_source_id and school_id = private.current_school_id();
  if not found then
    raise exception 'ไม่พบหลักสูตรต้นฉบับ';
  end if;
  insert into public.curriculum_versions (id, school_id, school_curriculum_id, framework_version_id, framework_status, version_label,
    effective_year_be, hours_per_credit, subject_code_pattern, announcement_source_id, announcement_locator, based_on_version_id, created_by)
  values (v_new, v_src.school_id, v_src.school_curriculum_id, v_src.framework_version_id, v_src.framework_status, btrim(p_version_label),
    null, v_src.hours_per_credit, v_src.subject_code_pattern, null, null, v_src.id, auth.uid());

  drop table if exists _map;
  create temp table _map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _map select id, gen_random_uuid() from public.study_programs where curriculum_version_id = p_source_id;
  insert into _map select id, gen_random_uuid() from public.subjects where curriculum_version_id = p_source_id;
  insert into _map select id, gen_random_uuid() from public.subject_learning_outcomes where curriculum_version_id = p_source_id;

  insert into public.study_programs (id, school_id, curriculum_version_id, code, name_th, stage, is_active, source_document_id, source_locator, import_row_id)
  select m.new_id, p.school_id, v_new, p.code, p.name_th, p.stage, p.is_active, p.source_document_id, p.source_locator, p.import_row_id
  from public.study_programs p join _map m on m.old_id = p.id;
  insert into public.subjects (id, school_id, curriculum_version_id, code, name_th, name_en, learning_area_id, subject_type, grade_level_id,
    credits, learning_hours, description_th, source_document_id, source_locator, import_row_id)
  select m.new_id, s.school_id, v_new, s.code, s.name_th, s.name_en, s.learning_area_id, s.subject_type, s.grade_level_id,
    s.credits, s.learning_hours, s.description_th, s.source_document_id, s.source_locator, s.import_row_id
  from public.subjects s join _map m on m.old_id = s.id;
  insert into public.subject_offerings (school_id, curriculum_version_id, subject_id, study_program_id, grade_level_id, term_no, offering_kind,
    hours_per_week, sort_order, source_document_id, source_locator, import_row_id)
  select o.school_id, v_new, ms.new_id, mp.new_id, o.grade_level_id, o.term_no, o.offering_kind, o.hours_per_week, o.sort_order,
    o.source_document_id, o.source_locator, o.import_row_id
  from public.subject_offerings o join _map ms on ms.old_id = o.subject_id left join _map mp on mp.old_id = o.study_program_id
  where o.curriculum_version_id = p_source_id;
  insert into public.learning_activities (school_id, curriculum_version_id, study_program_id, activity_type, name_th, grade_level_id, term_no,
    activity_hours, source_document_id, source_locator, import_row_id)
  select a.school_id, v_new, mp.new_id, a.activity_type, a.name_th, a.grade_level_id, a.term_no, a.activity_hours,
    a.source_document_id, a.source_locator, a.import_row_id
  from public.learning_activities a left join _map mp on mp.old_id = a.study_program_id where a.curriculum_version_id = p_source_id;
  insert into public.subject_learning_outcomes (id, school_id, curriculum_version_id, subject_id, outcome_kind, code, statement_th, indicator_id,
    source_document_id, source_locator, import_row_id)
  select mo.new_id, o.school_id, v_new, ms.new_id, o.outcome_kind, o.code, o.statement_th, o.indicator_id, o.source_document_id, o.source_locator, o.import_row_id
  from public.subject_learning_outcomes o join _map mo on mo.old_id = o.id join _map ms on ms.old_id = o.subject_id;
  -- mapping ที่คัดลอกต้องตรวจซ้ำในฉบับใหม่
  insert into public.curriculum_indicator_mappings (school_id, curriculum_version_id, subject_id, indicator_id, learning_outcome_id, coverage,
    source_document_id, source_locator, import_row_id)
  select c.school_id, v_new, ms.new_id, c.indicator_id, mo.new_id, c.coverage, c.source_document_id, c.source_locator, c.import_row_id
  from public.curriculum_indicator_mappings c join _map ms on ms.old_id = c.subject_id left join _map mo on mo.old_id = c.learning_outcome_id
  where c.curriculum_version_id = p_source_id and c.status <> 'rejected';
  return v_new;
end;
$$;

-- ---------------------------------------------------------------- Cohort
create or replace function public.curriculum_implementation_set(
  p_version_id uuid, p_study_program_id uuid, p_entry_academic_year_id uuid, p_entry_grade_level_id uuid,
  p_source_id uuid, p_locator text, p_status text default 'planned')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.require_human();
  if not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการกำหนดการใช้หลักสูตรกับรุ่นได้' using errcode = 'insufficient_privilege';
  end if;
  insert into public.curriculum_implementations (school_id, curriculum_version_id, study_program_id, entry_academic_year_id, entry_grade_level_id,
    status, decided_source_id, decided_locator)
  values (private.current_school_id(), p_version_id, p_study_program_id, p_entry_academic_year_id, p_entry_grade_level_id,
    coalesce(p_status, 'planned'), p_source_id, p_locator)
  returning id into v_id;
  return v_id;
end;
$$;

-- หาฉบับหลักสูตรของ (ปีการศึกษา, ระดับชั้น, แผน) จากรุ่นที่เข้าเรียน — ไม่ใช้ปีปัจจุบัน และไม่เดา
create or replace function public.curriculum_resolve(p_academic_year_id uuid, p_grade_level_id uuid, p_study_program_id uuid default null)
returns table (resolution text, curriculum_version_id uuid, implementation_id uuid, entry_year_be int, entry_grade_level_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select y.year_be, g.level_order, g.stage
    from public.academic_years y, public.grade_levels g
    where y.id = p_academic_year_id and g.id = p_grade_level_id
      and y.school_id = private.current_school_id() and g.school_id = y.school_id
  ), candidates as (
    select i.id, i.curriculum_version_id, ey.year_be, i.entry_grade_level_id
    from public.curriculum_implementations i
    join public.academic_years ey on ey.id = i.entry_academic_year_id
    join public.grade_levels eg on eg.id = i.entry_grade_level_id
    join target t on eg.stage = t.stage and eg.level_order <= t.level_order
                 and ey.year_be = t.year_be - (t.level_order - eg.level_order)
    where i.school_id = private.current_school_id()
      and (i.study_program_id is null or i.study_program_id is not distinct from p_study_program_id)
  )
  select case count(*) when 0 then 'unresolved' when 1 then 'resolved' else 'ambiguous' end,
         case when count(*) = 1 then min(c.curriculum_version_id::text)::uuid end,
         case when count(*) = 1 then min(c.id::text)::uuid end,
         case when count(*) = 1 then min(c.year_be) end,
         case when count(*) = 1 then min(c.entry_grade_level_id::text)::uuid end
  from candidates c
$$;

create view public.v_classroom_curriculum with (security_invoker = true) as
select c.id as classroom_id, c.academic_year_id, c.grade_level_id, c.room_no, cp.study_program_id,
       r.resolution, r.curriculum_version_id, r.implementation_id, r.entry_year_be
from public.classrooms c
left join public.classroom_programs cp on cp.classroom_id = c.id
cross join lateral public.curriculum_resolve(c.academic_year_id, c.grade_level_id, cp.study_program_id) r;
revoke all on public.v_classroom_curriculum from anon, authenticated;
grant select on public.v_classroom_curriculum to authenticated;

-- ---------------------------------------------------------------- Conflicts
create or replace function public.source_conflict_resolve(p_id uuid, p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_human();
  if not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการตัดสินข้อขัดแย้งได้' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_resolution, ''))) = 0 then
    raise exception 'กรุณาระบุผลการตัดสินและเหตุผล';
  end if;
  update public.source_conflicts set status = 'resolved', resolution = btrim(p_resolution), resolved_by = auth.uid(), resolved_at = now()
   where id = p_id and school_id = private.current_school_id() and status = 'open';
  if not found then
    raise exception 'ไม่พบข้อขัดแย้งที่ยังเปิดอยู่';
  end if;
end $$;

-- ---------------------------------------------------------------- Mapping review (C2)
create or replace function public.curriculum_mapping_review(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.curriculum_indicator_mappings;
begin
  perform private.require_human();
  select * into v from public.curriculum_indicator_mappings where id = p_id and school_id = private.current_school_id() for update;
  if not found or not private.can_edit_subject(v.subject_id) then
    raise exception 'ไม่พบ mapping หรือคุณไม่มีสิทธิ์ตรวจ' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('verified', 'rejected', 'pending_review') then
    raise exception 'สถานะไม่ถูกต้อง';
  end if;
  update public.curriculum_indicator_mappings
     set status = p_status, review_note = p_note,
         verified_by = case when p_status = 'pending_review' then null else auth.uid() end,
         verified_at = case when p_status = 'pending_review' then null else now() end
   where id = p_id;
end $$;

-- Coverage / gap: แยกสถานะ ไม่สรุปว่า "สอนครบ" · framework_complete = false → ห้ามแสดง % เป็นผลสมบูรณ์
create view public.v_indicator_coverage with (security_invoker = true) as
select v.id as curriculum_version_id, i.id as indicator_id, i.full_code, i.indicator_kind, fla.code as area_code,
       fgl.code as grade_code, fv.is_complete as framework_complete,
       count(m.id) filter (where m.status = 'verified')::int as verified_count,
       count(m.id) filter (where m.status = 'pending_review')::int as pending_count,
       count(m.id) filter (where m.status = 'rejected')::int as rejected_count,
       case
         when count(m.id) filter (where m.status = 'verified') > 0 then 'verified'
         when count(m.id) filter (where m.status = 'pending_review') > 0 then 'pending_review'
         else 'unmapped'
       end as coverage_status,
       bool_or(m.status = 'verified' and (sd.status <> 'reviewed' or sd.reliability in ('C', 'D'))) is true as evidence_incomplete,
       (count(m.id) filter (where m.status = 'verified' and m.coverage = 'primary') > 1) as possible_duplicate
from public.curriculum_versions v
join public.framework_versions fv on fv.id = v.framework_version_id
join public.indicators i on i.framework_version_id = fv.id
join public.learning_standards s on s.id = i.standard_id
join public.framework_learning_areas fla on fla.id = s.framework_learning_area_id
join public.framework_grade_levels fgl on fgl.id = i.framework_grade_level_id
left join public.curriculum_indicator_mappings m on m.curriculum_version_id = v.id and m.indicator_id = i.id
left join public.source_documents sd on sd.id = m.source_document_id
group by v.id, i.id, fla.code, fgl.code, fv.is_complete;
revoke all on public.v_indicator_coverage from anon, authenticated;
grant select on public.v_indicator_coverage to authenticated;

-- ---------------------------------------------------------------- grants
revoke all on function private.curriculum_transition(uuid, text[], text, boolean) from public, anon, authenticated;
revoke all on function
  public.storage_begin_curriculum_source_upload(text, text, bigint),
  public.curriculum_version_submit(uuid), public.curriculum_version_return(uuid), public.curriculum_version_approve(uuid),
  public.curriculum_version_activate(uuid), public.curriculum_version_retire(uuid),
  public.curriculum_version_set_framework_status(uuid, text), public.curriculum_version_clone(uuid, text),
  public.curriculum_implementation_set(uuid, uuid, uuid, uuid, uuid, text, text), public.curriculum_resolve(uuid, uuid, uuid),
  public.source_conflict_resolve(uuid, text), public.curriculum_mapping_review(uuid, text, text)
from public, anon, service_role;
grant execute on function
  public.storage_begin_curriculum_source_upload(text, text, bigint),
  public.curriculum_version_submit(uuid), public.curriculum_version_return(uuid), public.curriculum_version_approve(uuid),
  public.curriculum_version_activate(uuid), public.curriculum_version_retire(uuid),
  public.curriculum_version_set_framework_status(uuid, text), public.curriculum_version_clone(uuid, text),
  public.curriculum_implementation_set(uuid, uuid, uuid, uuid, uuid, text, text), public.curriculum_resolve(uuid, uuid, uuid),
  public.source_conflict_resolve(uuid, text), public.curriculum_mapping_review(uuid, text, text)
to authenticated;
