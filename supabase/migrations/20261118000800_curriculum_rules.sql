-- =============================================================================
-- C3 — Curriculum Compliance Rules
-- หลักการ
-- - เกณฑ์ทุกข้อต้องมีแหล่งที่มา (เอกสาร + locator) และเวอร์ชัน · เกณฑ์ที่ยังไม่ยืนยัน (draft) ไม่ถูกใช้ตัดสิน → insufficient_data
-- - ยืนยันเกณฑ์ได้เฉพาะหัวหน้าฝ่ายวิชาการ (มนุษย์) · AI/parser เสนอเกณฑ์ได้แต่ยืนยันไม่ได้
-- - ประเมินจากข้อมูลที่บันทึกแล้ว (committed) เท่านั้น — ไม่ใช้ข้อมูลรอตรวจ · ไม่บังคับ 1 หน่วยกิต = 40 ชั่วโมง
-- - ผล: pass | warning | fail | insufficient_data (ไม่มี "ผ่าน" ถ้าข้อมูลหรือเกณฑ์ไม่ครบ)
-- =============================================================================

create table public.curriculum_rules (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null default private.current_school_id() references public.schools (id) on delete restrict,
  code                text not null check (code ~ '^[A-Z]{2,6}-[A-Z0-9-]{1,24}$'),
  version             int not null default 1 check (version > 0),
  title_th            text not null check (length(btrim(title_th)) between 1 and 300),
  category            text not null check (category in ('structure', 'credits', 'learning_hours', 'program', 'mapping', 'duplication', 'coverage', 'cohort', 'missing_data')),
  rule_type           text not null check (rule_type in ('area_basic_hours', 'basic_hours_total', 'additional_hours', 'activity_hours')),
  params              jsonb not null default '{}'::jsonb,
  source_document_id  uuid,
  source_locator      text check (source_locator is null or private.is_valid_locator(source_locator)),
  status              text not null default 'draft' check (status in ('draft', 'verified', 'retired')),
  proposed_by         text not null default 'manual' check (proposed_by in ('manual', 'parser', 'ai')),
  note                text,
  verified_by         uuid references auth.users (id),
  verified_at         timestamptz,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (school_id, code, version),
  check ((status = 'verified') = (verified_by is not null and verified_at is not null)
         or status = 'retired'),
  check (status = 'draft' or (source_document_id is not null and source_locator is not null)),
  foreign key (source_document_id, school_id) references public.source_documents (id, school_id) on delete restrict
);
alter table public.curriculum_rules enable row level security;
revoke all on public.curriculum_rules from anon, authenticated;
grant select on public.curriculum_rules to authenticated;
grant insert (id, code, version, title_th, category, rule_type, params, source_document_id, source_locator, proposed_by, note) on public.curriculum_rules to authenticated;
grant update (title_th, category, rule_type, params, source_document_id, source_locator, note) on public.curriculum_rules to authenticated;
create policy curriculum_rules_select on public.curriculum_rules for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.curriculum_reader_role()));
create policy curriculum_rules_insert on public.curriculum_rules for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_office_staff()));
-- แก้ได้เฉพาะเกณฑ์ร่าง · เกณฑ์ที่ยืนยันแล้วต้องออกเวอร์ชันใหม่
create policy curriculum_rules_update on public.curriculum_rules for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_office_staff()) and status = 'draft')
  with check (school_id = (select private.current_school_id()) and status = 'draft');

create or replace function public.curriculum_rule_verify(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.curriculum_rules;
begin
  perform private.require_human();
  if not private.has_role('academic_head') then
    raise exception 'เฉพาะหัวหน้าฝ่ายวิชาการยืนยันเกณฑ์ได้' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.curriculum_rules where id = p_id and school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบเกณฑ์'; end if;
  if p_status = 'verified' then
    if v.status <> 'draft' then raise exception 'ยืนยันได้เฉพาะเกณฑ์ร่าง'; end if;
    if v.source_document_id is null or v.source_locator is null then raise exception 'เกณฑ์ต้องอ้างเอกสารและหน้าก่อนยืนยัน'; end if;
    update public.curriculum_rules set status = 'verified', verified_by = auth.uid(), verified_at = now(), updated_at = now() where id = p_id;
  elsif p_status = 'retired' then
    update public.curriculum_rules set status = 'retired', updated_at = now() where id = p_id;
  else
    raise exception 'สถานะไม่ถูกต้อง';
  end if;
end $$;
revoke all on function public.curriculum_rule_verify(uuid, text) from public, anon;
grant execute on function public.curriculum_rule_verify(uuid, text) to authenticated;

-- ---------------------------------------------------------------- evaluator (อ่านอย่างเดียว · RLS ผู้เรียก)
-- ชั่วโมงต่อแผน: offering ที่ study_program_id = แผน หรือ null (ใช้ทุกแผน) · นับจาก subjects.learning_hours ตามต้นฉบับ
create or replace function public.curriculum_compliance_check(p_version_id uuid)
returns table (rule_code text, rule_version int, title_th text, category text, source text, scope text, status text, expected text, actual text, detail text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ver public.curriculum_versions;
  v_rule public.curriculum_rules;
  v_prog record;
  v_hours numeric;
  v_n_off int;
  v_grades text[];
  v_src text;
  v_cnt int;
begin
  select * into v_ver from public.curriculum_versions where id = p_version_id;
  if not found then return; end if;
  select count(*) into v_n_off from public.subject_offerings where curriculum_version_id = p_version_id;

  -- ---- system data-quality checks (แหล่ง: ระบบ — ไม่ใช่เกณฑ์หลักสูตร)
  rule_code := 'SYS-DATA'; rule_version := 1; title_th := 'มีโครงสร้างรายวิชาที่บันทึกแล้ว'; category := 'missing_data'; source := 'ระบบ (ข้อมูลที่บันทึกแล้ว)'; scope := 'ฉบับ';
  expected := '> 0 รายการ'; actual := v_n_off::text;
  status := case when v_n_off > 0 then 'pass' else 'insufficient_data' end;
  detail := case when v_n_off > 0 then null else 'ยังไม่มีการจัดรายวิชาที่ผ่านการอนุมัติและบันทึก — เกณฑ์อื่นประเมินไม่ได้' end;
  return next;

  select count(*) into v_cnt from public.subjects where curriculum_version_id = p_version_id and nullif(btrim(description_th), '') is null;
  rule_code := 'SYS-DESC'; title_th := 'รายวิชามีคำอธิบายรายวิชา'; category := 'missing_data';
  expected := '0 รายวิชาที่ไม่มีคำอธิบาย'; actual := v_cnt::text;
  status := case when not exists (select 1 from public.subjects where curriculum_version_id = p_version_id) then 'insufficient_data' when v_cnt = 0 then 'pass' else 'warning' end;
  detail := null; return next;

  select count(*) into v_cnt from public.source_conflicts c
   where c.status <> 'resolved' and (c.doc_a_id = v_ver.announcement_source_id or c.doc_b_id = v_ver.announcement_source_id
         or c.doc_a_id in (select d.id from public.source_documents d where d.parent_id = v_ver.announcement_source_id));
  rule_code := 'SYS-CONFLICT'; title_th := 'ข้อขัดแย้งของเอกสารต้นทางได้รับการตัดสินแล้ว'; category := 'missing_data';
  expected := '0 ข้อที่ยังไม่ตัดสิน'; actual := v_cnt::text;
  status := case when v_ver.announcement_source_id is null then 'insufficient_data' when v_cnt = 0 then 'pass' else 'warning' end;
  detail := case when v_ver.announcement_source_id is null then 'ฉบับนี้ยังไม่ระบุเอกสารประกาศใช้' end; return next;

  rule_code := 'SYS-FRAMEWORK'; title_th := 'อ้างอิงกรอบหลักสูตรแกนกลางที่ยืนยันแล้วและชุดตัวชี้วัดครบ'; category := 'mapping';
  expected := 'framework confirmed + is_complete';
  select coalesce(fv.version_label, '–') || ' · ' || v_ver.framework_status || ' · complete=' || coalesce(fv.is_complete::text, '–') into actual
    from (select 1) x left join public.framework_versions fv on fv.id = v_ver.framework_version_id;
  status := case when v_ver.framework_version_id is not null and v_ver.framework_status = 'confirmed'
                      and exists (select 1 from public.framework_versions f where f.id = v_ver.framework_version_id and f.is_complete) then 'pass'
                 else 'insufficient_data' end;
  detail := case when status = 'insufficient_data' then 'ยังไม่มีชุดตัวชี้วัดแกนกลางที่ยืนยัน — ไม่รายงานความครอบคลุม (Coverage)' end; return next;

  if status = 'pass' then
    select count(*) into v_cnt from public.indicators i where i.framework_version_id = v_ver.framework_version_id
       and not exists (select 1 from public.curriculum_indicator_mappings m where m.indicator_id = i.id and m.curriculum_version_id = p_version_id and m.status = 'verified');
    rule_code := 'SYS-COVERAGE'; title_th := 'ตัวชี้วัดแกนกลางมี mapping ที่ยืนยันแล้ว'; category := 'coverage';
    expected := '0 ตัวชี้วัดที่ยังไม่มี mapping'; actual := v_cnt::text;
    status := case when v_cnt = 0 then 'pass' else 'warning' end; detail := null; return next;
  end if;

  select count(*) into v_cnt from public.curriculum_implementations where curriculum_version_id = p_version_id;
  rule_code := 'SYS-COHORT'; title_th := 'กำหนดรุ่นนักเรียนที่ใช้หลักสูตรฉบับนี้'; category := 'cohort';
  expected := '≥ 1 รุ่น'; actual := v_cnt::text; status := case when v_cnt > 0 then 'pass' else 'insufficient_data' end; detail := null; return next;

  -- ---- document criteria
  for v_rule in select * from public.curriculum_rules r where r.school_id = v_ver.school_id and r.status <> 'retired' order by r.code, r.version loop
    rule_code := v_rule.code; rule_version := v_rule.version; title_th := v_rule.title_th; category := v_rule.category;
    select coalesce(d.register_code, '–') || ' ' || coalesce(v_rule.source_locator, '') into v_src
      from (select 1) x left join public.source_documents d on d.id = v_rule.source_document_id;
    source := v_src;
    v_grades := array(select jsonb_array_elements_text(v_rule.params -> 'grade_codes'));
    expected := (v_rule.params ->> 'op') || ' ' || (v_rule.params ->> 'hours') || ' ชม.';
    if v_rule.status <> 'verified' then
      scope := array_to_string(v_grades, ','); status := 'insufficient_data'; actual := null;
      detail := 'เกณฑ์ยังไม่ได้รับการยืนยันจากหัวหน้าฝ่ายวิชาการ'; return next; continue;
    end if;
    for v_prog in select p.id, p.code, p.stage from public.study_programs p where p.curriculum_version_id = p_version_id order by p.code loop
      if not exists (select 1 from public.grade_levels g where g.school_id = v_ver.school_id and g.code = any (v_grades) and g.stage = v_prog.stage) then continue; end if;
      scope := v_prog.code || ' · ' || array_to_string(v_grades, ',');
      if v_rule.rule_type = 'activity_hours' then
        select sum(a.activity_hours), count(*) into v_hours, v_cnt from public.learning_activities a join public.grade_levels g on g.id = a.grade_level_id
         where a.curriculum_version_id = p_version_id and g.code = any (v_grades) and (a.study_program_id = v_prog.id or a.study_program_id is null);
      else
        select sum(s.learning_hours), count(*) into v_hours, v_cnt
          from public.subject_offerings o join public.subjects s on s.id = o.subject_id join public.grade_levels g on g.id = o.grade_level_id
          left join public.learning_areas la on la.id = s.learning_area_id
         where o.curriculum_version_id = p_version_id and g.code = any (v_grades) and (o.study_program_id = v_prog.id or o.study_program_id is null)
           and s.subject_type = case when v_rule.rule_type = 'additional_hours' then 'additional' else 'basic' end
           and (v_rule.rule_type <> 'area_basic_hours' or la.code = v_rule.params ->> 'area_code');
      end if;
      actual := coalesce(v_hours, 0)::text || ' ชม.';
      if v_cnt = 0 then
        status := 'insufficient_data'; detail := 'ไม่มีข้อมูลที่บันทึกแล้วในขอบเขตนี้';
      elsif (v_rule.params ->> 'op' = 'eq' and v_hours = (v_rule.params ->> 'hours')::numeric)
         or (v_rule.params ->> 'op' = 'gte' and v_hours >= (v_rule.params ->> 'hours')::numeric) then
        status := 'pass'; detail := null;
      else
        status := coalesce(v_rule.params ->> 'severity', 'warning'); detail := 'ไม่ตรงกับเกณฑ์ในเอกสารอ้างอิง — ตรวจกับต้นฉบับก่อนสรุป';
      end if;
      return next;
    end loop;
  end loop;
end $$;
revoke all on function public.curriculum_compliance_check(uuid) from public, anon;
grant execute on function public.curriculum_compliance_check(uuid) to authenticated;

-- ---------------------------------------------------------------- analytics: โครงสร้างจากข้อมูลที่บันทึกแล้วเท่านั้น
create or replace function public.curriculum_structure_summary(p_version_id uuid)
returns table (grade_code text, program_code text, subject_type text, subjects int, credits numeric, learning_hours int)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.code, p.code, s.subject_type, count(*)::int, sum(s.credits), sum(s.learning_hours)::int
    from public.subject_offerings o
    join public.subjects s on s.id = o.subject_id
    join public.grade_levels g on g.id = o.grade_level_id
    left join public.study_programs p on p.id = o.study_program_id
   where o.curriculum_version_id = p_version_id
   group by 1, 2, 3
   order by 1, 2, 3
$$;
revoke all on function public.curriculum_structure_summary(uuid) from public, anon;
grant execute on function public.curriculum_structure_summary(uuid) to authenticated;
