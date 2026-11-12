import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiToken, rest, signIn, SUPABASE_URL } from "./helpers";

/**
 * Phase 1.6 — Secure Document Storage
 * ทดสอบผ่าน Edge Functions จริง (Deno) + S3 emulator ที่ตรวจลายเซ็น SigV4 (แทน R2 ใน local)
 */
const FN = "http://127.0.0.1:54330/functions/v1";
const PDF = Buffer.from("%PDF-1.4\n%ทดสอบ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const FAKE_PDF = Buffer.concat([Buffer.from("MZ\x90\x00"), Buffer.alloc(60, 1)]); // ไฟล์ .exe ที่ตั้งชื่อเป็น .pdf
const DOCX = Buffer.from("PK\x03\x04....[Content_Types].xml....word/document.xml....");
const MACRO_DOCX = Buffer.from("PK\x03\x04....[Content_Types].xml....word/document.xml....word/vbaProject.bin");
const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function fn(request: APIRequestContext, name: string, body: unknown, token?: string) {
  const res = await request.post(`${FN}/${name}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, data: body });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

/** อัปโหลดครบ 3 ขั้น (ขอ URL → PUT → ยืนยัน) */
async function upload(request: APIRequestContext, token: string, name: string, bytes: Buffer, mime: string, extra: Record<string, unknown> = {}) {
  const begin = await fn(request, "storage-upload-url", { title: `ทดสอบ ${name}`, category: "general", fileName: name, mimeType: mime, size: bytes.length, ...extra }, token);
  expect(begin.status, JSON.stringify(begin.body)).toBe(200);
  const put = await request.put(begin.body.uploadUrl, { headers: { "Content-Type": mime }, data: bytes });
  expect(put.status()).toBe(200);
  const confirm = await fn(request, "storage-confirm-upload", { fileId: begin.body.fileId }, token);
  return { begin: begin.body, confirm };
}

const psql = (sql: string) =>
  execFileSync("docker", ["exec", "supabase_db_academic-sakngam", "psql", "-U", "postgres", "-tAc", sql], { encoding: "utf8" }).trim();

test.describe.serial("Storage — อัปโหลด / ดาวน์โหลด / สิทธิ์", () => {
  let t1: string; // teacher1 (คณิต, T003)
  let t2: string; // teacher2 (วิทย์, T004)
  let fileT1: string;
  let fileT2: string;

  test.beforeAll(async ({ request }) => {
    t1 = await apiToken(request, "teacher1@snw.test");
    t2 = await apiToken(request, "teacher2@snw.test");
  });

  test("อัปโหลด PDF → ยืนยัน (sha256) → ดาวน์โหลดได้ไฟล์เดิม ผ่าน presigned URL 5 นาที", async ({ request }) => {
    const { begin, confirm } = await upload(request, t1, "แผนการสอน ม.1.pdf", PDF, MIME.pdf);
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({ status: "ready", size: PDF.length });
    expect(confirm.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(begin.expiresInSeconds).toBe(300);
    expect(begin).not.toHaveProperty("objectKey");
    const u = new URL(begin.uploadUrl);
    expect(u.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    // object key สร้างโดยระบบ ไม่มีชื่อไฟล์ของผู้ใช้
    expect(decodeURIComponent(u.pathname)).toMatch(/^\/sakngam-academic-documents\/schools\/[0-9a-f-]{36}\/documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/);
    fileT1 = begin.fileId;

    const dl = await fn(request, "storage-download-url", { fileId: fileT1 }, t1);
    expect(dl.status).toBe(200);
    expect(new URL(dl.body.url).searchParams.get("X-Amz-Expires")).toBe("300");
    const get = await request.get(dl.body.url);
    expect(get.status()).toBe(200);
    expect(Buffer.from(await get.body()).equals(PDF)).toBeTruthy();
    expect(get.headers()["content-disposition"]).toContain("filename*=UTF-8''");

    // เวอร์ชันใหม่ของเอกสารเดิม ไม่ทับฉบับแรก
    const v2 = await upload(request, t1, "แผนการสอน ม.1 (แก้ไข).pdf", PDF, MIME.pdf, { documentId: begin.documentId });
    expect(v2.begin.version).toBe(2);
    expect(v2.confirm.status).toBe(200);

    const docx = await upload(request, t2, "บันทึกหลังสอน.docx", DOCX, MIME.docx);
    expect(docx.confirm.status).toBe(200);
    fileT2 = docx.begin.fileId;
  });

  test("สิทธิ์ดาวน์โหลด: ครูอื่น / ผู้บริหาร / ผู้ดูแลระบบ ไม่ได้ · ฝ่ายวิชาการและหัวหน้ากลุ่มสาระ (scope) ได้", async ({ request }) => {
    const dl = async (email: string, fileId: string) => (await fn(request, "storage-download-url", { fileId }, await apiToken(request, email))).status;
    expect((await fn(request, "storage-download-url", { fileId: fileT1 }, t2)).status).toBe(403);
    expect(await dl("exec@snw.test", fileT1)).toBe(403);
    expect(await dl("admin@snw.test", fileT1)).toBe(403);
    expect(await dl("admin@other.test", fileT1)).toBe(403);
    expect(await dl("staff@snw.test", fileT1)).toBe(200);
    expect(await dl("head@snw.test", fileT2)).toBe(200);
    expect(await dl("areahead@snw.test", fileT1)).toBe(200); // ครูคณิต
    expect(await dl("areahead@snw.test", fileT2)).toBe(403); // ครูวิทย์ นอก scope

    // metadata ผ่าน Data API ก็ถูกจำกัดด้วย RLS
    const rows = await request.get(`${SUPABASE_URL}/rest/v1/files?select=id`, { headers: rest(t2) });
    expect((await rows.json()).map((r: { id: string }) => r.id)).not.toContain(fileT1);
    expect(psql(`select count(*) from public.file_events where event = 'download_url_issued' and file_id = '${fileT1}'`)).toBe("3"); // teacher1 + staff + areahead
  });

  test("ไม่มี token / token ปลอม → 401 ทุก function", async ({ request }) => {
    for (const name of ["storage-upload-url", "storage-confirm-upload", "storage-download-url", "storage-delete"]) {
      expect((await fn(request, name, { fileId: fileT1 })).status).toBe(401);
      expect((await fn(request, name, { fileId: fileT1 }, "not-a-jwt")).status).toBe(401);
    }
  });

  test("Bucket เป็น private และลายเซ็น presigned URL ถูกบังคับ", async ({ request }) => {
    const dl = (await fn(request, "storage-download-url", { fileId: fileT1 }, t1)).body.url as string;
    const u = new URL(dl);
    expect((await request.get(`${u.origin}${u.pathname}`)).status()).toBe(403); // ไม่มีลายเซ็น
    u.searchParams.set("X-Amz-Signature", "0".repeat(64));
    expect((await request.get(u.toString())).status()).toBe(403); // ลายเซ็นปลอม
    const other = new URL(dl);
    other.pathname = other.pathname.replace(/[0-9a-f-]{36}\.pdf$/, "00000000-0000-4000-a000-000000000000.pdf");
    expect((await request.get(other.toString())).status()).toBe(403); // ใช้ URL เดิมกับ object อื่นไม่ได้

    const begin = await fn(request, "storage-upload-url", { title: "x", fileName: "x.pdf", mimeType: MIME.pdf, size: PDF.length }, t1);
    // ส่ง Content-Type / ขนาดไม่ตรงกับที่ลงนามไว้ → ถูกปฏิเสธ
    expect((await request.put(begin.body.uploadUrl, { headers: { "Content-Type": "text/html" }, data: PDF })).status()).toBe(403);
    expect((await request.put(begin.body.uploadUrl, { headers: { "Content-Type": MIME.pdf }, data: Buffer.concat([PDF, PDF]) })).status()).toBe(403);
    // ยืนยันก่อนอัปโหลดจริง → 409
    expect((await fn(request, "storage-confirm-upload", { fileId: begin.body.fileId }, t1)).status).toBe(409);
  });

  test("ตรวจชนิดและขนาด: นามสกุล / MIME / magic bytes / macro / ชื่อไฟล์", async ({ request }) => {
    const ask = (fileName: string, mimeType: string, size: number) =>
      fn(request, "storage-upload-url", { title: "x", fileName, mimeType, size }, t1);
    expect((await ask("setup.exe", "application/octet-stream", 10)).status).toBe(400);
    expect((await ask("a.pdf", MIME.docx, 10)).status).toBe(400);
    expect((await ask("big.pdf", MIME.pdf, 25 * 1024 * 1024)).status).toBe(400);
    expect((await ask("../../etc/passwd.pdf", MIME.pdf, 10)).status).toBe(400);

    const fake = await upload(request, t1, "รายงาน.pdf", FAKE_PDF, MIME.pdf);
    expect(fake.confirm.status).toBe(422);
    expect(fake.confirm.body.error).toContain("ไม่ผ่านการตรวจสอบ");
    expect(psql(`select status from public.files where id = '${fake.begin.fileId}'`)).toBe("rejected");
    expect((await fn(request, "storage-download-url", { fileId: fake.begin.fileId }, t1)).status).toBe(400);

    const macro = await upload(request, t1, "มาโคร.docx", MACRO_DOCX, MIME.docx);
    expect(macro.confirm.status).toBe(422);
    expect(macro.confirm.body.error).toContain("Macro");

    const mismatch = await upload(request, t1, "จริงๆเป็นpdf.docx", PDF, MIME.docx);
    expect(mismatch.confirm.status).toBe(422);
  });

  test("ลบตามสิทธิ์ และหลักฐานที่ตรวจรับแล้วลบไม่ได้", async ({ request }) => {
    const staff = await apiToken(request, "staff@snw.test");
    const head = await apiToken(request, "head@snw.test");
    expect((await fn(request, "storage-delete", { fileId: fileT1 }, t2)).status).toBe(403); // ครูคนอื่น
    expect((await fn(request, "storage-delete", { fileId: fileT1 }, staff)).status).toBe(403); // เจ้าหน้าที่

    const lock = await request.post(`${SUPABASE_URL}/rest/v1/rpc/storage_lock_file`, { headers: rest(staff), data: { p_file_id: fileT1 } });
    expect(lock.ok()).toBeTruthy();
    const lockByTeacher = await request.post(`${SUPABASE_URL}/rest/v1/rpc/storage_lock_file`, { headers: rest(t2), data: { p_file_id: fileT2 } });
    expect(lockByTeacher.ok()).toBeFalsy();
    for (const tok of [t1, head]) {
      const r = await fn(request, "storage-delete", { fileId: fileT1 }, tok);
      expect(r.status).toBe(403);
      expect(r.body.error).toContain("หลักฐาน");
    }

    const del = await fn(request, "storage-delete", { fileId: fileT2 }, t2);
    expect(del.status).toBe(200);
    expect(psql(`select status from public.files where id = '${fileT2}'`)).toBe("deleted");
    expect((await fn(request, "storage-download-url", { fileId: fileT2 }, head)).status).toBe(400);
  });

  test("ไฟล์ที่อัปโหลดไม่สำเร็จ: ตรวจพบและล้างโดยงานของระบบเท่านั้น", async ({ request }) => {
    const begin = await fn(request, "storage-upload-url", { title: "ค้าง", fileName: "ค้าง.pdf", mimeType: MIME.pdf, size: PDF.length }, t2);
    await request.put(begin.body.uploadUrl, { headers: { "Content-Type": MIME.pdf }, data: PDF }); // อัปโหลดแต่ไม่ยืนยัน
    psql(`update public.files set upload_expires_at = now() - interval '1 hour' where id = '${begin.body.fileId}'`);

    expect((await fn(request, "storage-cleanup", {})).status).toBe(403);
    expect((await fn(request, "storage-cleanup", {}, t2)).status).toBe(403);
    const run = await fn(request, "storage-cleanup", {}, "local-cron-secret");
    expect(run.status).toBe(200);
    expect(run.body.expired).toBeGreaterThanOrEqual(1);
    expect(run.body.objectsRemoved).toBeGreaterThanOrEqual(1);
    expect(psql(`select status from public.files where id = '${begin.body.fileId}'`)).toBe("expired");
    expect((await fn(request, "storage-confirm-upload", { fileId: begin.body.fileId }, t2)).status).toBe(404);
  });
});

test.describe("Storage — หน้าจอ", () => {
  test("ครูอัปโหลดผ่านหน้าคลังเอกสาร และเจ้าหน้าที่วิชาการดาวน์โหลดได้", async ({ page }) => {
    await signIn(page, "teacher1@snw.test");
    await page.goto("/teacher/documents");
    await page.getByLabel("ชื่อเอกสาร").fill("วิจัยในชั้นเรียน (UI)");
    await page.getByLabel("ไฟล์").setInputFiles({ name: "วิจัย.pdf", mimeType: MIME.pdf, buffer: PDF });
    await page.getByRole("button", { name: "อัปโหลด" }).click();
    const doc = page.getByTestId("document").filter({ hasText: "วิจัยในชั้นเรียน (UI)" });
    await expect(doc.getByText("พร้อมใช้งาน")).toBeVisible();

    await page.getByLabel("ไฟล์").setInputFiles({ name: "virus.exe", mimeType: "application/octet-stream", buffer: FAKE_PDF });
    await page.getByLabel("ชื่อเอกสาร").fill("ไม่ควรผ่าน");
    await page.getByRole("button", { name: "อัปโหลด" }).click();
    await expect(page.getByRole("alert")).toContainText("รองรับเฉพาะไฟล์ PDF");

    await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
    await signIn(page, "staff@snw.test");
    await page.goto("/office/documents");
    const row = page.getByTestId("document").filter({ hasText: "วิจัยในชั้นเรียน (UI)" });
    await expect(row).toContainText("นางสาวตัวอย่าง ก (T003)");
    const download = page.waitForEvent("download");
    await row.getByRole("button", { name: /ดาวน์โหลด/ }).click();
    expect((await download).suggestedFilename()).toBe("วิจัย.pdf");
    await expect(row.getByRole("button", { name: /ลบ/ })).toHaveCount(0); // เจ้าหน้าที่ลบไม่ได้
  });
});
