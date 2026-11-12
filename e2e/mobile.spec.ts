import { expect, test } from "@playwright/test";
import { login, signIn } from "./helpers";

test("มือถือ: เปิดเมนู เห็นผู้ใช้ และออกจากระบบได้", async ({ page }) => {
  await login(page, "teacher1@snw.test");
  await expect(page).toHaveURL(/\/teacher$/);
  await page.getByRole("button", { name: "เปิดเมนู" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("user-name")).toHaveText("ครูตัวอย่าง ก");
  await dialog.getByRole("button", { name: "ออกจากระบบ" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("มือถือ: หน้าห้องเรียนแสดงเป็นการ์ดและเปิดฟอร์มได้", async ({ page }) => {
  await signIn(page, "head@snw.test");
  await page.goto("/office/classrooms");
  const list = page.getByRole("list", { name: "รายการห้องเรียน" });
  await expect(list.getByRole("listitem")).toHaveCount(13); // 12 ห้องที่คัดลอก + ม.1/3 จากชุดทดสอบ desktop
  await expect(page.getByRole("table")).toBeHidden();
  await page.getByRole("button", { name: "เพิ่มห้องเรียน" }).click();
  await expect(page.getByRole("dialog").getByLabel("ห้องที่")).toBeVisible();
});
