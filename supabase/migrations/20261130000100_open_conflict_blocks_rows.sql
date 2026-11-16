-- ปิดช่องว่าง: แถวนำเข้าของรายวิชาที่ยังมีข้อขัดแย้ง (CF) เปิดอยู่ ต้องจัดเป็น "ขัดแย้ง" แม้ไม่มี issue SOURCE_CONFLICT
-- ผลต่อเนื่อง: อนุมัติคำเตือน/สร้างทะเบียนแบบรวมคำเตือน/สร้างผลการเรียนรู้ ข้ามแถวเหล่านี้ได้เอง (ระบบไม่ตัดสินแทน)
-- · forward-only · ไม่แก้ข้อมูล · แถวที่อนุมัติ/ข้าม/บันทึกแล้วไม่ถูกกระทบ (คืนสถานะเดิมก่อน)
-- · เพิ่ม trigger ป้องกันการคัดลอกฉบับ (clone) ที่ยังมีรายวิชาผูกกับ CF เปิด — กันข้อมูลที่ยังไม่ยืนยันไหลไปปีถัดไป

create or replace function private.curriculum_row_class(p_status text, p_issues jsonb, p_school uuid, p_norm jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_status in ('approved', 'skipped', 'committed') then p_status
    when p_status = 'error' or exists (select 1 from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) e where e ->> 'severity' = 'error') then 'error'
    when exists (select 1 from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) e where e ->> 'code' = 'SOURCE_CONFLICT')
         and not exists (select 1 from public.source_conflicts c where c.school_id = p_school and c.status = 'resolved'
                          and c.subject_ref in (coalesce(p_norm ->> 'code', ''), coalesce(p_norm ->> 'subject_code', ''))) then 'conflict'
    when exists (select 1 from public.source_conflicts c where c.school_id = p_school and c.status <> 'resolved'
                  and c.subject_ref is not null and c.subject_ref in (coalesce(p_norm ->> 'code', ''), coalesce(p_norm ->> 'subject_code', ''))
                  and coalesce(p_norm ->> 'code', p_norm ->> 'subject_code', '') <> '') then 'conflict'
    when exists (select 1 from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) e where e ->> 'severity' = 'warning') then 'warning'
    else 'pass'
  end
$$;
grant execute on function private.curriculum_row_class(text, jsonb, uuid, jsonb) to authenticated;

create or replace function private.curriculum_guard_clone_open_conflicts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.based_on_version_id is not null and exists (
       select 1 from public.subjects s join public.source_conflicts c on c.school_id = s.school_id and c.subject_ref = s.code and c.status <> 'resolved'
        where s.curriculum_version_id = new.based_on_version_id and s.is_active) then
    raise exception 'คัดลอกฉบับนี้ไม่ได้: ยังมีรายวิชาที่ผูกกับข้อขัดแย้งที่ยังไม่ตัดสิน — ตัดสินหรือปิดใช้งานรายวิชาเหล่านั้นก่อน'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists curriculum_versions_guard_clone on public.curriculum_versions;
create trigger curriculum_versions_guard_clone before insert on public.curriculum_versions
  for each row execute function private.curriculum_guard_clone_open_conflicts();
