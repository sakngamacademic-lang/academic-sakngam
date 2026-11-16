-- =============================================================================
-- C4.1 — แก้ 2 ปัญหาบน Staging (คนละสาเหตุ)
-- (ก) วิเคราะห์ PDF หลายหน้าเกิน CPU limit ของ Edge Function → งานค้าง running
--     · แบ่งงานเป็นรอบ (chunk) เก็บข้อความรายหน้า + ความคืบหน้า + heartbeat → ทำต่อจากหน้าที่ค้างได้ ไม่ข้ามหน้า
--     · กันวนไม่สิ้นสุด: รอบต้องตรงลำดับ (p_expected_chunk) และไม่เกินเพดาน · กันทำซ้อนด้วย lease
--     · งานค้าง (ไม่มี heartbeat > 10 นาที) → failed พร้อมเหตุผล · ผู้ดูแลสั่ง “ทำต่อ” งานเดิมได้ (ไม่สร้างงานใหม่)
-- (ข) curriculum_compliance_review ช้า (หา CF รายเกณฑ์ผ่าน RLS ซ้ำ ๆ → เกิน statement timeout)
--     · คำนวณ CF ที่เกี่ยวข้องครั้งเดียวต่อการเรียก ผลลัพธ์เท่าเดิม
-- forward-only · ไม่แตะข้อมูลหลักสูตร/CF
-- =============================================================================

alter table public.document_analyses
  add column pages_done   int not null default 0 check (pages_done >= 0),
  add column chunk_count  int not null default 0 check (chunk_count >= 0),
  add column attempts     int not null default 0 check (attempts >= 0),
  add column heartbeat_at timestamptz,
  add column phase        text not null default 'extract' check (phase in ('extract', 'analyze'));

-- ข้อความรายหน้า (ผลกลางของการอ่าน) — ใช้ทำต่อจากหน้าที่ค้างและวิเคราะห์ทั้งเล่มในรอบสุดท้าย · อ่าน/เขียนผ่าน service_role เท่านั้น
create table public.document_analysis_pages (
  analysis_id  uuid not null references public.document_analyses (id) on delete restrict,
  page_no      int not null check (page_no > 0),
  text         text not null default '' check (length(text) <= 60000),
  created_at   timestamptz not null default now(),
  primary key (analysis_id, page_no)
);
alter table public.document_analysis_pages enable row level security;
revoke all on public.document_analysis_pages from anon, authenticated;
grant select, insert, update on public.document_analysis_pages to service_role;

-- นิยามงานค้าง: ยังไม่เสร็จ และไม่มีความเคลื่อนไหว 10 นาที
create or replace function private.document_analysis_is_stale(a public.document_analyses)
returns boolean language sql stable set search_path = '' as $$
  select a.status in ('queued', 'running') and coalesce(a.heartbeat_at, a.started_at, a.created_at) < now() - interval '10 minutes'
$$;

-- ---------------------------------------------------------------- ขอวิเคราะห์ (แทนของเดิม: งานค้างใช้นิยามใหม่ · ถ้ามีงานค้างให้ “ทำต่อ” แทนการสร้างใหม่)
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
  if exists (select 1 from public.document_analyses a where a.source_document_id = d.id and a.status in ('queued', 'running')) then
    raise exception 'เอกสารนี้มีงานวิเคราะห์ที่ยังไม่เสร็จ — กด “ทำต่อ” ที่งานเดิมแทนการสร้างงานใหม่';
  end if;
  insert into public.document_analyses (school_id, source_document_id, file_id, ai_allowed, page_count, created_by)
  values (d.school_id, d.id, f.id, coalesce(p_allow_ai, false), d.page_count, auth.uid())
  returning id into v_id;
  return query select v_id, f.object_key, f.file_ext, d.page_count, coalesce(p_allow_ai, false), d.register_code;
end $$;

-- ---------------------------------------------------------------- ทำต่อ/ลองใหม่ งานเดิม (ผู้ดูแลหลักสูตร) — ไม่สร้างงานใหม่ เก็บหน้าที่อ่านแล้วไว้
create or replace function public.document_analysis_retry(p_analysis_id uuid)
returns table (analysis_id uuid, chunk_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare a public.document_analyses;
begin
  perform private.require_human();
  if not private.is_curriculum_admin() then
    raise exception 'เฉพาะผู้ดูแลหลักสูตรสั่งทำต่อได้' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.document_analyses d where d.id = p_analysis_id and d.school_id = private.current_school_id() for update;
  if not found then raise exception 'ไม่พบงานวิเคราะห์' using errcode = 'insufficient_privilege'; end if;
  if a.status = 'done' then raise exception 'งานนี้วิเคราะห์เสร็จแล้ว — ใช้ “วิเคราะห์ใหม่” ถ้าต้องการอ่านซ้ำ'; end if;
  if a.status in ('queued', 'running') and not private.document_analysis_is_stale(a) then
    raise exception 'งานนี้กำลังทำงานอยู่ — รอสักครู่';
  end if;
  if a.attempts >= 5 then raise exception 'สั่งทำต่อครบ 5 ครั้งแล้ว — ตรวจไฟล์ (เช่น แบ่ง PDF เป็นส่วนเล็กลง) แล้ววิเคราะห์ใหม่'; end if;
  if exists (select 1 from public.document_analysis_items i where i.analysis_id = a.id) then
    raise exception 'งานนี้มีผลบางส่วนแล้ว — ใช้ “วิเคราะห์ใหม่”';
  end if;
  update public.document_analyses
     set status = 'queued', error = null, finished_at = null, attempts = attempts + 1, heartbeat_at = now(), updated_at = now()
   where id = a.id;
  return query select a.id, a.chunk_count;
end $$;

-- ---------------------------------------------------------------- จองรอบประมวลผล (service_role) — กันทำซ้อน · กันวนไม่สิ้นสุด
create or replace function public.document_analysis_claim(p_analysis_id uuid, p_expected_chunk int, p_max_chunks int default 400)
returns table (analysis_id uuid, object_key text, file_ext text, page_count int, pages_done int, chunk_no int, phase text, allow_ai boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.document_analyses;
  f public.files;
begin
  select * into a from public.document_analyses d where d.id = p_analysis_id for update;
  if not found or a.status not in ('queued', 'running') then return; end if;
  -- รอบที่ส่งต่อมาต้องตรงลำดับ (คำขอซ้ำ/ค้างเก่าไม่ทำงานซ้อน)
  if p_expected_chunk is not null and p_expected_chunk <> a.chunk_count then return; end if;
  if a.chunk_count >= p_max_chunks then
    update public.document_analyses set status = 'failed', finished_at = now(), updated_at = now(),
           error = 'ประมวลผลเกิน ' || p_max_chunks || ' รอบ (อ่านได้ ' || a.pages_done || coalesce('/' || a.page_count, '') || ' หน้า) — หยุดเพื่อกันการทำงานวนไม่สิ้นสุด'
     where id = a.id;
    return;
  end if;
  select * into f from public.files where id = a.file_id;
  update public.document_analyses
     set status = 'running', started_at = coalesce(started_at, now()), heartbeat_at = now(), chunk_count = chunk_count + 1, updated_at = now()
   where id = a.id;
  return query select a.id, f.object_key, f.file_ext, a.page_count, a.pages_done, a.chunk_count + 1, a.phase, a.ai_allowed;
end $$;

-- ---------------------------------------------------------------- บันทึกข้อความรายหน้า (service_role) — pages_done = หน้าที่อ่านต่อเนื่องจากหน้า 1
create or replace function public.document_analysis_save_pages(p_analysis_id uuid, p_first_page int, p_texts text[], p_page_count int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.document_analyses;
  v_done int;
begin
  select * into a from public.document_analyses where id = p_analysis_id for update;
  if not found or a.status <> 'running' then raise exception 'งานวิเคราะห์ไม่อยู่ในสถานะกำลังทำงาน'; end if;
  if p_first_page <> a.pages_done + 1 then raise exception 'หน้าที่บันทึกไม่ต่อเนื่อง (คาดหน้า %, ได้หน้า %)', a.pages_done + 1, p_first_page; end if;
  insert into public.document_analysis_pages (analysis_id, page_no, text)
  select a.id, p_first_page + i - 1, left(coalesce(p_texts[i], ''), 60000) from generate_subscripts(p_texts, 1) i
  on conflict (analysis_id, page_no) do update set text = excluded.text;
  v_done := a.pages_done + coalesce(array_length(p_texts, 1), 0);
  update public.document_analyses
     set pages_done = v_done, page_count = coalesce(p_page_count, page_count), heartbeat_at = now(),
         phase = case when p_page_count is not null and v_done >= p_page_count then 'analyze' else 'extract' end, updated_at = now()
   where id = a.id;
  return v_done;
end $$;

create or replace function public.document_analysis_page_texts(p_analysis_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.text order by p.page_no), '{}') from public.document_analysis_pages p where p.analysis_id = p_analysis_id
$$;

-- ---------------------------------------------------------------- งานค้าง → failed พร้อมเหตุผล (ผู้อ่านหลักสูตรเรียกได้ · เปลี่ยนเฉพาะงานที่ค้างจริง)
create or replace function public.document_analysis_reap_stale()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  perform private.require_human();
  if not private.curriculum_reader_role() then return 0; end if;
  update public.document_analyses a
     set status = 'failed', finished_at = now(), updated_at = now(),
         error = 'หยุดทำงานกลางคัน (เกินเวลา/CPU ของ Edge Function) ที่หน้า ' || a.pages_done || coalesce('/' || a.page_count, '')
                 || ' — กด “ทำต่อ” เพื่อประมวลผลต่อจากหน้าที่ค้าง'
   where a.school_id = private.current_school_id() and private.document_analysis_is_stale(a);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- (ข) เปรียบเทียบหลักสูตร: คำนวณ CF ที่เกี่ยวข้องครั้งเดียว (ผลเท่าเดิม)
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
  v_school uuid;
  v_all text[];
  v_struct text[];
  v_cf_area jsonb;
  v_subj jsonb;
  v_rules jsonb;
  v_rule jsonb;
  v_area text;
begin
  select v.school_id into v_school from public.curriculum_versions v where v.id = p_version_id;
  if not found then return; end if;

  -- CF ที่ยังไม่ตัดสินทั้งหมด
  v_all := array(select sc.conflict_code from public.source_conflicts sc where sc.school_id = v_school and sc.status <> 'resolved' order by sc.conflict_code);
  -- รหัสวิชาของฉบับนี้ → รหัสกลุ่มสาระ (อ่านครั้งเดียว — join ซ้ำผ่าน RLS ทำให้ช้าเกิน statement timeout)
  select coalesce(jsonb_object_agg(s.code, coalesce(la.code, '')), '{}'::jsonb) into v_subj
    from public.subjects s left join public.learning_areas la on la.id = s.learning_area_id
   where s.curriculum_version_id = p_version_id;
  -- CF ระดับรายวิชา → รหัสกลุ่มสาระของรายวิชาที่อ้าง
  select coalesce(jsonb_object_agg(m.conflict_code, m.areas), '{}'::jsonb) into v_cf_area
    from (select sc.conflict_code, jsonb_agg(distinct v_subj ->> btrim(r)) as areas
            from public.source_conflicts sc, unnest(string_to_array(replace(coalesce(sc.subject_ref, ''), ' ', ''), '/')) r
           where sc.school_id = v_school and sc.status <> 'resolved' and v_subj ? btrim(r)
           group by sc.conflict_code) m;
  -- CF ระดับโครงสร้าง (ชั่วโมง/หน่วยกิต/ยอดแผน ที่ไม่ผูกรหัสวิชาในฉบับนี้)
  v_struct := array(select sc.conflict_code from public.source_conflicts sc
                     where sc.school_id = v_school and sc.status <> 'resolved'
                       and sc.category in ('learning_hours', 'program_total', 'credits')
                       and not (v_cf_area ? sc.conflict_code));
  select coalesce(jsonb_object_agg(r.code || '#' || r.version, jsonb_build_object('type', r.rule_type, 'area', r.params ->> 'area_code')), '{}'::jsonb)
    into v_rules from public.curriculum_rules r where r.school_id = v_school;

  for c in select * from public.curriculum_compliance_check(p_version_id) loop
    rule_code := c.rule_code; rule_version := c.rule_version; title_th := c.title_th; category := c.category; source := c.source;
    scope := c.scope; raw_status := c.status; expected := c.expected; actual := c.actual; open_conflicts := '{}';
    v_rule := v_rules -> (c.rule_code || '#' || c.rule_version);
    if c.rule_code = 'SYS-CONFLICT' then
      open_conflicts := v_all;
    elsif v_rule is not null and v_rule ->> 'type' in ('area_basic_hours', 'basic_hours_total', 'additional_hours', 'activity_hours') then
      v_area := v_rule ->> 'area';
      open_conflicts := array(
        select x from (
          select e.key as x from jsonb_each(v_cf_area) e where v_area is null or e.value ? v_area
          union
          select unnest(v_struct)
        ) u order by x);
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
revoke all on function public.document_analysis_retry(uuid), public.document_analysis_claim(uuid, int, int),
  public.document_analysis_save_pages(uuid, int, text[], int), public.document_analysis_page_texts(uuid),
  public.document_analysis_reap_stale(), private.document_analysis_is_stale(public.document_analyses) from public, anon;
grant execute on function public.document_analysis_retry(uuid), public.document_analysis_reap_stale() to authenticated;
revoke all on function public.document_analysis_claim(uuid, int, int), public.document_analysis_save_pages(uuid, int, text[], int),
  public.document_analysis_page_texts(uuid) from authenticated;
grant execute on function public.document_analysis_claim(uuid, int, int), public.document_analysis_save_pages(uuid, int, text[], int),
  public.document_analysis_page_texts(uuid) to service_role;
grant execute on function private.document_analysis_is_stale(public.document_analyses) to authenticated, service_role;
