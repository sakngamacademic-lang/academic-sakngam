import { defineConfig, devices } from "@playwright/test";

// Chromium ต้องใช้ locale UTF-8 จึงตั้งชื่อไฟล์ดาวน์โหลดภาษาไทยได้ (container บางตัวไม่มี LANG)
process.env.LANG ||= "C.UTF-8";

/**
 * E2E tests — ใช้ Supabase LOCAL + seed data เท่านั้น
 * ก่อนรัน: npm run db:start && npm run db:reset และมี .env.local (ดู README)
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
    locale: "th-TH",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 5173 --strictPort --host localhost",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Phase 1.6: S3 emulator (แทน R2) + Edge Functions บน Deno — local เท่านั้น
      command: "npm run storage:dev",
      url: "http://127.0.0.1:54330/functions/v1/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
