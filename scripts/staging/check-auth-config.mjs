#!/usr/bin/env node
/**
 * ตรวจ Auth config ของ Supabase Staging แบบอ่านอย่างเดียว (Management API) — ไม่แก้ค่าใด ๆ
 * ใช้: SUPABASE_ACCESS_TOKEN=… node scripts/staging/check-auth-config.mjs <project-ref> --site-url https://<preview>.vercel.app
 * token ต้องมีสิทธิ์อ่าน (ผ่าน Environment Secret ไม่ใส่ในแชต) · exit 1 เมื่อมีข้อที่ไม่ผ่าน
 */
const ref = process.argv[2];
const siteUrl = process.argv.includes("--site-url") ? process.argv[process.argv.indexOf("--site-url") + 1] : null;
if (!ref || !/^[a-z0-9]{20}$/.test(ref)) { console.error("ต้องระบุ project ref (20 ตัวอักษร)"); process.exit(2); }
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN ?? ""}` } });
if (!res.ok) { console.error(`อ่านค่าไม่ได้ HTTP ${res.status}`); process.exit(2); }
const c = await res.json();
const allow = String(c.uri_allow_list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const origin = siteUrl ? new URL(siteUrl).origin : null;
const checks = [
  ["ปิด self signup (disable_signup = true)", c.disable_signup === true, `ตอนนี้ ${c.disable_signup}`],
  ["รหัสผ่านขั้นต่ำ ≥ 10", Number(c.password_min_length) >= 10, `ตอนนี้ ${c.password_min_length}`],
  ["Site URL ไม่ใช่ localhost", !/localhost|127\.0\.0\.1/.test(String(c.site_url ?? "")), `ตอนนี้ ${c.site_url}`],
  ...(origin ? [
    ["Site URL ตรงกับ Preview", new URL(c.site_url).origin === origin, `ตอนนี้ ${c.site_url}`],
    ["Redirect URLs มี Preview (reset password)", allow.some((u) => u.startsWith(origin)), `ตอนนี้ [${allow.join(", ")}]`],
  ] : []),
  ["ไม่เปิด anonymous sign-in", c.external_anonymous_users_enabled !== true, `ตอนนี้ ${c.external_anonymous_users_enabled}`],
  ["ไม่ auto-confirm อีเมล", c.mailer_autoconfirm !== true, `ตอนนี้ ${c.mailer_autoconfirm}`],
];
let bad = 0;
for (const [name, ok, detail] of checks) { console.log(`${ok ? "✅" : "❌"} ${name} — ${detail}`); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
