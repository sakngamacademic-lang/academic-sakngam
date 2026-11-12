-- =============================================================================
-- Migration: get_my_access
-- Phase 1.3 — RPC เดียวสำหรับ frontend อ่าน "สิทธิ์ของฉัน" จากฐานข้อมูล
--   * คืนข้อมูลของผู้เรียกเท่านั้น (auth.uid()) — ไม่รับพารามิเตอร์
--   * roles ว่างเสมอ หากบัญชี/โรงเรียนถูกระงับ หรือยังไม่ผูกโรงเรียน
--   * เป็นข้อมูลสำหรับ UI เท่านั้น สิทธิ์จริงยังบังคับด้วย RLS
--
-- Rollback plan: drop function public.get_my_access();
-- =============================================================================

create or replace function public.get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id',      p.id,
    'email',        p.email,
    'display_name', p.display_name,
    'is_active',    p.is_active and coalesce(s.is_active, false),
    'account_status', case
                        when not p.is_active then 'suspended'
                        when s.id is null then 'no_school'
                        when not s.is_active then 'school_inactive'
                        else 'active'
                      end,
    'school', case when s.id is not null and s.is_active
                   then jsonb_build_object('id', s.id, 'code', s.code, 'name_th', s.name_th)
              end,
    'roles', case when p.is_active and coalesce(s.is_active, false)
                  then coalesce((
                    select jsonb_agg(ur.role order by ur.role)
                    from public.user_roles ur
                    where ur.user_id = p.id and ur.school_id = p.school_id
                  ), '[]'::jsonb)
                  else '[]'::jsonb
             end
  )
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  where p.id = (select auth.uid())
$$;

comment on function public.get_my_access() is 'ข้อมูลบัญชีและบทบาทของผู้ใช้ปัจจุบัน (สำหรับ UI) — Phase 1.3';
revoke all on function public.get_my_access() from public, anon;
grant execute on function public.get_my_access() to authenticated;
