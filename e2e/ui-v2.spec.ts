import { expect, test, type Page } from "@playwright/test";
import { login, signIn } from "./helpers";

/**
 * UI Integration V2 — Welcome Page + Dashboard (Dark Premium)
 * Auth / Route Guard ใช้ของ Phase 1.3 เดิม (ทดสอบใน auth.spec.ts) ไฟล์นี้ตรวจ UI ที่นำเข้าใหม่
 */

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 900, height: 1180 },
  mobile: { width: 390, height: 844 },
} as const;

/** เก็บ console error / page error ทุกหน้า แล้วตรวจท้ายแต่ละเทสต์ */
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => {
  expect(errors, "ไม่มี console / page error").toEqual([]);
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "ไม่มี scroll แนวนอน").toBeLessThanOrEqual(0);
}

/** Dashboard ต้องไม่มี keyframe animation (อนุญาตเฉพาะ transition ของ hover/focus) */
const keyframeAnimations = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation).map((a) => (a as CSSAnimation).animationName));


/** องค์ประกอบที่ให้ผู้ใช้เลือกบทบาทเอง (ต้องไม่มี) — ตรวจองค์ประกอบจริง ไม่ใช่ข้อความ */
async function roleSelectors(page: Page) {
  return page.evaluate(() => {
    const re = /role|บทบาท|portal/i;
    const roleWords = /ครูผู้สอน|ฝ่ายวิชาการ|ผู้บริหาร|ผู้ดูแลระบบ|teacher|office/i;
    const pick = /เลือกบทบาท|เข้าแบบ|เข้าในฐานะ|login as|sign in as/i;
    const found: string[] = [];
    document.querySelectorAll("select, input, textarea, [role=radiogroup], [role=listbox], [role=combobox]").forEach((el) => {
      const id = el.getAttribute("id");
      const lbl = id ? document.querySelector(`label[for="${id}"]`)?.textContent : "";
      const meta = [el.getAttribute("name"), id, el.getAttribute("aria-label"), lbl].join(" ");
      if (re.test(meta)) found.push(el.outerHTML.slice(0, 80));
    });
    document.querySelectorAll("option").forEach((o) => roleWords.test(o.textContent ?? "") && found.push(o.outerHTML));
    document.querySelectorAll("a[href]").forEach((a) => /[?&](role|as|portal)=/.test(a.getAttribute("href") ?? "") && found.push(a.outerHTML.slice(0, 80)));
    document.querySelectorAll("a, button, [role=tab], label").forEach((el) => pick.test(el.textContent ?? "") && found.push(el.outerHTML.slice(0, 80)));
    document.querySelectorAll("[data-role], [data-select-role]").forEach((el) => found.push(el.outerHTML.slice(0, 80)));
    return found;
  });
}

test.describe("Welcome Page", () => {
  test("ยังไม่ login: มีเพียงปุ่มเข้าสู่ระบบ (/login) และเยี่ยมชมข้อมูล (/visit)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /ระบบบริหาร\s*งานวิชาการ/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("main a")).toHaveCount(2);
    await expect(page.locator("[data-auth-cta]")).toHaveAttribute("href", "/login");
    await expect(page.locator("[data-visit-cta]")).toHaveAttribute("href", "/visit");
    expect(await roleSelectors(page)).toEqual([]);
    await page.locator("[data-auth-cta]").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("form input:not([type=hidden])")).toHaveCount(2);
    expect(await roleSelectors(page)).toEqual([]);
  });

  test("login อยู่แล้ว: ปุ่มพาไป Dashboard ตามบทบาท (ครู → /teacher, ฝ่ายวิชาการ → /office)", async ({ page }) => {
    await signIn(page, "teacher1@snw.test");
    await page.goto("/");
    await expect(page.locator("[data-auth-cta]")).toHaveAttribute("href", "/teacher");
    await page.locator("[data-auth-cta]").click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("heading", { name: /^สวัสดี/ })).toBeVisible();

    await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, "head@snw.test"); // มีทั้งบทบาทวิชาการและครู → office ก่อน (defaultPortalPath เดิม)
    await page.goto("/");
    await expect(page.locator("[data-auth-cta]")).toHaveAttribute("href", "/office");
  });

  test("มือถือ: หัวเรื่องและปุ่มไม่ล้นจอ", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile, hasTouch: true, isMobile: true, locale: "th-TH" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalOverflow(page);
    await ctx.close();
  });
});

test.describe("Office Dashboard", () => {
  test("หัวหน้าวิชาการ: ทางลัด, ข้อมูลจริงแยกจาก Demo, คิวตรวจรับกรองได้, ไม่มี animation", async ({ page }) => {
    await signIn(page, "head@snw.test");
    await expect(page).toHaveURL(/\/office$/);
    await expect(page.getByRole("heading", { name: "แดชบอร์ดฝ่ายวิชาการ" })).toBeVisible();

    const qa = page.getByRole("navigation", { name: "ทางลัด" });
    await expect(qa.getByRole("link", { name: /สร้างภาระงาน/ })).toBeVisible();
    await qa.getByRole("link", { name: /จัดการปีการศึกษา/ }).click();
    await expect(page).toHaveURL(/\/office\/academic-years$/);
    await page.goBack();

    // ข้อมูลจริง (ไม่อยู่ใน Demo zone)
    const live = page.locator("section[aria-labelledby=live-title]");
    await expect(live.getByText("ข้อมูลจริง")).toBeVisible();
    await expect(live.getByText(/^25\d\d$/)).toBeVisible();
    expect(await live.locator("xpath=ancestor::*[@data-demo-zone]").count()).toBe(0);

    // งานเอกสาร: ข้อมูลจริงจากฐานข้อมูล (ไม่มี Demo zone แล้ว)
    await expect(page.locator("[data-demo-zone]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /ความคืบหน้าการส่งเอกสาร/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /คิวตรวจรับเอกสาร/ })).toBeVisible();
    await expect(page.getByText("เอกสารรอตรวจ")).toBeVisible();

    expect(await keyframeAnimations(page)).toEqual([]);
    expect(await roleSelectors(page)).toEqual([]);
  });

  test("ผู้ดูแลระบบ: ไม่เห็น Demo งานวิชาการ (ไม่มีสิทธิ์ tasks/assessment)", async ({ page }) => {
    await signIn(page, "admin@snw.test");
    await expect(page.getByRole("heading", { name: "แดชบอร์ดฝ่ายวิชาการ" })).toBeVisible();
    await expect(page.locator("section[aria-labelledby=live-title]")).toBeVisible();
    await expect(page.locator("[data-demo-zone]")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "ทางลัด" }).getByRole("link", { name: /สร้างภาระงาน/ })).toHaveCount(0);
  });
});

test.describe("Teacher Dashboard", () => {
  test("ครู: สถานะงานจากข้อมูลจริง และลิงก์ไปส่งงาน", async ({ page }) => {
    await login(page, "teacher1@snw.test");
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("heading", { name: /^สวัสดี/ })).toBeVisible();
    await expect(page.locator("[data-demo-zone]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /งานที่ได้รับมอบหมาย/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "กำหนดส่งที่ใกล้เข้ามา" })).toBeVisible();
    await page.getByRole("link", { name: "ส่งเอกสาร" }).first().click();
    await expect(page).toHaveURL(/\/teacher\/assignments$/);

    expect(await keyframeAnimations(page)).toEqual([]);
    expect(await roleSelectors(page)).toEqual([]);
  });
});

test.describe("Responsive: ไม่มี scroll แนวนอน", () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`${name} ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.goto("/visit");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.goto("/login");
      await expectNoHorizontalOverflow(page);

      await signIn(page, "head@snw.test");
      await expect(page.getByRole("heading", { name: "แดชบอร์ดฝ่ายวิชาการ" })).toBeVisible();
      await expect(page.locator("#queue")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto("/teacher");
      await expect(page.getByRole("heading", { name: /^สวัสดี/ })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      if (name === "mobile") {
        // ปุ่มส่งเอกสารเห็นโดยไม่ต้องเลื่อน
        const b = (await page.getByRole("link", { name: "ส่งเอกสาร" }).boundingBox())!;
        expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
      }
    });
  }
});
