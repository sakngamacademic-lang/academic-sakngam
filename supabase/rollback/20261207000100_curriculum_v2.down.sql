-- =============================================================================
-- แผนย้อนกลับ migration 20261207000100_curriculum_v2
-- ⚠️ ไม่ใช่ migration อัตโนมัติ — รันเองใน SQL Editor หลังได้รับอนุมัติเท่านั้น
-- ผลกระทบ: ลบเฉพาะวัตถุ cv2_* (ข้อมูลหลักสูตร V2) · ไม่แตะตารางหลักสูตรเดิม ไฟล์ หรือ audit_logs
-- เงื่อนไข: ถ้ามีหลักสูตร V2 ที่ approved/active จะหยุดทันที · ถ้ามีข้อมูล V2 ให้สำรองก่อน (ขั้นตอน 0)
-- =============================================================================
-- 0) สำรองข้อมูล V2 ก่อน (รันจากเครื่องที่มีสิทธิ์ — ไม่ใช่ SQL Editor):
--    pg_dump "$STAGING_DB_URL" -Fc -t 'public.cv2_*' -f cv2-backup-$(date +%Y%m%d).dump
--    ตรวจว่ากู้คืนได้: pg_restore --list cv2-backup-YYYYMMDD.dump
begin;
do $$
begin
  if exists (select 1 from public.cv2_curricula where status in ('approved', 'active')) then
    raise exception 'มีหลักสูตร V2 ที่อนุมัติ/ใช้งานแล้ว — ห้ามย้อนกลับจนกว่าจะมีมติ';
  end if;
end $$;
drop function if exists public.cv2_remove_source(uuid, text);
drop function if exists public.cv2_set_primary(uuid, uuid);
drop function if exists public.cv2_import_source(int, text, jsonb, jsonb, jsonb);
alter table public.cv2_curricula drop constraint if exists cv2_curricula_primary_fk;
drop table if exists public.cv2_rows;
drop table if exists public.cv2_descriptions;
drop table if exists public.cv2_sources;
drop table if exists public.cv2_curricula;
drop table if exists public.cv2_import_log;   -- สำรองไว้แล้วในขั้นตอน 0 · การเปลี่ยนแปลงยังอยู่ใน audit_logs
drop function if exists private.cv2_can_read(uuid);
commit;
-- หลังรันจริง: delete from supabase_migrations.schema_migrations where version = '20261207000100';
