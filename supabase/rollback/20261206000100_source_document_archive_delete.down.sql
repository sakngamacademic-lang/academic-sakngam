-- =============================================================================
-- แผนย้อนกลับ (ROLLBACK) ของ migration 20261206000100_source_document_archive_delete
-- ⚠️ ไม่ใช่ migration อัตโนมัติ — รันเองใน SQL Editor หลังได้รับอนุมัติเท่านั้น
--
-- สิ่งที่ทำ: ปิดคำสั่งเก็บเข้าคลัง/ลบ และคืนโครงสร้าง status เดิม
-- สิ่งที่ไม่ทำ (เพื่อรักษาหลักฐาน):
--   · ไม่ลบตาราง source_document_events และไม่ลบ audit_logs (บันทึกเหตุการณ์ต้องคงอยู่)
--   · ไม่กู้แถวที่ถูกลบไปแล้วโดยอัตโนมัติ — ถ้าต้องกู้ ใช้ข้อมูลเดิมจาก audit_logs (ตัวอย่างท้ายไฟล์) และขออนุมัติแยก
-- เงื่อนไข: ถ้ายังมีเอกสารสถานะ archived ไฟล์นี้จะหยุดทันที (ต้องตัดสินก่อนว่าจะคืนสถานะเป็นอะไร)
-- =============================================================================
begin;

do $$
begin
  if exists (select 1 from public.source_documents where status = 'archived') then
    raise exception 'ยังมีเอกสารสถานะ archived % รายการ — ตัดสินก่อนว่าจะคืนเป็น registered/superseded แล้วจึงย้อนกลับ',
      (select count(*) from public.source_documents where status = 'archived');
  end if;
end $$;

-- 1. ปิดคำสั่ง (หน้าเว็บจะกลับไปโหมด “ยังไม่ติดตั้ง” และปิดปุ่มเอง)
drop function if exists public.source_document_delete(uuid, text);
drop function if exists public.source_document_archive(uuid, text);
drop function if exists public.source_document_reference_summary(uuid);
drop function if exists private.source_document_references(uuid);

-- 2. คืน check ของ status และลบคอลัมน์ archived_* (ไม่มีข้อมูลเพราะตรวจแล้วว่าไม่มีแถว archived)
alter table public.source_documents drop constraint if exists source_documents_archived_fields_check;
alter table public.source_documents drop constraint source_documents_status_check;
alter table public.source_documents add constraint source_documents_status_check
  check (status in ('registered', 'reviewed', 'superseded'));
alter table public.source_documents drop column if exists archive_reason, drop column if exists archived_by, drop column if exists archived_at;

-- 3. คง public.source_document_events ไว้ (append-only · RLS อ่านเฉพาะผู้ดูแลหลักสูตร/system_admin)

commit;

-- หลังรันสำเร็จ: ลบประวัติ migration ให้ตรงกับสภาพจริง (ทำหลังรันจริงเท่านั้น)
--   delete from supabase_migrations.schema_migrations where version = '20261206000100';

-- ตัวอย่างการตรวจรายการที่ถูกลบ (ไม่กู้อัตโนมัติ):
--   select record_id, created_at, actor_id, old_data ->> 'register_code' as code, old_data
--     from public.audit_logs where table_name = 'source_documents' and action = 'DELETE' order by created_at desc;
