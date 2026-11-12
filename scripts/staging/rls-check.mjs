#!/usr/bin/env node
/**
 * ตรวจ RLS ของ Hosted Supabase Staging ผ่าน Data API จริง (ใช้ anon key + บัญชีทดสอบเท่านั้น)
 *
 * ค่าที่ต้องตั้งเป็น environment variable (ห้ามใส่ในไฟล์ที่ commit หรือส่งในแชท):
 *   STAGING_SUPABASE_URL     เช่น https://<project-ref>.supabase.co
 *   STAGING_ANON_KEY         anon / publishable key (ห้ามใช้ service_role — สคริปต์จะปฏิเสธ)
 *   STAGING_TEST_PASSWORD    รหัสผ่านของบัญชีทดสอบ *.test ที่สร้างไว้ใน staging
 *
 * ใช้: node scripts/staging/rls-check.mjs
 */
const URL_ = process.env.STAGING_SUPABASE_URL;
const KEY = process.env.STAGING_ANON_KEY;
const PASSWORD = process.env.STAGING_TEST_PASSWORD;

if (!URL_ || !KEY || !PASSWORD) {
  console.error("ต้องตั้ง STAGING_SUPABASE_URL, STAGING_ANON_KEY และ STAGING_TEST_PASSWORD");
  process.exit(2);
}
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(URL_)) {
  console.error("STAGING_SUPABASE_URL ต้องเป็น https://<ref>.supabase.co (สคริปต์นี้สำหรับ Hosted Staging เท่านั้น)");
  process.exit(2);
}
// ปฏิเสธ service_role key (JWT รุ่นเก่า หรือ secret key รุ่นใหม่)
const role = (() => {
  try {
    return JSON.parse(Buffer.from(KEY.split(".")[1] ?? "", "base64url").toString()).role;
  } catch {
    return undefined;
  }
})();
if (role === "service_role" || KEY.startsWith("sb_secret_")) {
  console.error("ห้ามใช้ service_role / secret key — ใช้ anon หรือ publishable key เท่านั้น");
  process.exit(2);
}

const base = { apikey: KEY, "Content-Type": "application/json" };
let failed = 0;
const check = (ok, name) => {
  console.log(`${ok ? "ok    " : "FAIL  "} ${name}`);
  if (!ok) failed++;
};

async function token(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: base, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!r.ok) throw new Error(`login ${email}: HTTP ${r.status}`);
  return (await r.json()).access_token;
}
const get = async (path, t) => fetch(`${URL_}/rest/v1/${path}`, { headers: t ? { ...base, Authorization: `Bearer ${t}` } : base });
const codes = async (email) => (await (await get("teachers?select=teacher_code", await token(email))).json()).map((r) => r.teacher_code).sort();

// anon ต้องไม่เห็นข้อมูลใด ๆ
for (const t of ["schools", "profiles", "user_roles", "teachers", "learning_areas", "audit_logs"]) {
  const r = await get(`${t}?select=*&limit=1`);
  const body = r.ok ? await r.json() : [];
  check(!r.ok || body.length === 0, `anon อ่าน ${t} ไม่ได้`);
}
// สมัครสมาชิกเองไม่ได้
const signup = await fetch(`${URL_}/auth/v1/signup`, { method: "POST", headers: base, body: JSON.stringify({ email: `probe-${Date.now()}@example.test`, password: "Probe#12345678" }) });
check(!signup.ok, "ปิด Self Signup");

// การมองเห็นทะเบียนครูตามบทบาท (ข้อมูลทดสอบชุดเดียวกับ supabase/seed.sql)
check((await codes("head@snw.test")).length >= 10, "academic_head เห็นทั้งโรงเรียน");
check(JSON.stringify(await codes("areahead@snw.test")) === JSON.stringify(["T002", "T003", "T005"]), "learning_area_head เห็นเฉพาะกลุ่มสาระตน");
check(JSON.stringify(await codes("teacher1@snw.test")) === JSON.stringify(["T003"]), "teacher เห็นเฉพาะระเบียนตนเอง");
check(JSON.stringify(await codes("admin@other.test")) === JSON.stringify(["T001"]), "แยกข้อมูลข้ามโรงเรียน");

// ครูเขียนทะเบียนไม่ได้
const tt = await token("teacher1@snw.test");
const ins = await fetch(`${URL_}/rest/v1/teachers`, {
  method: "POST",
  headers: { ...base, Authorization: `Bearer ${tt}` },
  body: JSON.stringify({ teacher_code: "PROBE", prefix: "นาย", first_name: "ก", last_name: "ข" }),
});
check(!ins.ok, "teacher เพิ่มระเบียนครูไม่ได้");

console.log(failed ? `\n${failed} รายการไม่ผ่าน` : "\nผ่านทั้งหมด");
process.exit(failed ? 1 : 0);
