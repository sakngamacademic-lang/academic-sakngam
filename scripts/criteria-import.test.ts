// deno test --config supabase/functions/deno.json scripts/criteria-import.test.ts — ข้อความจำลองรูปแบบเดียวกับแบบประเมิน (ไม่ใช่เกณฑ์จริง)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { parseCriteriaText } from "../src/features/curriculum/categories/criteria-import.ts";

const SAMPLE = `หน้า ๑๒
ระดับ ๕
๑. ประเด็นตัวอย่าง ก
  มีรายละเอียดต่อบรรทัด
1.1 องค์ประกอบย่อย ก-1
1.2 องค์ประกอบย่อย ก-2
(1) เงื่อนไขย่อยของ 1.2
(2) เงื่อนไขย่อยที่สองของ 1.2
หน้า 13
ข้อ 2 ประเด็นตัวอย่าง ข
- รายการย่อยแบบขีด`;

Deno.test("แยกเกณฑ์หลัก/องค์ประกอบย่อย/เงื่อนไข พร้อมหน้าและระดับ (เลขไทยได้)", () => {
  const r = parseCriteriaText(SAMPLE);
  assertEquals(r.items.map((x) => [x.code, x.parentCode, x.page]), [
    ["1", null, 12], ["1.1", "1", 12], ["1.2", "1", 12], ["1.2(1)", "1.2", 12], ["1.2(2)", "1.2", 12], ["2", null, 13], ["2(1)", "2", 13],
  ]);
  assertEquals(r.items[0]!.text, "ประเด็นตัวอย่าง ก มีรายละเอียดต่อบรรทัด");
  assert(r.items.every((x) => x.level === "5"));
  assertEquals(r.warnings, []);
});

Deno.test("คงข้อความต้นฉบับ ไม่แต่งเพิ่ม", () => {
  const r = parseCriteriaText("หน้า 3\n1. ผู้เรียนร้อยละ ๘๐ ผ่านเกณฑ์");
  assertEquals(r.items[0]!.text, "ผู้เรียนร้อยละ ๘๐ ผ่านเกณฑ์");
});

Deno.test("เตือนเมื่อไม่มีหน้า/รหัสซ้ำ/ไม่มีรายการแม่", () => {
  const r = parseCriteriaText("1. ก\n1. ข\n3.1 ค");
  assert(r.warnings.some((w) => w.includes("ซ้ำ")));
  assert(r.warnings.some((w) => w.includes("ไม่พบรายการแม่ 3")));
  assert(r.warnings.some((w) => w.includes("ไม่มีเลขหน้า")));
});

Deno.test("คำนำหน้ารหัส (เช่น ชุดเกณฑ์)", () => {
  assertEquals(parseCriteriaText("หน้า 1\n1.1 x", "K5-").items[0]!.code, "K5-1.1");
});
