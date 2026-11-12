import { expect, test, type Page } from "@playwright/test";
import { apiToken, expectForbidden, rest, signIn, SUPABASE_URL } from "./helpers";

const OTHER_SCHOOL_YEAR = "40000000-0000-4000-a000-000000012569";

async function openDialogAndSave(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click();
}

test.describe.serial("Master Data — หัวหน้าวิชาการ", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "head@snw.test");
  });

  test("ปีการศึกษา: เพิ่ม, กันปีซ้ำ, ตั้งปีปัจจุบัน", async ({ page }) => {
    await page.goto("/office/academic-years");
    await expect(page.getByRole("heading", { name: "ปีการศึกษา" })).toBeVisible();
    await page.getByRole("button", { name: "เพิ่มปีการศึกษา" }).click();
    await expect(page.getByLabel("ปีการศึกษา (พ.ศ.)")).toHaveValue("2570");
    await openDialogAndSave(page);
    await expect(page.getByText("เพิ่มปีการศึกษาเรียบร้อย")).toBeVisible();

    // ปีซ้ำ → ข้อความจากฐานข้อมูลภาษาไทย
    await page.getByRole("button", { name: "เพิ่มปีการศึกษา" }).click();
    await page.getByLabel("ปีการศึกษา (พ.ศ.)").fill("2569");
    await page.getByLabel("วันเริ่มต้น").fill("2040-05-16");
    await page.getByLabel("วันสิ้นสุด").fill("2041-05-15");
    await openDialogAndSave(page);
    await expect(page.getByRole("alert").filter({ hasText: "มีปีการศึกษานี้อยู่แล้ว" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "ยกเลิก" }).click();

    // วันที่กลับด้าน → ตรวจฝั่ง client
    await page.getByRole("button", { name: "เพิ่มปีการศึกษา" }).click();
    await page.getByLabel("วันสิ้นสุด").fill("2027-01-01");
    await openDialogAndSave(page);
    await expect(page.getByText("วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "ยกเลิก" }).click();

    const row2570 = page.getByRole("row").filter({ hasText: "2570" });
    await row2570.getByRole("button", { name: "ตั้งเป็นปีปัจจุบัน" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยืนยัน" }).click();
    await expect(page.getByText("ตั้งปีการศึกษาปัจจุบันเรียบร้อย")).toBeVisible();
    await expect(row2570.getByText("ปัจจุบัน", { exact: true })).toBeVisible();
    await expect(page.getByRole("table").getByText("ปัจจุบัน", { exact: true })).toHaveCount(1);
  });

  test("ภาคเรียน: วันที่นอกปี / ทับซ้อน / ตั้งภาคปัจจุบัน", async ({ page }) => {
    await page.goto("/office/terms");
    await page.getByLabel("กรองตามปีการศึกษา").selectOption({ label: "ปีการศึกษา 2570 (ปัจจุบัน)" });
    await expect(page.getByText("ยังไม่มีภาคเรียนในปีการศึกษานี้")).toBeVisible();

    await page.getByRole("button", { name: "เพิ่มภาคเรียน" }).click();
    await page.getByLabel("วันเปิดภาคเรียน").fill("2027-04-01");
    await page.getByLabel("วันปิดภาคเรียน").fill("2027-10-10");
    await openDialogAndSave(page);
    await expect(page.getByText(/ต้องอยู่ภายในปีการศึกษา 2570/)).toBeVisible();

    await page.getByLabel("วันเปิดภาคเรียน").fill("2027-05-16");
    await openDialogAndSave(page);
    await expect(page.getByText("เพิ่มภาคเรียนเรียบร้อย")).toBeVisible();

    await page.getByRole("button", { name: "เพิ่มภาคเรียน" }).click();
    await expect(page.getByLabel("ภาคเรียนที่")).toHaveValue("2");
    await page.getByLabel("วันเปิดภาคเรียน").fill("2027-10-01");
    await page.getByLabel("วันปิดภาคเรียน").fill("2028-03-31");
    await openDialogAndSave(page);
    await expect(page.getByRole("alert").filter({ hasText: "ทับซ้อน" })).toBeVisible();
    await page.getByLabel("วันเปิดภาคเรียน").fill("2027-11-01");
    await openDialogAndSave(page);
    await expect(page.getByText("เพิ่มภาคเรียนเรียบร้อย")).toBeVisible();

    await page.getByRole("row").filter({ hasText: "ภาคเรียนที่ 2" }).getByRole("button", { name: "ตั้งเป็นภาคปัจจุบัน" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยืนยัน" }).click();
    await expect(page.getByText("ตั้งภาคเรียนปัจจุบันเรียบร้อย")).toBeVisible();
  });

  test("ห้องเรียน: คัดลอกจากปีก่อน, กันห้องซ้ำ, ปิดใช้งาน", async ({ page }) => {
    await page.goto("/office/classrooms");
    await expect(page.getByLabel("กรองตามปีการศึกษา")).toHaveValue(/.+/);
    await page.getByLabel("กรองตามปีการศึกษา").selectOption({ label: "ปีการศึกษา 2570 (ปัจจุบัน)" });
    await expect(page.getByText("ยังไม่มีห้องเรียนในปีการศึกษานี้")).toBeVisible();

    await page.getByRole("button", { name: "คัดลอกจากปีอื่น" }).click();
    await page.getByLabel("คัดลอกจากปีการศึกษา").selectOption({ label: "2569" });
    await page.getByRole("dialog").getByRole("button", { name: "คัดลอก" }).click();
    await expect(page.getByText("คัดลอกห้องเรียน 12 ห้องเรียบร้อย")).toBeVisible();
    await expect(page.getByText("ทั้งหมด 12 ห้อง")).toBeVisible();

    await page.getByRole("button", { name: "เพิ่มห้องเรียน" }).click();
    await page.getByLabel("ระดับชั้น", { exact: true }).selectOption({ label: "ม.1" });
    await page.getByLabel("ห้องที่").fill("1");
    await openDialogAndSave(page);
    await expect(page.getByRole("alert").filter({ hasText: "มีห้องเรียนนี้อยู่แล้วในปีการศึกษาเดียวกัน" })).toBeVisible();
    await page.getByLabel("ห้องที่").fill("3");
    await openDialogAndSave(page);
    await expect(page.getByText("เพิ่มห้องเรียนเรียบร้อย")).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "ม.1/3" });
    await row.getByRole("button", { name: /ปิดใช้งาน/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ปิดใช้งาน" }).click();
    await expect(page.getByText("ปิดใช้งานห้อง ม.1/3 แล้ว")).toBeVisible();
    await expect(row.getByText("ปิดใช้งาน", { exact: true })).toBeVisible();
  });

  test("ระดับชั้น: ค้นหา/กรอง และแก้ไข", async ({ page }) => {
    await page.goto("/office/grade-levels");
    await page.getByLabel("กรองตามสถานะ").selectOption("inactive");
    await expect(page.getByRole("row").filter({ hasText: "ป.1" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "ม.1" })).toHaveCount(0);
    await page.getByLabel("กรองตามสถานะ").selectOption("");
    await page.getByLabel("ค้นหา").fill("M6");
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
    await page.getByRole("row").filter({ hasText: "ม.6" }).getByRole("button", { name: "แก้ไข" }).click();
    await expect(page.getByLabel("รหัส")).toBeDisabled();
    await page.getByLabel("ลำดับการแสดงผล").fill("12");
    await openDialogAndSave(page);
    await expect(page.getByText("บันทึกการแก้ไขเรียบร้อย")).toBeVisible();
  });
});

test.describe("สิทธิ์ตามบทบาท (UI)", () => {
  test("ผู้บริหาร: อ่านอย่างเดียว", async ({ page }) => {
    await signIn(page, "exec@snw.test");
    for (const path of ["/office/academic-years", "/office/classrooms", "/office/learning-areas"]) {
      await page.goto(path);
      await expect(page.getByText("คุณมีสิทธิ์ดูข้อมูลอย่างเดียว")).toBeVisible();
      await expect(page.getByRole("button", { name: /^เพิ่ม/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "แก้ไข" })).toHaveCount(0);
    }
  });

  test("หัวหน้ากลุ่มสาระ: เห็นเฉพาะกลุ่มสาระของตน", async ({ page }) => {
    await signIn(page, "areahead@snw.test");
    await page.goto("/office/learning-areas");
    await expect(page.getByText("คุณเห็นเฉพาะกลุ่มสาระที่ได้รับมอบหมายเป็นหัวหน้า")).toBeVisible();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("row").filter({ hasText: "คณิตศาสตร์" })).toBeVisible();
    await expect(page.getByRole("table").getByText("ภาษาไทย")).toHaveCount(0);
  });

  test("เจ้าหน้าที่วิชาการ: จัดการระดับชั้นได้ แต่จัดการกลุ่มสาระไม่ได้", async ({ page }) => {
    await signIn(page, "staff@snw.test");
    await page.goto("/office/grade-levels");
    await expect(page.getByRole("button", { name: "เพิ่มระดับชั้น" })).toBeVisible();
    await page.goto("/office/learning-areas");
    await expect(page.getByRole("row")).toHaveCount(9);
    await expect(page.getByRole("button", { name: "เพิ่มกลุ่มสาระ" })).toHaveCount(0);
  });

  test("ครู: เข้าหน้าข้อมูลพื้นฐานไม่ได้", async ({ page }) => {
    await signIn(page, "teacher1@snw.test");
    await page.goto("/office/academic-years");
    await expectForbidden(page);
  });

  test("ผู้ดูแลระบบ: มอบหมายและถอนหัวหน้ากลุ่มสาระ", async ({ page }) => {
    await signIn(page, "admin@snw.test");
    await page.goto("/office/learning-areas");
    await page.getByRole("button", { name: "จัดการหัวหน้ากลุ่มสาระภาษาไทย" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("ยังไม่มีหัวหน้ากลุ่มสาระ")).toBeVisible();
    await expect(dialog.getByLabel("มอบหมายผู้ใช้").locator("option", { hasText: "ผู้ดูแลระบบ (ทดสอบ)" })).toHaveCount(0);
    await dialog.getByLabel("มอบหมายผู้ใช้").selectOption({ label: "ครูตัวอย่าง ข" });
    await dialog.getByRole("button", { name: "มอบหมาย", exact: true }).click();
    await expect(page.getByText("มอบหมาย ครูตัวอย่าง ข เป็นหัวหน้ากลุ่มสาระเรียบร้อย")).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "ครูตัวอย่าง ข" })).toBeVisible();

    await dialog.getByRole("button", { name: "ถอนสิทธิ์ ครูตัวอย่าง ข" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ถอนสิทธิ์" }).click();
    await expect(page.getByText("ถอนสิทธิ์หัวหน้ากลุ่มสาระของ ครูตัวอย่าง ข แล้ว")).toBeVisible();
  });
});

test.describe("RLS ผ่าน Data API จริง", () => {
  test("หัวหน้ากลุ่มสาระเห็นเฉพาะกลุ่มสาระของตน และเพิ่ม scope ตนเองไม่ได้", async ({ request }) => {
    const token = await apiToken(request, "areahead@snw.test");
    const areas = await (await request.get(`${SUPABASE_URL}/rest/v1/learning_areas?select=code`, { headers: rest(token) })).json();
    expect(areas).toEqual([{ code: "MA" }]);
    const self = await request.post(`${SUPABASE_URL}/rest/v1/user_roles`, {
      headers: rest(token),
      data: {
        user_id: "10000000-0000-4000-a000-000000000004",
        school_id: "00000000-0000-4000-a000-000000000001",
        role: "learning_area_head",
        learning_area_id: "30000000-0000-4000-a000-000000000001",
      },
    });
    expect(self.status()).toBe(403);
  });

  test("ข้ามโรงเรียน: มองไม่เห็นและแก้ไม่ได้", async ({ request }) => {
    const other = await apiToken(request, "admin@other.test");
    const years = await (await request.get(`${SUPABASE_URL}/rest/v1/academic_years?select=year_be,id`, { headers: rest(other) })).json();
    expect(years).toEqual([{ year_be: 2569, id: OTHER_SCHOOL_YEAR }]);

    const head = await apiToken(request, "head@snw.test");
    const rpc = await request.post(`${SUPABASE_URL}/rest/v1/rpc/set_current_academic_year`, {
      headers: rest(head),
      data: { p_year_id: OTHER_SCHOOL_YEAR },
    });
    expect(rpc.ok()).toBe(false);
    const forged = await request.post(`${SUPABASE_URL}/rest/v1/academic_years`, {
      headers: rest(head),
      data: { school_id: "00000000-0000-4000-a000-000000000002", year_be: 2590, starts_on: "2047-05-16", ends_on: "2048-05-15" },
    });
    expect(forged.status()).toBe(403); // ไม่มีสิทธิ์กำหนด school_id เอง
  });

  test("สิทธิ์เขียนตามบทบาท", async ({ request }) => {
    const teacher = await apiToken(request, "teacher1@snw.test");
    const t = await request.post(`${SUPABASE_URL}/rest/v1/grade_levels`, {
      headers: rest(teacher),
      data: { code: "X1", name_th: "ทดสอบ", stage: "other", level_order: 50 },
    });
    expect(t.status()).toBe(403);

    const staff = await apiToken(request, "staff@snw.test");
    const s = await request.post(`${SUPABASE_URL}/rest/v1/learning_areas`, { headers: rest(staff), data: { code: "XX", name_th: "ทดสอบ" } });
    expect(s.status()).toBe(403);

    const exec = await apiToken(request, "exec@snw.test");
    const e = await request.patch(`${SUPABASE_URL}/rest/v1/academic_years?year_be=eq.2569`, {
      headers: { ...rest(exec), Prefer: "return=representation" },
      data: { note: "แก้โดยผู้บริหาร" },
    });
    expect(await e.json()).toEqual([]); // RLS: ไม่มีแถวถูกแก้

    const del = await request.delete(`${SUPABASE_URL}/rest/v1/classrooms?room_no=eq.1`, { headers: rest(await apiToken(request, "head@snw.test")) });
    expect(del.status()).toBe(403); // ไม่มีการลบจริง (ใช้ปิดใช้งาน)
  });
});
