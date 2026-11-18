-- ประเภทหลักสูตร + ทะเบียนเกณฑ์ประเมิน + หลักฐานตามเกณฑ์ (forward-only · เพิ่มตารางใหม่ ไม่แก้ข้อมูลเดิม)
--  · ไม่เปลี่ยนประเภทรายวิชาทางการ (subjects.subject_type) — การจัดหมวดเก็บแยกเป็นความสัมพันธ์ หนึ่งรายการอยู่ได้หลายหมวด พร้อมเหตุผล
--  · เกณฑ์ประเมินเป็นข้อมูลที่ฝ่ายวิชาการบันทึกจากเอกสารต้นฉบับ (ระบบไม่สร้างเกณฑ์เอง) — ยืนยันได้เมื่อมีเอกสาร+เลขหน้า
--  · ระบบเดิม curriculum_rules (กฎโครงสร้างเวลาเรียนที่คำนวณได้) ใช้เป็นหลักฐานประกอบ ไม่ซ้ำกับตารางนี้
--  · เขียนผ่าน RPC เท่านั้น: ผู้ดูแลหลักสูตร (academic_head) · อ่าน: ผู้อ่านหลักสูตร · Audit ทุกแถว

create table public.curriculum_category_links (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  category               text not null check (category in ('general', 'vocational', 'local', 'specialized', 'activities')),
  target_type            text not null check (target_type in ('subject', 'program', 'activity')),
  target_id              uuid not null,
  status                 text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected')),
  reason                 text not null check (length(btrim(reason)) between 1 and 2000),
  source_document_id     uuid,
  source_locator         text check (source_locator is null or private.is_valid_locator(source_locator)),
  decided_by             uuid references auth.users (id),
  decided_at             timestamptz,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (curriculum_version_id, category, target_type, target_id),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  check (status = 'proposed' or (decided_by is not null and decided_at is not null))
);

create table public.assessment_criteria (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  parent_id           uuid references public.assessment_criteria (id) on delete restrict,
  seq                 int not null default 1 check (seq > 0),
  code                text not null check (length(btrim(code)) between 1 and 40),
  title_th            text not null check (length(btrim(title_th)) between 1 and 500),
  issuer              text check (issuer is null or length(issuer) <= 300),
  edition             text check (edition is null or length(edition) <= 200),
  year_be             int check (year_be is null or year_be between 2500 and 2700),
  quality_level       text check (quality_level is null or length(quality_level) <= 100),
  categories          text[] not null default '{}' check (categories <@ array['general', 'vocational', 'local', 'specialized', 'activities']::text[]),
  report_section      text check (report_section is null or report_section in ('structure', 'vocational', 'local', 'activities', 'graduation', 'community')),
  requirement_th      text check (requirement_th is null or length(requirement_th) <= 4000),
  source_document_id  uuid,
  source_locator      text check (source_locator is null or private.is_valid_locator(source_locator)),
  status              text not null default 'draft' check (status in ('draft', 'verified', 'retired')),
  verified_by         uuid references auth.users (id),
  verified_at         timestamptz,
  note                text check (note is null or length(note) <= 2000),
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (school_id, code),
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  -- ยืนยันเกณฑ์ได้เมื่อมีเอกสารต้นฉบับ + เลขหน้าเท่านั้น
  check (status <> 'verified' or (source_document_id is not null and source_locator is not null and verified_by is not null and verified_at is not null))
);
create index assessment_criteria_parent_idx on public.assessment_criteria (parent_id, seq);

create table public.criteria_evidence (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  criterion_id           uuid not null references public.assessment_criteria (id) on delete restrict,
  curriculum_version_id  uuid not null,
  target_type            text not null check (target_type in ('subject', 'program', 'activity', 'source_document', 'rule')),
  target_id              uuid not null,
  result                 text not null default 'pending' check (result in ('direct', 'partial', 'pending', 'none')),
  status                 text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected')),
  note                   text check (note is null or length(note) <= 2000),
  source_document_id     uuid,
  source_locator         text check (source_locator is null or private.is_valid_locator(source_locator)),
  decided_by             uuid references auth.users (id),
  decided_at             timestamptz,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (criterion_id, curriculum_version_id, target_type, target_id),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  check (status = 'proposed' or (decided_by is not null and decided_at is not null)),
  -- “พบหลักฐานตรงเกณฑ์/บางส่วน” ต้องยืนยันโดยคน และมีที่มาของหลักฐาน
  check (result not in ('direct', 'partial') or (status = 'confirmed' and source_document_id is not null and source_locator is not null)),
  check (status <> 'rejected' or length(btrim(coalesce(note, ''))) > 0)
);
create index criteria_evidence_criterion_idx on public.criteria_evidence (criterion_id, curriculum_version_id);

do $$
declare t text;
begin
  foreach t in array array['curriculum_category_links', 'assessment_criteria', 'criteria_evidence'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
      using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()))', t);
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function private.set_updated_at()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.audit_row_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- ตรวจเป้าหมายว่าอยู่ในฉบับหลักสูตรเดียวกัน (ไม่สร้างข้อมูลปลอม)
create or replace function private.curriculum_target_exists(p_version_id uuid, p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'subject' then exists (select 1 from public.subjects where id = p_id and curriculum_version_id = p_version_id)
    when 'program' then exists (select 1 from public.study_programs where id = p_id and curriculum_version_id = p_version_id)
    when 'activity' then exists (select 1 from public.learning_activities where id = p_id and curriculum_version_id = p_version_id)
    when 'source_document' then exists (select 1 from public.source_documents where id = p_id and school_id = private.current_school_id())
    when 'rule' then exists (select 1 from public.curriculum_rules where id = p_id and school_id = private.current_school_id())
    else false end
$$;

create or replace function private.require_curriculum_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then raise exception 'เฉพาะผู้ดูแลหลักสูตร' using errcode = 'insufficient_privilege'; end if;
end $$;

-- ---------------------------------------------------------------- จัดหมวดหลักสูตร (เสนอ/ยืนยัน/ปฏิเสธ พร้อมเหตุผล)
create or replace function public.curriculum_category_set(p_version_id uuid, p_category text, p_target_type text, p_target_id uuid, p_status text,
  p_reason text, p_source_document_id uuid default null, p_source_locator text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_curriculum_admin();
  if p_status not in ('proposed', 'confirmed', 'rejected') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'กรุณาระบุเหตุผลการจัดหมวด'; end if;
  if not exists (select 1 from public.curriculum_versions where id = p_version_id and school_id = private.current_school_id()) then raise exception 'ไม่พบฉบับหลักสูตร'; end if;
  if p_target_type not in ('subject', 'program', 'activity') or not private.curriculum_target_exists(p_version_id, p_target_type, p_target_id) then
    raise exception 'ไม่พบรายวิชา/แผนการเรียน/กิจกรรมในฉบับหลักสูตรนี้';
  end if;
  insert into public.curriculum_category_links (curriculum_version_id, category, target_type, target_id, status, reason, source_document_id, source_locator, decided_by, decided_at)
  values (p_version_id, p_category, p_target_type, p_target_id, p_status, btrim(p_reason), p_source_document_id, p_source_locator,
          case when p_status = 'proposed' then null else auth.uid() end, case when p_status = 'proposed' then null else now() end)
  on conflict (curriculum_version_id, category, target_type, target_id) do update
    set status = excluded.status, reason = excluded.reason, source_document_id = excluded.source_document_id, source_locator = excluded.source_locator,
        decided_by = excluded.decided_by, decided_at = excluded.decided_at
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- ทะเบียนเกณฑ์ (บันทึกจากต้นฉบับโดยคน)
create or replace function public.assessment_criterion_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status text;
begin
  perform private.require_curriculum_admin();
  if p_id is not null then
    select status into v_status from public.assessment_criteria where id = p_id and school_id = private.current_school_id() for update;
    if not found then raise exception 'ไม่พบเกณฑ์'; end if;
    if v_status = 'verified' then raise exception 'เกณฑ์ที่ยืนยันแล้วแก้ไขไม่ได้ — เปลี่ยนเป็นร่างก่อน'; end if;
  end if;
  insert into public.assessment_criteria as c (id, parent_id, seq, code, title_th, issuer, edition, year_be, quality_level, categories, report_section, requirement_th,
                                               source_document_id, source_locator, note)
  values (coalesce(p_id, gen_random_uuid()), nullif(p_data->>'parent_id', '')::uuid, coalesce((p_data->>'seq')::int, 1), p_data->>'code', p_data->>'title_th',
          nullif(p_data->>'issuer', ''), nullif(p_data->>'edition', ''), nullif(p_data->>'year_be', '')::int, nullif(p_data->>'quality_level', ''),
          coalesce(array(select jsonb_array_elements_text(p_data->'categories')), '{}'), nullif(p_data->>'report_section', ''), nullif(p_data->>'requirement_th', ''),
          nullif(p_data->>'source_document_id', '')::uuid, nullif(p_data->>'source_locator', ''), nullif(p_data->>'note', ''))
  on conflict (id) do update set parent_id = excluded.parent_id, seq = excluded.seq, code = excluded.code, title_th = excluded.title_th, issuer = excluded.issuer,
    edition = excluded.edition, year_be = excluded.year_be, quality_level = excluded.quality_level, categories = excluded.categories, report_section = excluded.report_section,
    requirement_th = excluded.requirement_th, source_document_id = excluded.source_document_id, source_locator = excluded.source_locator, note = excluded.note
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.assessment_criterion_verify(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_curriculum_admin();
  if p_status not in ('draft', 'verified', 'retired') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  update public.assessment_criteria set status = p_status,
         verified_by = case when p_status = 'verified' then auth.uid() else null end,
         verified_at = case when p_status = 'verified' then now() else null end
   where id = p_id and school_id = private.current_school_id();
  if not found then raise exception 'ไม่พบเกณฑ์'; end if;
end $$;

-- ---------------------------------------------------------------- หลักฐานตามเกณฑ์ (คนตรวจและยืนยันเท่านั้น)
create or replace function public.criteria_evidence_set(p_criterion_id uuid, p_version_id uuid, p_target_type text, p_target_id uuid, p_result text, p_status text,
  p_note text default null, p_source_document_id uuid default null, p_source_locator text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_curriculum_admin();
  if not exists (select 1 from public.assessment_criteria where id = p_criterion_id and school_id = private.current_school_id() and status <> 'retired') then raise exception 'ไม่พบเกณฑ์'; end if;
  if not private.curriculum_target_exists(p_version_id, p_target_type, p_target_id) then raise exception 'ไม่พบหลักฐานที่อ้างถึงในระบบ'; end if;
  insert into public.criteria_evidence (criterion_id, curriculum_version_id, target_type, target_id, result, status, note, source_document_id, source_locator, decided_by, decided_at)
  values (p_criterion_id, p_version_id, p_target_type, p_target_id, p_result, p_status, nullif(btrim(coalesce(p_note, '')), ''), p_source_document_id, p_source_locator,
          case when p_status = 'proposed' then null else auth.uid() end, case when p_status = 'proposed' then null else now() end)
  on conflict (criterion_id, curriculum_version_id, target_type, target_id) do update
    set result = excluded.result, status = excluded.status, note = excluded.note, source_document_id = excluded.source_document_id,
        source_locator = excluded.source_locator, decided_by = excluded.decided_by, decided_at = excluded.decided_at
  returning id into v_id;
  return v_id;
end $$;

revoke all on function private.curriculum_target_exists(uuid, text, uuid), private.require_curriculum_admin(),
  public.curriculum_category_set(uuid, text, text, uuid, text, text, uuid, text), public.assessment_criterion_save(uuid, jsonb),
  public.assessment_criterion_verify(uuid, text), public.criteria_evidence_set(uuid, uuid, text, uuid, text, text, text, uuid, text) from public, anon;
grant execute on function private.curriculum_target_exists(uuid, text, uuid), private.require_curriculum_admin() to authenticated;
grant execute on function public.curriculum_category_set(uuid, text, text, uuid, text, text, uuid, text), public.assessment_criterion_save(uuid, jsonb),
  public.assessment_criterion_verify(uuid, text), public.criteria_evidence_set(uuid, uuid, text, uuid, text, text, text, uuid, text) to authenticated;
