-- =============================================================================
-- ตรวจปัญหาเข้าสู่ระบบบน Supabase Staging — อ่านอย่างเดียว (ไม่แก้ข้อมูล · rollback ท้ายไฟล์)
-- วิธีใช้: Supabase Dashboard → project ที่ Vercel Preview ใช้ → SQL Editor → วางทั้งไฟล์
--          แก้อีเมลในบรรทัด "params" ให้ตรงบัญชีที่ทดสอบ → Run
-- ไม่แสดงรหัสผ่าน/hash/token ใด ๆ (แสดงเพียงว่ามีรหัสผ่านหรือไม่)
-- =============================================================================
begin read only;

with params as (select lower('owner@example.com') as email),  -- ← แก้อีเมล
u as (select au.* from auth.users au, params where lower(au.email) = params.email)
select
  '1. auth.users' as check_item,
  (select count(*) from u) as found,
  (select jsonb_build_object(
     'user_id', id,
     'email_confirmed', email_confirmed_at is not null,
     'has_password', encrypted_password is not null and encrypted_password <> '',
     'banned', banned_until is not null and banned_until > now(),
     'deleted', deleted_at is not null,
     'is_sso_user', is_sso_user,
     'last_sign_in_at', last_sign_in_at,
     'created_at', created_at,
     'app_metadata', raw_app_meta_data,           -- ต้องมี school_id
     'identities', (select jsonb_agg(i.provider) from auth.identities i where i.user_id = u.id)
   ) from u) as detail
union all
select '2. profiles', count(*), jsonb_agg(jsonb_build_object('school_id', p.school_id, 'is_active', p.is_active, 'email', p.email))
  from public.profiles p join u on u.id = p.id
union all
select '3. schools (ทั้งหมด)', count(*), jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name_th', s.name_th, 'is_active', s.is_active))
  from public.schools s
union all
select '4. app_metadata.school_id ตรงกับ profiles / schools',
  (select count(*) from u join public.profiles p on p.id = u.id
    where (u.raw_app_meta_data ->> 'school_id') = p.school_id::text
      and exists (select 1 from public.schools s where s.id = p.school_id and s.is_active)),
  (select jsonb_build_object('app_metadata_school_id', u.raw_app_meta_data ->> 'school_id', 'profile_school_id', p.school_id)
     from u left join public.profiles p on p.id = u.id)
union all
select '5. user_roles', count(*), jsonb_agg(jsonb_build_object('role', r.role, 'school_id', r.school_id, 'learning_area_id', r.learning_area_id))
  from public.user_roles r join u on u.id = r.user_id
union all
select '5b. ผู้ดูแลที่มีอยู่ (system_admin/academic_head) ต่อโรงเรียน', count(*), jsonb_agg(jsonb_build_object('school_id', r.school_id, 'role', r.role))
  from public.user_roles r where r.role in ('system_admin', 'academic_head')
union all
select '7. migrations ล่าสุด', count(*), (select jsonb_agg(version order by version desc) from (select version from supabase_migrations.schema_migrations order by version desc limit 3) v)
  from supabase_migrations.schema_migrations;

-- 6. get_my_access() ในมุมมองของผู้ใช้ (จำลอง JWT ภายใน transaction นี้เท่านั้น)
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where lower(email) = lower('owner@example.com')), 'role', 'authenticated')::text, true);  -- ← แก้อีเมล
set local role authenticated;
select '6. get_my_access()' as check_item, public.get_my_access() as detail;
reset role;

rollback;
