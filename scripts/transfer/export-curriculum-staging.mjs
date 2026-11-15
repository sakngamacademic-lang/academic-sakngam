#!/usr/bin/env node
/**
 * สร้างไฟล์ SQL สำหรับย้าย "ข้อมูลหลักสูตรที่รอตรวจ" จาก Supabase Local → Supabase Staging (Hosted)
 *
 * หลักการ (ตรวจได้ทุกข้อในไฟล์ที่สร้าง):
 * - รักษา UUID เดิมทุกแถว และความสัมพันธ์ FK (source page / sheet / cell / normalized / issues / สถานะ)
 * - school_id → โรงเรียนปลายทางตามรหัส · ผู้สร้าง/ผู้ทำรายการ → บัญชีปลายทางที่ระบุ (ไม่สร้างบัญชี)
 * - สถานะคงเดิม: ฉบับหลักสูตร draft · ชุดนำเข้า needs_review · แถว needs_review/error · ข้อขัดแย้ง needs_decision · เกณฑ์ draft
 *   (สคริปต์ปฏิเสธข้อมูลที่ approved / committed / active — ไม่ย้ายผลการอนุมัติ)
 * - upsert ปลอดภัย: insert … on conflict (id) do nothing · ถ้ามีแถว id เดียวกันแต่เนื้อหาต่าง → abort (ไม่เขียนทับ)
 * - ตรวจจำนวนแถวหลังย้าย ไม่ตรง → abort ทั้ง transaction · รันซ้ำได้ (ไม่สร้างซ้ำ)
 * - ไฟล์ต้นฉบับ: file_id ของเอกสารถูกตั้งเป็น null (ไฟล์อยู่ใน storage local) — ผูกใหม่หลังอัปโหลดเข้า R2 และตรวจ SHA256
 * - สร้างไฟล์ rollback คู่กัน (ลบเฉพาะแถวที่ย้าย และเฉพาะเมื่อยังไม่มีการตรวจ/อนุมัติโดยคน) — ไม่ถูกรันอัตโนมัติ
 *
 * ใช้:
 *   --dry-run  สร้าง dryrun-<ts>.sql แบบ "อ่านอย่างเดียว" (begin read only) สำหรับรันบน Staging: ตรวจโรงเรียน/บัญชี/บทบาทผู้สร้าง, แถวที่จะเพิ่ม/ซ้ำ/ขัดแย้ง,
 *             FK ภายใน payload, unique key ชนกัน, CHECK constraint จริงของ Hosted (ผ่านตารางชั่วคราว) — ไม่เขียนตารางจริงและไม่บันทึก audit
 *   node scripts/transfer/export-curriculum-staging.mjs --school-code <รหัสโรงเรียนปลายทาง> --actor-email <อีเมลบัญชีปลายทาง> \
 *     [--db postgresql://postgres:postgres@127.0.0.1:54322/postgres] [--out <dir>]
 * ผลลัพธ์ (มีข้อมูลหลักสูตรที่ยังไม่อนุมัติ — ห้าม commit): <out>/transfer-<ts>.sql, rollback-<ts>.sql, manifest-<ts>.json
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const DRY = process.argv.includes("--dry-run");
const DB = args.db ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const OUT = resolve(args.out ?? "transfer-out");
const SCHOOL_CODE = args["school-code"];
const ACTOR_EMAIL = args["actor-email"];
if (!SCHOOL_CODE || !ACTOR_EMAIL) {
  console.error("ต้องระบุ --school-code และ --actor-email ของปลายทาง");
  process.exit(2);
}
if (!/^[A-Za-z0-9_-]{2,32}$/.test(SCHOOL_CODE) || !/^[^\s'@]+@[^\s'@]+$/.test(ACTOR_EMAIL)) {
  console.error("รูปแบบรหัสโรงเรียนหรืออีเมลไม่ถูกต้อง");
  process.exit(2);
}

const q = (sql) => execFileSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", DB, "-c", sql], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 }).trim();
const json = (sql) => JSON.parse(q(`select coalesce(json_agg(t), '[]') from (${sql}) t`));

// ลำดับตาม FK · override: คอลัมน์ที่ต้องแมป/ล้างค่า · filter: แถวที่ย้าย
const SCHOOL = "school";
const ACTOR = "actor";
const TABLES = [
  { name: "source_documents", where: "true", order: "parent_id nulls first, register_code",
    override: { school_id: SCHOOL, created_by: ACTOR, file_id: null, reviewed_by: null, reviewed_at: null, duplicate_of_id: null, learning_area_id: null } },
  { name: "source_conflicts", where: "status <> 'resolved'", order: "conflict_code",
    override: { school_id: SCHOOL, created_by: ACTOR, resolved_by: null } },
  { name: "school_curricula", where: "true", order: "created_at", override: { school_id: SCHOOL, created_by: ACTOR } },
  { name: "curriculum_versions", where: "status = 'draft'", order: "created_at",
    override: { school_id: SCHOOL, created_by: ACTOR, framework_version_id: null, based_on_version_id: null } },
  { name: "import_batches", where: "status in ('uploaded', 'needs_review', 'failed')", order: "created_at",
    override: { school_id: SCHOOL, created_by: ACTOR, approved_by: null, committed_by: null, learning_area_id: null } },
  { name: "import_rows", where: "status in ('pending', 'valid', 'warning', 'error', 'needs_review')", order: "batch_id, row_no",
    override: { school_id: SCHOOL, decision_by: null } },
  { name: "curriculum_rules", where: "status = 'draft'", order: "code, version", override: { school_id: SCHOOL, created_by: ACTOR, verified_by: null } },
];

// ปฏิเสธข้อมูลที่ผ่านการอนุมัติ/บันทึกแล้ว — ต้องตัดสินใจแยก ไม่ย้ายอัตโนมัติ
const blocked = q(`select concat_ws(', ',
  (select 'curriculum_versions ไม่ใช่ draft ' || count(*) from public.curriculum_versions where status <> 'draft' having count(*) > 0),
  (select 'import_batches อนุมัติ/บันทึกแล้ว ' || count(*) from public.import_batches where status in ('approved', 'committed') having count(*) > 0),
  (select 'import_rows อนุมัติ/บันทึก/ข้าม ' || count(*) from public.import_rows where status in ('approved', 'committed', 'skipped') having count(*) > 0),
  (select 'curriculum_rules ยืนยันแล้ว ' || count(*) from public.curriculum_rules where status = 'verified' having count(*) > 0))`);
if (blocked) {
  console.error(`พบข้อมูลที่ผ่านการตรวจโดยคนแล้ว — ต้องตัดสินใจแยกก่อนย้าย: ${blocked}`);
  process.exit(3);
}

const lit = (s) => `$x$${s}$x$`; // dollar quoting — ข้อมูลไม่มี "$x$" (ตรวจด้านล่าง)
const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
mkdirSync(OUT, { recursive: true });
const manifest = { generated_at: new Date().toISOString(), source_db: DB.replace(/:[^:@/]+@/, ":***@"), target_school_code: SCHOOL_CODE, actor_email: ACTOR_EMAIL, tables: {} };

let sql = `-- =============================================================================
-- Transfer: Local curriculum staging → Hosted Staging (สร้างโดย scripts/transfer/export-curriculum-staging.mjs · ${manifest.generated_at})
-- รันใน SQL Editor ของ project Staging ทั้งไฟล์ — ทั้งหมดอยู่ใน transaction เดียว ผิดพลาด = ไม่มีอะไรเปลี่ยน
-- ⚠️ มีข้อมูลหลักสูตรที่ยังไม่อนุมัติ: ห้าม commit เข้า Git · ห้ามรันบน Production
-- =============================================================================
begin;
create temp table _ctx on commit drop as
  select (select id from public.schools where code = '${SCHOOL_CODE}' and is_active) as school_id,
         (select id from auth.users where lower(email) = lower('${ACTOR_EMAIL}') and deleted_at is null) as actor_id;
do $chk$ begin
  if (select school_id from _ctx) is null then raise exception 'ไม่พบโรงเรียนปลายทาง ${SCHOOL_CODE}'; end if;
  if (select actor_id from _ctx) is null then raise exception 'ไม่พบบัญชีปลายทาง ${ACTOR_EMAIL}'; end if;
  if not exists (select 1 from public.profiles p, _ctx c where p.id = c.actor_id and p.school_id = c.school_id) then
    raise exception 'บัญชีปลายทางไม่ได้อยู่ในโรงเรียนปลายทาง';
  end if;
end $chk$;
`;
let rollback = `-- Rollback ของ transfer ${ts} — ลบเฉพาะแถวที่ย้าย (ตาม id) และเฉพาะเมื่อยังไม่มีการตรวจ/อนุมัติโดยคน
-- ไม่ถูกรันอัตโนมัติ · ใช้เมื่อได้รับอนุมัติเท่านั้น
begin;
`;
const guards = [];
const tableInfo = {};
let dry = `-- DRY RUN (ตารางชั่วคราว + rollback) — ไม่เขียนตารางจริง และไม่บันทึก audit · ${new Date().toISOString()}
begin;  -- เขียนเฉพาะตารางชั่วคราว แล้ว rollback ท้ายไฟล์ (ใช้ใน SQL Editor ซึ่งเป็น postgres)
create temp table _ctx on commit drop as
  select (select id from public.schools where code = '${SCHOOL_CODE}' and is_active) as school_id,
         (select id from auth.users where lower(email) = lower('${ACTOR_EMAIL}') and deleted_at is null) as actor_id;
create temp table _rep (seq serial, item text, detail jsonb, ok boolean) on commit drop;
insert into _rep (item, detail, ok) select 'โรงเรียนปลายทางพบ ${SCHOOL_CODE}', jsonb_build_object('school_id', school_id), school_id is not null from _ctx;
insert into _rep (item, detail, ok) select 'บัญชีผู้สร้างชุดพบในปลายทาง (${ACTOR_EMAIL})', jsonb_build_object('actor_id', actor_id), actor_id is not null from _ctx;
insert into _rep (item, detail, ok) select 'บัญชีผู้สร้างผูกโรงเรียนเดียวกัน', jsonb_build_object('profile_school', p.school_id), p.school_id = c.school_id from _ctx c left join public.profiles p on p.id = c.actor_id;
insert into _rep (item, detail, ok) select 'บัญชีผู้สร้างเป็นเจ้าหน้าที่วิชาการ (academic_staff) และไม่ใช่ academic_head (Two-person)',
  jsonb_build_object('roles', (select coalesce(jsonb_agg(role), '[]') from public.user_roles ur where ur.user_id = c.actor_id)),
  exists (select 1 from public.user_roles ur where ur.user_id = c.actor_id and ur.role = 'academic_staff')
  and not exists (select 1 from public.user_roles ur where ur.user_id = c.actor_id and ur.role = 'academic_head') from _ctx c;
insert into _rep (item, detail, ok) select 'มี academic_head อย่างน้อย 1 คนในโรงเรียน (ผู้อนุมัติ) ที่ไม่ใช่ผู้สร้างชุด',
  jsonb_build_object('heads', (select count(*) from public.user_roles ur join _ctx c on true where ur.role = 'academic_head' and ur.school_id = c.school_id and ur.user_id is distinct from c.actor_id)),
  exists (select 1 from public.user_roles ur join _ctx c on true where ur.role = 'academic_head' and ur.school_id = c.school_id and ur.user_id is distinct from c.actor_id);
`;
const deletes = [];

for (const t of TABLES) {
  const cols = q(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
                  where table_schema = 'public' and table_name = '${t.name}' and is_generated = 'NEVER' and identity_generation is null`).split(",");
  const rows = json(`select * from public.${t.name} where ${t.where} order by ${t.order}`);
  const payload = JSON.stringify(rows);
  if (payload.includes("$x$")) throw new Error(`ข้อมูล ${t.name} มีลำดับอักขระที่ใช้ quoting`);
  const sha = createHash("sha256").update(payload).digest("hex");
  manifest.tables[t.name] = { rows: rows.length, sha256: sha };
  if (!rows.length) continue;
  const mapped = Object.keys(t.override);
  tableInfo[t.name] = { rows, cols: null };
  const sel = cols.map((c) => {
    if (!(c in t.override)) return `r.${c}`;
    const v = t.override[c];
    return v === SCHOOL ? "(select school_id from _ctx)" : v === ACTOR ? "(select actor_id from _ctx)" : "null";
  }).join(", ");
  const compareCols = cols.filter((c) => !mapped.includes(c) && !["created_at", "updated_at"].includes(c));
  const mappedSel = cols.map((c) => (c in t.override ? (t.override[c] === SCHOOL ? "(select school_id from _ctx)" : t.override[c] === ACTOR ? "(select actor_id from _ctx)" : "null") : `r.${c}`)).join(", ");
  dry += `
create temp table _src_${t.name} on commit drop as select * from jsonb_populate_recordset(null::public.${t.name}, ${lit(payload)}::jsonb);
create temp table _chk_${t.name} (like public.${t.name} including defaults including constraints) on commit drop;
insert into _rep (item, detail, ok) select '${t.name}: ต้นทาง ${rows.length} แถว', jsonb_build_object('source_rows', (select count(*) from _src_${t.name}),
   'already_in_target_same_id', (select count(*) from public.${t.name} d join _src_${t.name} s on s.id = d.id),
   'same_id_but_different_content', (select count(*) from public.${t.name} d join _src_${t.name} s on s.id = d.id where (${compareCols.map((c) => `d.${c}`).join(", ")}) is distinct from (${compareCols.map((c) => `s.${c}`).join(", ")})),
   'would_insert', (select count(*) from _src_${t.name} s where not exists (select 1 from public.${t.name} d where d.id = s.id))),
   (select count(*) from public.${t.name} d join _src_${t.name} s on s.id = d.id where (${compareCols.map((c) => `d.${c}`).join(", ")}) is distinct from (${compareCols.map((c) => `s.${c}`).join(", ")})) = 0;
-- CHECK constraint / ชนิดข้อมูล / default ตามนิยามจริงของ Hosted (ตารางชั่วคราว — ไม่เขียนตารางจริง)
insert into _chk_${t.name} (${cols.join(", ")}) select ${mappedSel} from _src_${t.name} r;
insert into _rep (item, detail, ok) select '${t.name}: ผ่าน CHECK constraint ของ Hosted ทุกแถว', jsonb_build_object('rows', (select count(*) from _chk_${t.name})), (select count(*) from _chk_${t.name}) = ${rows.length};
`;
  sql += `
-- ---- ${t.name}: ${rows.length} แถว · sha256(payload) ${sha}
create temp table _src_${t.name} on commit drop as select * from jsonb_populate_recordset(null::public.${t.name}, ${lit(payload)}::jsonb);
do $chk$ declare n int; begin
  select count(*) into n from public.${t.name} d join _src_${t.name} s on s.id = d.id
   where (${compareCols.map((c) => `d.${c}`).join(", ")}) is distinct from (${compareCols.map((c) => `s.${c}`).join(", ")});
  if n > 0 then raise exception '${t.name}: มี % แถวที่ id ซ้ำแต่เนื้อหาต่างจากต้นทาง — ไม่เขียนทับ (ตรวจความแตกต่างก่อน)', n; end if;
end $chk$;
insert into public.${t.name} (${cols.join(", ")})
select ${sel} from _src_${t.name} r
on conflict (id) do nothing;
do $chk$ declare n int; begin
  select count(*) into n from public.${t.name} d join _src_${t.name} s on s.id = d.id;
  if n <> ${rows.length} then raise exception '${t.name}: จำนวนแถวหลังย้าย % ≠ ต้นทาง ${rows.length}', n; end if;
end $chk$;
`;
  const ids = rows.map((r) => `'${r.id}'`).join(",");
  deletes.unshift(`delete from public.${t.name} where id in (${ids});`);
  if (t.name === "import_rows") guards.push(`if exists (select 1 from public.import_rows where id in (${ids}) and (status in ('approved','committed','skipped') or decision_by is not null)) then raise exception 'มีแถวที่คนตรวจแล้ว — ยกเลิก rollback'; end if;`);
  if (t.name === "import_batches") guards.push(`if exists (select 1 from public.import_batches where id in (${ids}) and status not in ('uploaded','needs_review','failed')) then raise exception 'มีชุดนำเข้าที่อนุมัติ/บันทึกแล้ว — ยกเลิก rollback'; end if;`);
  if (t.name === "source_conflicts") guards.push(`if exists (select 1 from public.source_conflicts where id in (${ids}) and status = 'resolved') then raise exception 'มีข้อขัดแย้งที่ตัดสินแล้ว — ยกเลิก rollback'; end if;`);
  if (t.name === "curriculum_versions") guards.push(`if exists (select 1 from public.curriculum_versions where id in (${ids}) and status <> 'draft') then raise exception 'ฉบับหลักสูตรไม่ใช่ draft แล้ว — ยกเลิก rollback'; end if;`);
}

// ---- ส่วนท้ายของ dry run: FK ภายใน payload + unique key ชนกัน
const FKS = [["source_documents", "parent_id", "source_documents"], ["source_conflicts", "doc_a_id", "source_documents"], ["source_conflicts", "doc_b_id", "source_documents"],
  ["curriculum_versions", "school_curriculum_id", "school_curricula"], ["curriculum_versions", "announcement_source_id", "source_documents"],
  ["import_batches", "source_document_id", "source_documents"], ["import_batches", "curriculum_version_id", "curriculum_versions"],
  ["import_rows", "batch_id", "import_batches"], ["curriculum_rules", "source_document_id", "source_documents"]];
for (const [child, col, parent] of FKS) {
  if (!manifest.tables[child]?.rows || !manifest.tables[parent]) continue;
  dry += `insert into _rep (item, detail, ok) select 'FK ${child}.${col} → ${parent}: ทุกค่าอ้างแถวที่มีใน payload หรือปลายทาง', jsonb_build_object('orphans', count(*)), count(*) = 0
  from _src_${child} c where c.${col} is not null and not exists (select 1 from _src_${parent} p where p.id = c.${col}) and not exists (select 1 from public.${parent} p where p.id = c.${col});
`;
}
for (const [tbl, key] of [["source_documents", "register_code"], ["source_conflicts", "conflict_code"], ["curriculum_rules", "code, version"]]) {
  if (!manifest.tables[tbl]?.rows) continue;
  dry += `insert into _rep (item, detail, ok) select 'unique ${tbl}(school, ${key}): ไม่ชนกับแถว id อื่นที่มีอยู่ในปลายทาง', jsonb_build_object('collisions', count(*)), count(*) = 0
  from _src_${tbl} s join public.${tbl} d on (${key.split(", ").map((k) => `d.${k} = s.${k}`).join(" and ")}) and d.school_id = (select school_id from _ctx) and d.id <> s.id;
`;
}
dry += `insert into _rep (item, detail, ok) select 'สถานะที่ย้าย: ไม่มี approved / committed / skipped / active', jsonb_build_object(
  'import_rows', (select jsonb_object_agg(status, n) from (select status, count(*) n from _src_import_rows group by 1) x),
  'import_batches', (select jsonb_object_agg(status, n) from (select status, count(*) n from _src_import_batches group by 1) x),
  'curriculum_versions', (select jsonb_object_agg(status, n) from (select status, count(*) n from _src_curriculum_versions group by 1) x),
  'source_conflicts', (select jsonb_object_agg(status, n) from (select status, count(*) n from _src_source_conflicts group by 1) x)),
  not exists (select 1 from _src_import_rows where status in ('approved', 'committed', 'skipped'))
  and not exists (select 1 from _src_import_batches where status in ('approved', 'committed'))
  and not exists (select 1 from _src_curriculum_versions where status <> 'draft');
select seq, item, ok, detail from _rep order by seq;
rollback;
`;
sql += `
insert into public.audit_logs (school_id, actor_id, table_name, record_id, action, new_data)
select school_id, actor_id, 'data_transfer', null, 'INSERT', ${lit(JSON.stringify({ kind: "local_curriculum_staging", generated_at: manifest.generated_at, tables: manifest.tables }))}::jsonb from _ctx;
select '${Object.entries(manifest.tables).map(([k, v]) => `${k}=${v.rows}`).join(" ")}' as transferred;
commit;
`;
rollback += `do $g$ begin\n  ${guards.join("\n  ")}\nend $g$;\n${deletes.join("\n")}\ncommit;\n`;
const files = { sql: join(OUT, `transfer-${ts}.sql`), rollback: join(OUT, `rollback-${ts}.sql`), manifest: join(OUT, `manifest-${ts}.json`) };
writeFileSync(files.sql, sql);
if (DRY) {
  files.dry = join(OUT, `dryrun-${ts}.sql`);
  writeFileSync(files.dry, dry);
  // เวอร์ชันอ่านอย่างเดียว แบ่งเป็นหลายคำสั่ง (ไฟล์ละ ≤ ~1 MB): CTE ล้วน รันผ่าน read-only role ได้ · แต่ละไฟล์ตรวจ chunk ของตารางหนึ่ง
  // พ่อแม่ใน FK ใช้เฉพาะ id (payload เล็ก) · ไม่มี CHECK-constraint probe (ใช้ไฟล์ temp-table ใน SQL Editor แทน)
  const ctxSql = `select (select id from public.schools where code = '${SCHOOL_CODE}' and is_active) as school_id,
  (select id from auth.users where lower(email) = lower('${ACTOR_EMAIL}') and deleted_at is null) as actor_id`;
  const ctxChecks = [
    `select 'โรงเรียนปลายทางพบ ${SCHOOL_CODE}', jsonb_build_object('school_id', school_id), school_id is not null from ctx`,
    `select 'บัญชีผู้สร้างชุดพบในปลายทาง (${ACTOR_EMAIL})', jsonb_build_object('actor_id', actor_id), actor_id is not null from ctx`,
    `select 'บัญชีผู้สร้างผูกโรงเรียนเดียวกัน', jsonb_build_object('profile_school', p.school_id), p.school_id = c.school_id from ctx c left join public.profiles p on p.id = c.actor_id`,
    `select 'บัญชีผู้สร้างเป็น academic_staff และไม่ใช่ academic_head (Two-person)', jsonb_build_object('roles', (select coalesce(jsonb_agg(role), '[]') from public.user_roles ur where ur.user_id = c.actor_id)),
      exists (select 1 from public.user_roles ur where ur.user_id = c.actor_id and ur.role = 'academic_staff') and not exists (select 1 from public.user_roles ur where ur.user_id = c.actor_id and ur.role = 'academic_head') from ctx c`,
    `select 'มี academic_head อย่างน้อย 1 คนที่ไม่ใช่ผู้สร้างชุด (ผู้อนุมัติ)', jsonb_build_object('heads', (select count(*) from public.user_roles ur join ctx c on true where ur.role = 'academic_head' and ur.school_id = c.school_id and ur.user_id is distinct from c.actor_id)),
      exists (select 1 from public.user_roles ur join ctx c on true where ur.role = 'academic_head' and ur.school_id = c.school_id and ur.user_id is distinct from c.actor_id)`,
  ];
  const CHUNK = 450 * 1024;
  const roFiles = [];
  let first = true;
  for (const tb of TABLES) {
    const info = tableInfo[tb.name];
    if (!info?.rows.length) continue;
    const parts = []; let cur = []; let size = 0;
    for (const row of info.rows) { const s = JSON.stringify(row).length; if (size + s > CHUNK && cur.length) { parts.push(cur); cur = []; size = 0; } cur.push(row); size += s; }
    if (cur.length) parts.push(cur);
    const colsT = q(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = '${tb.name}' and is_generated = 'NEVER' and identity_generation is null`).split(",");
    const cmp = colsT.filter((c) => !Object.keys(tb.override).includes(c) && !["created_at", "updated_at"].includes(c));
    const fks = FKS.filter(([child, , parent]) => child === tb.name && tableInfo[parent]?.rows.length);
    parts.forEach((rowsC, i) => {
      const ctes = [`ctx as (${ctxSql})`, `src as (select * from jsonb_populate_recordset(null::public.${tb.name}, ${lit(JSON.stringify(rowsC))}::jsonb))`];
      for (const parent of new Set(fks.map((f) => f[2]))) ctes.push(`ids_${parent} as (select * from jsonb_populate_recordset(null::public.${parent}, ${lit(JSON.stringify(tableInfo[parent].rows.map((r) => ({ id: r.id }))))}::jsonb))`);
      const checks = first ? [...ctxChecks] : [];
      first = false;
      const diff = `(select count(*) from public.${tb.name} d join src s on s.id = d.id where (${cmp.map((c) => `d.${c}`).join(", ")}) is distinct from (${cmp.map((c) => `s.${c}`).join(", ")}))`;
      checks.push(`select '${tb.name} [ส่วน ${i + 1}/${parts.length}]: ต้นทาง ${rowsC.length} แถว', jsonb_build_object('source_rows', (select count(*) from src), 'already_in_target_same_id', (select count(*) from public.${tb.name} d join src s on s.id = d.id), 'same_id_but_different_content', ${diff}, 'would_insert', (select count(*) from src s where not exists (select 1 from public.${tb.name} d where d.id = s.id))), ${diff} = 0 and (select count(*) from src) = ${rowsC.length}`);
      for (const [, col, parent] of fks) checks.push(`select '${tb.name}.${col} → ${parent} [ส่วน ${i + 1}]: FK อ้างแถวที่มีใน payload หรือปลายทาง', jsonb_build_object('orphans', count(*)), count(*) = 0 from src c where c.${col} is not null and not exists (select 1 from ids_${parent} p where p.id = c.${col}) and not exists (select 1 from public.${parent} p where p.id = c.${col})`);
      const uniq = { source_documents: "register_code", source_conflicts: "conflict_code", curriculum_rules: "code, version" }[tb.name];
      if (uniq) checks.push(`select 'unique ${tb.name}(school, ${uniq}) ไม่ชนกับ id อื่นในปลายทาง', jsonb_build_object('collisions', count(*)), count(*) = 0 from src s join public.${tb.name} d on (${uniq.split(", ").map((k) => `d.${k} = s.${k}`).join(" and ")}) and d.school_id = (select school_id from ctx) and d.id <> s.id`);
      if (colsT.includes("status")) {
        const bad = { import_rows: "('approved','committed','skipped')", import_batches: "('approved','committed')", curriculum_versions: "('under_review','approved','active','retired')", curriculum_rules: "('verified','retired')", source_conflicts: "('resolved')" }[tb.name];
        checks.push(`select '${tb.name} [ส่วน ${i + 1}]: สถานะที่ย้าย', (select jsonb_object_agg(status, n) from (select status, count(*) n from src group by 1) x), ${bad ? `not exists (select 1 from src where status in ${bad})` : "true"}`);
      }
      const sqlRo = `-- DRY RUN อ่านอย่างเดียว · ${tb.name} ส่วน ${i + 1}/${parts.length} · ${manifest.generated_at}\nwith ${ctes.join(",\n")}\nselect item, ok, detail from (\n${checks.map((c) => `(${c})`).join("\nunion all\n")}\n) x(item, detail, ok);\n`;
      const f = join(OUT, `dryrun-ro-${String(roFiles.length + 1).padStart(2, "0")}-${tb.name}-${i + 1}.sql`);
      writeFileSync(f, sqlRo);
      roFiles.push(f);
    });
  }
  files.dryRo = roFiles;
}
writeFileSync(files.rollback, rollback);
manifest.files = Object.fromEntries(Object.entries(files).filter(([k]) => k !== "manifest").map(([k, f]) => [k, { path: f, sha256: createHash("sha256").update(k === "sql" ? sql : rollback).digest("hex") }]));
writeFileSync(files.manifest, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ out: OUT, tables: manifest.tables, dryrun: DRY ? files.dry : null, dryrunReadonlyFiles: DRY ? files.dryRo.length : 0 }, null, 1));
