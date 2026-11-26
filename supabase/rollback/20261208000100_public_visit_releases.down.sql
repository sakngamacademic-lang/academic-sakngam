-- =============================================================================
-- แผนย้อนกลับ migration 20261208000100_public_visit_releases
-- ⚠️ ไม่ใช่ migration อัตโนมัติ — รันเองใน SQL Editor หลังได้รับอนุมัติเท่านั้น
-- ผลกระทบ: หน้า /visit จะไม่แสดงข้อมูล (ทุกอย่างกลับเป็นไม่เผยแพร่) · ไม่แตะข้อมูลหลักสูตร ไฟล์ หรือ audit_logs
-- ประวัติการเผยแพร่ยังอยู่ใน audit_logs · ถ้าต้องการเก็บตารางไว้ ให้สำรองก่อน:
--    pg_dump "$STAGING_DB_URL" -Fc -t public.public_releases -f public-releases-$(date +%Y%m%d).dump
-- =============================================================================
begin;
drop function if exists public.public_document_authorize(uuid);
drop function if exists public.public_visit_data();
drop function if exists private.published_document_ids(uuid);
drop function if exists public.public_release_withdraw(uuid, text);
drop function if exists public.public_release_publish(text, uuid, uuid, text, text);
drop table if exists public.public_releases;
commit;
