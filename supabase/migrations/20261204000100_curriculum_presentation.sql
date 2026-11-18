-- การนำเสนอหลักสูตร: บันทึก “โรงเรียนยืนยันเอกสาร” + ข้อความวิสัยทัศน์/จุดเน้นจากเล่มหลักสูตร (forward-only · เพิ่มตารางใหม่ ไม่แก้ข้อมูลเดิม)
--  · การยืนยันของโรงเรียน ≠ ผลการตรวจความสอดคล้องกับเกณฑ์แกนกลาง (แยกตารางและสถานะ)
--  · ผูกกับ sha256 ของไฟล์ต้นฉบับ ณ วันที่ยืนยัน — ไฟล์ถูกแทน/เปลี่ยน = การยืนยันไม่ตรงกับไฟล์ปัจจุบัน (ตรวจได้)
--  · ไม่แก้ชั่วโมง หน่วยกิต รหัสวิชา แผนการเรียน หรือ CF ใด ๆ
--  · เขียนผ่าน RPC เฉพาะผู้ดูแลหลักสูตร (academic_head) · อ่านตามสิทธิ์ผู้อ่านหลักสูตร · Audit ทุกแถว

create table public.curriculum_document_confirmations (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  source_document_id     uuid not null,
  scope                  text not null check (scope in ('structure', 'curriculum_book', 'other')),
  document_sha256        text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  confirmed_by_role      text not null check (length(btrim(confirmed_by_role)) between 1 and 200),
  confirmed_on           date not null,
  evidence_document_id   uuid,
  evidence_locator       text check (evidence_locator is null or private.is_valid_locator(evidence_locator)),
  note                   text check (note is null or length(note) <= 2000),
  status                 text not null default 'active' check (status in ('active', 'revoked')),
  revoked_reason         text check (revoked_reason is null or length(revoked_reason) <= 2000),
  recorded_by            uuid not null default auth.uid() references auth.users (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  foreign key (evidence_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  check (status <> 'revoked' or length(btrim(coalesce(revoked_reason, ''))) > 0)
);
create unique index curriculum_document_confirmations_active on public.curriculum_document_confirmations (curriculum_version_id, source_document_id, scope) where status = 'active';
comment on table public.curriculum_document_confirmations is 'โรงเรียนยืนยันเอกสาร (เช่น โครงสร้างหลักสูตร) — ไม่ใช่ผลตรวจความสอดคล้องกับเกณฑ์แกนกลาง';

create table public.curriculum_highlights (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  curriculum_version_id  uuid not null,
  kind                   text not null check (kind in ('vision', 'mission', 'goal', 'focus', 'highlight')),
  seq                    int not null default 1 check (seq > 0),
  text_th                text not null check (length(btrim(text_th)) between 1 and 4000),
  source_document_id     uuid not null,
  source_locator         text not null check (private.is_valid_locator(source_locator)),
  status                 text not null default 'draft' check (status in ('draft', 'confirmed', 'retired')),
  confirmed_by           uuid references auth.users (id),
  confirmed_at           timestamptz,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (curriculum_version_id, school_id) references public.curriculum_versions (id, school_id) on delete restrict,
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  check ((status = 'confirmed') = (confirmed_by is not null and confirmed_at is not null) or status = 'retired')
);
create index curriculum_highlights_version_idx on public.curriculum_highlights (curriculum_version_id, kind, seq);
comment on table public.curriculum_highlights is 'วิสัยทัศน์/พันธกิจ/จุดเน้นที่คัดลอกจากเล่มหลักสูตร พร้อมหน้าอ้างอิง — แสดงในโหมดนำเสนอเฉพาะที่ยืนยันแล้ว';

do $$
declare t text;
begin
  foreach t in array array['curriculum_document_confirmations', 'curriculum_highlights'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
      using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()))', t);
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function private.set_updated_at()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.audit_row_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- บันทึก/เพิกถอนการยืนยันของโรงเรียน
create or replace function public.curriculum_document_confirm(p_version_id uuid, p_document_id uuid, p_scope text, p_confirmed_by_role text, p_confirmed_on date,
  p_evidence_document_id uuid default null, p_evidence_locator text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_sha text; v_id uuid;
begin
  perform private.require_curriculum_admin();
  if not exists (select 1 from public.curriculum_versions where id = p_version_id and school_id = private.current_school_id()) then raise exception 'ไม่พบฉบับหลักสูตร'; end if;
  select sha256 into v_sha from public.source_documents where id = p_document_id and school_id = private.current_school_id();
  if not found then raise exception 'ไม่พบเอกสาร'; end if;
  if v_sha is null then raise exception 'เอกสารนี้ยังไม่มีไฟล์ต้นฉบับที่ตรวจค่า SHA-256 — อัปโหลดไฟล์ก่อนบันทึกการยืนยัน'; end if;
  if p_confirmed_on > current_date then raise exception 'วันที่ยืนยันต้องไม่เกินวันนี้'; end if;
  insert into public.curriculum_document_confirmations (curriculum_version_id, source_document_id, scope, document_sha256, confirmed_by_role, confirmed_on,
                                                        evidence_document_id, evidence_locator, note)
  values (p_version_id, p_document_id, p_scope, v_sha, btrim(p_confirmed_by_role), p_confirmed_on, p_evidence_document_id, p_evidence_locator, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.curriculum_document_confirmation_revoke(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_curriculum_admin();
  update public.curriculum_document_confirmations set status = 'revoked', revoked_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_id and school_id = private.current_school_id() and status = 'active';
  if not found then raise exception 'ไม่พบการยืนยันที่ยังมีผล'; end if;
end $$;

-- ---------------------------------------------------------------- วิสัยทัศน์/จุดเน้น (คัดลอกจากเล่ม + หน้าอ้างอิง)
create or replace function public.curriculum_highlight_save(p_id uuid, p_version_id uuid, p_kind text, p_seq int, p_text text, p_document_id uuid, p_locator text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status text;
begin
  perform private.require_curriculum_admin();
  if p_id is not null then
    select status into v_status from public.curriculum_highlights where id = p_id and school_id = private.current_school_id() for update;
    if not found then raise exception 'ไม่พบรายการ'; end if;
    if v_status = 'confirmed' then raise exception 'รายการที่ยืนยันแล้วแก้ไม่ได้ — เปลี่ยนเป็นร่างก่อน'; end if;
    update public.curriculum_highlights set kind = p_kind, seq = coalesce(p_seq, 1), text_th = p_text, source_document_id = p_document_id, source_locator = p_locator
     where id = p_id returning id into v_id;
  else
    insert into public.curriculum_highlights (curriculum_version_id, kind, seq, text_th, source_document_id, source_locator)
    values (p_version_id, p_kind, coalesce(p_seq, 1), p_text, p_document_id, p_locator) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.curriculum_highlight_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_curriculum_admin();
  if p_status not in ('draft', 'confirmed', 'retired') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  update public.curriculum_highlights set status = p_status,
         confirmed_by = case when p_status = 'confirmed' then auth.uid() end, confirmed_at = case when p_status = 'confirmed' then now() end
   where id = p_id and school_id = private.current_school_id();
  if not found then raise exception 'ไม่พบรายการ'; end if;
end $$;

revoke all on function public.curriculum_document_confirm(uuid, uuid, text, text, date, uuid, text, text), public.curriculum_document_confirmation_revoke(uuid, text),
  public.curriculum_highlight_save(uuid, uuid, text, int, text, uuid, text), public.curriculum_highlight_set_status(uuid, text) from public, anon;
grant execute on function public.curriculum_document_confirm(uuid, uuid, text, text, date, uuid, text, text), public.curriculum_document_confirmation_revoke(uuid, text),
  public.curriculum_highlight_save(uuid, uuid, text, int, text, uuid, text), public.curriculum_highlight_set_status(uuid, text) to authenticated;
