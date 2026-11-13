import { assertEquals } from "jsr:@std/assert@1";
import { contentDisposition } from "./s3.ts";

Deno.test("Content-Disposition: ค่าเริ่มต้น attachment · inline เฉพาะเมื่อขอ (เปิด PDF ตรงหน้า)", () => {
  assertEquals(contentDisposition("a.pdf"), `attachment; filename="a.pdf"; filename*=UTF-8''a.pdf`);
  assertEquals(contentDisposition("a.pdf", true).startsWith("inline;"), true);
  assertEquals(contentDisposition("หลักสูตร.pdf").includes(`filename="document.pdf"`), true, "ชื่อไทยใช้ชื่อสำรอง ASCII");
});
