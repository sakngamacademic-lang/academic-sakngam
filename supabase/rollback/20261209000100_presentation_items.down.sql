-- =============================================================================
-- แผนย้อนกลับ migration 20261209000100_presentation_items
-- ⚠️ ไม่ใช่ migration อัตโนมัติ — รันเองใน SQL Editor หลังได้รับอนุมัติเท่านั้น
-- ผลกระทบ: หน้านำเสนอเล่มจะไม่มีรายการ (ตำแหน่งเล่ม ม.ต้น/ม.ปลาย หาย) · ไฟล์ใน R2, files, source_documents, public_releases ไม่ถูกแตะ
-- สำรองก่อนทุกครั้ง:
--    pg_dump "$DB_URL" -Fc -t public.presentation_items -f presentation-items-$(date +%Y%m%d).dump
-- =============================================================================
begin;
drop function if exists public.presentation_item_remove(uuid, text);
drop function if exists public.presentation_item_attach(text, uuid, text, text, uuid, uuid, int, jsonb, boolean);
drop function if exists private.require_presentation_editor(text, uuid);
drop table if exists public.presentation_items;
commit;
