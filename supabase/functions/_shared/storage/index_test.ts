import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { createStorageProvider, DEFAULT_BUCKET, r2Endpoint } from "./index.ts";

const ACCT = "0123456789abcdef0123456789abcdef";

async function presignedPut(accountId: string) {
  const env: Record<string, string> = {
    STORAGE_PROVIDER: "r2",
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
  };
  const p = createStorageProvider((k) => env[k]);
  return new URL(await p.presignPut("curriculum/2569/a.pdf", { contentType: "application/pdf", contentLength: 10, expiresInSeconds: 300 }));
}

Deno.test("presigned URL ของ R2 ใช้ HTTPS และ hostname <account>.r2.cloudflarestorage.com (regression: https://https/...)", async () => {
  for (
    const input of [
      ACCT,
      ` ${ACCT} `,
      `https://${ACCT}.r2.cloudflarestorage.com`,
      `https://${ACCT}.r2.cloudflarestorage.com/`,
      `https://${ACCT}.r2.cloudflarestorage.com/${DEFAULT_BUCKET}`,
      `${ACCT}.r2.cloudflarestorage.com`,
    ]
  ) {
    const u = await presignedPut(input);
    assertEquals(u.protocol, "https:", input);
    assertEquals(u.hostname, `${ACCT}.r2.cloudflarestorage.com`, input);
    assertEquals(u.pathname, `/${DEFAULT_BUCKET}/curriculum/2569/a.pdf`, input);
    assertEquals(u.searchParams.get("X-Amz-SignedHeaders"), "content-length;content-type;host");
  }
});

Deno.test("R2_ACCOUNT_ID ผิดรูปแบบ → error ชัดเจน ไม่สร้าง URL ผิด", () => {
  for (const bad of ["", "https://", "https:///x", "bad id", "a_b"]) {
    assertThrows(() => r2Endpoint(bad), Error, "R2_ACCOUNT_ID", JSON.stringify(bad));
  }
});
