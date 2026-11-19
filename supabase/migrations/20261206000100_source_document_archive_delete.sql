-- =============================================================================
-- Migration: source_document_archive_delete
-- เก็บเข้าคลัง / ลบรายการทะเบียนเอกสารต้นทาง (source_documents) อย่างปลอดภัย
--
-- ของเดิมที่ตรวจแล้ว (Staging):
--   · source_documents: RLS select (curriculum_reader_role) / insert, update (is_curriculum_admin)
--     ไม่มี policy/grant DELETE · คอลัมน์ status แก้ผ่านหน้าเว็บไม่ได้ (ไม่อยู่ใน column grant)
--   · FK 24 รายการที่ชี้มาที่ source_documents เป็น ON DELETE RESTRICT ทั้งหมด (รวม parent_id / duplicate_of_id)
--   · trigger: source_documents_audit (private.audit_row_change) · lock_columns · set_updated_at · assign_code
--
-- สิ่งที่เพิ่ม:
--   1. status 'archived' (แยกจาก 'superseded') + archived_at / archived_by / archive_reason
--   2. source_document_events — บันทึกเหตุการณ์แบบ append-only (รวมกรณีถูกปฏิเสธ) ไม่มี FK เพื่อให้คงอยู่หลังลบ
--   3. private.source_document_references() — ตรวจการอ้างอิงจาก catalog (FK ทุกตัวที่ชี้มา) ไม่ใช้รายการคงที่
--   4. RPC: source_document_reference_summary / source_document_archive / source_document_delete
--
-- หลักการ:
--   · เก็บเข้าคลังไม่แตะแถวที่อ้างอิง ความสัมพันธ์กับหลักฐานเดิมคงอยู่ครบ
--   · ลบถาวรได้เฉพาะเมื่อไม่มีการอ้างอิง — ตรวจซ้ำในธุรกรรมเดียวกันหลังล็อกแถว (FOR UPDATE)
--     ถ้าตรวจการอ้างอิงไม่สำเร็จ → ปฏิเสธ (ไม่ลบ) และบันทึกเหตุการณ์
--   · ไม่ลบไฟล์ในตาราง files และไม่ลบวัตถุใน Storage ไม่ cascade
--   · เฉพาะผู้ดูแลหลักสูตร (private.require_curriculum_admin = มนุษย์ + is_curriculum_admin) ไม่เพิ่มบทบาท/สิทธิ์ใหม่
-- forward-only
-- =============================================================================

-- ---------------------------------------------------------------- 1. สถานะ archived
alter table public.source_documents drop constraint source_documents_status_check;
alter table public.source_documents add constraint source_documents_status_check
  check (status in ('registered', 'reviewed', 'superseded', 'archived'));
alter table public.source_documents
  add column archived_at timestamptz,
  add column archived_by uuid,
  add column archive_reason text;
alter table public.source_documents add constraint source_documents_archived_fields_check
  check ((status = 'archived') = (archived_at is not null and archived_by is not null and length(btrim(coalesce(archive_reason, ''))) > 0));
comment on column public.source_documents.archived_at is 'เวลาที่เก็บเข้าคลัง (เลิกใช้งาน) — แถวที่อ้างอิงยังคงอยู่';
-- คอลัมน์ใหม่ไม่ถูก grant ให้ authenticated → แก้ได้ผ่าน RPC เท่านั้น

-- ---------------------------------------------------------------- 2. เหตุการณ์ (append-only)
create table public.source_document_events (
  id                  bigint generated always as identity primary key,
  school_id           uuid not null references public.schools (id) on delete restrict,
  source_document_id  uuid not null,          -- ไม่มี FK: ต้องคงอยู่หลังลบรายการทะเบียน
  register_code       text not null,
  title               text not null,
  actor_id            uuid not null,
  event               text not null check (event in ('archived', 'archive_rejected', 'deleted', 'delete_rejected')),
  reason              text not null check (length(btrim(reason)) > 0),
  detail              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
comment on table public.source_document_events is 'เหตุการณ์เก็บเข้าคลัง/ลบทะเบียนเอกสารต้นทาง (append-only) รวมกรณีถูกปฏิเสธ — ใคร ทำอะไร เมื่อใด ผลอย่างไร';
create index source_document_events_doc_idx on public.source_document_events (source_document_id, created_at);
create index source_document_events_school_idx on public.source_document_events (school_id, created_at desc);
create trigger source_document_events_no_update_delete before update or delete on public.source_document_events
  for each row execute function private.prevent_audit_mutation();

alter table public.source_document_events enable row level security;
revoke all on public.source_document_events from anon, authenticated;
grant select on public.source_document_events to authenticated;
create policy source_document_events_select on public.source_document_events for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_curriculum_admin() or private.has_role('system_admin')));

-- ---------------------------------------------------------------- 3. ตรวจการอ้างอิงจาก catalog
-- คืน [{table, column, count}] เฉพาะที่ count > 0 · ใช้ FK ทุกตัวที่ชี้มาที่ source_documents (ตารางใหม่ในอนาคตถูกตรวจอัตโนมัติ)
-- security definer: นับครบโดยไม่ขึ้นกับ RLS ของผู้เรียก (ผู้เรียกต้องผ่าน require_curriculum_admin ก่อนใน RPC)
create or replace function private.source_document_references(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v_n bigint;
  v_out jsonb := '[]'::jsonb;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join lateral unnest(c.conkey) k(attnum) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f' and c.confrelid = 'public.source_documents'::regclass and a.attname <> 'school_id'
     order by 1, 2
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using p_id;
    if v_n > 0 then
      v_out := v_out || jsonb_build_object('table', r.tbl::text, 'column', r.col, 'count', v_n);
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function private.source_document_references(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. RPC
-- สรุปการอ้างอิง (ให้หน้าเว็บใช้แทนการนับฝั่ง client)
create or replace function public.source_document_reference_summary(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_doc public.source_documents;
begin
  perform private.require_curriculum_admin();
  select * into v_doc from public.source_documents where id = p_id and school_id = private.current_school_id();
  if not found then raise exception 'ไม่พบเอกสารในทะเบียน'; end if;
  return jsonb_build_object('id', v_doc.id, 'register_code', v_doc.register_code, 'status', v_doc.status,
    'references', private.source_document_references(v_doc.id));
end $$;

-- เก็บเข้าคลัง: ไม่แตะความสัมพันธ์ใด ๆ
create or replace function public.source_document_archive(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_doc public.source_documents; v_uid uuid := auth.uid(); v_refs jsonb;
begin
  perform private.require_curriculum_admin();
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'กรุณาระบุเหตุผลการเก็บเข้าคลัง'; end if;
  select * into v_doc from public.source_documents where id = p_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบเอกสารในทะเบียน'; end if;
  if v_doc.status = 'archived' then
    insert into public.source_document_events (school_id, source_document_id, register_code, title, actor_id, event, reason, detail)
    values (v_doc.school_id, v_doc.id, v_doc.register_code, v_doc.title, v_uid, 'archive_rejected', btrim(p_reason), jsonb_build_object('cause', 'already_archived'));
    return jsonb_build_object('result', 'rejected', 'cause', 'already_archived');
  end if;
  v_refs := private.source_document_references(v_doc.id);
  update public.source_documents
     set status = 'archived', archived_at = now(), archived_by = v_uid, archive_reason = btrim(p_reason)
   where id = v_doc.id;
  insert into public.source_document_events (school_id, source_document_id, register_code, title, actor_id, event, reason, detail)
  values (v_doc.school_id, v_doc.id, v_doc.register_code, v_doc.title, v_uid, 'archived', btrim(p_reason),
          jsonb_build_object('previous_status', v_doc.status, 'references', v_refs));
  return jsonb_build_object('result', 'archived', 'references', v_refs);
end $$;

-- ลบถาวร (เฉพาะรายการทะเบียน): ตรวจการอ้างอิงซ้ำหลังล็อกแถวในธุรกรรมเดียวกัน
-- การล็อก FOR UPDATE ทำให้ธุรกรรมอื่นที่จะเพิ่มแถวอ้างอิง (ต้องใช้ FOR KEY SHARE) ต้องรอ → ไม่มีช่องว่างระหว่างตรวจกับลบ
-- ถูกปฏิเสธ → คืนผล rejected (ไม่ raise) เพื่อให้บันทึกเหตุการณ์คงอยู่
create or replace function public.source_document_delete(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_doc public.source_documents; v_uid uuid := auth.uid(); v_refs jsonb; v_err text;
begin
  perform private.require_curriculum_admin();
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'กรุณาระบุเหตุผลการลบ'; end if;
  select * into v_doc from public.source_documents where id = p_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบเอกสารในทะเบียน'; end if;

  begin
    v_refs := private.source_document_references(v_doc.id);
  exception when others then
    get stacked diagnostics v_err = message_text;
    insert into public.source_document_events (school_id, source_document_id, register_code, title, actor_id, event, reason, detail)
    values (v_doc.school_id, v_doc.id, v_doc.register_code, v_doc.title, v_uid, 'delete_rejected', btrim(p_reason),
            jsonb_build_object('cause', 'reference_check_failed', 'error', v_err));
    return jsonb_build_object('result', 'rejected', 'cause', 'reference_check_failed');
  end;

  if jsonb_array_length(v_refs) > 0 then
    insert into public.source_document_events (school_id, source_document_id, register_code, title, actor_id, event, reason, detail)
    values (v_doc.school_id, v_doc.id, v_doc.register_code, v_doc.title, v_uid, 'delete_rejected', btrim(p_reason),
            jsonb_build_object('cause', 'referenced', 'references', v_refs));
    return jsonb_build_object('result', 'rejected', 'cause', 'referenced', 'references', v_refs);
  end if;

  delete from public.source_documents where id = v_doc.id;   -- audit_row_change บันทึกข้อมูลเดิมทั้งแถว · FK RESTRICT ยังป้องกันซ้ำอีกชั้น
  insert into public.source_document_events (school_id, source_document_id, register_code, title, actor_id, event, reason, detail)
  values (v_doc.school_id, v_doc.id, v_doc.register_code, v_doc.title, v_uid, 'deleted', btrim(p_reason),
          jsonb_build_object('file_id', v_doc.file_id, 'storage', 'not_deleted', 'previous_status', v_doc.status));
  return jsonb_build_object('result', 'deleted', 'file_id', v_doc.file_id, 'storage', 'not_deleted');
end $$;

revoke all on function public.source_document_reference_summary(uuid), public.source_document_archive(uuid, text),
  public.source_document_delete(uuid, text) from public, anon;
grant execute on function public.source_document_reference_summary(uuid), public.source_document_archive(uuid, text),
  public.source_document_delete(uuid, text) to authenticated;
