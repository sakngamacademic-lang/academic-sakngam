#!/usr/bin/env node
/**
 * ตรวจ Storage (R2 หรือ S3 emulator) ผ่าน Edge Functions จริง: private bucket · presigned URL · SHA256 · ขนาด · MIME · ดาวน์โหลด · เวอร์ชัน
 * ตั้ง env: SUPABASE_URL SUPABASE_ANON_KEY APP_EMAIL APP_PASSWORD [FUNCTIONS_URL] [VERIFY_KIND=curriculum|teacher]
 * ไฟล์ทดสอบเป็น PDF ขนาดเล็กที่สร้างเอง (ไม่ใช่ข้อมูลจริง) และถูกลบ (soft delete) เมื่อจบ · exit 1 เมื่อมีข้อที่ไม่ผ่าน
 */
import { callFn, config, sha256, signIn, upload } from "./_client.mjs";
const c = config();
const token = await signIn(c);
const kind = process.env.VERIFY_KIND === "teacher" ? "teacher" : "curriculum";
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); };
const pdf = Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n% verify ${Date.now()} ${Math.random()}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
let fileId;
try {
  const up = await upload(c, token, pdf, "verify-storage.pdf", { curriculumSource: kind === "curriculum", title: "ตรวจ storage (ทดสอบ)", category: "other" });
  fileId = up.fileId;
  check("อัปโหลด + เซิร์ฟเวอร์คำนวณ SHA256 ตรงกับไฟล์ต้นทาง", up.sha256 === sha256(pdf), up.sha256.slice(0, 12));
  const d = await callFn(c, token, "storage-download-url", { fileId });
  check("Presigned URL อายุ ≤ 5 นาที", d.expiresInSeconds <= 300, `${d.expiresInSeconds}s`);
  const got = await fetch(d.url);
  const body = Buffer.from(await got.arrayBuffer());
  check("ดาวน์โหลดด้วย presigned URL ได้ + SHA256/ขนาดตรง", got.ok && sha256(body) === sha256(pdf) && body.length === pdf.length, `${body.length} bytes`);
  check("Content-Type เป็น PDF และ Content-Disposition เป็น attachment", got.headers.get("content-type")?.includes("application/pdf") && /^attachment/.test(got.headers.get("content-disposition") ?? ""));
  const u = new URL(d.url);
  const bare = await fetch(`${u.origin}${u.pathname}`);
  check("Bucket เป็น private: เข้าถึงโดยไม่มีลายเซ็นไม่ได้", [401, 403].includes(bare.status), `HTTP ${bare.status}`);
  const tampered = new URL(d.url);
  const sig = tampered.searchParams.get("X-Amz-Signature");
  if (sig) { tampered.searchParams.set("X-Amz-Signature", sig.replace(/.$/, sig.endsWith("0") ? "1" : "0")); }
  const bad = await fetch(tampered);
  check("ลายเซ็นที่ถูกแก้ใช้ไม่ได้", bad.status === 403, `HTTP ${bad.status}`);
  const other = new URL(d.url); other.pathname = other.pathname.replace(/[^/]+$/, "00000000-0000-0000-0000-000000000000");
  check("Presigned URL ใช้กับ object อื่นไม่ได้", (await fetch(other)).status === 403);
  try { await callFn(c, token, "storage-download-url", { fileId: "00000000-0000-4000-8000-000000000000" }); check("ขอ URL ของไฟล์ที่ไม่มี/ไม่มีสิทธิ์ถูกปฏิเสธ", false); }
  catch { check("ขอ URL ของไฟล์ที่ไม่มี/ไม่มีสิทธิ์ถูกปฏิเสธ", true); }
  const v2 = await upload(c, token, Buffer.concat([pdf, Buffer.from("\n% v2")]), "verify-storage.pdf", { curriculumSource: kind === "curriculum", title: "ตรวจ storage (ทดสอบ)", category: "other" });
  check("อัปโหลดซ้ำได้ไฟล์ใหม่แยกกัน (ไม่เขียนทับ)", v2.fileId !== fileId && v2.sha256 !== up.sha256);
  await callFn(c, token, "storage-delete", { fileId: v2.fileId }).catch(() => {});
} catch (e) {
  check("ขั้นตอนทดสอบ", false, e.message);
} finally {
  if (fileId) await callFn(c, token, "storage-delete", { fileId }).catch(() => {});
}
process.exit(results.every(Boolean) ? 0 : 1);
