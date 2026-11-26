-- เล่มนำเสนอหลักสูตรแบบถาวร (forward-only · เพิ่มตาราง/ฟังก์ชันใหม่ ไม่แก้และไม่ลบข้อมูลเดิม)
--  · ไฟล์ PDF อยู่ใน Cloudflare R2 (ผ่านระบบ files เดิม · bucket private) · ตำแหน่ง/ระดับ/กลุ่มสาระอยู่ในตารางนี้
--    → เปลี่ยนเครื่อง เปลี่ยนลิงก์ หรือ Deploy ใหม่ เอกสารไม่หาย (เดิมเก็บใน IndexedDB ของเบราว์เซอร์ ผูกกับลิงก์)
--  · เล่มกลุ่มสาระ: 1 เล่มต่อกลุ่มสาระต่อระดับ (ม.ต้น / ม.ปลาย) — เปลี่ยนไฟล์ = แถวเดิมเป็น replaced (ไม่ลบ) แล้วเพิ่มแถวใหม่
--  · นำออก = status removed (ไฟล์และทะเบียนเอกสารต้นทางยังอยู่)
--  · สิทธิ์: เล่มโรงเรียน = ผู้ดูแลหลักสูตร · เล่ม/แผนของกลุ่มสาระ = ผู้ดูแลหลักสูตร หรือหัวหน้ากลุ่มสาระที่ได้รับมอบหมาย
--    (private.can_edit_curriculum_area) · เขียนผ่าน RPC เท่านั้น · อ่านตามสิทธิ์ผู้อ่านหลักสูตร · Audit ทุกแถว
--  · การเผยแพร่สาธารณะยังใช้ public_releases เดิม (แยกจากตารางนี้)

create table public.presentation_items (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  kind                text not null check (kind in ('school_book', 'area_book', 'lesson_plan')),
  learning_area_id    uuid,
  stage               text check (stage in ('lower', 'upper')),
  source_document_id  uuid not null,
  title               text not null check (length(btrim(title)) between 1 and 300),
  meta                jsonb,
  status              text not null default 'active' check (status in ('active', 'replaced', 'removed')),
  ended_by            uuid references auth.users (id),
  ended_at            timestamptz,
  end_reason          text check (end_reason is null or length(end_reason) <= 1000),
  created_by          uuid not null default auth.uid() references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (learning_area_id, school_id) references public.learning_areas (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  check ((kind = 'school_book') = (learning_area_id is null)),
  check ((kind = 'area_book') = (stage is not null)),
  check ((status = 'active') = (ended_at is null))
);
create unique index presentation_items_one_book on public.presentation_items (school_id, learning_area_id, stage) where status = 'active' and kind = 'area_book';
create unique index presentation_items_one_doc on public.presentation_items (school_id, source_document_id) where status = 'active';
create index presentation_items_school_idx on public.presentation_items (school_id, status, kind);
comment on table public.presentation_items is 'เล่มนำเสนอหลักสูตร: ชี้ไปยังเอกสารต้นทาง (ไฟล์ใน R2) พร้อมกลุ่มสาระและระดับ ม.ต้น/ม.ปลาย';

alter table public.presentation_items enable row level security;
revoke all on public.presentation_items from anon, authenticated;
grant select on public.presentation_items to authenticated;
create policy presentation_items_select on public.presentation_items for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()));
create trigger presentation_items_set_updated_at before update on public.presentation_items for each row execute function private.set_updated_at();
create trigger presentation_items_audit after insert or update or delete on public.presentation_items for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- สิทธิ์จัดการรายการ
create or replace function private.require_presentation_editor(p_kind text, p_learning_area_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_human();
  if p_kind = 'school_book' then
    if not private.is_curriculum_admin() then raise exception 'เฉพาะผู้ดูแลหลักสูตรจัดการเล่มหลักสูตรสถานศึกษาได้' using errcode = 'insufficient_privilege'; end if;
  elsif not coalesce(private.can_edit_curriculum_area(p_learning_area_id), false) then
    raise exception 'เฉพาะผู้ดูแลหลักสูตร หรือหัวหน้ากลุ่มสาระที่ได้รับมอบหมาย' using errcode = 'insufficient_privilege';
  end if;
end $$;
revoke all on function private.require_presentation_editor(text, uuid) from public, anon;

-- ---------------------------------------------------------------- แนบเล่ม/แผน
-- p_file_id = ไฟล์ที่เพิ่งอัปโหลด (ลงทะเบียนเป็นเอกสารต้นทางให้) · หรือ p_source_document_id = เอกสารที่อยู่ในระบบแล้ว
create or replace function public.presentation_item_attach(p_kind text, p_learning_area_id uuid, p_stage text, p_title text,
  p_file_id uuid default null, p_source_document_id uuid default null, p_page_count int default null, p_meta jsonb default null, p_replace boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_school uuid := private.current_school_id(); v_file public.files; v_doc uuid; v_old public.presentation_items; v_id uuid; v_title text := btrim(coalesce(p_title, ''));
begin
  if p_kind not in ('school_book', 'area_book', 'lesson_plan') then raise exception 'ชนิดรายการไม่ถูกต้อง'; end if;
  perform private.require_presentation_editor(p_kind, p_learning_area_id);
  if p_kind = 'school_book' and (p_learning_area_id is not null or p_stage is not null) then raise exception 'เล่มหลักสูตรสถานศึกษาไม่ต้องระบุกลุ่มสาระ/ระดับ'; end if;
  if p_kind <> 'school_book' and not exists (select 1 from public.learning_areas where id = p_learning_area_id and school_id = v_school) then raise exception 'ไม่พบกลุ่มสาระ'; end if;
  if p_kind = 'area_book' and p_stage is null then raise exception 'เลือกระดับ (ม.ต้น / ม.ปลาย) ของเล่มก่อน'; end if;
  if p_kind = 'lesson_plan' and p_stage is not null then raise exception 'แผนการสอนไม่ต้องระบุระดับ'; end if;
  if (p_file_id is null) = (p_source_document_id is null) then raise exception 'ระบุไฟล์ที่อัปโหลด หรือเอกสารในระบบ อย่างใดอย่างหนึ่ง'; end if;
  if v_title = '' then raise exception 'กรุณาระบุชื่อ'; end if;

  if p_source_document_id is not null then
    select d.id into v_doc from public.source_documents d join public.files f on f.id = d.file_id and f.school_id = d.school_id
     where d.id = p_source_document_id and d.school_id = v_school and d.status <> 'archived'
       and f.status = 'ready' and f.deleted_at is null and f.mime_type = 'application/pdf';
    if not found then raise exception 'ไม่พบเอกสาร PDF นี้ในระบบ หรือเอกสารถูกเก็บเข้าคลังแล้ว'; end if;
  else
    select f.* into v_file from public.files f join public.documents d on d.id = f.document_id and d.school_id = f.school_id
     where f.id = p_file_id and f.school_id = v_school and d.kind = 'curriculum_source'
       and f.status = 'ready' and f.deleted_at is null and f.mime_type = 'application/pdf';
    if not found then raise exception 'ไม่พบไฟล์ PDF ที่อัปโหลด หรือไฟล์ยังไม่ผ่านการตรวจ'; end if;
    select d.id into v_doc from public.source_documents d where d.file_id = p_file_id and d.school_id = v_school;
    if v_doc is null then
      insert into public.source_documents (school_id, title, doc_type, content_status, learning_area_id, grade_scope, page_count, file_id, sha256, notes)
      values (v_school, left(v_title, 300),
              case p_kind when 'school_book' then 'curriculum_book' when 'area_book' then 'learning_area_curriculum' else 'other' end, 'has_content',
              p_learning_area_id, case p_stage when 'lower' then 'ม.1-3' when 'upper' then 'ม.4-6' end,
              case when p_page_count > 0 then p_page_count end, p_file_id, v_file.sha256, 'แนบจากหน้านำเสนอเล่มหลักสูตร · ไฟล์ ' || v_file.original_name)
      returning id into v_doc;
    end if;
  end if;

  if p_kind = 'area_book' then
    select * into v_old from public.presentation_items
     where school_id = v_school and kind = 'area_book' and learning_area_id = p_learning_area_id and stage = p_stage and status = 'active' for update;
    if found then
      if not p_replace then raise exception 'ช่องนี้มีเล่มอยู่แล้ว — ใช้ “เปลี่ยนไฟล์” ถ้าต้องการแทนที่' using errcode = 'unique_violation'; end if;
      if exists (select 1 from public.public_releases r where r.school_id = v_school and r.target_type = 'source_document' and r.target_id = v_old.source_document_id and r.status = 'published') then
        raise exception 'เล่มเดิมกำลังเผยแพร่อยู่ — ถอนการเผยแพร่ก่อนเปลี่ยนไฟล์';
      end if;
      update public.presentation_items set status = 'replaced', ended_by = auth.uid(), ended_at = now(), end_reason = 'เปลี่ยนไฟล์' where id = v_old.id;
    end if;
  end if;

  insert into public.presentation_items (kind, learning_area_id, stage, source_document_id, title, meta)
  values (p_kind, p_learning_area_id, p_stage, v_doc, left(v_title, 300), p_meta) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- นำออก (ไม่ลบไฟล์ ไม่ลบทะเบียนเอกสาร)
create or replace function public.presentation_item_remove(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.presentation_items;
begin
  select * into v_item from public.presentation_items where id = p_id and school_id = private.current_school_id() and status = 'active' for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  perform private.require_presentation_editor(v_item.kind, v_item.learning_area_id);
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'กรุณาระบุเหตุผล' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.public_releases r where r.school_id = v_item.school_id and r.target_type = 'source_document' and r.target_id = v_item.source_document_id and r.status = 'published') then
    raise exception 'เล่มนี้กำลังเผยแพร่อยู่ — ถอนการเผยแพร่ก่อนนำออก';
  end if;
  update public.presentation_items set status = 'removed', ended_by = auth.uid(), ended_at = now(), end_reason = btrim(p_reason) where id = p_id;
end $$;

revoke all on function public.presentation_item_attach(text, uuid, text, text, uuid, uuid, int, jsonb, boolean), public.presentation_item_remove(uuid, text) from public, anon;
grant execute on function public.presentation_item_attach(text, uuid, text, text, uuid, uuid, int, jsonb, boolean), public.presentation_item_remove(uuid, text) to authenticated;

-- ---------------------------------------------------------------- นำเล่มที่เผยแพร่ไว้แล้วเข้ามา (เพิ่มอย่างเดียว ไม่แก้ของเดิม)
insert into public.presentation_items (school_id, kind, learning_area_id, stage, source_document_id, title, created_by)
select r.school_id, case when r.learning_area_id is null then 'school_book' else 'area_book' end, r.learning_area_id, r.book_stage, d.id, d.title, r.published_by
  from public.public_releases r join public.source_documents d on d.id = r.target_id and d.school_id = r.school_id
 where r.target_type = 'source_document' and r.status = 'published' and d.status <> 'archived'
on conflict do nothing;
