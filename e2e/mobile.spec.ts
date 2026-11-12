import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("มือถือ: เปิดเมนู เห็นผู้ใช้ และออกจากระบบได้", async ({ page }) => {
  await login(page, "teacher1@snw.test");
  await expect(page).toHaveURL(/\/teacher$/);
  await page.getByRole("button", { name: "เปิดเมนู" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("user-name")).toHaveText("ครูตัวอย่าง ก");
  await dialog.getByRole("button", { name: "ออกจากระบบ" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
