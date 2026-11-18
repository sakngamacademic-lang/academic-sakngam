// deno test --config supabase/functions/deno.json scripts/reference-qa.test.ts — ข้อมูลจำลอง
import { assert, assertEquals } from "jsr:@std/assert@1";
import { crossEdition, referenceQa } from "../src/features/mapping/reference-qa.ts";

const R = (code: string, statement = "x", locator = "pdf:1") => ({ code, standard: code.split(" ม")[0]!, grade: "", statement, locator });

Deno.test("ตรวจเลขขาดช่วง รหัสข้อความต่าง รูปแบบผิด", () => {
  const r = referenceQa([R("ค 1.1 ม.1/1"), R("ค 1.1 ม.1/2"), R("ค 1.1 ม.1/4"), R("ค 1.1 ม.1/1", "ข้อความอื่น", "pdf:9"), R("ค 1.1 ม.1")], ["ค 1.1", "ค 2.1"]);
  assert(r.issues.some((i) => i.kind === "gap" && i.detail.includes("ข้อ 3")));
  assert(r.issues.some((i) => i.kind === "variant" && i.locators.includes("pdf:9")));
  assert(r.issues.some((i) => i.kind === "bad_code"));
  assert(r.issues.some((i) => i.kind === "orphan_standard" && i.key === "ค2.1"));
  assertEquals(r.distinct, 3);
});
Deno.test("จำนวนน้อยผิดปกติรายชั้น = สัญญาณให้ตรวจ", () => {
  const rows = [1, 2, 3].flatMap((g) => Array.from({ length: 10 }, (_, i) => R(`ว 1.1 ม.${g}/${i + 1}`))).concat([R("ว 1.1 ม.4/1")]);
  const r = referenceQa(rows);
  assert(r.issues.some((i) => i.kind === "low_count" && i.key === "ว ม.4"));
  assertEquals(r.cells.find((c) => c.grade === "ม.4")?.indicators, 1);
});
Deno.test("รหัสจากเอกสารโรงเรียน: อยู่ในฐาน / ไม่อยู่ในฉบับนี้ / ฐานไม่ครอบคลุม", () => {
  const out = crossEdition(["ค 1.1\nม. 1/1", "ค 1.2 ม.1/1", "ท 1.1 ม.1/1", "ไม่ใช่รหัส"], new Set(["ค1.1ม.1/1"]), new Set(["ค1.1", "ค1.2"]));
  assertEquals([out.found.length, out.notInEdition.length, out.uncovered.length], [1, 1, 1]);
});
