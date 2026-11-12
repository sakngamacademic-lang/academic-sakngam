import { expect, test, type Page } from "@playwright/test";
import { apiToken, expectForbidden, rest, signIn, SUPABASE_URL } from "./helpers";

/** Phase 1.5 — ทะเบียนครู: UI, การแยกสิทธิ์ 6 บทบาท และ RLS ผ่าน Data API จริง */

const rowsOf = (page: Page) => page.locator("table tbody tr");
const dialog = (page: Page) => page.getByRole("dialog");

test.describe.serial("ทะเบียนครู — หัวหน้าวิชาการ", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "head@snw.test");
    await page.goto("/office/teachers");
    await expect(page.getByRole("heading", { name: "ทะเบียนครูและบุคลากร" })).toBeVisible();
  });

  test("ค้นหา / กรอง: ค่าเริ่มต้นแสดงเฉพาะผู้ปฏิบัติงาน", async ({ page }) => {
    await expect(rowsOf(page)).toHaveCount(8);
    await page.getByLabel("กรองตามสถานะการทำงาน").selectOption("");
    await expect(rowsOf(page)).toHaveCount(10);
    await page.getByLabel("กรองตามกลุ่มสาระ").selectOption({ label: "คณิตศาสตร์" });
    await expect(rowsOf(page)).toHaveCount(3);
    await page.getByLabel("กรองตามบัญชีเข้าระบบ").selectOption("unlinked");
    await expect(rowsOf(page)).toHaveCount(1);
    await page.getByLabel("กรองตามกลุ่มสาระ").selectOption("");
    await page.getByLabel("กรองตามบัญชีเข้าระบบ").selectOption("");
    await page.getByPlaceholder("ค้นหารหัส ชื่อ หรืออีเมล").fill("S001");
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page)).toContainText("บุคลากรสนับสนุน");
  });

  test("เพิ่มครูที่ยังไม่มีบัญชี, กันรหัสซ้ำ, แก้ไขสถานะ", async ({ page }) => {
    await page.getByRole("button", { name: "เพิ่มครู / บุคลากร" }).click();
    await dialog(page).getByLabel("รหัสประจำตัว").fill("T001");
    await dialog(page).getByLabel("คำนำหน้า").fill("นางสาว");
    await dialog(page).getByLabel("ชื่อ", { exact: true }).fill("ทดสอบ");
    await dialog(page).getByLabel("นามสกุล").fill("อีทูอี");
    await dialog(page).getByLabel("กลุ่มสาระ").selectOption({ label: "ภาษาไทย" });
    await dialog(page).getByLabel(/อีเมล/).fill("E2E.New@snw.test");
    await dialog(page).getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText("รหัสประจำตัวนี้มีอยู่แล้ว")).toBeVisible();

    await dialog(page).getByLabel("รหัสประจำตัว").fill("T900");
    await dialog(page).getByRole("button", { name: "บันทึก" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.getByPlaceholder("ค้นหารหัส ชื่อ หรืออีเมล").fill("T900");
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page)).toContainText("e2e.new@snw.test");
    await expect(rowsOf(page)).toContainText("ยังไม่มีบัญชี");

    await rowsOf(page).getByRole("button", { name: /แก้ไข/ }).click();
    await dialog(page).getByLabel("สถานะการทำงาน").selectOption("transferred");
    await dialog(page).getByRole("button", { name: "บันทึก" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(rowsOf(page)).toHaveCount(0); // ตัวกรองค่าเริ่มต้น = ปฏิบัติงาน
    await page.getByLabel("กรองตามสถานะการทำงาน").selectOption("transferred");
    await expect(rowsOf(page)).toHaveCount(1);
  });

  test("ผูกบัญชีที่มีอยู่แล้ว (ไม่สร้างบัญชีใหม่) และยกเลิกการผูก", async ({ page }) => {
    await page.getByPlaceholder("ค้นหารหัส ชื่อ หรืออีเมล").fill("T006");
    await rowsOf(page).getByRole("button", { name: /ผูกบัญชี/ }).click();
    const select = dialog(page).getByLabel("บัญชีผู้ใช้");
    // ตัวเลือกมีเฉพาะบัญชีที่ยังไม่ผูก และไม่รวมบัญชีที่ถูกระงับ
    await expect(select.locator("option", { hasText: "teacher1@snw.test" })).toHaveCount(0);
    await expect(select.locator("option", { hasText: "suspended@snw.test" })).toHaveCount(0);
    await select.selectOption({ label: "เจ้าหน้าที่วิชาการ (ทดสอบ) · staff@snw.test" });
    await dialog(page).getByRole("button", { name: "ผูกบัญชี" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(rowsOf(page)).toContainText("มีบัญชี");

    await rowsOf(page).getByRole("button", { name: /ยกเลิกผูก/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิกการผูก" }).click();
    await expect(rowsOf(page)).toContainText("ยังไม่มีบัญชี");
  });
});

test.describe("ทะเบียนครู — แยกสิทธิ์ตามบทบาท (UI)", () => {
  test("หัวหน้ากลุ่มสาระ: เห็นเฉพาะครูคณิต อ่านอย่างเดียว", async ({ page }) => {
    await signIn(page, "areahead@snw.test");
    await page.goto("/office/teachers");
    await expect(page.getByText(/เฉพาะกลุ่มสาระ: คณิตศาสตร์/)).toBeVisible();
    await expect(rowsOf(page)).toHaveCount(3);
    await expect(page.getByRole("button", { name: "เพิ่มครู / บุคลากร" })).toHaveCount(0);
    await expect(page.locator("table").getByRole("button")).toHaveCount(0);
    await page.goto("/office");
    await expect(page.locator("#registry")).toContainText("คณิตศาสตร์");
    await expect(page.locator("#registry")).not.toContainText("ภาษาไทย");
  });

  test("ผู้บริหาร: เห็นทั้งโรงเรียน อ่านอย่างเดียว", async ({ page }) => {
    await signIn(page, "exec@snw.test");
    await page.goto("/office/teachers");
    await expect(rowsOf(page)).toHaveCount(8);
    await expect(page.getByRole("button", { name: "เพิ่มครู / บุคลากร" })).toHaveCount(0);
    await expect(page.locator("table").getByRole("button")).toHaveCount(0);
  });

  test("เจ้าหน้าที่วิชาการ: เพิ่ม/แก้ไขได้ แต่ผูกบัญชีไม่ได้", async ({ page }) => {
    await signIn(page, "staff@snw.test");
    await page.goto("/office/teachers");
    await expect(page.getByRole("button", { name: "เพิ่มครู / บุคลากร" })).toBeVisible();
    await expect(page.locator("table").getByRole("button", { name: /แก้ไข/ }).first()).toBeVisible();
    await expect(page.locator("table").getByRole("button", { name: /ผูกบัญชี|ยกเลิกผูก/ })).toHaveCount(0);
  });

  test("ผู้ดูแลระบบ: จัดการและผูกบัญชีได้", async ({ page }) => {
    await signIn(page, "admin@snw.test");
    await page.goto("/office/teachers");
    await expect(page.getByRole("button", { name: "เพิ่มครู / บุคลากร" })).toBeVisible();
    await expect(page.locator("table").getByRole("button", { name: /ผูกบัญชี/ }).first()).toBeVisible();
  });

  test("ครู: เข้าทะเบียนไม่ได้ แต่เห็นระเบียนของตนในโปรไฟล์", async ({ page }) => {
    await signIn(page, "teacher1@snw.test");
    await page.goto("/office/teachers");
    await expectForbidden(page);
    await page.goto("/teacher/profile");
    await expect(page.locator("#registry")).toContainText("T003");
    await expect(page.locator("#registry")).toContainText("นางสาวตัวอย่าง ก");
  });

  test("มือถือ: ทะเบียนแสดงเป็นการ์ด ไม่มี scroll แนวนอน", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "head@snw.test");
    await page.goto("/office/teachers");
    await expect(page.getByText("T003").filter({ visible: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("ทะเบียนครู — RLS ผ่าน Data API จริง", () => {
  const url = `${SUPABASE_URL}/rest/v1/teachers`;

  test("การมองเห็นตามบทบาท และแยกโรงเรียน", async ({ request }) => {
    const count = async (email: string) => {
      const res = await request.get(`${url}?select=teacher_code`, { headers: rest(await apiToken(request, email)) });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).map((r: { teacher_code: string }) => r.teacher_code).sort();
    };
    expect((await count("head@snw.test")).length).toBeGreaterThanOrEqual(10);
    expect(await count("areahead@snw.test")).toEqual(["T002", "T003", "T005"]);
    expect(await count("teacher1@snw.test")).toEqual(["T003"]);
    expect(await count("admin@other.test")).toEqual(["T001"]); // โรงเรียนอื่นเห็นเฉพาะของตน
    const anon = await request.get(`${url}?select=id`, { headers: rest() });
    expect(anon.ok()).toBeFalsy();
  });

  test("ครูเพิ่ม/แก้ระเบียนไม่ได้ และไม่มีใครแก้ profile_id ตรงได้", async ({ request }) => {
    const teacher = await apiToken(request, "teacher1@snw.test");
    const ins = await request.post(url, {
      headers: rest(teacher),
      data: { teacher_code: "HACK1", prefix: "นาย", first_name: "ก", last_name: "ข" },
    });
    expect(ins.status()).toBe(403);
    const upd = await request.patch(`${url}?teacher_code=eq.T003`, {
      headers: { ...rest(teacher), Prefer: "return=representation" },
      data: { first_name: "แก้เอง" },
    });
    expect(await upd.json()).toEqual([]);

    const head = await apiToken(request, "head@snw.test");
    const link = await request.patch(`${url}?teacher_code=eq.T005`, {
      headers: rest(head),
      data: { profile_id: "10000000-0000-4000-a000-000000000005" },
    });
    expect(link.ok()).toBeFalsy();
    const del = await request.delete(`${url}?teacher_code=eq.T005`, { headers: rest(head) });
    expect(del.ok()).toBeFalsy();

    const staff = await apiToken(request, "staff@snw.test");
    const rpc = await request.post(`${SUPABASE_URL}/rest/v1/rpc/link_teacher_account`, {
      headers: rest(staff),
      data: { p_teacher_id: "50000000-0000-4000-a000-000000000005", p_profile_id: "10000000-0000-4000-a000-000000000005" },
    });
    expect(rpc.ok()).toBeFalsy();
  });
});
