import { expect, test, type Page } from "@playwright/test";
import { apiToken, expectForbidden, rest, signIn, SUPABASE_URL } from "./helpers";

/** Phase 1.7 — มอบหมายภาระงาน: สร้าง → แนบแม่แบบ → เผยแพร่ → ครูเห็นงาน · สิทธิ์ · กันซ้ำ · วันครบกำหนด */

const PDF = Buffer.from("%PDF-1.4\n%แม่แบบ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const SEED_OVERDUE_TASK = "60000000-0000-4000-a000-000000000003";
const SEED_SCHOOL_TASK = "60000000-0000-4000-a000-000000000001";
const OTHER_SCHOOL_TEACHER = "50000000-0000-4000-a000-000000000101";
const TITLE = "E2E: บันทึกหลังการสอน เดือนที่ 2";

const rpc = (page: Page, token: string, fn: string, data: unknown) =>
  page.request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { headers: rest(token), data });

test.describe.serial("ภาระงาน — เจ้าหน้าที่วิชาการสร้างและมอบหมาย", () => {
  let taskUrl = "";

  test("สร้างงาน (ตรวจวันที่) → แนบแม่แบบ → เผยแพร่ตามกลุ่มสาระ", async ({ page }) => {
    await signIn(page, "staff@snw.test");
    await page.goto("/office/tasks");
    await page.getByRole("link", { name: "สร้างภาระงาน" }).first().click();
    await expect(page).toHaveURL(/\/office\/tasks\/create$/);

    await page.getByLabel("ชื่องาน").fill(TITLE);
    await page.getByLabel("รายละเอียด / ข้อกำหนด").fill("ส่งเป็น PDF ไฟล์เดียว");
    await page.getByLabel("วันเริ่มต้น").fill("2030-01-10T08:00");
    await page.getByLabel("วันครบกำหนด").fill("2030-01-05T08:00");
    await page.getByRole("button", { name: /บันทึกฉบับร่าง/ }).click();
    await expect(page.getByText("วันครบกำหนดต้องอยู่หลังวันเริ่มต้น")).toBeVisible();
    await page.getByLabel("วันครบกำหนด").fill("2030-01-20T16:30");
    await page.getByRole("button", { name: /บันทึกฉบับร่าง/ }).click();
    await expect(page).toHaveURL(/\/office\/tasks\/[0-9a-f-]{36}$/);
    taskUrl = page.url();
    await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(page.getByText("ฉบับร่าง", { exact: true })).toBeVisible();

    await page.getByLabel("แนบแม่แบบ").setInputFiles({ name: "แบบบันทึกหลังสอน.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.locator("#templates")).toContainText("แบบบันทึกหลังสอน.pdf");

    await page.getByRole("radio", { name: "ตามกลุ่มสาระ" }).check();
    await page.getByRole("group", { name: "เลือกกลุ่มสาระ" }).getByLabel("คณิตศาสตร์").check();
    await page.getByRole("button", { name: "เผยแพร่และมอบหมาย" }).click();
    await expect(page.getByText("มอบหมายใหม่ 3 คน")).toBeVisible();
    await expect(page.getByText("เผยแพร่แล้ว").first()).toBeVisible();
    await expect(page.getByTestId("recipient")).toHaveCount(3);
  });

  test("มอบหมายซ้ำถูกข้าม (UI ไม่แสดงคนที่ได้รับแล้ว + RPC กันซ้ำ)", async ({ page }) => {
    await signIn(page, "staff@snw.test");
    await page.goto(taskUrl);
    await page.getByRole("radio", { name: "เลือกรายบุคคล" }).check();
    const list = page.getByRole("list", { name: "รายชื่อครู" });
    await expect(list.getByText("(T003)")).toHaveCount(0); // ได้รับมอบหมายแล้ว
    await list.getByText("(T004)").click();
    await page.getByRole("button", { name: /มอบหมายเพิ่ม/ }).click();
    await expect(page.getByText("มอบหมายใหม่ 1 คน")).toBeVisible();
    await expect(page.getByTestId("recipient")).toHaveCount(4);

    const token = await apiToken(page.request, "staff@snw.test");
    const taskId = taskUrl.split("/").pop();
    const again = await rpc(page, token, "task_publish", { p_task_id: taskId, p_mode: "learning_areas", p_learning_area_ids: ["30000000-0000-4000-a000-000000000002"] });
    expect(await again.json()).toEqual([{ assigned_count: 0, skipped_count: 3 }]);
    const cross = await rpc(page, token, "task_publish", { p_task_id: taskId, p_mode: "teachers", p_teacher_ids: [OTHER_SCHOOL_TEACHER] });
    expect(cross.status()).toBe(403); // ครูต่างโรงเรียน
  });

  test("ครูที่ได้รับมอบหมายเห็นงาน รายละเอียด และดาวน์โหลดแม่แบบ · ครูอื่นไม่เห็น", async ({ page }) => {
    await signIn(page, "teacher1@snw.test");
    await page.goto("/teacher/assignments");
    const card = page.getByTestId("assignment").filter({ hasText: TITLE });
    await expect(card).toContainText("รับไฟล์: PDF, DOCX");
    await card.getByRole("button", { name: "รายละเอียด / แม่แบบ" }).click();
    await expect(card).toContainText("ส่งเป็น PDF ไฟล์เดียว");
    const download = page.waitForEvent("download");
    await card.getByRole("button", { name: /ดาวน์โหลดแม่แบบ/ }).click();
    expect((await download).suggestedFilename()).toBe("แบบบันทึกหลังสอน.pdf");
    await expect(card.getByRole("button", { name: /ส่งเอกสาร/ })).toBeDisabled(); // Phase 1.9

    // งานที่เลยกำหนด (seed) แสดงชัด
    await expect(page.getByTestId("assignment").filter({ hasText: "รายงานผลการประเมินกลางภาค" })).toContainText("เลยกำหนด");
    await page.getByPlaceholder("ค้นหาชื่องาน").fill("แผนการจัดการเรียนรู้");
    await expect(page.getByTestId("assignment")).toHaveCount(1);

    const t2 = await apiToken(page.request, "teacher2@snw.test");
    const res = await page.request.get(`${SUPABASE_URL}/rest/v1/tasks?select=title`, { headers: rest(t2) });
    const titles = (await res.json()).map((r: { title: string }) => r.title);
    expect(titles).toContain(TITLE); // teacher2 ถูกเพิ่มรายบุคคล
    expect(titles).not.toContain("บันทึกหลังการสอน คณิตศาสตร์ เดือนที่ 1"); // งานกลุ่มคณิตไม่ได้มอบให้ครูวิทย์
  });

  test("แก้ไขวันครบกำหนด และยกเลิกงาน (ประวัติไม่หาย)", async ({ page }) => {
    await signIn(page, "staff@snw.test");
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "แก้ไข" }).click();
    await page.getByRole("dialog").getByLabel("วันครบกำหนด").fill("2030-02-01T16:30");
    await page.getByRole("dialog").getByRole("button", { name: "บันทึกการแก้ไข" }).click();
    await expect(page.locator("#task-info")).toContainText("1 ก.พ. 2573");

    await page.getByRole("button", { name: "ยกเลิกงาน" }).click();
    await page.getByLabel("เหตุผลการยกเลิก").fill("รวมกับงานเดือนที่ 3");
    await page.getByRole("button", { name: "ยืนยันยกเลิกงาน" }).click();
    await expect(page.getByText(/งานนี้ถูกยกเลิกแล้ว — เหตุผล: รวมกับงานเดือนที่ 3/)).toBeVisible();
    await expect(page.getByTestId("recipient")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "แก้ไข" })).toHaveCount(0);

    await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
    await signIn(page, "teacher1@snw.test");
    await page.goto("/teacher/assignments");
    await page.getByRole("tab", { name: /ยกเลิก/ }).click();
    await expect(page.getByTestId("assignment").filter({ hasText: TITLE })).toBeVisible();
  });
});

test.describe("ภาระงาน — สิทธิ์ตามบทบาท", () => {
  test("หัวหน้ากลุ่มสาระ: สร้างได้เฉพาะงานกลุ่มตน และมอบหมายได้เฉพาะครูในกลุ่ม", async ({ page }) => {
    await signIn(page, "areahead@snw.test");
    await page.goto("/office/tasks/create");
    const scope = page.getByLabel("ขอบเขตงาน");
    await expect(scope.locator("option")).toHaveCount(1);
    await expect(scope.locator("option")).toHaveText("กลุ่มสาระคณิตศาสตร์");
    await page.getByLabel("ชื่องาน").fill("E2E: งานกลุ่มคณิต");
    await page.getByRole("button", { name: /บันทึกฉบับร่าง/ }).click();
    await expect(page).toHaveURL(/\/office\/tasks\/[0-9a-f-]{36}$/);
    await page.getByRole("radio", { name: "ครูทุกคนในขอบเขต" }).check();
    await page.getByRole("button", { name: "เผยแพร่และมอบหมาย" }).click();
    await expect(page.getByText("มอบหมายใหม่ 3 คน")).toBeVisible();

    const token = await apiToken(page.request, "areahead@snw.test");
    const outside = await rpc(page, token, "task_publish", { p_task_id: page.url().split("/").pop(), p_mode: "teachers", p_teacher_ids: ["50000000-0000-4000-a000-000000000004"] });
    expect(outside.status()).toBe(403);
    const schoolWide = await rpc(page, token, "task_cancel", { p_task_id: SEED_SCHOOL_TASK, p_reason: "x" });
    expect(schoolWide.status()).toBe(403);
    // งานระดับโรงเรียน: เห็นเฉพาะการมอบหมายของครูในกลุ่ม
    const a = await page.request.get(`${SUPABASE_URL}/rest/v1/task_assignments?select=id&task_id=eq.${SEED_SCHOOL_TASK}`, { headers: rest(token) });
    expect((await a.json()).length).toBe(3);
  });

  test("ผู้บริหาร: อ่านอย่างเดียว", async ({ page }) => {
    await signIn(page, "exec@snw.test");
    await page.goto("/office/tasks");
    await expect(page.getByTestId("task-row").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "สร้างภาระงาน" })).toHaveCount(0);
    await page.getByTestId("task-row").filter({ hasText: "รายงานผลการประเมินกลางภาค" }).getByRole("link").click();
    await expect(page.locator("#recipients")).toBeVisible();
    await expect(page.getByRole("button", { name: /แก้ไข|ยกเลิกงาน|เผยแพร่/ })).toHaveCount(0);
    await page.goto("/office/tasks/create");
    await expectForbidden(page);
  });

  test("ครู / ผู้ดูแลระบบ / โรงเรียนอื่น", async ({ page }) => {
    await signIn(page, "teacher1@snw.test");
    await page.goto("/office/tasks");
    await expectForbidden(page);
    const t1 = await apiToken(page.request, "teacher1@snw.test");
    const ins = await page.request.post(`${SUPABASE_URL}/rest/v1/tasks`, { headers: rest(t1), data: { title: "x", due_at: "2030-01-01T00:00:00Z" } });
    expect(ins.ok()).toBeFalsy();
    const draft = await page.request.get(`${SUPABASE_URL}/rest/v1/tasks?select=status&status=eq.draft`, { headers: rest(t1) });
    expect(await draft.json()).toEqual([]); // ครูไม่เห็นฉบับร่าง
    for (const email of ["admin@snw.test", "admin@other.test"]) {
      const tok = await apiToken(page.request, email);
      const r = await page.request.get(`${SUPABASE_URL}/rest/v1/tasks?select=id`, { headers: rest(tok) });
      expect(await r.json()).toEqual([]);
    }
  });

  test("Dashboard ติดตาม: นับผู้รับ/ส่งแล้ว/เลยกำหนดจาก due_at", async ({ page }) => {
    await signIn(page, "head@snw.test");
    await page.goto("/office/tasks");
    const row = page.getByTestId("task-row").filter({ hasText: "รายงานผลการประเมินกลางภาค" });
    await expect(row).toContainText("ส่งแล้ว 0/2");
    await expect(row).toContainText("เลยกำหนด 2");
    await row.getByRole("link").click();
    await expect(page.getByTestId("recipient").filter({ hasText: "เลยกำหนด" })).toHaveCount(2);
    const token = await apiToken(page.request, "head@snw.test");
    const p = await page.request.get(`${SUPABASE_URL}/rest/v1/task_progress?task_id=eq.${SEED_OVERDUE_TASK}`, { headers: rest(token) });
    expect((await p.json())[0]).toMatchObject({ total: 2, overdue: 2 });
  });
});
