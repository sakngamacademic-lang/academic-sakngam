// ตัวช่วยเรียก Supabase Auth + Edge Functions ด้วยบัญชีผู้ใช้จริง (anon key เท่านั้น — ห้ามใช้ service_role)
import { createHash } from "node:crypto";
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export function config() {
  const need = (k) => { const v = process.env[k]; if (!v) { console.error(`ต้องตั้งค่า ${k}`); process.exit(2); } return v; };
  const url = need("SUPABASE_URL").replace(/\/$/, "");
  if (/service_role/i.test(process.env.SUPABASE_ANON_KEY ?? "")) { console.error("ห้ามใช้ service_role key"); process.exit(2); }
  return { url, anon: need("SUPABASE_ANON_KEY"), email: need("APP_EMAIL"), password: need("APP_PASSWORD"), fn: (process.env.FUNCTIONS_URL ?? `${url}/functions/v1`).replace(/\/$/, "") };
}
export async function signIn(c) {
  const r = await fetch(`${c.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: c.anon, "content-type": "application/json" }, body: JSON.stringify({ email: c.email, password: c.password }) });
  if (!r.ok) throw new Error(`เข้าสู่ระบบไม่สำเร็จ HTTP ${r.status}`);
  return (await r.json()).access_token;
}
export async function callFn(c, token, name, body) {
  const r = await fetch(`${c.fn}/${name}`, { method: "POST", headers: { authorization: `Bearer ${token}`, apikey: c.anon, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status} ${j.error ?? ""}`);
  return j;
}
/** อัปโหลดผ่าน presigned URL → ยืนยัน (เซิร์ฟเวอร์คำนวณ sha256 เอง) */
export async function upload(c, token, bytes, fileName, opts) {
  const t = await callFn(c, token, "storage-upload-url", { documentId: null, taskId: null, curriculumSource: Boolean(opts.curriculumSource), title: opts.title, category: opts.category, fileName, mimeType: "application/pdf", size: bytes.length });
  const put = await fetch(t.uploadUrl, { method: "PUT", headers: t.headers, body: bytes });
  if (!put.ok) throw new Error(`PUT HTTP ${put.status}`);
  const done = await callFn(c, token, "storage-confirm-upload", { fileId: t.fileId });
  return { fileId: t.fileId, sha256: done.sha256 };
}
