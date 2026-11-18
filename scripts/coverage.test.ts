// deno test --config supabase/functions/deno.json --unstable-sloppy-imports scripts/coverage.test.ts — ข้อมูลจำลอง
import { assertEquals } from "jsr:@std/assert@1";
import { compareMapping, normCode, type RefIndicator, type SchoolSubject } from "../src/features/mapping/match.ts";
import { coverage } from "../src/features/mapping/coverage.ts";

const ind = (code: string, statement: string): RefIndicator => ({ key: normCode(code), id: null, code, standardCode: code.split(" ม")[0]!, standardText: null, statement, grade: code.match(/ม\.[\d-]+/)![0], areaCode: code[0]!, locator: "pdf:1", sourceDocId: "d", flags: [] });
const REF = [ind("ว 1.1 ม.1/1", "อธิบายระบบนิเวศ ความสัมพันธ์ของสิ่งมีชีวิตในระบบนิเวศ"), ind("ว 1.1 ม.1/2", "อธิบายการถ่ายทอดพลังงานในสายใยอาหาร"), ind("ว 1.1 ม.1/3", "วิเคราะห์ปัญหาสิ่งแวดล้อมในท้องถิ่น"), ind("ว 1.1 ม.1/4", "ออกแบบการทดลองเรื่องแรง")];
const subj = (desc: string, declared: string[] = []): SchoolSubject => ({ id: "s", code: "ว21101", name: "วิทยาศาสตร์ 1", grade: "ม.1", areaCode: "ว", hasUnits: false, locator: "pdf:9", sourceDocId: "d",
  units: [{ id: "desc:s", kind: "description", title: "", declared, locator: "pdf:9", sourceDocId: "d", parts: [{ field: "d", label: "คำอธิบาย", text: desc }] }] });

Deno.test("แยก ตรงกันตามรหัส / มีหลักฐานเนื้อหา / ยังไม่พบ · ตารางท้องถิ่นนับเป็นรหัส", () => {
  const out = compareMapping({ subjects: [subj("ศึกษาระบบนิเวศ ความสัมพันธ์ของสิ่งมีชีวิตในระบบนิเวศ การถ่ายทอดพลังงานในสายใยอาหาร", ["ว1.1ม.1/1"])], indicators: REF, decisions: [] });
  const c = coverage(REF, out, [{ key: "1-2", codeNorm: "ว1.1ม.1/3", table: "1", row: "2", localText: "ป่าชุมชน" }], false);
  const st = (k: string) => c.rows.find((r) => r.indicator.key === k)!.status;
  assertEquals(st("ว1.1ม.1/1"), "code");
  assertEquals(st("ว1.1ม.1/3"), "code");
  assertEquals(["content", "suggest"].includes(st("ว1.1ม.1/2")), true);
  assertEquals(st("ว1.1ม.1/4"), "none");
});
Deno.test("ร้อยละเฉพาะฐานที่ยืนยันว่าครบ", () => {
  const out = compareMapping({ subjects: [subj("ระบบนิเวศ", ["ว1.1ม.1/1"])], indicators: REF, decisions: [] });
  assertEquals(coverage(REF, out, [], false).cells[0]!.percent, null);
  assertEquals(coverage(REF, out, [], true).cells[0]!.percent, 25);
});
Deno.test("ปฏิเสธแล้วไม่นับ", () => {
  const out = compareMapping({ subjects: [subj("x", ["ว1.1ม.1/1"])], indicators: REF, decisions: [{ subjectId: "s", indicatorKey: "ว1.1ม.1/1", status: "rejected", note: "ไม่ใช่", mappingId: "m", at: null }] });
  assertEquals(coverage(REF, out, [], true).rows[0]!.status, "none");
});
