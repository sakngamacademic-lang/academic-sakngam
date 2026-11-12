import { execSync } from "node:child_process";
import { SUPABASE_URL } from "./helpers";

/** รีเซ็ตฐานข้อมูล LOCAL + seed ก่อนรันชุดทดสอบ เพื่อให้ผลทดสอบคงที่ (ข้ามได้ด้วย E2E_SKIP_DB_RESET=1) */
export default function globalSetup() {
  if (process.env.E2E_SKIP_DB_RESET === "1") return;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(SUPABASE_URL)) throw new Error("refusing to reset a non-local database");
  execSync("npx supabase db reset", { stdio: "ignore" });
}
