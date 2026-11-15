-- =============================================================================
-- ให้บทบาทเพิ่มแก่ "บัญชีที่มีอยู่แล้ว" ของโรงเรียนที่ bootstrap เสร็จแล้ว (เช่น ผู้ตรวจคนที่สอง = academic_staff)
-- - เรียกได้เฉพาะ postgres ผ่าน SQL Editor (ไม่เปิดผ่าน API / service_role) · dry run เป็นค่าเริ่มต้น · ต้องมีเหตุผล · บันทึก audit
-- - ไม่สร้างบัญชี · ไม่แก้ role ที่มีอยู่ · ไม่ให้ academic_head / system_admin (ใช้ bootstrap สำหรับคนแรกเท่านั้น)
-- - ต้องยืนยันอีเมลแล้ว · ผูกโรงเรียนเดียวกันแล้ว (หรือยังว่างและตรงกับ app_metadata.school_id)
-- =============================================================================
create or replace function private.grant_school_role(p_email text, p_school_code text, p_role public.app_role, p_reason text, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users;
  v_school public.schools;
  v_profile public.profiles;
  v_plan jsonb;
  v_has boolean;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ทำได้เฉพาะเจ้าของโปรเจกต์ผ่าน SQL (session_user = %)', session_user using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร'; end if;
  if p_role not in ('academic_staff', 'executive', 'teacher', 'learning_area_head') then
    raise exception 'ฟังก์ชันนี้ให้ได้เฉพาะ academic_staff / executive / teacher / learning_area_head (หัวหน้าฝ่ายวิชาการและผู้ดูแลระบบใช้ขั้นตอน bootstrap)';
  end if;
  if p_role = 'learning_area_head' then raise exception 'หัวหน้ากลุ่มสาระต้องระบุกลุ่มสาระ — กำหนดผ่านระบบโดยผู้ดูแล'; end if;
  select * into v_user from auth.users where lower(email) = lower(btrim(p_email)) and deleted_at is null;
  if not found then raise exception 'ไม่พบบัญชี % (สร้างบัญชีด้วย Invite ใน Dashboard ก่อน — ฟังก์ชันนี้ไม่สร้างบัญชี)', p_email; end if;
  if v_user.email_confirmed_at is null then raise exception 'บัญชียังไม่ยืนยันอีเมล'; end if;
  if v_user.banned_until is not null and v_user.banned_until > now() then raise exception 'บัญชีถูกระงับ'; end if;
  select * into v_school from public.schools where code = p_school_code and is_active;
  if not found then raise exception 'ไม่พบโรงเรียน % ที่เปิดใช้งาน', p_school_code; end if;
  if not exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id and p.is_active
                  where ur.school_id = v_school.id and ur.role in ('academic_head', 'system_admin')) then
    raise exception 'โรงเรียนนี้ยังไม่ได้ bootstrap ผู้ดูแลคนแรก';
  end if;
  select * into v_profile from public.profiles where id = v_user.id;
  if not found or not v_profile.is_active then raise exception 'ไม่พบ profile ที่ใช้งานได้ของบัญชีนี้'; end if;
  if v_profile.school_id is not null and v_profile.school_id <> v_school.id then raise exception 'profile ผูกโรงเรียนอื่นอยู่แล้ว'; end if;
  if exists (select 1 from public.user_roles where user_id = v_user.id and school_id = v_school.id and role = 'academic_head') then
    raise exception 'บัญชีนี้เป็นหัวหน้าฝ่ายวิชาการอยู่แล้ว — ใช้บัญชีคนละคนกับผู้อนุมัติเพื่อรักษา Two-person approval';
  end if;
  select exists (select 1 from public.user_roles where user_id = v_user.id and school_id = v_school.id and role = p_role) into v_has;
  v_plan := jsonb_build_object('user_id', v_user.id, 'email', v_user.email, 'school', v_school.code, 'role', p_role,
                               'set_profile_school', v_profile.school_id is null, 'already_has_role', v_has, 'dry_run', p_dry_run);
  if p_dry_run or v_has then return v_plan; end if;
  if v_profile.school_id is null then update public.profiles set school_id = v_school.id where id = v_user.id; end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('school_id', v_school.id) where id = v_user.id;
  insert into public.user_roles (user_id, school_id, role, granted_by) values (v_user.id, v_school.id, p_role, null);
  insert into public.audit_logs (school_id, actor_id, table_name, record_id, action, new_data)
  values (v_school.id, null, 'role_grant', v_user.id, 'INSERT', v_plan || jsonb_build_object('reason', btrim(p_reason), 'session_user', session_user, 'executed_at', now()));
  return v_plan;
end;
$$;
revoke all on function private.grant_school_role(text, text, public.app_role, text, boolean) from public, anon, authenticated, service_role;
