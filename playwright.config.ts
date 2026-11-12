import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests — ใช้ Supabase LOCAL + seed data เท่านั้น
 * ก่อนรัน: npm run db:start && npm run db:reset และมี .env.local (ดู README)
 */
export default defineConfig({
  testDir: "./e2e",
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
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort --host localhost",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
