-- =============================================================================
-- Bootstrap บทบาทแรกของโรงเรียน (ครั้งเดียว · ตรวจสอบได้ · มี Audit Log)
--
-- ปัญหา: user_roles เขียนได้เฉพาะ system_admin → บัญชีแรกของโรงเรียนไม่มีใครให้สิทธิ์ได้ (chicken-and-egg)
-- ทางแก้: ฟังก์ชันใน schema private ที่ "ไม่เปิดผ่าน API" — เรียกได้เฉพาะ role postgres (SQL Editor / psql ของเจ้าของโปรเจกต์)
--   * anon / authenticated / service_role เรียกไม่ได้ (ไม่ต้องใช้หรือเปิดเผย Service Role Key)
--   * ไม่แก้ RLS · ไม่เปิด self signup · ไม่สร้างหรือลบบัญชี (บัญชีต้องมีอยู่และยืนยันอีเมลแล้ว)
--   * ทำงานได้เฉพาะเมื่อโรงเรียนยังไม่มี system_admin หรือ academic_head ที่ใช้งานอยู่ (บัญชีแรกเท่านั้น)
--   * ผูก profile.school_id (ถ้ายังว่าง) + ตั้ง app_metadata.school_id ให้ตรงกัน + เพิ่มบทบาท
--   * audit: trigger เดิมบันทึก profiles/user_roles อัตโนมัติ + แถวสรุปเหตุผล (table_name = 'role_bootstrap')
--   * p_dry_run = true (ค่าเริ่มต้น): ตรวจอย่างเดียว คืนผลว่าจะทำอะไร ไม่เขียนข้อมูล
-- =============================================================================

create or replace function private.bootstrap_school_role(
  p_email text,
  p_school_code text,
  p_roles public.app_role[],
  p_reason text,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users;
  v_school public.schools;
  v_profile public.profiles;
  v_existing int;
  v_role public.app_role;
  v_added text[] := '{}';
  v_plan jsonb;
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'bootstrap ทำได้เฉพาะเจ้าของโปรเจกต์ผ่าน SQL (session_user = %)', session_user using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร (บันทึกใน audit log)';
  end if;
  if p_roles is null or cardinality(p_roles) = 0 or not (p_roles <@ array['academic_head', 'system_admin']::public.app_role[]) then
    raise exception 'bootstrap ให้ได้เฉพาะ academic_head และ/หรือ system_admin';
  end if;

  select * into v_user from auth.users where lower(email) = lower(btrim(p_email)) and deleted_at is null;
  if not found then raise exception 'ไม่พบบัญชี % ในโปรเจกต์นี้ (ตรวจว่าเชื่อม project ถูกตัว)', p_email; end if;
  if v_user.email_confirmed_at is null then raise exception 'บัญชียังไม่ยืนยันอีเมล'; end if;
  if v_user.banned_until is not null and v_user.banned_until > now() then raise exception 'บัญชีถูกระงับ (banned_until)'; end if;

  select * into v_school from public.schools where code = p_school_code;
  if not found then raise exception 'ไม่พบโรงเรียนรหัส % — ต้องสร้างแถว schools ก่อน (ขั้นตอนแยก)', p_school_code; end if;
  if not v_school.is_active then raise exception 'โรงเรียน % ถูกปิดใช้งาน', p_school_code; end if;

  select count(*) into v_existing from public.user_roles ur join public.profiles p on p.id = ur.user_id and p.is_active
   where ur.school_id = v_school.id and ur.role in ('system_admin', 'academic_head');
  if v_existing > 0 then
    raise exception 'โรงเรียนนี้มีผู้ดูแลแล้ว % บัญชี — ให้กำหนดบทบาทผ่านระบบตามปกติ (bootstrap ใช้ได้ครั้งแรกเท่านั้น)', v_existing
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from public.profiles where id = v_user.id;
  if not found then raise exception 'บัญชีนี้ไม่มี profile (trigger on_auth_user_created ไม่ทำงาน) — ตรวจ migration'; end if;
  if v_profile.school_id is not null and v_profile.school_id <> v_school.id then
    raise exception 'profile ผูกกับโรงเรียนอื่นอยู่แล้ว — ไม่ย้ายโรงเรียนอัตโนมัติ';
  end if;
  if not v_profile.is_active then raise exception 'profile ถูกระงับ (is_active = false)'; end if;

  v_plan := jsonb_build_object(
    'user_id', v_user.id, 'email', v_user.email, 'school', v_school.code,
    'set_profile_school', v_profile.school_id is null,
    'set_app_metadata_school', (v_user.raw_app_meta_data ->> 'school_id') is distinct from v_school.id::text,
    'roles', to_jsonb(p_roles), 'dry_run', p_dry_run);
  if p_dry_run then
    return v_plan;
  end if;

  if v_profile.school_id is null then
    update public.profiles set school_id = v_school.id where id = v_user.id;
  end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('school_id', v_school.id)
   where id = v_user.id;
  foreach v_role in array p_roles loop
    if not exists (select 1 from public.user_roles where user_id = v_user.id and school_id = v_school.id and role = v_role) then
      insert into public.user_roles (user_id, school_id, role, granted_by) values (v_user.id, v_school.id, v_role, null);
      v_added := v_added || v_role::text;
    end if;
  end loop;

  insert into public.audit_logs (school_id, actor_id, table_name, record_id, action, new_data)
  values (v_school.id, null, 'role_bootstrap', v_user.id, 'INSERT',
          v_plan || jsonb_build_object('roles_added', to_jsonb(v_added), 'reason', btrim(p_reason),
                                       'session_user', session_user, 'executed_at', now()));
  return v_plan || jsonb_build_object('roles_added', to_jsonb(v_added));
end;
$$;

revoke all on function private.bootstrap_school_role(text, text, public.app_role[], text, boolean) from public, anon, authenticated, service_role;
comment on function private.bootstrap_school_role(text, text, public.app_role[], text, boolean) is
  'ให้บทบาทแรกของโรงเรียน (academic_head/system_admin) — เฉพาะ postgres ผ่าน SQL · ครั้งเดียวต่อโรงเรียน · dry run เป็นค่าเริ่มต้น · บันทึก audit';
