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
 *   node scripts/transfer/export-curriculum-staging.mjs --school-code <รหัสโรงเรียนปลายทาง> --actor-email <อีเมลบัญชีปลายทาง> \
 *     [--db postgresql://postgres:postgres@127.0.0.1:54322/postgres] [--out <dir>]
 * ผลลัพธ์ (มีข้อมูลหลักสูตรที่ยังไม่อนุมัติ — ห้าม commit): <out>/transfer-<ts>.sql, rollback-<ts>.sql, manifest-<ts>.json
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
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
  const sel = cols.map((c) => {
    if (!(c in t.override)) return `r.${c}`;
    const v = t.override[c];
    return v === SCHOOL ? "(select school_id from _ctx)" : v === ACTOR ? "(select actor_id from _ctx)" : "null";
  }).join(", ");
  const compareCols = cols.filter((c) => !mapped.includes(c) && !["created_at", "updated_at"].includes(c));
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

sql += `
insert into public.audit_logs (school_id, actor_id, table_name, record_id, action, new_data)
select school_id, actor_id, 'data_transfer', null, 'INSERT', ${lit(JSON.stringify({ kind: "local_curriculum_staging", generated_at: manifest.generated_at, tables: manifest.tables }))}::jsonb from _ctx;
select '${Object.entries(manifest.tables).map(([k, v]) => `${k}=${v.rows}`).join(" ")}' as transferred;
commit;
`;
rollback += `do $g$ begin\n  ${guards.join("\n  ")}\nend $g$;\n${deletes.join("\n")}\ncommit;\n`;
const files = { sql: join(OUT, `transfer-${ts}.sql`), rollback: join(OUT, `rollback-${ts}.sql`), manifest: join(OUT, `manifest-${ts}.json`) };
writeFileSync(files.sql, sql);
writeFileSync(files.rollback, rollback);
manifest.files = Object.fromEntries(Object.entries(files).filter(([k]) => k !== "manifest").map(([k, f]) => [k, { path: f, sha256: createHash("sha256").update(k === "sql" ? sql : rollback).digest("hex") }]));
writeFileSync(files.manifest, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ out: OUT, tables: manifest.tables }, null, 1));
