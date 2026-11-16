-- ลงทะเบียนเอกสารต้นทางแบบง่าย: เซิร์ฟเวอร์สร้างรหัสทะเบียน SRC-NN อัตโนมัติ (ไม่ซ้ำต่อโรงเรียน)
--  · ถ้าไม่ระบุรหัส (null/ว่าง) trigger จะออกเลขถัดไปจากรหัสที่มีอยู่ (รวมรหัสลูก SRC-NN-XX) ภายใต้ advisory lock ต่อโรงเรียน
--  · ขยายรูปแบบรหัสเป็น 2–4 หลัก (SRC-01 … SRC-9999) — รหัสเดิมทั้งหมดยังผ่าน
--  · ความน่าเชื่อถือไม่บังคับ: null = "รอตรวจสอบ" (ระบบไม่ตั้ง A ให้เอง) · ประเภทเอกสารมีค่าเริ่มต้น 'other'
--  · ไม่แก้ข้อมูลเดิม · สิทธิ์ (RLS/grant) และ Audit Log เดิมคงเดิม · forward-only

alter table public.source_documents drop constraint if exists source_documents_register_code_check;
alter table public.source_documents add constraint source_documents_register_code_check
  check (register_code ~ '^SRC-[0-9]{2,4}(-[A-Z0-9]{1,8})?$');

alter table public.source_documents alter column reliability drop not null;
alter table public.source_documents alter column doc_type set default 'other';

create or replace function private.source_documents_assign_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next int;
begin
  if new.register_code is not null and btrim(new.register_code) <> '' then
    new.register_code := upper(btrim(new.register_code));
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('source_documents_code/' || new.school_id::text, 0));
  select coalesce(max((substring(d.register_code from '^SRC-([0-9]{2,4})'))::int), 0) + 1 into v_next
    from public.source_documents d where d.school_id = new.school_id;
  while exists (select 1 from public.source_documents d where d.school_id = new.school_id and d.register_code = 'SRC-' || lpad(v_next::text, 2, '0')) loop
    v_next := v_next + 1;
  end loop;
  if v_next > 9999 then raise exception 'รหัสทะเบียนเอกสารเต็ม (SRC-9999)'; end if;
  new.register_code := 'SRC-' || lpad(v_next::text, 2, '0');
  return new;
end;
$$;

drop trigger if exists source_documents_assign_code on public.source_documents;
create trigger source_documents_assign_code before insert on public.source_documents
  for each row execute function private.source_documents_assign_code();
