-- =============================================================================
-- Phase 2 — ทะเบียนมาตรฐานและตัวชี้วัด (กรอบแกนกลาง) + การตรวจรับรองข้อมูลจาก PDF
--  · ลำดับ: กรอบหลักสูตร → ฉบับ → กลุ่มสาระ → สาระ (ใหม่) → มาตรฐาน → ระดับชั้น → ตัวชี้วัด
--  · ตัวชี้วัด: ชนิดระหว่างทาง/ปลายทาง เป็นข้อมูลเฉพาะเมื่อเอกสารระบุ (ค่าเริ่ม unspecified) — ไม่สมมติว่าทุกฉบับแบ่ง
--  · สมรรถนะสำคัญ / คุณลักษณะอันพึงประสงค์ / การอ่าน คิดวิเคราะห์ และเขียน: ผู้ดูแลบันทึกพร้อมเอกสารและหน้าอ้างอิงเท่านั้น
--  · ยอมรับหลายรายการพร้อมกันได้เฉพาะรายการที่ไม่มีปัญหาค้าง · ประวัติแก้ไขจาก audit_logs · ไม่มีการอนุมัติอัตโนมัติ
--  · forward-only · ไม่แตะข้อมูลหลักสูตรสถานศึกษา/CF
-- =============================================================================

create table public.framework_strands (
  id                          uuid primary key default gen_random_uuid(),
  framework_version_id        uuid not null,
  framework_learning_area_id  uuid not null,
  code                        text not null check (code ~ '^[0-9]{1,2}$'),
  name_th                     text not null check (length(btrim(name_th)) between 1 and 300),
  source_citation             text not null check (length(btrim(source_citation)) > 0),
  created_at                  timestamptz not null default now(),
  unique (framework_version_id, framework_learning_area_id, code),
  unique (id, framework_version_id),
  foreign key (framework_learning_area_id, framework_version_id)
    references public.framework_learning_areas (id, framework_version_id) on delete restrict
);
alter table public.learning_standards add column strand_id uuid;
alter table public.learning_standards add constraint learning_standards_strand_fkey
  foreign key (strand_id, framework_version_id) references public.framework_strands (id, framework_version_id) on delete restrict;
alter table public.indicators add column stage_kind text not null default 'unspecified'
  check (stage_kind in ('interim', 'final', 'unspecified'));

create table public.framework_competencies (
  id                    uuid primary key default gen_random_uuid(),
  framework_version_id  uuid not null references public.framework_versions (id) on delete restrict,
  kind                  text not null check (kind in ('key_competency', 'desired_characteristic', 'reading_thinking_writing')),
  code                  text not null check (code ~ '^[A-Za-z0-9ก-๙._-]{1,20}$'),
  name_th               text not null check (length(btrim(name_th)) between 1 and 300),
  description_th        text check (description_th is null or length(description_th) <= 4000),
  source_citation       text not null check (length(btrim(source_citation)) > 0),
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  unique (framework_version_id, kind, code)
);

do $$
declare t text;
begin
  foreach t in array array['framework_strands', 'framework_competencies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (true)', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function private.audit_row_change()', t);
  end loop;
end $$;
create trigger framework_learning_areas_audit after insert or update or delete on public.framework_learning_areas
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------- ผลวิเคราะห์ที่ผ่านการตรวจ → กรอบแกนกลาง (เพิ่มสาระ + ชนิดตัวชี้วัด · ไม่เขียนทับ)
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
  v_strand uuid;
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
      -- สาระ (ถ้าเอกสารระบุ “สาระที่ N …” ก่อนมาตรฐาน) — ชื่อตามที่พิมพ์ ถ้าไม่มีชื่อใช้ป้าย “สาระที่ N” ตามต้นฉบับ
      v_strand := null;
      if coalesce(v ->> 'strand_no', '') ~ '^[0-9]{1,2}$' then
        insert into public.framework_strands (framework_version_id, framework_learning_area_id, code, name_th, source_citation)
        values (v_fv.id, v_area, v ->> 'strand_no', coalesce(nullif(btrim(v ->> 'strand_name'), ''), 'สาระที่ ' || (v ->> 'strand_no')), v_cite)
        on conflict (framework_version_id, framework_learning_area_id, code) do nothing;
        select id into v_strand from public.framework_strands
         where framework_version_id = v_fv.id and framework_learning_area_id = v_area and code = v ->> 'strand_no';
      end if;
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
      insert into public.learning_standards (framework_version_id, framework_learning_area_id, code, statement_th, source_citation, strand_id)
      values (v_fv.id, v_area, v ->> 'code', btrim(v ->> 'statement'), v_cite, v_strand) returning id into v_std;
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
      insert into public.indicators (framework_version_id, standard_id, framework_grade_level_id, code, full_code, indicator_kind, statement_th, source_citation, stage_kind)
      values (v_fv.id, v_std, v_grade, v ->> 'number', v ->> 'standard_code' || ' ' || v_grade_code || '/' || (v ->> 'number'),
              case when v_grade_code like '%-%' then 'stage' else 'grade' end, btrim(v ->> 'statement'), v_cite,
              -- ระหว่างทาง/ปลายทาง เฉพาะเมื่อเอกสารระบุ — ไม่สมมติ
              case when v ->> 'stage_kind' in ('interim', 'final') then v ->> 'stage_kind' else 'unspecified' end)
      returning id into v_ind;
      update public.document_analysis_items set status = 'committed', target_table = 'indicators', target_id = v_ind, updated_at = now() where id = r.id;
      v_ins_ind := v_ins_ind + 1;
    end if;
  end loop;

  return jsonb_build_object('framework_version_id', v_fv.id, 'standards_inserted', v_ins_std, 'indicators_inserted', v_ins_ind,
                            'already_same', v_same, 'conflicts_not_overwritten', v_conflict, 'invalid_skipped', v_invalid);
end $$;


-- ---------------------------------------------------------------- ตรวจรายการ (เพิ่ม: ยอมรับหลายรายการได้เฉพาะรายการที่ไม่มีปัญหาค้าง)
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
  -- ยอมรับหลายรายการพร้อมกัน: เฉพาะรายการที่ไม่มีปัญหาค้าง (ซ้ำ/ค่าขัดแย้ง/ข้อมูลไม่พอ) — รายการที่มีปัญหาต้องตรวจทีละรายการ
  if p_decision = 'accept' and coalesce(array_length(p_item_ids, 1), 0) > 1 and exists (
       select 1 from public.document_analysis_items i
        where i.id = any (p_item_ids)
          and (i.status in ('insufficient', 'duplicate')
               or i.flags @> '[{"code":"VARIANT_IN_DOC"}]' or i.flags @> '[{"code":"VARIANT_FRAMEWORK"}]'
               or i.flags @> '[{"code":"NO_STANDARD"}]' or i.flags @> '[{"code":"NO_STATEMENT"}]' or i.flags @> '[{"code":"COMMIT_CONFLICT"}]'
               or i.flags @> '[{"code":"COMMIT_INVALID"}]' or i.flags @> '[{"code":"NO_AREA"}]')) then
    raise exception 'มีรายการที่ซ้ำ ขัดแย้ง หรือข้อมูลไม่พอปนอยู่ — ยอมรับรายการเหล่านั้นทีละรายการหลังตรวจต้นฉบับ';
  end if;
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


-- ---------------------------------------------------------------- บันทึกสมรรถนะ/คุณลักษณะ (ผู้ดูแลหลักสูตร · ต้องอ้างเอกสาร+หน้า · ฉบับที่ยืนยันแล้วเพิ่มไม่ได้)
create or replace function public.framework_competency_add(p_framework_version_id uuid, p_kind text, p_code text, p_name_th text,
                                                           p_description_th text, p_source_document_id uuid, p_locator text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.framework_versions;
  d public.source_documents;
  v_id uuid;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะผู้ดูแลหลักสูตรบันทึกได้' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.framework_versions where id = p_framework_version_id;
  if not found then raise exception 'ไม่พบฉบับกรอบหลักสูตร'; end if;
  if v.status = 'published' then raise exception 'ฉบับนี้ยืนยันแล้ว — เพิ่มข้อมูลไม่ได้'; end if;
  select * into d from public.source_documents where id = p_source_document_id and school_id = private.current_school_id();
  if not found then raise exception 'ต้องอ้างเอกสารต้นทางในทะเบียน'; end if;
  if p_locator is null or not private.is_valid_locator(p_locator) then raise exception 'ต้องระบุหน้าอ้างอิง (เช่น pdf:12)'; end if;
  insert into public.framework_competencies (framework_version_id, kind, code, name_th, description_th, source_citation)
  values (v.id, p_kind, btrim(p_code), btrim(p_name_th), nullif(btrim(coalesce(p_description_th, '')), ''), d.register_code || ' ' || p_locator)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- ค้นหา/กรองรายการตรวจ (กลุ่มสาระ มาตรฐาน ชั้น สถานะ ปัญหา ข้อความ)
create or replace function public.document_analysis_items_search(p_analysis_id uuid, p_type text default null, p_status text default null,
  p_area text default null, p_standard text default null, p_grade text default null, p_flag text default null, p_search text default null,
  p_limit int default 100, p_offset int default 0)
returns setof public.document_analysis_items
language sql
stable
security invoker
set search_path = ''
as $$
  select i.* from public.document_analysis_items i
   where i.analysis_id = p_analysis_id
     and (p_type is null or i.item_type = p_type)
     and (p_status is null or i.status = p_status)
     and (p_area is null or coalesce(i.extracted ->> 'area_code', left(i.extracted ->> 'standard_code', 1), left(i.extracted ->> 'code', 1)) = p_area)
     and (p_standard is null or coalesce(i.extracted ->> 'standard_code', i.extracted ->> 'code') = p_standard)
     and (p_grade is null or i.extracted ->> 'grade' = p_grade)
     and (p_flag is null or (p_flag = 'any' and jsonb_array_length(i.flags) > 0) or i.flags @> jsonb_build_array(jsonb_build_object('code', p_flag)))
     and (p_search is null or i.item_key ilike '%' || p_search || '%' or coalesce(i.edited, i.extracted) ->> 'statement' ilike '%' || p_search || '%')
   order by i.seq
   limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------- สรุปความคืบหน้าการตรวจ (ตามชนิด/กลุ่มสาระ/ชั้น/สถานะ)
create or replace function public.document_analysis_summary(p_analysis_id uuid)
returns table (item_type text, area_code text, grade text, status text, repaired boolean, conflicted boolean, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.item_type,
         coalesce(i.extracted ->> 'area_code', left(i.extracted ->> 'standard_code', 1), left(i.extracted ->> 'code', 1)),
         i.extracted ->> 'grade', i.status,
         i.flags @> '[{"code":"TEXT_REPAIRED"}]',
         (i.flags @> '[{"code":"VARIANT_IN_DOC"}]' or i.flags @> '[{"code":"VARIANT_FRAMEWORK"}]' or i.flags @> '[{"code":"COMMIT_CONFLICT"}]'),
         count(*)::int
    from public.document_analysis_items i
   where i.analysis_id = p_analysis_id
   group by 1, 2, 3, 4, 5, 6
$$;

-- ---------------------------------------------------------------- ประวัติการแก้ไขรายการ (จาก audit_logs · ผู้อ่านหลักสูตร)
create or replace function public.document_analysis_item_history(p_item_id uuid)
returns table (at timestamptz, actor_name text, action text, status text, decision_note text, edited jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.curriculum_reader_role() or not exists (
       select 1 from public.document_analysis_items i where i.id = p_item_id and i.school_id = private.current_school_id()) then
    raise exception 'ไม่พบรายการ' using errcode = 'insufficient_privilege';
  end if;
  return query
  select l.created_at, coalesce(p.display_name, p.email, 'ระบบ'), l.action, l.new_data ->> 'status', l.new_data ->> 'decision_note', l.new_data -> 'edited'
    from public.audit_logs l left join public.profiles p on p.id = l.actor_id
   where l.table_name = 'document_analysis_items' and l.record_id = p_item_id
   order by l.created_at;
end $$;

-- ---------------------------------------------------------------- ความครบถ้วนของกรอบแกนกลาง (ไม่ให้ % ถ้ายังไม่ยืนยันว่าครบ)
create or replace function public.framework_completeness(p_framework_version_id uuid)
returns table (area_code text, area_name text, grade_code text, standards int, indicators int, interim int, final int, unspecified int,
               version_status text, is_complete boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.code, a.name_th, g.code,
         (select count(*)::int from public.learning_standards s where s.framework_learning_area_id = a.id),
         count(i.id)::int,
         count(i.id) filter (where i.stage_kind = 'interim')::int,
         count(i.id) filter (where i.stage_kind = 'final')::int,
         count(i.id) filter (where i.stage_kind = 'unspecified')::int,
         v.status, v.is_complete
    from public.framework_versions v
    join public.framework_learning_areas a on a.framework_version_id = v.id
    left join public.learning_standards s on s.framework_learning_area_id = a.id
    left join public.indicators i on i.standard_id = s.id
    left join public.framework_grade_levels g on g.id = i.framework_grade_level_id
   where v.id = p_framework_version_id
   group by a.id, a.code, a.name_th, g.code, g.level_order, v.status, v.is_complete
   order by a.code, g.level_order nulls first
$$;

revoke all on function public.framework_competency_add(uuid, text, text, text, text, uuid, text), public.document_analysis_items_search(uuid, text, text, text, text, text, text, text, int, int),
  public.document_analysis_summary(uuid), public.document_analysis_item_history(uuid), public.framework_completeness(uuid) from public, anon;
grant execute on function public.framework_competency_add(uuid, text, text, text, text, uuid, text), public.document_analysis_items_search(uuid, text, text, text, text, text, text, text, int, int),
  public.document_analysis_summary(uuid), public.document_analysis_item_history(uuid), public.framework_completeness(uuid) to authenticated;
