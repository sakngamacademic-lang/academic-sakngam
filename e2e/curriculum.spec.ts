import { expect, test, type Page } from "@playwright/test";
import { apiToken, rest, signIn, SUPABASE_URL } from "./helpers";

/**
 * Curriculum Intelligence (C1.1–C2) — ไหลผ่าน UI จริง: ลงทะเบียนเอกสาร → ฉบับร่าง → นำเข้า PDF → ตรวจรายแถว → อนุมัติ (คนละคน) → บันทึก
 * ⚠️ ข้อมูลทั้งหมดเป็นข้อมูลทดสอบที่สร้างขึ้นในเทสต์ (รหัส E2E-*) ไม่ใช่หลักสูตรจริง
 */

/** PDF 1 หน้าที่สร้างขึ้นเพื่อทดสอบ (ข้อความ ASCII) */
function testPdf(text: string): Buffer {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 12 Tf 72 760 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const dialog = (page: Page) => page.getByRole("dialog");

test.describe.serial("หลักสูตร — นำเข้าข้อมูลผ่านการตรวจสอบ", () => {
  test("ยังไม่มีข้อมูล: Dashboard แสดง Empty state ไม่มี KPI ปลอม", async ({ page }) => {
    await signIn(page, "head@snw.test");
    await page.goto("/office/curriculum");
    await expect(page.getByText("ยังไม่มีข้อมูลหลักสูตรในระบบ")).toBeVisible();
    await expect(page.getByText("ยังไม่มีชุดข้อมูลอ้างอิงหลักสูตรแกนกลาง")).toBeVisible();
    await page.goto("/office/curriculum/indicators");
    await page.getByRole("tab", { name: "กรอบหลักสูตรแกนกลาง" }).click();
    await expect(page.getByText("ยังไม่มีข้อมูลกรอบหลักสูตรแกนกลางในระบบ")).toBeVisible();
  });

  test("หัวหน้าฯ สร้างหลักสูตร · เจ้าหน้าที่ลงทะเบียน PDF และสร้างฉบับร่าง + แผนการเรียน", async ({ page }) => {
    await signIn(page, "head@snw.test");
    await page.goto("/office/curriculum/versions");
    await page.getByRole("button", { name: "หลักสูตรสถานศึกษา" }).click();
    await dialog(page).getByLabel("ชื่อหลักสูตร (ตามเอกสาร)").fill("E2E หลักสูตรทดสอบ");
    await dialog(page).getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText("E2E หลักสูตรทดสอบ")).toBeVisible();

    await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
    await signIn(page, "staff@snw.test");
    await page.goto("/office/curriculum/imports");
    await page.getByRole("button", { name: "ลงทะเบียนเอกสาร" }).click();
    await dialog(page).getByLabel("รหัสทะเบียน").fill("SRC-90");
    await dialog(page).getByLabel("ชื่อเอกสาร").fill("E2E เอกสารทดสอบ");
    await dialog(page).getByLabel("จำนวนหน้า PDF").fill("1");
    await dialog(page).getByLabel("ไฟล์ (PDF / .xlsx ≤ 100 MB)").setInputFiles({ name: "e2e.pdf", mimeType: "application/pdf", buffer: testPdf("E2E101 Test subject for automated import") });
    await dialog(page).getByRole("button", { name: "บันทึก" }).click();
    await expect(page.locator("#sources")).toContainText("SRC-90");
    await expect(page.locator("#sources")).toContainText("มีไฟล์");

    await page.goto("/office/curriculum/versions");
    await page.getByRole("button", { name: "ฉบับร่างใหม่" }).click();
    await dialog(page).getByLabel("ชื่อฉบับ").fill("E2E-ฉบับร่าง");
    await dialog(page).getByLabel("ชั่วโมงต่อหน่วยกิต (ไม่บังคับ — ใช้เตือนเท่านั้น ไม่แก้ค่าต้นฉบับ)").fill("40");
    await dialog(page).getByLabel("เอกสารประกาศใช้").selectOption({ label: "SRC-90 E2E เอกสารทดสอบ" });
    await dialog(page).getByLabel("ตำแหน่งในเอกสาร").fill("pdf:1");
    await dialog(page).getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByTestId("version").filter({ hasText: "E2E-ฉบับร่าง" })).toContainText("ฉบับร่าง");

    await page.goto("/office/curriculum/programs");
    await page.getByRole("button", { name: "เพิ่มแผนการเรียน" }).click();
    await dialog(page).getByLabel("รหัสแผน").fill("E2E-GEN");
    await dialog(page).getByLabel("ชื่อแผนการเรียน (ตามเอกสาร)").fill("แผนทดสอบ E2E");
    await dialog(page).getByLabel("ตำแหน่ง").fill("หน้า 1");
    await dialog(page).getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText(/รูปแบบ|ข้อมูลไม่ถูกต้อง/).first()).toBeVisible(); // locator ต้องเป็น pdf:/sheet:
    await dialog(page).getByLabel("ตำแหน่ง").fill("pdf:1");
    await dialog(page).getByRole("button", { name: "บันทึก" }).click();
    await expect(page.locator("table")).toContainText("แผนทดสอบ E2E");
  });

  test("นำเข้า PDF → แถว needs_review → กรอกจากข้อความ → อนุมัติแถว (เจ้าหน้าที่) → อนุมัติชุด + บันทึก (หัวหน้าฯ)", async ({ page }) => {
    await signIn(page, "staff@snw.test");
    await page.goto("/office/curriculum/imports");
    await page.getByRole("button", { name: "สร้างชุดนำเข้า" }).click();
    await dialog(page).getByLabel("การจับคู่คอลัมน์ / ช่วงหน้า (JSON)").fill('{"pages": "1"}');
    await dialog(page).getByRole("button", { name: "สร้าง" }).click();
    const batch = page.getByTestId("batch").first();
    await batch.getByRole("button", { name: "อ่านไฟล์" }).click();
    await expect(page.getByText(/อ่านไฟล์แล้ว 1 แถว/)).toBeVisible();
    await batch.getByRole("link", { name: "ตรวจรายแถว" }).click();

    const row = page.getByTestId("import-row").first();
    await expect(row).toContainText("ต้องตรวจโดยคน");
    await expect(row).toContainText("E2E101 Test subject for automated import");
    await expect(row).toContainText("PDF หน้า 1");
    await row.getByRole("button", { name: "อนุมัติแถว" }).click();
    await expect(page.getByText("ยังไม่ได้กรอกค่าจากต้นฉบับ อนุมัติไม่ได้")).toBeVisible();

    const set = async (f: string, v: string) => row.getByLabel(`แถว 1 ${f}`, { exact: true }).fill(v);
    await set("code", "E2E101");
    await set("name_th", "วิชาทดสอบ E2E");
    await set("learning_area_code", "MA");
    await set("subject_type", "basic");
    await set("grade_code", "M1");
    await set("credits", "1.0");
    await set("learning_hours", "20");
    await row.getByRole("button", { name: "บันทึกและตรวจซ้ำ" }).click();
    const reviewed = page.getByTestId("import-row").first();
    await expect(reviewed).toContainText("V22"); // แจ้งเป็นข้อมูล: 20 ≠ 1.0 × 40 แต่ไม่แก้ค่า
    await reviewed.getByRole("button", { name: "อนุมัติแถว" }).click();
    await expect(page.getByTestId("import-row").first()).toContainText("อนุมัติ");
    await expect(page.getByRole("button", { name: /อนุมัติชุด/ })).toHaveCount(0); // เจ้าหน้าที่ไม่มีสิทธิ์อนุมัติชุด

    // RPC: เจ้าหน้าที่อนุมัติชุด/commit ไม่ได้
    const staff = await apiToken(page.request, "staff@snw.test");
    const batchId = new URL(page.url()).searchParams.get("batch");
    const approve = await page.request.post(`${SUPABASE_URL}/rest/v1/rpc/curriculum_import_batch_approve`, { headers: rest(staff), data: { p_batch_id: batchId } });
    expect(approve.status()).toBe(403);
    const commit = await page.request.post(`${SUPABASE_URL}/rest/v1/rpc/curriculum_import_batch_commit`, { headers: rest(staff), data: { p_batch_id: batchId } });
    expect(commit.status()).toBe(403);

    await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
    await signIn(page, "head@snw.test");
    await page.goto(`/office/curriculum/review?batch=${batchId}`);
    await page.getByRole("button", { name: "อนุมัติชุด" }).click();
    await page.getByRole("button", { name: "บันทึกเข้าข้อมูลหลัก" }).click();
    await expect(page.getByText("บันทึกเข้าข้อมูลหลักแล้ว").first()).toBeVisible();

    await page.goto("/office/curriculum/subjects");
    // บันทึกแล้วแต่ฉบับยังเป็นร่าง → ต้องแจ้งว่าไม่ใช่หลักสูตรที่ใช้งานจริง และ Dashboard ไม่นับเป็นหลักสูตรที่ใช้อยู่
    await expect(page.getByTestId("version-status-notice")).toContainText("ไม่ใช่หลักสูตรที่ใช้งานจริง");
    const subjectRow = page.locator("table tbody tr").filter({ hasText: "E2E101" });
    await expect(subjectRow).toContainText("1.0");
    await expect(subjectRow).toContainText("20");
    await subjectRow.getByRole("button", { name: /รายละเอียด/ }).click();
    await expect(dialog(page)).toContainText("SRC-90");
    await expect(dialog(page)).toContainText("PDF หน้า 1");
    await expect(dialog(page)).toContainText("นำเข้าผ่านการตรวจรายแถวและอนุมัติแล้ว");
  });

  test("ส่งตรวจ → อนุมัติ → ล็อกเนื้อหา · ห้องเรียนที่ไม่มีเอกสารยืนยัน = ยังระบุไม่ได้", async ({ page }) => {
    await signIn(page, "staff@snw.test");
    await page.goto("/office/curriculum/versions");
    const v = page.getByTestId("version").filter({ hasText: "E2E-ฉบับร่าง" });
    await v.getByRole("button", { name: "ส่งตรวจ" }).click();
    await expect(v).toContainText("รอตรวจ");
    await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
    await signIn(page, "head@snw.test");
    await page.goto("/office/curriculum/versions");
    await page.getByTestId("version").filter({ hasText: "E2E-ฉบับร่าง" }).getByRole("button", { name: "อนุมัติ", exact: true }).click();
    await expect(page.getByTestId("version").filter({ hasText: "E2E-ฉบับร่าง" })).toContainText("อนุมัติแล้ว");
    await page.goto("/office/curriculum/subjects");
    await expect(page.getByTestId("version-status-notice")).toHaveCount(0);
    await page.goto("/office/curriculum/versions");

    const head = await apiToken(page.request, "head@snw.test");
    const upd = await page.request.patch(`${SUPABASE_URL}/rest/v1/subjects?code=eq.E2E101`, { headers: rest(head), data: { name_th: "แก้หลังอนุมัติ" } });
    expect(upd.ok()).toBeFalsy(); // trigger ล็อกเนื้อหาฉบับที่อนุมัติ

    await expect(page.getByRole("list", { name: "หลักสูตรของห้องเรียน" })).toContainText("ยังระบุไม่ได้");
  });
});

test.describe("หลักสูตร — สิทธิ์และการแยกโรงเรียน (Data API)", () => {
  test("ครู / ผู้บริหาร / โรงเรียนอื่น", async ({ request }) => {
    const teacher = await apiToken(request, "teacher1@snw.test");
    for (const t of ["source_documents", "import_batches", "import_rows"]) {
      const r = await request.get(`${SUPABASE_URL}/rest/v1/${t}?select=id`, { headers: rest(teacher) });
      expect(await r.json(), t).toEqual([]);
    }
    const exec = await apiToken(request, "exec@snw.test");
    const ins = await request.post(`${SUPABASE_URL}/rest/v1/school_curricula`, { headers: rest(exec), data: { name_th: "x" } });
    expect(ins.ok()).toBeFalsy();
    const other = await apiToken(request, "admin@other.test");
    for (const t of ["school_curricula", "curriculum_versions", "subjects", "source_documents"]) {
      const r = await request.get(`${SUPABASE_URL}/rest/v1/${t}?select=id`, { headers: rest(other) });
      expect(await r.json(), t).toEqual([]);
    }
  });

  test("มือถือ: หน้าหลักสูตรไม่มี scroll แนวนอน", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "head@snw.test");
    for (const path of ["/office/curriculum", "/office/curriculum/structure", "/office/curriculum/imports", "/office/curriculum/review"]) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "เมนูหลักสูตร" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
