#!/usr/bin/env node
/**
 * Local storage stack สำหรับพัฒนา/ทดสอบ Phase 1.6 (ไม่ใช้ Cloud)
 * - s3rver : S3-compatible emulator แทน Cloudflare R2 (เก็บไฟล์)
 * - proxy  : ตรวจลายเซ็น SigV4 / expiry / private bucket (s3rver ไม่ตรวจ SigV4 เอง) — scripts/sigv4-verify.mjs
 *            bucket private ชื่อเดียวกับ production: sakngam-academic-documents
 * - Deno   : รัน Edge Functions ชุดเดียวกับที่ deploy (supabase/functions/_dev/serve.ts)
 * ต้องเปิด Supabase local ก่อน (npm run db:start)
 *
 *   npm run storage:dev
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import S3rver from "s3rver";
import { startPrivateProxy } from "./s3-private-proxy.mjs";

const BUCKET = "sakngam-academic-documents";
const S3_PORT = Number(process.env.S3_PORT ?? 54340);
const FN_PORT = Number(process.env.FUNCTIONS_PORT ?? 54330);

// ค่า local ของ Supabase CLI (ไม่ใช่ความลับของ production) → ไฟล์ env ที่ถูก gitignore
const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
const envFile = "supabase/functions/.env.local";
writeFileSync(
  envFile,
  [
    `SUPABASE_URL=${status.API_URL}`,
    `SUPABASE_ANON_KEY=${status.ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}`,
    "STORAGE_PROVIDER=s3",
    `S3_ENDPOINT=http://127.0.0.1:${S3_PORT}`,
    `S3_BUCKET=${BUCKET}`,
    "S3_REGION=us-east-1",
    "S3_ACCESS_KEY_ID=S3RVER",
    "S3_SECRET_ACCESS_KEY=S3RVER",
    "STORAGE_CRON_SECRET=local-cron-secret",
    "ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173",
    `FUNCTIONS_PORT=${FN_PORT}`,
    "",
  ].join("\n"),
);

const cors = `<CORSConfiguration><CORSRule>
  <AllowedOrigin>http://localhost:5173</AllowedOrigin><AllowedOrigin>http://127.0.0.1:5173</AllowedOrigin>
  <AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod>
  <AllowedHeader>content-type</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>300</MaxAgeSeconds>
</CORSRule></CORSConfiguration>`;
const dir = join(tmpdir(), "sakngam-s3rver");
mkdirSync(dir, { recursive: true });
await new S3rver({
  port: S3_PORT + 1, // เข้าถึงผ่าน proxy เท่านั้น
  address: "127.0.0.1",
  silent: true,
  directory: dir,
  configureBuckets: [{ name: BUCKET, configs: [cors] }],
}).run();
await startPrivateProxy({ listenPort: S3_PORT, targetPort: S3_PORT + 1, credentials: { S3RVER: "S3RVER" } });
console.log(`storage : http://127.0.0.1:${S3_PORT}/${BUCKET} (private, ตรวจ SigV4)`);

const deno = spawn(
  "npx",
  ["deno", "run", "--allow-net", "--allow-env", `--env-file=${envFile}`, "supabase/functions/_dev/serve.ts"],
  { stdio: "inherit" },
);
console.log(`functions: http://127.0.0.1:${FN_PORT}/functions/v1/<name>`);
const stop = () => {
  deno.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
