#!/usr/bin/env node
/**
 * ย้ายไฟล์ต้นฉบับหลักสูตร (6 PDF) เข้า Storage ของโปรเจกต์ปลายทาง (R2) ผ่าน Edge Functions เดิม พร้อมตรวจ SHA256 ทุกไฟล์
 * ขั้นตอนต่อไฟล์: ตรวจ SHA256 กับ manifest → อัปโหลด → SHA256 ที่เซิร์ฟเวอร์คำนวณต้องตรง → ดาวน์โหลดกลับมาตรวจซ้ำ
 * ผลลัพธ์: link-r2-<ts>.sql — ผูก source_documents.file_id (ต้องรันโดยเจ้าของใน SQL Editor เพราะ file_id/sha256 แก้ผ่าน API ไม่ได้)
 *          SQL ผูกเฉพาะเมื่อ sha256 ของไฟล์ตรงกับ sha256 ที่ลงทะเบียนไว้ใน source_documents และไฟล์ status = ready
 * รันซ้ำได้: ไฟล์ที่มี SHA256 เดียวกันอยู่แล้ว (ready) จะไม่อัปโหลดซ้ำ — ใช้ไฟล์เดิม · --dry-run ตรวจ manifest อย่างเดียว
 * ใช้: node scripts/r2/migrate-source-pdfs.mjs --dir <โฟลเดอร์ PDF> --manifest <SHA256SUMS> --out <dir> [--dry-run]
 * ชื่อไฟล์ → รหัสทะเบียน: …pages_001-100… → SRC-01-P1 … …pages_501-547… → SRC-01-P6 (ตามช่วงหน้า)
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { callFn, config, sha256, signIn, upload } from "./_client.mjs";
const arg = (k) => (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : null);
const dir = arg("dir"), manifestPath = arg("manifest"), out = resolve(arg("out") ?? "transfer-out"), dry = process.argv.includes("--dry-run");
if (!dir || !manifestPath) { console.error("ต้องระบุ --dir และ --manifest"); process.exit(2); }
const expected = Object.fromEntries(readFileSync(manifestPath, "utf8").split("\n").filter((l) => /^[0-9a-f]{64}\s/.test(l)).map((l) => { const [h, n] = l.split(/\s+\*?/); return [n.trim(), h]; }));
const files = readdirSync(dir).filter((f) => /pages_\d+-\d+.*\.pdf$/i.test(f)).sort((a, b) => Number(a.match(/pages_(\d+)/)[1]) - Number(b.match(/pages_(\d+)/)[1]));
if (!files.length) { console.error("ไม่พบไฟล์ PDF ตามรูปแบบ …pages_NNN-NNN…pdf"); process.exit(2); }
let bad = 0;
const plan = files.map((f, i) => ({ file: f, code: `SRC-01-P${i + 1}`, bytes: readFileSync(join(dir, f)) }));
for (const p of plan) {
  p.sha = sha256(p.bytes);
  const ok = expected[p.file] === p.sha;
  console.log(`${ok ? "✅" : "❌"} manifest ${p.code} ${p.file} ${p.sha.slice(0, 12)} ${p.bytes.length} bytes`);
  if (!ok) bad++;
}
if (bad) { console.error("SHA256 ไม่ตรง manifest — หยุด"); process.exit(1); }
if (plan.length !== 6) console.warn(`⚠️ พบ ${plan.length} ไฟล์ (คาดว่า 6)`);
if (dry) { console.log("dry-run: ตรวจ manifest ผ่านทุกไฟล์ — ไม่อัปโหลด"); process.exit(0); }
const c = config();
const token = await signIn(c);
const links = [];
for (const p of plan) {
  // รันซ้ำได้: ถ้ามีไฟล์ที่ SHA256 เดียวกันและ ready อยู่แล้ว (RLS ของผู้เรียก) ใช้ไฟล์เดิม ไม่อัปโหลดซ้ำ
  const ex = await fetch(`${c.url}/rest/v1/files?sha256=eq.${p.sha}&status=eq.ready&select=id&limit=1`, { headers: { authorization: `Bearer ${token}`, apikey: c.anon } });
  const found = ex.ok ? (await ex.json())[0] : null;
  const up = found ? { fileId: found.id, sha256: p.sha, reused: true } : await upload(c, token, p.bytes, p.file, { curriculumSource: true, title: p.code, category: "other" });
  const ok1 = up.sha256 === p.sha;
  const d = await callFn(c, token, "storage-download-url", { fileId: up.fileId });
  const back = Buffer.from(await (await fetch(d.url)).arrayBuffer());
  const ok2 = sha256(back) === p.sha && back.length === p.bytes.length;
  console.log(`${ok1 && ok2 ? "✅" : "❌"} ${p.code} → file ${up.fileId} ${up.reused ? " (ใช้ไฟล์เดิม)" : ""} · SHA ${ok1 ? "ตรง" : "ไม่ตรง"} · ดาวน์โหลดกลับ ${ok2 ? "ตรง" : "ไม่ตรง"}`);
  if (!(ok1 && ok2)) { bad++; continue; }
  links.push({ code: p.code, fileId: up.fileId, sha: p.sha });
}
mkdirSync(out, { recursive: true });
const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const sql = `-- ผูกไฟล์ต้นฉบับที่ย้ายเข้า Storage แล้วกับ source_documents (รันใน SQL Editor ของโปรเจกต์ปลายทาง) · ${ts}
begin;
${links.map((l) => `update public.source_documents d set file_id = f.id from public.files f
 where d.register_code = '${l.code}' and f.id = '${l.fileId}' and f.status = 'ready' and f.sha256 = '${l.sha}' and d.sha256 = f.sha256 and d.file_id is null;`).join("\n")}
do $c$ begin
  if (select count(*) from public.source_documents where register_code like 'SRC-01-P%' and file_id is not null) <> ${links.length} then
    raise exception 'ผูกไฟล์ไม่ครบ ${links.length} รายการ (ตรวจ sha256 ใน source_documents หรือผูกไว้แล้ว)';
  end if;
end $c$;
commit;
`;
writeFileSync(join(out, `link-r2-${ts}.sql`), sql);
console.log(`สร้าง ${join(out, `link-r2-${ts}.sql`)} (${links.length} ไฟล์)`);
process.exit(bad ? 1 : 0);
