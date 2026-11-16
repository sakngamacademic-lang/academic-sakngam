-- =============================================================================
-- C4 — วิเคราะห์เอกสารหลักสูตรอัตโนมัติ (อ่าน/จำแนก/สกัด) แยกจากการอนุมัติ
-- หลักการ
--  · การอ่านเอกสาร (parser/AI ผ่าน Edge Function + service_role) เขียนได้เฉพาะ "ผลวิเคราะห์" — ไม่แตะข้อมูลหลักสูตร
--  · ทุกรายการต้องมีพิกัด (pdf:N หรือ sheet:..!A1) — ถ้าอ่านไม่ได้เป็นสถานะ insufficient (“ข้อมูลไม่พอ”) ห้ามเดา
--  · ผู้ดูแลหลักสูตร (academic_head) ยอมรับ/แก้/ปฏิเสธรายการ → บันทึกเข้ากรอบแกนกลาง (learning_standards/indicators) ได้เฉพาะ
--    รายการที่ยอมรับ · ไม่เขียนทับข้อมูลเดิม (ค่าต่าง = ข้ามและติดธง) · ฉบับกรอบที่ยืนยันแล้ว (published) แก้ไม่ได้
--  · เปรียบเทียบใช้ curriculum_compliance_check เดิม + แยก CF ที่ยังไม่ตัดสิน → ผ่าน / ไม่ผ่าน / ข้อมูลไม่พอ / รอตรวจข้อขัดแย้ง
--  · ไม่สร้าง/คัดลอก/แก้ฉบับหลักสูตรใด ๆ (รวม 2570) · ไม่ปิด CF · forward-only
-- =============================================================================

create table public.document_analyses (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  source_document_id  uuid not null,
  file_id             uuid not null,
  status              text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  doc_class           text check (doc_class is null or doc_class in (
    'core_curriculum', 'school_curriculum', 'learning_area_curriculum', 'standards_indicators', 'announcement_time', 'unknown')),
  class_confidence    numeric(4,3) check (class_confidence is null or class_confidence between 0 and 1),
  class_evidence      jsonb not null default '[]'::jsonb,
  meta                jsonb not null default '{}'::jsonb,
  engine              text,
  ai_allowed          boolean not null default false,
  ai_status           text not null default 'not_requested' check (ai_status in ('not_requested', 'not_configured', 'used', 'not_needed', 'failed')),
  ai_note             text,
  page_count          int check (page_count is null or page_count > 0),
  item_counts         jsonb not null default '{}'::jsonb,
  error               text,
  created_by          uuid not null default auth.uid(),
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, school_id),
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict,
  foreign key (file_id, school_id) references public.files (id, school_id) on delete restrict
);
create index document_analyses_doc_idx on public.document_analyses (source_document_id, created_at desc);
create unique index document_analyses_one_active on public.document_analyses (source_document_id) where status in ('queued', 'running');

create table public.document_analysis_items (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete restrict,
  analysis_id    uuid not null,
  seq            int not null check (seq > 0),
  item_type      text not null check (item_type in (
    'curriculum_year', 'revision', 'learning_area', 'grade_level', 'standard', 'indicator', 'subject', 'time_structure', 'study_program', 'unreadable')),
  item_key       text not null check (length(item_key) between 1 and 300),
  extracted      jsonb not null default '{}'::jsonb,
  edited         jsonb,
  locator        text check (locator is null or private.is_valid_locator(locator)),
  excerpt        text check (excerpt is null or length(excerpt) <= 4000),
  confidence     numeric(4,3) check (confidence is null or confidence between 0 and 1),
  proposed_by    text not null default 'parser' check (proposed_by in ('parser', 'ai')),
  flags          jsonb not null default '[]'::jsonb,
  status         text not null default 'extracted' check (status in ('extracted', 'insufficient', 'duplicate', 'accepted', 'rejected', 'committed')),
  duplicate_of   uuid references public.document_analysis_items (id) on delete restrict,
  decision_by    uuid,
  decision_at    timestamptz,
  decision_note  text check (decision_note is null or length(decision_note) <= 2000),
  target_table   text,
  target_id      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (analysis_id, seq),
  unique (id, school_id),
  foreign key (analysis_id, school_id) references public.document_analyses (id, school_id) on delete restrict,
  -- ทุกข้อมูลต้องมีพิกัดต้นฉบับ ยกเว้นรายการ “ข้อมูลไม่พอ” (ยังยอมรับไม่ได้จนกว่าผู้ดูแลระบุพิกัด)
  check (locator is not null or status in ('insufficient', 'rejected')),
  check (status not in ('accepted', 'rejected', 'committed') or decision_by is not null),
  check (status <> 'rejected' or length(btrim(coalesce(decision_note, ''))) > 0)
);
create index document_analysis_items_analysis_idx on public.document_analysis_items (analysis_id, item_type, status);

-- ---------------------------------------------------------------- RLS: อ่านตามบทบาทหลักสูตร · เขียนผ่าน RPC เท่านั้น
alter table public.document_analyses enable row level security;
alter table public.document_analysis_items enable row level security;
revoke all on public.document_analyses, public.document_analysis_items from anon, authenticated;
grant select on public.document_analyses, public.document_analysis_items to authenticated;
create policy document_analyses_select on public.document_analyses for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()));
create policy document_analysis_items_select on public.document_analysis_items for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()));

create trigger document_analyses_audit after insert or update or delete on public.document_analyses
  for each row execute function private.audit_row_change();
create trigger document_analysis_items_audit after insert or update or delete on public.document_analysis_items
  for each row execute function private.audit_row_change();
-- กรอบแกนกลาง: บันทึก Audit Log ทุกการเพิ่ม/แก้ (เดิมไม่มี trigger)
create trigger framework_versions_audit after insert or update or delete on public.framework_versions
  for each row execute function private.audit_row_change();
create trigger learning_standards_audit after insert or update or delete on public.learning_standards
  for each row execute function private.audit_row_change();
create trigger indicators_audit after insert or update or delete on public.indicators
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- 1) ขอวิเคราะห์ (ผู้ดูแลหลักสูตร) — คืนเป้าหมายไฟล์ให้ Edge Function
create or replace function public.document_analysis_request(p_source_document_id uuid, p_allow_ai boolean default false)
returns table (analysis_id uuid, object_key text, file_ext text, page_count int, allow_ai boolean, register_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.source_documents;
  f public.files;
  v_id uuid;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะผู้ดูแลหลักสูตรสั่งวิเคราะห์เอกสารได้' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.source_documents where id = p_source_document_id and school_id = private.current_school_id();
  if not found then raise exception 'ไม่พบเอกสารต้นทาง' using errcode = 'insufficient_privilege'; end if;
  select * into f from public.files where id = d.file_id and school_id = d.school_id;
  if not found or f.status <> 'ready' then raise exception 'เอกสารนี้ยังไม่มีไฟล์ที่อัปโหลดและตรวจแล้ว'; end if;
  if f.file_ext not in ('pdf', 'xlsx') then raise exception 'วิเคราะห์อัตโนมัติได้เฉพาะ PDF และ Excel (.xlsx)'; end if;
  -- งานค้าง (เกิน 15 นาที) ถือว่าล้มเหลว เพื่อเริ่มใหม่ได้
  update public.document_analyses set status = 'failed', error = 'หมดเวลา — เริ่มวิเคราะห์ใหม่ได้', finished_at = now(), updated_at = now()
   where source_document_id = d.id and status in ('queued', 'running') and created_at < now() - interval '15 minutes';
  if exists (select 1 from public.document_analyses a where a.source_document_id = d.id and a.status in ('queued', 'running')) then
    raise exception 'เอกสารนี้กำลังวิเคราะห์อยู่';
  end if;
  insert into public.document_analyses (school_id, source_document_id, file_id, ai_allowed, page_count, created_by)
  values (d.school_id, d.id, f.id, coalesce(p_allow_ai, false), d.page_count, auth.uid())
  returning id into v_id;
  return query select v_id, f.object_key, f.file_ext, d.page_count, coalesce(p_allow_ai, false), d.register_code;
end $$;

-- ---------------------------------------------------------------- 2) สถานะงาน (service_role เท่านั้น)
create or replace function public.document_analysis_set_status(p_analysis_id uuid, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('running', 'failed') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  update public.document_analyses
     set status = p_status,
         error = case when p_status = 'failed' then left(coalesce(p_error, 'วิเคราะห์ไม่สำเร็จ'), 1000) end,
         started_at = case when p_status = 'running' then now() else started_at end,
         finished_at = case when p_status = 'failed' then now() else finished_at end,
         updated_at = now()
   where id = p_analysis_id and status in ('queued', 'running');
  if not found then raise exception 'ไม่พบงานวิเคราะห์ที่ยังไม่เสร็จ'; end if;
end $$;

-- ---------------------------------------------------------------- 3) เก็บผลวิเคราะห์ (service_role เท่านั้น · ไม่มีการอนุมัติในขั้นนี้)
-- ซ้ำในเอกสาร: ชนิด+คีย์+ค่าเท่ากัน → duplicate · ค่าต่าง → ติดธง VARIANT_IN_DOC ทั้งสองฝั่ง
-- เทียบกรอบแกนกลางที่มีอยู่: EXISTS_IN_FRAMEWORK (ข้อความเดียวกัน) / VARIANT_FRAMEWORK (ข้อความต่างฉบับ)
create or replace function public.document_analysis_store(p_analysis_id uuid, p_result jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.document_analyses;
  it jsonb;
  v_seq int := 0;
  v_locator text;
  v_first public.document_analysis_items;
  v_flags jsonb;
  v_status text;
  v_existing text;
  v_code text;
  v_id uuid;
begin
  select * into a from public.document_analyses where id = p_analysis_id for update;
  if not found or a.status not in ('queued', 'running') then raise exception 'ไม่พบงานวิเคราะห์ที่ยังไม่เสร็จ'; end if;
  if jsonb_typeof(p_result -> 'items') <> 'array' then raise exception 'ผลวิเคราะห์ไม่ถูกต้อง'; end if;
  if jsonb_array_length(p_result -> 'items') > 20000 then raise exception 'รายการมากเกินไป — แบ่งเอกสารเป็นส่วน'; end if;

  for it in select * from jsonb_array_elements(p_result -> 'items') loop
    v_seq := v_seq + 1;
    v_locator := nullif(btrim(it ->> 'locator'), '');
    if v_locator is not null and not private.is_valid_locator(v_locator) then v_locator := null; end if;
    v_flags := coalesce(it -> 'flags', '[]'::jsonb);
    v_status := case when coalesce((it ->> 'insufficient')::boolean, false) or v_locator is null then 'insufficient' else 'extracted' end;

    select * into v_first from public.document_analysis_items i
     where i.analysis_id = a.id and i.item_type = it ->> 'item_type' and i.item_key = it ->> 'item_key' and i.duplicate_of is null
     order by i.seq limit 1;
    if found then
      if v_first.extracted = coalesce(it -> 'extracted', '{}'::jsonb) then
        v_status := 'duplicate';
        v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'DUPLICATE_IN_DOC',
          'message_th', 'ซ้ำกับรายการเดิมที่ ' || coalesce(v_first.locator, 'ไม่ทราบพิกัด')));
      else
        v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'VARIANT_IN_DOC',
          'message_th', 'คีย์เดียวกันแต่ค่าต่างจากที่ ' || coalesce(v_first.locator, 'ไม่ทราบพิกัด') || ' — ตรวจกับต้นฉบับ'));
        update public.document_analysis_items set flags = flags || jsonb_build_array(jsonb_build_object('code', 'VARIANT_IN_DOC',
          'message_th', 'พบค่าต่างของคีย์เดียวกันที่ ' || coalesce(v_locator, 'ไม่ทราบพิกัด'))), updated_at = now()
         where id = v_first.id;
      end if;
    end if;

    -- เทียบกับกรอบแกนกลางเดิม (อ่านอย่างเดียว)
    v_code := it -> 'extracted' ->> 'full_code';
    if it ->> 'item_type' = 'indicator' and v_code is not null then
      select i.statement_th into v_existing from public.indicators i where i.full_code = v_code order by i.id limit 1;
      if found then
        v_flags := v_flags || jsonb_build_array(jsonb_build_object(
          'code', case when btrim(v_existing) = btrim(coalesce(it -> 'extracted' ->> 'statement', '')) then 'EXISTS_IN_FRAMEWORK' else 'VARIANT_FRAMEWORK' end,
          'message_th', case when btrim(v_existing) = btrim(coalesce(it -> 'extracted' ->> 'statement', '')) then 'มีในกรอบแกนกลางแล้ว (ข้อความตรงกัน)'
                             else 'รหัสนี้มีในกรอบแกนกลางแล้วแต่ข้อความต่าง (ต่างฉบับ) — จะไม่เขียนทับ' end,
          'existing', v_existing));
      end if;
    elsif it ->> 'item_type' = 'standard' and it -> 'extracted' ->> 'code' is not null then
      select s.statement_th into v_existing from public.learning_standards s where s.code = it -> 'extracted' ->> 'code' order by s.id limit 1;
      if found and btrim(v_existing) <> btrim(coalesce(it -> 'extracted' ->> 'statement', '')) then
        v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'VARIANT_FRAMEWORK',
          'message_th', 'มาตรฐานนี้มีในกรอบแกนกลางแล้วแต่ข้อความต่าง — จะไม่เขียนทับ', 'existing', v_existing));
      end if;
    end if;

    insert into public.document_analysis_items (school_id, analysis_id, seq, item_type, item_key, extracted, locator, excerpt, confidence, proposed_by, flags, status, duplicate_of)
    values (a.school_id, a.id, v_seq, it ->> 'item_type', left(it ->> 'item_key', 300), coalesce(it -> 'extracted', '{}'::jsonb), v_locator,
            left(it ->> 'excerpt', 4000), least(greatest(coalesce((it ->> 'confidence')::numeric, 0), 0), 1),
            case when it ->> 'proposed_by' = 'ai' then 'ai' else 'parser' end, v_flags, v_status,
            case when v_status = 'duplicate' then v_first.id end)
    returning id into v_id;
  end loop;

  update public.document_analyses
     set status = 'done', finished_at = now(), updated_at = now(),
         doc_class = coalesce(p_result ->> 'doc_class', 'unknown'),
         class_confidence = least(greatest(coalesce((p_result ->> 'class_confidence')::numeric, 0), 0), 1),
         class_evidence = coalesce(p_result -> 'class_evidence', '[]'::jsonb),
         meta = coalesce(p_result -> 'meta', '{}'::jsonb),
         engine = left(p_result ->> 'engine', 100),
         ai_status = coalesce(p_result ->> 'ai_status', 'not_requested'),
         ai_note = left(p_result ->> 'ai_note', 1000),
         page_count = coalesce((p_result ->> 'page_count')::int, page_count),
         item_counts = (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select item_type || ':' || status as k, count(*) as n from public.document_analysis_items where analysis_id = a.id group by 1) c)
   where id = a.id;
  return v_seq;
end $$;

-- ---------------------------------------------------------------- 4) ผู้ดูแลตรวจรายการ: ยอมรับ / แก้ (ยอมรับพร้อมค่าที่แก้) / ปฏิเสธ (ต้องมีเหตุผล) / ย้อนกลับ
create or replace function public.document_analysis_item_decide(p_item_ids uuid[], p_decision text, p_edited jsonb default null,
                                                                p_locator text default null, p_note text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.document_analysis_items;
  v_val jsonb;
  v_loc text;
  v_n int := 0;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะผู้ดูแลหลักสูตรตรวจผลวิเคราะห์ได้' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('accept', 'reject', 'reset') then raise exception 'การตัดสินไม่ถูกต้อง'; end if;
  if (p_edited is not null or p_locator is not null) and coalesce(array_length(p_item_ids, 1), 0) <> 1 then
    raise exception 'แก้ค่าได้ครั้งละ 1 รายการ';
  end if;
  if p_decision = 'reject' and length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'กรุณาระบุเหตุผลที่ปฏิเสธ'; end if;
  if p_locator is not null and not private.is_valid_locator(p_locator) then raise exception 'พิกัดอ้างอิงไม่ถูกต้อง (เช่น pdf:12 หรือ sheet:ชีต!A1)'; end if;

  for r in select * from public.document_analysis_items i
            where i.id = any (p_item_ids) and i.school_id = private.current_school_id() for update loop
    if r.status = 'committed' then raise exception 'รายการ % บันทึกเข้าฐานข้อมูลแล้ว แก้ไม่ได้', r.item_key; end if;
    v_loc := coalesce(p_locator, r.locator);
    if p_decision = 'accept' then
      v_val := coalesce(p_edited, r.edited, r.extracted);
      if v_loc is null then raise exception 'รายการ % ยังไม่มีหน้า/เซลล์อ้างอิง — ระบุพิกัดก่อนยอมรับ', r.item_key; end if;
      if r.item_type in ('standard', 'indicator') and length(btrim(coalesce(v_val ->> 'statement', ''))) = 0 then
        raise exception 'รายการ % ยังไม่มีข้อความ (ข้อมูลไม่พอ) — กรอกจากต้นฉบับก่อนยอมรับ', r.item_key;
      end if;
      update public.document_analysis_items
         set status = 'accepted', edited = coalesce(p_edited, edited), locator = v_loc,
             decision_by = auth.uid(), decision_at = now(), decision_note = p_note, updated_at = now()
       where id = r.id;
    elsif p_decision = 'reject' then
      update public.document_analysis_items
         set status = 'rejected', decision_by = auth.uid(), decision_at = now(), decision_note = btrim(p_note), updated_at = now()
       where id = r.id;
    else
      update public.document_analysis_items
         set status = case when r.duplicate_of is not null then 'duplicate' when r.locator is null then 'insufficient' else 'extracted' end,
             decision_by = null, decision_at = null, decision_note = null, updated_at = now()
       where id = r.id;
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'ไม่พบรายการ' using errcode = 'insufficient_privilege'; end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------- 5) บันทึกเข้ากรอบแกนกลาง (เฉพาะรายการที่ยอมรับ · ไม่เขียนทับ)
create or replace function private.framework_grade_name(p_code text)
returns text language sql immutable set search_path = '' as $$
  select case left(p_code, 1) when 'ป' then 'ประถมศึกษาปีที่ ' when 'ม' then 'มัธยมศึกษาปีที่ ' else '' end || substring(p_code from 3)
$$;

create or replace function public.document_analysis_commit_framework(p_analysis_id uuid, p_framework_code text, p_framework_name text,
                                                                     p_version_label text, p_published_year_be int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.document_analyses;
  d public.source_documents;
  v_fw uuid;
  v_fv public.framework_versions;
  r public.document_analysis_items;
  v jsonb;
  v_area uuid;
  v_grade uuid;
  v_std uuid;
  v_ind uuid;
  v_exist text;
  v_cite text;
  v_grade_code text;
  v_ins_std int := 0; v_ins_ind int := 0; v_same int := 0; v_conflict int := 0; v_invalid int := 0;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะผู้ดูแลหลักสูตรบันทึกข้อมูลอ้างอิงแกนกลางได้' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.document_analyses where id = p_analysis_id and school_id = private.current_school_id();
  if not found then raise exception 'ไม่พบผลวิเคราะห์' using errcode = 'insufficient_privilege'; end if;
  if a.status <> 'done' then raise exception 'การวิเคราะห์ยังไม่เสร็จ'; end if;
  if a.doc_class not in ('core_curriculum', 'standards_indicators') then
    raise exception 'บันทึกเข้ากรอบแกนกลางได้เฉพาะเอกสารหลักสูตรแกนกลาง/มาตรฐานและตัวชี้วัด (ประเภทที่จำแนกได้: %)', coalesce(a.doc_class, 'ไม่ทราบ');
  end if;
  if coalesce(btrim(p_framework_code), '') !~ '^[A-Za-z0-9_-]{2,32}$' then raise exception 'รหัสกรอบหลักสูตรต้องเป็น A-Z 0-9 _ - (2–32 ตัว)'; end if;
  if length(btrim(coalesce(p_version_label, ''))) = 0 or length(btrim(coalesce(p_framework_name, ''))) = 0 then
    raise exception 'กรุณาระบุชื่อกรอบหลักสูตรและฉบับ';
  end if;
  select * into d from public.source_documents where id = a.source_document_id;

  select id into v_fw from public.curriculum_frameworks where code = btrim(p_framework_code);
  if not found then
    insert into public.curriculum_frameworks (code, name_th, source_citation)
    values (btrim(p_framework_code), btrim(p_framework_name), d.register_code || ' ' || d.title) returning id into v_fw;
  end if;
  select * into v_fv from public.framework_versions where framework_id = v_fw and version_label = btrim(p_version_label);
  if not found then
    insert into public.framework_versions (framework_id, version_label, published_year_be, status, is_complete, source_citation)
    values (v_fw, btrim(p_version_label), p_published_year_be, 'draft', false, d.register_code || ' ' || d.title)
    returning * into v_fv;
  elsif v_fv.status = 'published' then
    raise exception 'ฉบับ % ยืนยันแล้ว — ไม่เพิ่ม/แก้ข้อมูล (สร้างฉบับใหม่แทน)', v_fv.version_label;
  end if;

  -- มาตรฐานก่อนตัวชี้วัด
  for r in select * from public.document_analysis_items i
            where i.analysis_id = a.id and i.status = 'accepted' and i.item_type in ('standard', 'indicator')
            order by case i.item_type when 'standard' then 0 else 1 end, i.seq for update loop
    v := coalesce(r.edited, r.extracted);
    v_cite := d.register_code || ' ' || r.locator;
    if r.item_type = 'standard' then
      if coalesce(v ->> 'code', '') !~ '^[ก-ฮ] [0-9]+\.[0-9]+$' or length(btrim(coalesce(v ->> 'area_name', ''))) = 0 then
        v_invalid := v_invalid + 1;
        update public.document_analysis_items set flags = flags || '[{"code":"COMMIT_INVALID","message_th":"ต้องมีรหัสมาตรฐาน (เช่น ว 1.1) และชื่อกลุ่มสาระ — แก้ค่าแล้วยอมรับใหม่"}]'::jsonb, updated_at = now() where id = r.id;
        continue;
      end if;
      insert into public.framework_learning_areas (framework_version_id, code, name_th)
      values (v_fv.id, left(v ->> 'code', 1), btrim(v ->> 'area_name')) on conflict (framework_version_id, code) do nothing;
      select id into v_area from public.framework_learning_areas where framework_version_id = v_fv.id and code = left(v ->> 'code', 1);
      select statement_th into v_exist from public.learning_standards where framework_version_id = v_fv.id and code = v ->> 'code';
      if found then
        if btrim(v_exist) = btrim(v ->> 'statement') then v_same := v_same + 1;
          update public.document_analysis_items set status = 'committed', target_table = 'learning_standards',
                 target_id = (select id from public.learning_standards where framework_version_id = v_fv.id and code = v ->> 'code'), updated_at = now() where id = r.id;
        else v_conflict := v_conflict + 1;
          update public.document_analysis_items set flags = flags || jsonb_build_array(jsonb_build_object('code', 'COMMIT_CONFLICT',
                 'message_th', 'ฉบับนี้มีมาตรฐานรหัสเดียวกันแต่ข้อความต่าง — ไม่เขียนทับ', 'existing', v_exist)), updated_at = now() where id = r.id;
        end if;
        continue;
      end if;
      insert into public.learning_standards (framework_version_id, framework_learning_area_id, code, statement_th, source_citation)
      values (v_fv.id, v_area, v ->> 'code', btrim(v ->> 'statement'), v_cite) returning id into v_std;
      update public.document_analysis_items set status = 'committed', target_table = 'learning_standards', target_id = v_std, updated_at = now() where id = r.id;
      v_ins_std := v_ins_std + 1;
    else
      v_grade_code := v ->> 'grade';
      if coalesce(v ->> 'standard_code', '') !~ '^[ก-ฮ] [0-9]+\.[0-9]+$' or coalesce(v_grade_code, '') !~ '^[ปม]\.[1-6](-[1-6])?$'
         or coalesce(v ->> 'number', '') !~ '^[0-9]{1,3}$' then
        v_invalid := v_invalid + 1;
        update public.document_analysis_items set flags = flags || '[{"code":"COMMIT_INVALID","message_th":"ต้องมีรหัสมาตรฐาน ชั้น (ม.1 / ม.4-6) และเลขข้อ — แก้ค่าแล้วยอมรับใหม่"}]'::jsonb, updated_at = now() where id = r.id;
        continue;
      end if;
      select id into v_std from public.learning_standards where framework_version_id = v_fv.id and code = v ->> 'standard_code';
      if not found then
        v_invalid := v_invalid + 1;
        update public.document_analysis_items set flags = flags || '[{"code":"COMMIT_NO_STANDARD","message_th":"ยังไม่มีมาตรฐานของตัวชี้วัดนี้ในฉบับ — ยอมรับรายการมาตรฐานก่อน"}]'::jsonb, updated_at = now() where id = r.id;
        continue;
      end if;
      insert into public.framework_grade_levels (framework_version_id, code, name_th, level_order)
      values (v_fv.id, v_grade_code, private.framework_grade_name(v_grade_code),
              (case left(v_grade_code, 1) when 'ม' then 6 else 0 end) + substring(v_grade_code from 3 for 1)::int)
      on conflict (framework_version_id, code) do nothing;
      select id into v_grade from public.framework_grade_levels where framework_version_id = v_fv.id and code = v_grade_code;
      select statement_th into v_exist from public.indicators
       where framework_version_id = v_fv.id and full_code = v ->> 'standard_code' || ' ' || v_grade_code || '/' || (v ->> 'number');
      if found then
        if btrim(v_exist) = btrim(v ->> 'statement') then v_same := v_same + 1;
          update public.document_analysis_items set status = 'committed', target_table = 'indicators',
                 target_id = (select id from public.indicators where framework_version_id = v_fv.id
                               and full_code = v ->> 'standard_code' || ' ' || v_grade_code || '/' || (v ->> 'number')), updated_at = now() where id = r.id;
        else v_conflict := v_conflict + 1;
          update public.document_analysis_items set flags = flags || jsonb_build_array(jsonb_build_object('code', 'COMMIT_CONFLICT',
                 'message_th', 'ฉบับนี้มีตัวชี้วัดรหัสเดียวกันแต่ข้อความต่าง — ไม่เขียนทับ', 'existing', v_exist)), updated_at = now() where id = r.id;
        end if;
        continue;
      end if;
      insert into public.indicators (framework_version_id, standard_id, framework_grade_level_id, code, full_code, indicator_kind, statement_th, source_citation)
      values (v_fv.id, v_std, v_grade, v ->> 'number', v ->> 'standard_code' || ' ' || v_grade_code || '/' || (v ->> 'number'),
              case when v_grade_code like '%-%' then 'stage' else 'grade' end, btrim(v ->> 'statement'), v_cite)
      returning id into v_ind;
      update public.document_analysis_items set status = 'committed', target_table = 'indicators', target_id = v_ind, updated_at = now() where id = r.id;
      v_ins_ind := v_ins_ind + 1;
    end if;
  end loop;

  return jsonb_build_object('framework_version_id', v_fv.id, 'standards_inserted', v_ins_std, 'indicators_inserted', v_ins_ind,
                            'already_same', v_same, 'conflicts_not_overwritten', v_conflict, 'invalid_skipped', v_invalid);
end $$;

-- ยืนยันฉบับกรอบแกนกลาง (ผู้ดูแลหลักสูตร) — หลังยืนยันเพิ่ม/แก้ไม่ได้ · is_complete = ผู้ดูแลยืนยันว่าชุดตัวชี้วัดครบตามเอกสาร
create or replace function public.framework_version_confirm(p_framework_version_id uuid, p_is_complete boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.framework_versions;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะผู้ดูแลหลักสูตรยืนยันกรอบแกนกลางได้' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.framework_versions where id = p_framework_version_id for update;
  if not found then raise exception 'ไม่พบฉบับกรอบหลักสูตร'; end if;
  if v.status = 'published' then raise exception 'ฉบับนี้ยืนยันแล้ว'; end if;
  if not exists (select 1 from public.indicators i where i.framework_version_id = v.id) then
    raise exception 'ฉบับนี้ยังไม่มีตัวชี้วัด — ยืนยันไม่ได้';
  end if;
  update public.framework_versions set status = 'published', is_complete = coalesce(p_is_complete, false) where id = v.id;
end $$;

-- ---------------------------------------------------------------- 6) เปรียบเทียบหลักสูตรสถานศึกษา: 4 สถานะ + CF ที่ยังไม่ตัดสิน
-- ใช้ผลจาก curriculum_compliance_check เดิม (ข้อมูลที่บันทึกแล้ว + เกณฑ์ที่ยืนยันแล้วเท่านั้น)
--  · insufficient_data → ข้อมูลไม่พอ (เช่น เกณฑ์ยังไม่ยืนยัน / ไม่มีข้อมูลในขอบเขต / ยังไม่มีกรอบแกนกลางที่ยืนยัน)
--  · มี CF ที่ยังไม่ตัดสินเกี่ยวกับขอบเขตนั้น → รอตรวจข้อขัดแย้ง (ไม่นับว่าผ่าน)
--  · warning/fail → ไม่ผ่าน · pass → ผ่าน
create or replace function public.curriculum_compliance_review(p_version_id uuid)
returns table (rule_code text, rule_version int, title_th text, category text, source text, scope text, raw_status text,
               verdict text, reason text, expected text, actual text, open_conflicts text[])
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  c record;
  v_rule public.curriculum_rules;
  v_school uuid;
  v_area text;
begin
  select v.school_id into v_school from public.curriculum_versions v where v.id = p_version_id;
  if not found then return; end if;
  for c in select * from public.curriculum_compliance_check(p_version_id) loop
    rule_code := c.rule_code; rule_version := c.rule_version; title_th := c.title_th; category := c.category; source := c.source;
    scope := c.scope; raw_status := c.status; expected := c.expected; actual := c.actual; open_conflicts := '{}';
    select * into v_rule from public.curriculum_rules r where r.school_id = v_school and r.code = c.rule_code and r.version = c.rule_version;
    if c.rule_code = 'SYS-CONFLICT' then
      open_conflicts := array(select sc.conflict_code from public.source_conflicts sc where sc.school_id = v_school and sc.status <> 'resolved' order by sc.conflict_code);
    elsif found and v_rule.rule_type in ('area_basic_hours', 'basic_hours_total', 'additional_hours', 'activity_hours') then
      v_area := v_rule.params ->> 'area_code';
      -- CF ระดับรายวิชาในกลุ่มสาระของเกณฑ์ (หรือทุกกลุ่มสาระ) + CF ระดับโครงสร้างเวลาเรียน (ไม่ผูกรหัสวิชา)
      open_conflicts := array(
        select sc.conflict_code from public.source_conflicts sc
         where sc.school_id = v_school and sc.status <> 'resolved'
           and (exists (select 1 from public.subjects s left join public.learning_areas la on la.id = s.learning_area_id
                         where s.curriculum_version_id = p_version_id and s.code = any (string_to_array(replace(coalesce(sc.subject_ref, ''), ' ', ''), '/'))
                           and (v_area is null or la.code = v_area))
                or (sc.category in ('learning_hours', 'program_total', 'credits')
                    and not exists (select 1 from public.subjects s where s.curriculum_version_id = p_version_id
                                     and s.code = any (string_to_array(replace(coalesce(sc.subject_ref, ''), ' ', ''), '/')))))
         order by sc.conflict_code);
    end if;
    if c.status = 'insufficient_data' then
      verdict := 'insufficient_data';
      reason := coalesce(c.detail, 'ข้อมูลหรือเกณฑ์ยังไม่ครบ — ยังสรุปไม่ได้');
    elsif coalesce(array_length(open_conflicts, 1), 0) > 0 then
      verdict := 'conflict_pending';
      reason := 'มีข้อขัดแย้งที่ยังไม่ตัดสิน ' || array_length(open_conflicts, 1) || ' ข้อในขอบเขตนี้ — ยังนับว่าผ่านไม่ได้';
    elsif c.status = 'pass' then
      verdict := 'pass'; reason := 'ตรงตามเกณฑ์ที่ยืนยันแล้ว จากข้อมูลที่บันทึกแล้ว';
    else
      verdict := 'fail'; reason := coalesce(c.detail, 'ไม่ตรงกับเกณฑ์ — ตรวจกับต้นฉบับก่อนสรุป');
    end if;
    return next;
  end loop;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.document_analysis_request(uuid, boolean), public.document_analysis_set_status(uuid, text, text),
  public.document_analysis_store(uuid, jsonb), public.document_analysis_item_decide(uuid[], text, jsonb, text, text),
  public.document_analysis_commit_framework(uuid, text, text, text, int), public.framework_version_confirm(uuid, boolean),
  public.curriculum_compliance_review(uuid), private.framework_grade_name(text) from public, anon;
grant execute on function public.document_analysis_request(uuid, boolean), public.document_analysis_item_decide(uuid[], text, jsonb, text, text),
  public.document_analysis_commit_framework(uuid, text, text, text, int), public.framework_version_confirm(uuid, boolean),
  public.curriculum_compliance_review(uuid) to authenticated;
-- การเขียนผลวิเคราะห์: service_role (Edge Function) เท่านั้น
revoke all on function public.document_analysis_set_status(uuid, text, text), public.document_analysis_store(uuid, jsonb) from authenticated;
grant execute on function public.document_analysis_set_status(uuid, text, text), public.document_analysis_store(uuid, jsonb) to service_role;
grant execute on function private.framework_grade_name(text) to authenticated, service_role;
