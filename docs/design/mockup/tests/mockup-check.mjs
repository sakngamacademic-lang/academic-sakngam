/**
 * Mockup V2 — Interaction / Animation / Responsive checks (Playwright, no app server)
 *
 * รัน:   node docs/design/mockup/tests/mockup-check.mjs
 * พร้อมถ่าย screenshot (เก็บที่ docs/design/screenshots/):
 *        node docs/design/mockup/tests/mockup-check.mjs --screenshots
 *
 * - เสิร์ฟไฟล์ใน docs/design/mockup ด้วย http server ในตัว (ไม่แตะ Production UI / Supabase)
 * - ใช้ Chromium ที่ติดตั้งมากับ @playwright/test
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SHOTS = resolve(HERE, "../../screenshots");
const WANT_SHOTS = process.argv.includes("--screenshots");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };

// ---------------------------------------------------------------- static server
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(ROOT, path || "welcome.html");
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ---------------------------------------------------------------- helpers
const results = [];
const check = (group, name, ok, extra = "") => results.push({ group, name, ok: !!ok, extra });
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const activeIdx = (p) => p.evaluate(() => [...document.querySelectorAll(".scene")].findIndex((s) => s.classList.contains("is-active")));
const settle = (p, ms = 1700) => p.waitForTimeout(ms);
const errors = [];
const watch = (p, tag) => {
  p.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
};

/**
 * ตรวจ "Role Selector" จากองค์ประกอบที่ผู้ใช้โต้ตอบได้จริง (ไม่ใช่ข้อความอธิบายทั่วไป)
 * คืนรายการองค์ประกอบที่เข้าข่าย — ต้องว่างเสมอ
 */
const findRoleSelectors = (p) =>
  p.evaluate(() => {
    const ROLE_ATTR = /role|บทบาท|portal/i;
    const ROLE_TEXT = /(เลือก\s*(บทบาท|portal|ระบบ)|เข้า(สู่ระบบ)?\s*(ใน)?\s*(ฐานะ|แบบ)\s*(ครู|ฝ่ายวิชาการ|ผู้บริหาร|ผู้ดูแล)|login\s+as|sign\s+in\s+as)/i;
    const found = [];
    const label = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}`;
    // 1) ฟอร์มควบคุมที่ชื่อ/ป้ายเกี่ยวกับบทบาท
    document.querySelectorAll("select, input, textarea, [role=radiogroup], [role=listbox], [role=combobox]").forEach((el) => {
      const attrs = [el.name, el.id, el.getAttribute("aria-label"), el.labels?.[0]?.textContent].join(" ");
      if (ROLE_ATTR.test(attrs)) found.push(`control ${label(el)}: ${attrs.trim()}`);
    });
    // 2) ตัวเลือกใน select ที่เป็นชื่อบทบาท
    document.querySelectorAll("option").forEach((o) => {
      if (/^(ครูผู้สอน|ฝ่ายวิชาการ|ผู้บริหาร|ผู้ดูแลระบบ|teacher|office)$/i.test(o.textContent.trim())) found.push(`option: ${o.textContent.trim()}`);
    });
    // 3) ลิงก์/ปุ่มที่ส่งบทบาทผ่าน URL หรือข้อความชวนเลือกบทบาท
    document.querySelectorAll("a, button, [role=button], [role=tab], label").forEach((el) => {
      const href = el.getAttribute("href") || "";
      const text = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ");
      if (/[?&](role|as|portal)=/i.test(href)) found.push(`link with role param: ${href}`);
      if (ROLE_TEXT.test(text)) found.push(`${label(el)}: ${text.trim()}`);
      if (el.hasAttribute("data-role") || el.hasAttribute("data-select-role")) found.push(`${label(el)} has data-role`);
    });
    return found;
  });

const shot = async (p, name, opts = {}) => {
  if (!WANT_SHOTS) return;
  await p.screenshot({ path: join(SHOTS, `${name}.png`), ...opts });
};

// ---------------------------------------------------------------- run
if (WANT_SHOTS) await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();

// ===== Welcome — desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: WANT_SHOTS ? 2 : 1 });
  const p = await ctx.newPage();
  watch(p, "welcome");
  await p.goto(BASE + "welcome.html", { waitUntil: "networkidle" });
  await settle(p);
  await shot(p, "welcome-desktop");
  const G = "Welcome";
  check(G, "Hero carousel มี 5 ฉาก", (await p.locator(".scene").count()) === 5);
  check(G, "CTA บน Top bar และในฉากแรกมองเห็นทันที", (await p.locator(".topbar [data-auth-cta]").isVisible()) && (await p.locator(".scene.is-active [data-auth-cta]").isVisible()));
  check(G, "ยังไม่ login: CTA ทุกปุ่ม → login.html", await p.evaluate(() => [...document.querySelectorAll("[data-auth-cta]")].every((a) => a.getAttribute("href") === "login.html")));
  check(G, "ไม่มี Role Selector", (await findRoleSelectors(p)).length === 0, (await findRoleSelectors(p)).join(" | "));

  // Interaction
  await p.click(".strip__arrow--next");
  check(G, "Transition: ฉากเดิมได้ is-leaving / ฉากใหม่ได้ is-entering", await p.evaluate(() => !!document.querySelector(".scene.is-leaving") && !!document.querySelector(".scene.is-entering")));
  await settle(p, 2300); // spec: ลบ is-entering ที่ 2.2s (ANIMATION-SPEC §2)
  check(G, "ปุ่มลูกศรถัดไป", (await activeIdx(p)) === 1);
  check(G, "Transition เสร็จแล้วไม่มี class ค้าง (ภายใน 2.3s)", await p.evaluate(() => !document.querySelector(".is-leaving, .is-entering")));
  check(G, "สี accent เปลี่ยนตามฉาก", (await p.evaluate(() => document.body.style.getPropertyValue("--accent"))) === "#6d7cff");
  await p.click(".thumb >> nth=4");
  check(G, "คลิก Thumbnail", (await activeIdx(p)) === 4);
  await p.click(".pager__dot >> nth=2");
  check(G, "Vertical indicator", (await activeIdx(p)) === 2);
  await p.click('.topnav [data-goto="3"]');
  check(G, "เมนูบนกระโดดไปฉาก", (await activeIdx(p)) === 3);
  await p.focus(".hero");
  await p.keyboard.press("Home");
  check(G, "คีย์บอร์ด Home", (await activeIdx(p)) === 0);
  await p.keyboard.press("ArrowLeft");
  check(G, "คีย์บอร์ด ArrowLeft วนไปฉากสุดท้าย", (await activeIdx(p)) === 4);
  await p.keyboard.press("End");
  await p.keyboard.press("ArrowRight");
  check(G, "คีย์บอร์ด ArrowRight วนกลับฉากแรก", (await activeIdx(p)) === 0);
  await settle(p);
  const box = await p.locator(".scene.is-active .scene__visual").boundingBox();
  await p.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 6 });
  await p.mouse.up();
  check(G, "ลาก/ปัดซ้าย → ฉากถัดไป", (await activeIdx(p)) === 1);
  check(G, "ฉากที่ซ่อนเป็น inert", await p.evaluate(() => [...document.querySelectorAll(".scene:not(.is-active)")].every((s) => s.inert)));
  check(G, "Live region ประกาศฉาก", /ฉากที่ 2 จาก 5/.test(await p.locator("[data-status]").textContent()));
  check(G, "Autoplay ปิดเป็นค่าเริ่มต้น", (await p.getAttribute(".progress__toggle", "aria-pressed")) === "false");
  await p.click(".progress__toggle");
  check(G, "Autoplay เปิด/ปิดได้", (await p.getAttribute(".progress__toggle", "aria-pressed")) === "true");
  await p.click(".progress__toggle");
  await p.mouse.move(600, 400);
  await p.mouse.move(900, 300, { steps: 4 });
  check(G, "Parallax: ตัวแปร --px อัปเดตตามเมาส์", (await p.evaluate(() => document.querySelector(".hero").style.getPropertyValue("--px"))) !== "");
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(1200);
  check(G, "Scroll reveal แสดงครบ", await p.evaluate(() => [...document.querySelectorAll(".reveal")].every((e) => e.classList.contains("is-visible"))));
  check(G, "เนื้อหาทุกฉากอ่านได้โดยไม่ต้องเปลี่ยน slide (Features + CTA band)", (await p.locator("#features .card").count()) === 4 && (await p.locator(".cta-band [data-auth-cta]").isVisible()));
  await p.goto(BASE + "welcome.html?session=teacher", { waitUntil: "networkidle" });
  check(G, "Login อยู่แล้ว (ครู): CTA → teacher-dashboard", (await p.getAttribute(".topbar [data-auth-cta]", "href")) === "teacher-dashboard.html");
  await p.goto(BASE + "welcome.html?session=office", { waitUntil: "networkidle" });
  await p.click(".topbar [data-auth-cta]");
  await p.waitForLoadState("networkidle");
  check(G, "Login อยู่แล้ว (ฝ่ายวิชาการ): กด CTA เข้า office-dashboard", p.url().endsWith("office-dashboard.html"));
  await ctx.close();
}

// ===== Welcome — reduced motion
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  watch(p, "welcome-reduced");
  await p.goto(BASE + "welcome.html", { waitUntil: "networkidle" });
  await p.click(".strip__arrow--next");
  const G = "Welcome (reduced motion)";
  check(G, "เปลี่ยนฉากทันที ไม่มี transition class", (await activeIdx(p)) === 1 && (await p.evaluate(() => !document.querySelector(".is-leaving, .is-entering"))));
  check(G, "ซ่อนปุ่ม Autoplay", await p.evaluate(() => document.querySelector(".progress__toggle").hidden));
  check(G, "ไม่มี animation ทำงาน", await p.evaluate(() => document.getAnimations().length === 0));
  check(G, "Scroll reveal แสดงทันที", await p.evaluate(() => [...document.querySelectorAll(".reveal")].every((e) => e.classList.contains("is-visible"))));
  await ctx.close();
}

// ===== Login (mock)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  watch(p, "login");
  await p.goto(BASE + "login.html", { waitUntil: "networkidle" });
  const G = "Login (mock)";
  check(G, "ไม่มี Role Selector", (await findRoleSelectors(p)).length === 0, (await findRoleSelectors(p)).join(" | "));
  check(G, "ฟอร์มมีเฉพาะอีเมล + รหัสผ่าน", (await p.locator("form input").count()) === 2 && (await p.locator("form select").count()) === 0);
  await p.click("button[type=submit]");
  check(G, "ฟอร์มว่างแสดงข้อผิดพลาดภาษาไทย", await p.locator("[data-login-error]").isVisible());
  await p.fill("#email", "teacher1@snw.test");
  await p.fill("#password", "x");
  await p.click("button[type=submit]");
  await p.waitForLoadState("networkidle");
  check(G, "บทบาทมาจาก 'ระบบ' → teacher-dashboard", p.url().endsWith("teacher-dashboard.html"));
  await ctx.close();
}

// ===== Dashboards — desktop
for (const [file, G] of [
  ["office-dashboard.html", "Office Dashboard"],
  ["teacher-dashboard.html", "Teacher Dashboard"],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: WANT_SHOTS ? 2 : 1 });
  const p = await ctx.newPage();
  watch(p, file);
  await p.goto(BASE + file, { waitUntil: "networkidle" });
  await shot(p, file.replace(".html", "-desktop"));
  check(G, "Sidebar แสดงถาวรบน desktop", await p.locator("#sidebar").isVisible());
  check(G, "ไม่มี carousel / scene / reveal", (await p.locator(".hero, .scene, .reveal").count()) === 0);
  check(G, "ไม่มี animation ทำงาน (ตาราง/ฟอร์มนิ่ง)", await p.evaluate(() => document.getAnimations().length === 0));
  check(G, "ไม่มี Role Selector", (await findRoleSelectors(p)).length === 0, (await findRoleSelectors(p)).join(" | "));
  if (file.startsWith("office")) {
    check(G, "มี Stats 4 / Quick actions 4 / กราฟ 2 / ตาราง 5 แถว",
      (await p.locator(".stat").count()) === 4 && (await p.locator(".qa__item").count()) === 4 &&
      (await p.locator(".chart svg").count()) === 2 && (await p.locator("#queue-table tbody tr").count()) === 5);
    await p.click("[data-filter-status=late]");
    check(G, "Chip กรองสถานะ", (await p.locator("#queue-table tbody tr:visible").count()) === 1);
    await p.click('[data-filter-status=""]');
    await p.fill("[data-filter-text]", "ครูตัวอย่าง ข");
    check(G, "ค้นหาในตาราง", (await p.locator("#queue-table tbody tr:visible").count()) === 1);
    await p.fill("[data-filter-text]", "ไม่มีชื่อนี้");
    check(G, "Empty state", await p.locator("[data-table-empty]").isVisible());
  } else {
    check(G, "ปุ่ม 'ส่งเอกสาร' บน Top bar", await p.locator(".app__top a.btn--primary", { hasText: "ส่งเอกสาร" }).isVisible());
    check(G, "การ์ด 'ต้องแก้ไขก่อน' พร้อมปุ่มส่งฉบับแก้ไข", await p.locator(".box--highlight", { hasText: "ส่งฉบับแก้ไข" }).isVisible());
    check(G, "มีครบ 4 สถานะ: ใกล้ครบกำหนด / ต้องแก้ไข / รอตรวจ / ส่งแล้ว", (await p.locator('.seg-tabs [role="tab"]').count()) === 4);
    await p.click(".stat--alert");
    check(G, "คลิกการ์ดสถิติ → เปิดแท็บที่ตรงกัน", (await p.getAttribute("#tab-fix", "aria-selected")) === "true" && (await p.locator("#panel-fix").isVisible()));
    await p.focus("#tab-fix");
    await p.keyboard.press("ArrowRight");
    check(G, "แท็บรองรับคีย์บอร์ด", (await p.getAttribute("#tab-wait", "aria-selected")) === "true");
  }
  await ctx.close();
}

// ===== Mobile (390×844) + Tablet (900×1180)
{
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: WANT_SHOTS ? 2 : 1, hasTouch: true, isMobile: true });
  const p = await m.newPage();
  watch(p, "mobile");
  for (const file of ["welcome.html", "login.html", "office-dashboard.html", "teacher-dashboard.html"]) {
    await p.goto(BASE + file, { waitUntil: "networkidle" });
    await settle(p, file === "welcome.html" ? 1700 : 200);
    check("Mobile", `${file}: ไม่มี scroll แนวนอน`, await noOverflow(p));
    if (file !== "login.html") await shot(p, file.replace(".html", "-mobile"));
  }
  await p.goto(BASE + "welcome.html", { waitUntil: "networkidle" });
  await settle(p);
  check("Mobile", "Welcome: CTA บน Top bar", await p.locator(".topbar [data-auth-cta]").isVisible());
  check("Mobile", "Welcome: หัวเรื่องทุกฉากไม่ล้นคอลัมน์", await p.evaluate(() => [...document.querySelectorAll(".scene .title span")].every((s) => s.scrollWidth <= s.parentElement.parentElement.clientWidth + 2)));
  const vb = await p.locator(".scene.is-active .scene__visual").boundingBox();
  await p.evaluate(({ x, y }) => {
    const el = document.querySelector(".stage");
    const fire = (type, cx) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: cx, clientY: y, pointerType: "touch" }));
    fire("pointerdown", x + 120);
    fire("pointerup", x - 60);
  }, { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 });
  check("Mobile", "Welcome: ปัดนิ้วเปลี่ยนฉาก", (await activeIdx(p)) === 1);
  await p.goto(BASE + "office-dashboard.html", { waitUntil: "networkidle" });
  check("Mobile", "Office: Sidebar ซ่อนเป็นค่าเริ่มต้น", !(await p.locator("#sidebar").isVisible()));
  await p.click("[data-drawer-open]");
  check("Mobile", "Office: เปิด Drawer", (await p.locator("#sidebar").isVisible()) && (await p.getAttribute("[data-drawer-open]", "aria-expanded")) === "true");
  await shot(p, "office-dashboard-mobile-drawer");
  await p.keyboard.press("Escape");
  check("Mobile", "Office: Esc ปิด Drawer", !(await p.locator("#sidebar").evaluate((el) => el.classList.contains("is-open"))));
  check("Mobile", "Office: ตารางกลายเป็นการ์ด", await p.evaluate(() => getComputedStyle(document.querySelector(".table thead")).display === "none"));
  await p.goto(BASE + "teacher-dashboard.html", { waitUntil: "networkidle" });
  check("Mobile", "Teacher: ปุ่มส่งเอกสารเห็นโดยไม่ต้องเลื่อน", await p.locator(".app__top a.btn--primary").isVisible());
  await m.close();

  const t = await browser.newContext({ viewport: { width: 900, height: 1180 } });
  const tp = await t.newPage();
  watch(tp, "tablet");
  for (const file of ["welcome.html", "office-dashboard.html", "teacher-dashboard.html"]) {
    await tp.goto(BASE + file, { waitUntil: "networkidle" });
    check("Tablet", `${file}: ไม่มี scroll แนวนอน`, await noOverflow(tp));
  }
  await t.close();
}

check("ทั่วไป", "ไม่มี console / page error", errors.length === 0, errors.join(" | "));
await browser.close();
server.close();

// ---------------------------------------------------------------- report
let group = "";
for (const r of results) {
  if (r.group !== group) console.log(`\n## ${(group = r.group)}`);
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra && !r.ok ? " — " + r.extra : ""}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
