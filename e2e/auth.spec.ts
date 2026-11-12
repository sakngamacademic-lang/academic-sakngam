import { expect, test } from "@playwright/test";
import { apiToken, expectForbidden, login, rest, SEED_PASSWORD, SUPABASE_URL } from "./helpers";

const OFFICE_HEADING = "แดชบอร์ดฝ่ายวิชาการ";

test.describe("Authentication", () => {
  test("ยังไม่ login เข้าหน้าที่ป้องกันไว้ → ไปหน้า Login", async ({ page }) => {
    await page.goto("/office");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/teacher/tasks");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("ตรวจสอบฟอร์มและแสดงข้อผิดพลาดภาษาไทย", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page.getByText("กรุณากรอกอีเมล")).toBeVisible();
    await expect(page.getByText("กรุณากรอกรหัสผ่าน")).toBeVisible();
  });

  test("login ไม่สำเร็จเมื่อรหัสผ่านผิด", async ({ page }) => {
    await login(page, "teacher1@snw.test", "wrong-password-123");
    await expect(page.getByRole("alert")).toHaveText("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("login สำเร็จ, refresh แล้ว session ยังอยู่, ไม่เก็บรหัสผ่าน, logout", async ({ page }) => {
    await login(page, "teacher1@snw.test");
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("heading", { name: "สวัสดี ครูตัวอย่าง ก" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("heading", { name: "สวัสดี ครูตัวอย่าง ก" })).toBeVisible();

    const stored = await page.evaluate(() => JSON.stringify(Object.assign({}, window.localStorage)));
    expect(stored).not.toContain(SEED_PASSWORD);

    await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("ออกจากระบบเรียบร้อยแล้ว")).toBeVisible();
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("กลับไปหน้าที่ตั้งใจหลัง login", async ({ page }) => {
    await page.goto("/office/teachers");
    await expect(page).toHaveURL(/\/login$/);
    await login(page, "head@snw.test");
    await expect(page).toHaveURL(/\/office\/teachers$/);
  });

  test("บัญชีถูกระงับใช้งานไม่ได้", async ({ page }) => {
    await login(page, "suspended@snw.test");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("บัญชีของคุณถูกระงับการใช้งาน")).toBeVisible();
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("session หมดอายุ (refresh token ใช้ไม่ได้) → กลับหน้า Login พร้อมแจ้งเตือน", async ({ page }) => {
    await login(page, "teacher1@snw.test");
    await expect(page).toHaveURL(/\/teacher$/);
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))!;
      const s = JSON.parse(localStorage.getItem(key)!);
      s.expires_at = Math.floor(Date.now() / 1000) - 60;
      s.refresh_token = "invalid-refresh-token";
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("เซสชันหมดอายุ")).toBeVisible();
  });
});

test.describe("Route guard ตามบทบาท", () => {
  const matrix = [
    { email: "admin@snw.test", office: true, teacher: false },
    { email: "head@snw.test", office: true, teacher: true },
    { email: "staff@snw.test", office: true, teacher: false },
    { email: "areahead@snw.test", office: true, teacher: true },
    { email: "exec@snw.test", office: true, teacher: false },
    { email: "teacher1@snw.test", office: false, teacher: true },
  ];

  for (const m of matrix) {
    test(`${m.email}: office=${m.office} teacher=${m.teacher}`, async ({ page }) => {
      await login(page, m.email);
      await expect(page).toHaveURL(m.office ? /\/office$/ : /\/teacher$/);

      await page.goto("/office");
      if (m.office) await expect(page.getByRole("heading", { name: OFFICE_HEADING })).toBeVisible();
      else await expectForbidden(page);

      await page.goto("/teacher");
      if (m.teacher) await expect(page.getByRole("heading", { name: /^สวัสดี/ })).toBeVisible();
      else await expectForbidden(page);
    });
  }

  test("ผู้บริหาร: ไม่มีปุ่ม/เมนูแก้ไข และเข้าหน้าจัดการผ่าน URL ไม่ได้", async ({ page }) => {
    await login(page, "exec@snw.test");
    await expect(page.getByRole("heading", { name: OFFICE_HEADING })).toBeVisible();
    await expect(page.getByRole("link", { name: "สร้างภาระงาน" })).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "เมนูฝ่ายวิชาการ" });
    await expect(nav.getByRole("link", { name: /รายการงาน/ })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /นำเข้า Excel/ })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /ตั้งค่าระบบ/ })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /รายงาน/ })).toHaveCount(1);
    for (const path of ["/office/tasks", "/office/imports", "/office/settings"]) {
      await page.goto(path);
      await expectForbidden(page);
    }
  });

  test("ผู้ดูแลระบบเห็นเมนูตั้งค่า แต่ไม่เห็นงานวิชาการ", async ({ page }) => {
    await login(page, "admin@snw.test");
    const nav = page.getByRole("navigation", { name: "เมนูฝ่ายวิชาการ" });
    await expect(nav.getByRole("link", { name: /ตั้งค่าระบบ/ })).toHaveCount(1);
    await expect(nav.getByRole("link", { name: /ตรวจรับเอกสาร/ })).toHaveCount(0);
    await page.goto("/office/reviews");
    await expectForbidden(page);
  });

  test("แสดงชื่อและบทบาทผู้ใช้", async ({ page }) => {
    await login(page, "head@snw.test");
    await expect(page.getByTestId("user-name")).toHaveText("หัวหน้าวิชาการ (ทดสอบ)");
    await expect(page.getByTestId("user-roles")).toContainText("หัวหน้าฝ่ายวิชาการ");
    await expect(page.getByTestId("user-roles")).toContainText("ครูผู้สอน");
    await expect(page.getByRole("link", { name: "ไประบบครู" })).toBeVisible();
  });

  test("ถอนบทบาทแล้ว UI สะท้อนสิทธิ์ใหม่จากฐานข้อมูล", async ({ page, request }) => {
    const teacher2 = "10000000-0000-4000-a000-000000000007";
    const school = "00000000-0000-4000-a000-000000000001";
    const adminToken = await apiToken(request, "admin@snw.test");

    await login(page, "teacher2@snw.test");
    await expect(page.getByRole("heading", { name: "สวัสดี ครูตัวอย่าง ข" })).toBeVisible();
    try {
      const del = await request.delete(
        `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${teacher2}&role=eq.teacher`,
        { headers: { ...rest(adminToken), Prefer: "return=representation" } },
      );
      expect((await del.json()).length).toBe(1);
      await page.reload();
      await expectForbidden(page);
    } finally {
      const ins = await request.post(`${SUPABASE_URL}/rest/v1/user_roles`, {
        headers: rest(adminToken),
        data: { user_id: teacher2, school_id: school, role: "teacher" },
      });
      expect(ins.status()).toBe(201);
    }
  });
});

test.describe("RLS ยังคงป้องกันข้อมูล (ทดสอบผ่าน Data API โดยตรง)", () => {
  test("ผู้ใช้โรงเรียนอื่นไม่เห็นข้อมูลโรงเรียนสักงาม", async ({ request }) => {
    const token = await apiToken(request, "admin@other.test");
    const profiles = await (await request.get(`${SUPABASE_URL}/rest/v1/profiles?select=email,school_id`, { headers: rest(token) })).json();
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.every((p: { email: string }) => p.email.endsWith("@other.test"))).toBe(true);
    const schools = await (await request.get(`${SUPABASE_URL}/rest/v1/schools?select=code`, { headers: rest(token) })).json();
    expect(schools).toEqual([{ code: "OTHER-DEV" }]);
  });

  test("ครูเปลี่ยน role / school_id ของตนเองผ่าน API ไม่ได้", async ({ request }) => {
    const me = "10000000-0000-4000-a000-000000000006";
    const token = await apiToken(request, "teacher1@snw.test");
    const grant = await request.post(`${SUPABASE_URL}/rest/v1/user_roles`, {
      headers: rest(token),
      data: { user_id: me, school_id: "00000000-0000-4000-a000-000000000001", role: "system_admin" },
    });
    expect(grant.status()).toBe(403);
    const move = await request.patch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${me}`, {
      headers: rest(token),
      data: { school_id: "00000000-0000-4000-a000-000000000002" },
    });
    expect(move.status()).toBe(403);
    const access = await (await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_my_access`, { headers: rest(token) })).json();
    expect(access.roles).toEqual(["teacher"]);
  });

  test("anon เรียก get_my_access ไม่ได้", async ({ request }) => {
    const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_my_access`, { headers: rest() });
    expect(res.ok()).toBe(false);
  });
});
