-- =============================================================================
-- Migration: foundation
-- Phase 1.2 — Sak Ngam Academic Platform
--
-- - schema `private`: ฟังก์ชันภายใน (ไม่เปิดผ่าน Data API)
-- - ปิดการเปิดตาราง/ฟังก์ชันใหม่ให้ Data API อัตโนมัติ (ต้อง GRANT เองทุกครั้ง)
-- - enum app_role (6 บทบาทตาม Phase 0)
-- - trigger function set_updated_at()
--
-- Rollback plan: drop schema private cascade; drop type public.app_role;
--                และคืนค่า default privileges (ไม่แนะนำ)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) ห้าม Data API เห็นวัตถุใหม่โดยอัตโนมัติ
--    (ป้องกันกรณี hosted project ยังเปิด auto-expose ไว้ — local ตั้งใน config.toml แล้ว)
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- 2) schema private — ไม่อยู่ใน api.schemas จึงเรียกผ่าน REST/RPC ไม่ได้
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
-- authenticated ต้องมี USAGE เพื่อให้ RLS policy เรียก helper functions ได้
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) บทบาทผู้ใช้
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'system_admin',        -- ผู้ดูแลระบบ (IT)
  'academic_head',       -- หัวหน้าฝ่ายวิชาการ
  'academic_staff',      -- เจ้าหน้าที่วิชาการ / ทะเบียน / วัดผล
  'learning_area_head',  -- หัวหน้ากลุ่มสาระ (scope จะเพิ่มใน Phase 1.4)
  'executive',           -- ผู้บริหาร (อ่านอย่างเดียว)
  'teacher'              -- ครูผู้สอน
);
comment on type public.app_role is 'บทบาทผู้ใช้ระบบ — ดู docs/architecture/PHASE-0.md หัวข้อ 5';

-- ---------------------------------------------------------------------------
-- 4) updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
