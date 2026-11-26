-- หน้าเยี่ยมชมสาธารณะ (/visit): "อนุมัติให้เผยแพร่" แยกจาก "ยืนยันความถูกต้อง" (forward-only · เพิ่มตาราง/ฟังก์ชันใหม่ ไม่แก้ข้อมูลเดิม)
--  · การยืนยัน (curriculum_category_links.status = confirmed) ≠ การอนุมัติเผยแพร่ (public_releases.status = published)
--  · เผยแพร่ได้ 2 ชนิด: ฉบับหลักสูตร (curriculum_version) และเอกสาร PDF (source_document) — ผู้ดูแลหลักสูตร (academic_head) เท่านั้น
--  · เล่มกลุ่มสาระ: ผู้ดูแลเลือกกลุ่มสาระ + ระดับ (ม.ต้น/ม.ปลาย) เองตอนเผยแพร่ — ไม่เดาจากชื่อไฟล์
--  · anon ไม่ได้สิทธิ์ตารางใด ๆ: อ่านผ่าน public_visit_data() ที่คืนเฉพาะคอลัมน์ที่จำเป็นของรายการที่เผยแพร่ + ยืนยันแล้ว
--    ไม่คืนข้อมูลบุคคล, เหตุผลภายใน (reason), ผู้บันทึก หรือ object_key
--  · PDF: public_document_authorize() ให้เฉพาะ service_role (Edge Function public-document-url) → presigned URL อายุสั้น
--    bucket ยังเป็น private ตามเดิม
--  · Audit ทุกแถวด้วย private.audit_row_change()

create table public.public_releases (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  target_type        text not null check (target_type in ('curriculum_version', 'source_document')),
  target_id          uuid not null,
  learning_area_id   uuid,
  book_stage         text check (book_stage in ('lower', 'upper')),
  status             text not null default 'published' check (status in ('published', 'withdrawn')),
  note               text check (note is null or length(note) <= 1000),
  published_by       uuid not null default auth.uid() references auth.users (id),
  published_at       timestamptz not null default now(),
  withdrawn_by       uuid references auth.users (id),
  withdrawn_at       timestamptz,
  withdraw_reason    text check (withdraw_reason is null or length(withdraw_reason) <= 1000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (learning_area_id, school_id) references public.learning_areas (id, school_id) on delete restrict,
  -- เล่มกลุ่มสาระต้องระบุทั้งกลุ่มสาระและระดับพร้อมกัน · ฉบับหลักสูตรไม่มีทั้งสองค่า
  check ((learning_area_id is null) = (book_stage is null)),
  check (target_type = 'source_document' or learning_area_id is null),
  check ((status = 'withdrawn') = (withdrawn_at is not null and withdrawn_by is not null and length(btrim(coalesce(withdraw_reason, ''))) > 0))
);
create unique index public_releases_one_active on public.public_releases (school_id, target_type, target_id) where status = 'published';
create unique index public_releases_one_book on public.public_releases (school_id, learning_area_id, book_stage) where status = 'published' and learning_area_id is not null;
comment on table public.public_releases is 'อนุมัติให้เผยแพร่ต่อสาธารณะ (หน้า /visit) — แยกจากสถานะยืนยันความถูกต้องของข้อมูลหลักสูตร';

alter table public.public_releases enable row level security;
revoke all on public.public_releases from anon, authenticated;
grant select on public.public_releases to authenticated;
create policy public_releases_select on public.public_releases for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()));
create trigger public_releases_set_updated_at before update on public.public_releases for each row execute function private.set_updated_at();
create trigger public_releases_audit after insert or update or delete on public.public_releases for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- เผยแพร่ / ถอนการเผยแพร่ (ผู้ดูแลหลักสูตรเท่านั้น)
create or replace function public.public_release_publish(p_target_type text, p_target_id uuid, p_learning_area_id uuid default null,
  p_book_stage text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_school uuid := private.current_school_id(); v_id uuid;
begin
  perform private.require_curriculum_admin();
  if p_target_type = 'curriculum_version' then
    if p_learning_area_id is not null or p_book_stage is not null then raise exception 'ฉบับหลักสูตรไม่ต้องระบุกลุ่มสาระ/ระดับ'; end if;
    if not exists (select 1 from public.curriculum_versions where id = p_target_id and school_id = v_school and status <> 'retired') then
      raise exception 'ไม่พบฉบับหลักสูตร หรือฉบับนี้เลิกใช้แล้ว';
    end if;
  elsif p_target_type = 'source_document' then
    if not exists (
      select 1 from public.source_documents d join public.files f on f.id = d.file_id and f.school_id = d.school_id
       where d.id = p_target_id and d.school_id = v_school and d.status <> 'archived'
         and f.status = 'ready' and f.deleted_at is null and f.mime_type = 'application/pdf') then
      raise exception 'เผยแพร่ได้เฉพาะเอกสาร PDF ที่มีไฟล์ในระบบและยังไม่ถูกเก็บเข้าคลัง';
    end if;
    if (p_learning_area_id is null) <> (p_book_stage is null) then raise exception 'เล่มกลุ่มสาระต้องเลือกทั้งกลุ่มสาระและระดับ (ม.ต้น/ม.ปลาย)'; end if;
    if p_learning_area_id is not null and not exists (select 1 from public.learning_areas where id = p_learning_area_id and school_id = v_school) then
      raise exception 'ไม่พบกลุ่มสาระ';
    end if;
  else
    raise exception 'ชนิดรายการไม่ถูกต้อง';
  end if;
  insert into public.public_releases (target_type, target_id, learning_area_id, book_stage, note)
  values (p_target_type, p_target_id, p_learning_area_id, p_book_stage, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.public_release_withdraw(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_curriculum_admin();
  update public.public_releases set status = 'withdrawn', withdrawn_by = auth.uid(), withdrawn_at = now(), withdraw_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_id and school_id = private.current_school_id() and status = 'published';
  if not found then raise exception 'ไม่พบรายการที่เผยแพร่อยู่'; end if;
end $$;

revoke all on function public.public_release_publish(text, uuid, uuid, text, text), public.public_release_withdraw(uuid, text) from public, anon;
grant execute on function public.public_release_publish(text, uuid, uuid, text, text), public.public_release_withdraw(uuid, text) to authenticated;

-- ---------------------------------------------------------------- เอกสารที่เผยแพร่ (ใช้ภายในฟังก์ชันสาธารณะ)
create or replace function private.published_document_ids(p_school uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select r.target_id
    from public.public_releases r
    join public.source_documents d on d.id = r.target_id and d.school_id = r.school_id
    join public.files f on f.id = d.file_id and f.school_id = d.school_id
   where r.school_id = p_school and r.target_type = 'source_document' and r.status = 'published'
     and d.status <> 'archived' and f.status = 'ready' and f.deleted_at is null and f.mime_type = 'application/pdf'
$$;
revoke all on function private.published_document_ids(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- ข้อมูลหน้าเยี่ยมชม (anon อ่านได้ · อ่านอย่างเดียว)
-- คืน jsonb: version, items (รายการจัดประเภทที่ "ยืนยันแล้ว" ของฉบับที่ "เผยแพร่"), areas (กลุ่มสาระ), books (เล่มกลุ่มสาระที่เผยแพร่), documents
create or replace function public.public_visit_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rel public.public_releases; v_school uuid; v_out jsonb;
begin
  select r.* into v_rel from public.public_releases r
    join public.curriculum_versions v on v.id = r.target_id and v.school_id = r.school_id and v.status <> 'retired'
   where r.target_type = 'curriculum_version' and r.status = 'published'
   order by r.published_at desc limit 1;
  v_school := coalesce(v_rel.school_id,
    (select r.school_id from public.public_releases r where r.target_type = 'source_document' and r.status = 'published' order by r.published_at desc limit 1));
  if v_school is null then return jsonb_build_object('version', null, 'items', '[]'::jsonb, 'areas', '[]'::jsonb, 'books', '[]'::jsonb, 'documents', '[]'::jsonb); end if;

  with docs as (select private.published_document_ids(v_school) as id),
  links as (
    select l.* from public.curriculum_category_links l
     where v_rel.id is not null and l.curriculum_version_id = v_rel.target_id and l.school_id = v_school and l.status = 'confirmed'
  ),
  items as (
    select jsonb_build_object(
      'category', l.category, 'target_type', l.target_type, 'target_id', l.target_id,
      'code', s.code, 'name', coalesce(s.name_th, p.name_th, a.name_th),
      'subject_type', s.subject_type, 'credits', s.credits, 'hours', coalesce(s.learning_hours, a.activity_hours),
      'activity_type', a.activity_type, 'program_code', p.code,
      'grade_code', coalesce(gs.code, ga.code), 'program_stage', p.stage,
      'locator', coalesce(l.source_locator, s.source_locator, p.source_locator, a.source_locator),
      'document_id', (select d.id from docs d where d.id = coalesce(l.source_document_id, s.source_document_id, p.source_document_id, a.source_document_id))
    ) as j, coalesce(s.code, p.code, a.name_th) as k
      from links l
      left join public.subjects s on l.target_type = 'subject' and s.id = l.target_id and s.school_id = v_school
      left join public.grade_levels gs on gs.id = s.grade_level_id
      left join public.study_programs p on l.target_type = 'program' and p.id = l.target_id and p.school_id = v_school
      left join public.learning_activities a on l.target_type = 'activity' and a.id = l.target_id and a.school_id = v_school
      left join public.grade_levels ga on ga.id = a.grade_level_id
     where coalesce(s.id, p.id, a.id) is not null
  )
  select jsonb_build_object(
    'version', case when v_rel.id is null then null else (
      select jsonb_build_object('id', v.id, 'label', v.version_label, 'year_be', v.effective_year_be, 'status', v.status, 'curriculum_name', c.name_th)
        from public.curriculum_versions v join public.school_curricula c on c.id = v.school_curriculum_id where v.id = v_rel.target_id) end,
    'items', coalesce((select jsonb_agg(j order by k) from items), '[]'::jsonb),
    'areas', coalesce((select jsonb_agg(jsonb_build_object('id', la.id, 'name', la.name_th, 'code', la.code) order by la.sort_order, la.code)
                         from public.learning_areas la where la.school_id = v_school and la.is_active), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(jsonb_build_object('learning_area_id', r.learning_area_id, 'stage', r.book_stage, 'document_id', d.id,
                         'title', d.title, 'page_count', d.page_count, 'updated_at', greatest(r.published_at, d.updated_at)))
                         from public.public_releases r join public.source_documents d on d.id = r.target_id
                        where r.school_id = v_school and r.status = 'published' and r.learning_area_id is not null
                          and d.id in (select id from docs)), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'page_count', d.page_count, 'page_offset', d.page_offset) order by d.register_code)
                         from public.source_documents d where d.id in (select id from docs)), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.public_visit_data() from public;
grant execute on function public.public_visit_data() to anon, authenticated;

-- ---------------------------------------------------------------- อนุญาตออก URL PDF สาธารณะ (service_role เท่านั้น — เรียกจาก Edge Function)
create or replace function public.public_document_authorize(p_document_id uuid)
returns table (object_key text, original_name text, mime_type text)
language plpgsql security definer set search_path = '' as $$
declare v_file public.files;
begin
  select f.* into v_file from public.source_documents d join public.files f on f.id = d.file_id and f.school_id = d.school_id
   where d.id = p_document_id and d.id in (select private.published_document_ids(d.school_id));
  if not found then raise exception 'ไม่พบเอกสาร หรือเอกสารนี้ยังไม่ได้รับอนุมัติให้เผยแพร่' using errcode = 'insufficient_privilege'; end if;
  perform private.log_file_event(v_file, 'download_url_issued', jsonb_build_object('public', true, 'source_document_id', p_document_id));
  return query select v_file.object_key, v_file.original_name, v_file.mime_type;
end $$;
revoke all on function public.public_document_authorize(uuid) from public, anon, authenticated;
grant execute on function public.public_document_authorize(uuid) to service_role;
