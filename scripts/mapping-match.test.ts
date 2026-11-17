// ทดสอบตัวเปรียบเทียบ Mapping ด้วยข้อมูลจำลอง (ไม่แตะฐานข้อมูล) — รัน: npx --no-install deno test scripts/mapping-match.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { compareMapping, findCodes, finalResult, gradeMatches, normCode, schoolGrade, type RefIndicator, type SchoolSubject } from "../src/features/mapping/match.ts";

const ind = (code: string, statement: string): RefIndicator => {
  const m = /^(\S+ \d+\.\d+) (ม\.[\d-]+)\/\d+$/.exec(code)!;
  return { key: normCode(code), id: null, code, standardCode: m[1]!, standardText: null, statement, grade: m[2]!, areaCode: code[0]!, locator: "pdf:100", sourceDocId: "src02", flags: [] };
};
// ข้อความรูปแบบเดียวกับที่ระบบอ่านจาก PDF (มีช่องว่างแทรกกลางวลี) — ข้อมูลจำลองสำหรับทดสอบเท่านั้น
const REF = [
  ind("ส 5.1 ม.2/1", "วิเคราะห์ลักษณะ ทางกายภาพของทวีปยุโรป และทวีปแอฟริกาโดยใช้ เครื่องมือทางภูมิศาสตร์ สืบค้นข้อมูล"),
  ind("ส 5.1 ม.2/2", "อธิบายมาตราส่วน ทิศ และสัญลักษณ์"),
  ind("ส 5.1 ม.2/3", "วิเคราะห์สาเหตุการเกิด ภัยพิบัติและผลกระทบ ในทวีปยุโรปและทวีปแอฟริกา"),
  ind("ส 5.2 ม.2/1", "สำรวจและระบุทำเลที่ตั้ง ของกิจกรรมทางเศรษฐกิจ และสังคมในทวีปยุโรป และทวีปแอฟริกา"),
  ind("ส 5.1 ม.3/1", "วิเคราะห์ลักษณะทางกายภาพของทวีปอเมริกาเหนือและอเมริกาใต้"),
];
const subject = (over: Partial<SchoolSubject> & { text?: string; declared?: string[] }): SchoolSubject => ({
  id: over.id ?? "s1", code: "ส22103", name: "สังคมศึกษา 4", grade: "ม.2", areaCode: "ส", hasUnits: over.hasUnits ?? false, locator: "pdf:171", sourceDocId: "doc",
  units: over.units ?? [{ id: `desc:${over.id ?? "s1"}`, kind: "description", title: "คำอธิบายรายวิชา", declared: over.declared ?? [], locator: "pdf:171", sourceDocId: "doc",
    parts: over.text === undefined ? [] : [{ field: "description", label: "คำอธิบายรายวิชา", text: over.text }] }],
});
const DESC = `ศึกษาการใช้เครื่องมือทางภูมิศาสตร์ในการรวบรวม วิเคราะห์และนำเสนอข้อมูลเกี่ยวกับลักษณะ
ทางกายภาพของทวีปยุโรปและแอฟริกา ระบุแนวทางการอนุรักษ์ทรัพยากรธรรมชาติและสิ่งแวดล้อม`;

Deno.test("ปรับรหัส/ระดับชั้น", () => {
  assertEquals(normCode("ส ๕.๑ ม.๒/๑"), "ส5.1ม.2/1");
  assertEquals(findCodes("… ส ๕.๑ ม.๒/๑, ส 5.2 ม.2/3 และ ส 1.1 ม.4-6/2"), ["ส5.1ม.2/1", "ส5.2ม.2/3", "ส1.1ม.4-6/2"]);
  assertEquals(schoolGrade("M2"), "ม.2");
  assertEquals(gradeMatches("ม.5", "ม.4-6"), true);
  assertEquals(gradeMatches("ม.2", "ม.3"), false);
});

Deno.test("กรณีรหัสตรง + เนื้อหาสอดคล้อง → ระดับ 1 แต่ยังไม่ยืนยัน = ต้องตรวจเพิ่มเติม (ไม่ผ่านอัตโนมัติ)", () => {
  const r = compareMapping({ subjects: [subject({ text: DESC, declared: ["ส5.1ม.2/1"] })], indicators: REF, decisions: [] });
  const p = r.pairs.find((x) => x.indicatorKey === "ส5.1ม.2/1")!;
  assertEquals(p.proposed, "covered");
  assertEquals(p.level, 1);
  assertEquals(p.result, "needs_review");
  assertEquals(p.verification, "unverified");
  assert(p.schoolSnippet?.includes("เครื่องมือทางภูมิศาสตร์"));
});

Deno.test("ยืนยันแล้วเท่านั้นจึงเป็น ครอบคลุม · ปฏิเสธ = ไม่พบ", () => {
  assertEquals(finalResult("covered", "verified"), "covered");
  assertEquals(finalResult("needs_review", "rejected"), "not_found");
  const r = compareMapping({ subjects: [subject({ text: DESC, declared: ["ส5.1ม.2/1"] })], indicators: REF,
    decisions: [{ subjectId: "s1", indicatorKey: "ส5.1ม.2/1", status: "verified", note: "ตรวจกับ PDF แล้ว", mappingId: "m1", at: null }] });
  assertEquals(r.indicatorRows.find((x) => x.indicator.key === "ส5.1ม.2/1")!.result, "covered");
  assertEquals(r.counts.covered, 1);
});

Deno.test("ชื่อหน่วยต่างกันแต่มีหลักฐานเนื้อหา → ระดับ 2/3 เป็นข้อเสนอที่ต้องตรวจ", () => {
  const s = subject({ hasUnits: true, units: [{ id: "u1", kind: "unit", title: "โลกกว้างของเรา", declared: [], locator: null, sourceDocId: null,
    parts: [{ field: "essence", label: "สาระสำคัญ", text: "ใช้เครื่องมือทางภูมิศาสตร์ เช่น แผนที่ วิเคราะห์ลักษณะทางกายภาพของทวีปยุโรปและทวีปแอฟริกา" }] }] });
  const r = compareMapping({ subjects: [s], indicators: REF, decisions: [] });
  const p = r.pairs.find((x) => x.indicatorKey === "ส5.1ม.2/1")!;
  assertEquals(p.origin, "suggested");
  assertEquals(p.result, "needs_review");
  assert(p.level === 2 || p.level === 3);
});

Deno.test("ความคล้ายจากชื่อทวีปอย่างเดียวไม่ถูกเสนอ (น้ำหนัก IDF)", () => {
  const r = compareMapping({ subjects: [subject({ text: "ศึกษาประวัติศาสตร์ทวีปยุโรปและทวีปแอฟริกา" })], indicators: REF, decisions: [] });
  assertEquals(r.pairs.length, 0);
  assertEquals(r.indicatorRows.find((x) => x.indicator.key === "ส5.1ม.2/3")!.result, "not_found");
});

Deno.test("ไม่มีหน่วย/คำอธิบาย → ข้อมูลไม่เพียงพอ (ไม่สร้างผล)", () => {
  const r = compareMapping({ subjects: [subject({})], indicators: REF, decisions: [] });
  assertEquals(r.pairs.length, 0);
  assert(r.indicatorRows.filter((x) => x.indicator.grade === "ม.2").every((x) => x.result === "insufficient"));
});

Deno.test("รหัสตรงแต่ข้อความต่าง (อาจคนละฉบับ) → ต้องตรวจเพิ่มเติม พร้อมเหตุผล", () => {
  const r = compareMapping({ subjects: [subject({ text: "อ่านแผนที่เพื่อหาเส้นทางในชุมชน", declared: ["ส5.1ม.2/3"] })], indicators: REF, decisions: [] });
  const p = r.pairs.find((x) => x.indicatorKey === "ส5.1ม.2/3")!;
  assertEquals(p.result, "needs_review");
  assert(p.reasons.some((x) => x.includes("คนละฉบับ")));
});

Deno.test("ระบุรหัสคนละชั้น → ต้องตรวจเพิ่มเติม · รหัสที่ไม่มีในฐานอ้างอิงถูกรายงาน", () => {
  const r = compareMapping({ subjects: [subject({ text: DESC, declared: ["ส5.1ม.3/1", "ส9.9ม.2/1"] })], indicators: REF, decisions: [] });
  const p = r.pairs.find((x) => x.indicatorKey === "ส5.1ม.3/1")!;
  assertEquals(p.result, "needs_review");
  assert(p.reasons.some((x) => x.includes("ระดับชั้นไม่ตรง")));
  assertEquals(r.unknownCodes.map((x) => x.code), ["ส9.9ม.2/1"]);
});

Deno.test("รายวิชาซ้ำ 2 รายการรองรับตัวชี้วัดเดียวกัน → มุมมอง B รวมเป็นแถวเดียว เรียงผลดีที่สุดก่อน", () => {
  const r = compareMapping({ subjects: [subject({ id: "a", text: DESC, declared: ["ส5.1ม.2/1"] }), subject({ id: "b", text: DESC })], indicators: REF, decisions: [] });
  const row = r.indicatorRows.find((x) => x.indicator.key === "ส5.1ม.2/1")!;
  assertEquals(row.pairs.length, 2);
  assertEquals(row.best!.subjectId, "a");
  assertEquals(r.indicatorRows.length, REF.length);
});
