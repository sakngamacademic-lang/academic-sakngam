import { readFileSync } from "node:fs";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** รหัสผ่านของบัญชีทดสอบใน supabase/seed.sql (ใช้ได้เฉพาะ local) */
export const SEED_PASSWORD = "LocalDev#2569";

function readEnvLocal(): Record<string, string> {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim()];
      }),
  );
}

const env = readEnvLocal();
export const SUPABASE_URL = env.VITE_SUPABASE_URL!;
export const ANON_KEY = env.VITE_SUPABASE_ANON_KEY!;

if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(SUPABASE_URL)) {
  throw new Error("E2E tests must run against LOCAL Supabase only");
}

export async function login(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
}

export async function expectForbidden(page: Page) {
  await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึงหน้านี้" })).toBeVisible();
}

/** เข้าสู่ระบบผ่าน REST เพื่อทดสอบ RLS โดยตรง (ไม่ผ่าน UI) */
export async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    data: { email, password: SEED_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

export function rest(token?: string) {
  return {
    apikey: ANON_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
  };
}
