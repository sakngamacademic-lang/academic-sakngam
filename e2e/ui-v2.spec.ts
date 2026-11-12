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

const statusText = (page: Page) => page.locator("[data-status]");
const activeScene = (page: Page) => page.locator(".scene.is-active");

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
  test("ยังไม่ login: แสดง Hero และปุ่มเข้าสู่ระบบทุกปุ่มไป /login", async ({ page }) => {
    await page.goto("/");
    // ครั้งแรก dev server อาจกำลังเตรียม chunk ของหน้า Welcome (lazy) จึงเผื่อเวลา
    await expect(page.getByRole("heading", { level: 1, name: /ระบบบริหาร\s*งานวิชาการ/ })).toBeVisible({ timeout: 20_000 });
    const ctas = page.locator("[data-auth-cta]");
    expect(await ctas.count()).toBeGreaterThanOrEqual(3);
    for (const href of await ctas.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) expect(href).toBe("/login");
    expect(await roleSelectors(page)).toEqual([]);
    await page.locator(".topbar [data-auth-cta]").click();
    await expect(page).toHaveURL(/\/login$/);
    // หน้า Login: มีแค่อีเมล + รหัสผ่าน ไม่มีตัวเลือกบทบาท
    await expect(page.locator("form input:not([type=hidden])")).toHaveCount(2);
    expect(await roleSelectors(page)).toEqual([]);
  });

  test("login อยู่แล้ว: ปุ่มพาไป Dashboard ตามบทบาท (ครู → /teacher, ฝ่ายวิชาการ → /office)", async ({ page }) => {
    await signIn(page, "teacher1@snw.test");
    await page.goto("/");
    await expect(page.locator(".topbar [data-auth-cta]")).toHaveAttribute("href", "/teacher");
    await page.locator(".scene.is-active [data-auth-cta]").click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("heading", { name: /^สวัสดี/ })).toBeVisible();

    await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, "head@snw.test"); // มีทั้งบทบาทวิชาการและครู → office ก่อน (defaultPortalPath เดิม)
    await page.goto("/");
    await expect(page.locator("#features [data-auth-cta]")).toHaveAttribute("href", "/office");
  });

  test("Carousel: ลูกศร, thumbnail, indicator, เมนูบน, คีย์บอร์ด, ลากเมาส์, autoplay", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/");
    await expect(statusText(page)).toHaveText(/ฉากที่ 1 จาก 5/);

    await page.getByRole("button", { name: "ฉากถัดไป" }).click();
    await expect(statusText(page)).toHaveText(/ฉากที่ 2 จาก 5: หลักสูตรและข้อมูลพื้นฐาน/);
    // transition: ฉากเดิมออก ฉากใหม่เข้า แล้วล้าง class ภายใน 2.3s (spec 2.2s)
    await expect(page.locator(".scene.is-entering")).toHaveCount(1);
    await page.waitForTimeout(2300);
    await expect(page.locator(".scene.is-leaving, .scene.is-entering")).toHaveCount(0);
    // ฉากที่ไม่แสดงเป็น inert
    expect(await page.locator(".scene[inert]").count()).toBe(4);

    await page.getByRole("button", { name: "ฉากก่อนหน้า" }).click();
    await expect(statusText(page)).toHaveText(/ฉากที่ 1 จาก 5/);
    await page.locator(".thumb").nth(3).click();
    await expect(statusText(page)).toHaveText(/ฉากที่ 4 จาก 5/);
    await page.getByRole("button", { name: /^ฉากที่ 5 / }).click();
    await expect(statusText(page)).toHaveText(/ฉากที่ 5 จาก 5/);
    await page.getByRole("navigation", { name: "ความสามารถของระบบ" }).getByRole("button", { name: "วัดผล" }).click();
    await expect(statusText(page)).toHaveText(/ฉากที่ 3 จาก 5/);

    const hero = page.locator(".hero");
    await hero.focus();
    await page.keyboard.press("End");
    await expect(statusText(page)).toHaveText(/ฉากที่ 5 จาก 5/);
    await page.keyboard.press("ArrowRight");
    await expect(statusText(page)).toHaveText(/ฉากที่ 1 จาก 5/); // วนรอบ
    await page.keyboard.press("ArrowLeft");
    await expect(statusText(page)).toHaveText(/ฉากที่ 5 จาก 5/);
    await page.keyboard.press("Home");
    await expect(statusText(page)).toHaveText(/ฉากที่ 1 จาก 5/);

    const box = (await activeScene(page).locator(".scene__visual").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(statusText(page)).toHaveText(/ฉากที่ 2 จาก 5/);

    const toggle = page.getByRole("button", { name: "เล่นอัตโนมัติ" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false"); // ปิดเป็นค่าเริ่มต้น
    await toggle.click();
    await expect(page.getByRole("button", { name: "หยุดเล่นอัตโนมัติ" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "หยุดเล่นอัตโนมัติ" }).click();

    // ไม่ดักการเลื่อนหน้า: เลื่อนลงได้ปกติและฉากไม่เปลี่ยน
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await expect(statusText(page)).toHaveText(/ฉากที่ 2 จาก 5/);
    await expect(page.locator("#features .reveal.is-visible").first()).toBeVisible();
  });

  test("Reduced motion: เปลี่ยนฉากทันที ไม่มี animation และซ่อน autoplay", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "เล่นอัตโนมัติ" })).toHaveCount(0);
    await page.getByRole("button", { name: "ฉากถัดไป" }).click();
    await expect(statusText(page)).toHaveText(/ฉากที่ 2 จาก 5/);
    await expect(page.locator(".scene.is-leaving, .scene.is-entering")).toHaveCount(0);
    await page.waitForTimeout(300);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running).toBe(0);
    expect(await page.locator("#features .reveal:not(.is-visible)").count()).toBe(0);
  });

  test("มือถือ: ปัดนิ้วเปลี่ยนฉาก และหัวเรื่องทุกฉากไม่ล้นจอ", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile, hasTouch: true, isMobile: true, locale: "th-TH" });
    const page = await ctx.newPage();
    await page.goto("/");
    for (let i = 0; i < 5; i++) {
      const overflow = await activeScene(page).evaluate((s) => {
        const col = s.querySelector(".scene__head")!.getBoundingClientRect();
        return Math.max(...[...s.querySelectorAll(".title span")].map((t) => t.getBoundingClientRect().right - col.right));
      });
      expect(overflow, `หัวเรื่องฉาก ${i + 1}`).toBeLessThanOrEqual(1);
      // มือถือ: ลูกศรถูกซ่อน ใช้ thumbnail / ปัดนิ้วแทน
      if (i < 4) await page.locator(".thumb").nth(i + 1).click();
      await page.waitForTimeout(700);
    }
    const stage = (await page.locator(".stage").boundingBox())!;
    const y = stage.y + 120;
    await page.locator(".stage").dispatchEvent("pointerdown", { clientX: stage.x + 320, clientY: y, pointerType: "touch", isPrimary: true });
    await page.locator(".stage").dispatchEvent("pointerup", { clientX: stage.x + 60, clientY: y + 10, pointerType: "touch", isPrimary: true });
    await expect(statusText(page)).toHaveText(/ฉากที่ 1 จาก 5/); // จากฉากที่ 5 ปัดไปข้างหน้า → วนกลับฉากแรก
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

    // Demo แยกชัดเจน
    const demo = page.locator("[data-demo-zone]");
    await expect(demo.getByRole("heading", { name: /ตัวอย่างหน้าจอ \(Demo\)/ })).toBeVisible();
    await expect(demo.getByRole("heading", { name: "งานที่ต้องดำเนินการ" })).toBeVisible();
    await expect(demo.getByRole("img", { name: /ร้อยละครูที่ส่งแล้ว/ })).toBeVisible();
    await expect(demo.getByRole("img", { name: /ต้องติดตาม/ })).toBeVisible();

    const queue = demo.locator("#queue");
    await expect(queue.locator("tbody tr")).toHaveCount(5);
    await queue.getByRole("button", { name: "ส่งกลับแก้ไข" }).click();
    await expect(queue.getByRole("button", { name: "ส่งกลับแก้ไข" })).toHaveAttribute("aria-pressed", "true");
    await expect(queue.locator("tbody tr")).toHaveCount(1);
    await queue.getByRole("button", { name: "ทั้งหมด" }).click();
    await queue.getByRole("searchbox").fill("ครูตัวอย่าง ข");
    await expect(queue.locator("tbody tr")).toHaveCount(1);
    await queue.getByRole("searchbox").fill("ไม่มีชื่อนี้");
    await expect(queue.getByText("ไม่พบรายการที่ตรงกับตัวกรอง")).toBeVisible();
    // ปุ่มที่ยังไม่มีระบบรองรับต้องปิดไว้
    for (const b of await demo.locator("button[title^='เปิดใช้งานใน']").all()) await expect(b).toBeDisabled();

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
  test("ครู: สถานะ, แท็บ, ข้อเสนอแนะ, ฟอร์มส่ง (ยังไม่เปิดใช้), ประวัติ", async ({ page }) => {
    await login(page, "teacher1@snw.test");
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("heading", { name: /^สวัสดี/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "ส่งเอกสาร" })).toBeVisible();

    const demo = page.locator("[data-demo-zone]");
    await expect(demo.getByRole("heading", { name: /ตัวอย่างหน้าจอ \(Demo\)/ })).toBeVisible();
    await expect(demo.getByRole("heading", { name: "ต้องแก้ไขก่อน" })).toBeVisible();
    await expect(demo.getByRole("heading", { name: "กำหนดส่งที่ใกล้เข้ามา" })).toBeVisible();
    await expect(demo.getByRole("heading", { name: "ประวัติการส่ง" })).toBeVisible();

    // คลิกการ์ดสถิติ → เปิดแท็บที่ตรงกัน
    await demo.getByRole("button", { name: /รอตรวจ/ }).first().click();
    await expect(page.getByRole("tab", { name: /รอตรวจ/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("โครงการสอนรายวิชา");
    // แท็บใช้ลูกศรได้
    await page.getByRole("tab", { name: /รอตรวจ/ }).press("ArrowRight");
    await expect(page.getByRole("tab", { name: /ส่งแล้ว/ })).toBeFocused();
    await expect(page.getByRole("tab", { name: /ส่งแล้ว/ })).toHaveAttribute("aria-selected", "true");

    // "ส่งฉบับแก้ไข" เลือกงานในฟอร์มให้ แต่ปุ่มส่งยังปิดไว้
    await demo.locator("#fix-a1").getByRole("button", { name: "ส่งฉบับแก้ไข" }).click();
    await expect(page.getByLabel("งานที่จะส่ง")).toHaveValue("a1");
    await expect(demo.getByRole("button", { name: /ส่งเอกสาร \(ยังไม่เปิดใช้งาน\)/ })).toBeDisabled();
    await expect(page.getByLabel(/หมายเหตุถึงฝ่ายวิชาการ/)).toBeDisabled();

    expect(await keyframeAnimations(page)).toEqual([]);
    expect(await roleSelectors(page)).toEqual([]);
  });
});

test.describe("Responsive: ไม่มี scroll แนวนอน", () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`${name} ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/");
      await expect(statusText(page)).toHaveText(/ฉากที่ 1/);
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
