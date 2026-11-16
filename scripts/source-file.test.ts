// deno test scripts/source-file.test.ts — ตัวช่วยปุ่ม "เปิด PDF / ดาวน์โหลด" ในทะเบียนเอกสารต้นทาง
import { assertEquals } from "jsr:@std/assert@1";
import { fileErrorMessage, isPdfName, parsePdfPage, pdfPageUrl } from "../src/features/curriculum/source-file.ts";

const signed = "https://acct.r2.cloudflarestorage.com/sakngam-academic-documents/a.pdf?X-Amz-Expires=300&X-Amz-Signature=abc";

Deno.test("เลขหน้า: ว่าง = 1, ตรวจช่วงตาม page_count", () => {
  assertEquals(parsePdfPage("", 10), { page: 1 });
  assertEquals(parsePdfPage(" 7 ", 10), { page: 7 });
  assertEquals(parsePdfPage("11", 10), { error: "เอกสารนี้มี 10 หน้า" });
  assertEquals(parsePdfPage("250", null), { page: 250 });
  assertEquals("error" in parsePdfPage("0", 10), true);
  assertEquals("error" in parsePdfPage("2.5", 10), true);
  assertEquals("error" in parsePdfPage("abc", 10), true);
});

Deno.test("URL เปิดหน้า: ต่อ #page=N โดยไม่แก้ query ที่ลงนาม", () => {
  assertEquals(pdfPageUrl(signed, 1), signed);
  assertEquals(pdfPageUrl(signed, 42), `${signed}#page=42`);
  assertEquals(pdfPageUrl(`${signed}#page=3`, 5), `${signed}#page=5`);
  assertEquals(new URL(pdfPageUrl(signed, 42)).search, new URL(signed).search);
});

Deno.test("ชนิดไฟล์และข้อความผิดพลาดที่เข้าใจง่าย", () => {
  assertEquals(isPdfName("หลักสูตร.PDF"), true);
  assertEquals(isPdfName("โครงสร้าง.xlsx"), false);
  assertEquals(fileErrorMessage(new Error("ไม่พบไฟล์ หรือคุณไม่มีสิทธิ์เข้าถึงไฟล์นี้")).startsWith("คุณไม่มีสิทธิ์"), true);
  assertEquals(fileErrorMessage(new Error("ไฟล์นี้ยังไม่พร้อมให้ดาวน์โหลด")).startsWith("ไฟล์ยังอัปโหลด"), true);
  assertEquals(fileErrorMessage(new Error("popup blocked")).includes("Pop-up"), true);
  assertEquals(fileErrorMessage(null), "เปิดเอกสารไม่สำเร็จ กรุณาลองใหม่");
});
