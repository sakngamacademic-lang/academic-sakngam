import { assertEquals } from "jsr:@std/assert@1";
import { consolidate } from "../src/features/curriculum-v2/consolidate.ts";
import { compareCurricula, similarity } from "../src/features/curriculum-v2/compare.ts";
import { gradeFromCode, planKey, type ParsedSource, type V2Row } from "../src/features/curriculum-v2/model.ts";
import { parsePdfPages, topLevel, type PdfItem } from "../src/features/curriculum-v2/parsers.ts";

// ข้อมูลสังเคราะห์ทั้งหมด (ไม่ใช่ข้อมูลหลักสูตรจริง)
const row = (o: Partial<V2Row>): V2Row => ({ grade: "M1", plan: "แผน ก", room: null, term: 1, section: "basic", code: "ท21101", codeRaw: "ท21101", name: "ภาษาไทย 1", credits: 1.5, hours: 60, raw: "1.5(60)", ref: { file: "x.xlsx", sheet: "s", cell: "B6" }, ...o });
const src = (rows: V2Row[], extra: Partial<ParsedSource> = {}): ParsedSource => ({ kind: "xlsx", fileName: "x.xlsx", sha256: "a", rows, activities: [], declared: [], descriptions: [], notes: [], ...extra });

Deno.test("consolidate: identical duplicate tables merge refs; conflicting duplicates flagged; ambiguity not guessed", () => {
  const c = consolidate(src([
    row({}), row({ ref: { file: "x.xlsx", sheet: "copy", cell: "B6" } }),
    row({ code: "ค21101", codeRaw: "ค21101", name: "คณิต 1", credits: 1, hours: 20, raw: "1.0(20)" }),
    row({ code: "ค21101", codeRaw: "ค21101", name: "คณิต 1", credits: 1.5, hours: 60, raw: "1.5(60)" }),
    row({ grade: null, code: "ว21101", codeRaw: "ว21101" }),
    row({ code: "ว31262", codeRaw: "ว3126๒" }),
  ], { declared: [{ grade: "M1", plan: "แผน ก", term: 1, total: 999, basic: null, additional: null, activities: 60, ref: { file: "x.xlsx", sheet: "s", cell: "D31" } }] }));
  assertEquals(c.rows[0]!.refs.length, 2);
  const kinds = c.issues.map((i) => i.kind).sort();
  for (const k of ["ambiguous", "credit_hours", "duplicate", "grade_mismatch", "thai_digit", "total_mismatch"]) assertEquals(kinds.includes(k), true, k);
});

Deno.test("model helpers", () => {
  assertEquals([gradeFromCode("ท21101"), gradeFromCode("ว32101"), gradeFromCode("ว20283")], ["M1", "M5", null]);
  assertEquals(planKey("แผนการเรียนศิลป์ ทั่วไป") === planKey("แผนศิลป์-ทั่วไป"), true);
  assertEquals(similarity("ภาษาไทย 1", "ภาษาไทย1"), 1);
});

Deno.test("compare: code/name/position matching; uncertain → review; totals", () => {
  const A = consolidate(src([
    row({}),
    row({ code: "ส21227", codeRaw: "ส21227", name: "การป้องกันทุจริต 1", section: "additional", credits: 0.5, hours: 20, raw: "0.5(20)" }),
    row({ code: "ง21261", codeRaw: "ง21261", name: "ขนมไทย 1", section: "additional", credits: 1, hours: 40, raw: "1.0(40)" }),
    row({ code: "ศ21201", codeRaw: "ศ21201", name: "วาดเส้น 1", section: "additional", credits: 0.5, hours: 20, raw: "0.5(20)" }),
    row({ code: "พ21102", codeRaw: "พ21102", name: "เทเบิลเทนนิส", term: 1, credits: 0.5, hours: 20, raw: "0.5(20)" }),
  ])).rows;
  const B = consolidate(src([
    row({ name: "ภาษาไทย1", hours: 40, credits: 1, raw: "1.0(40)" }),
    row({ code: "ส21221", codeRaw: "ส21221", name: "การป้องกันทุจริต 1", section: "additional", credits: 0.5, hours: 20, raw: "0.5(20)" }),
    row({ code: "ง21261", codeRaw: "ง21261", name: "การถนอมอาหาร 1", section: "additional", credits: 1, hours: 40, raw: "1.0(40)" }),
    row({ code: "จ21201", codeRaw: "จ21201", name: "ทักษะภาษาจีน 1", section: "additional", credits: 0.5, hours: 20, raw: "0.5(20)" }),
    row({ code: "พ21102", codeRaw: "พ21102", name: "เทเบิลเทนนิส", term: 2, credits: 0.5, hours: 20, raw: "0.5(20)" }),
  ])).rows;
  const r = compareCurricula(A, B);
  const k = (kind: string) => r.changes.filter((c) => c.kind === kind).map((c) => c.b?.code ?? c.a?.code);
  assertEquals(k("code_changed"), ["ส21221"]);
  assertEquals(k("review"), ["ง21261"]);           // รหัสเดิม ชื่อคนละเรื่อง → รอตรวจทาน ไม่สรุปเอง
  assertEquals(k("added"), ["จ21201"]);
  assertEquals(k("removed"), ["ศ21201"]);
  assertEquals(k("hours_changed"), ["ท21101"]);
  assertEquals(k("credits_changed"), ["ท21101"]);
  assertEquals(k("term_moved"), ["พ21102"]);
  assertEquals(k("renamed"), []);                  // ต่างแค่ช่องว่าง ไม่ถือว่าเปลี่ยนชื่อ
  const y = r.totals.find((t) => t.term === 0)!;
  assertEquals([y.a!.hours, y.b!.hours], [160, 140]);
});

Deno.test("docx: depth-aware top-level elements (nested tables)", () => {
  const xml = `<w:p><w:t>a</w:t></w:p><w:tbl><w:tr><w:tc><w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl><w:p><w:t>b</w:t></w:p>`;
  assertEquals(topLevel(xml, ["tbl", "p"]).map((e) => e.tag), ["p", "tbl", "p"]);
});

Deno.test("pdf: two-term table with split code items and offset credit baseline", () => {
  const L = (y: number, items: [string, number][]): PdfItem[] => items.map(([str, x]) => ({ str, x, y, w: str.length * 5 }));
  const items = [
    ...L(760, [["โครงสร้างหลักสูตรชั้นปี", 250]]), ...L(740, [["ชั้นมัธยมศึกษาปีที่", 220], ["4", 300], ["แผนวิทย์-คณิต", 320]]),
    ...L(720, [["ภาคเรียนที่", 160], ["1", 205], ["ภาคเรียนที่", 416], ["2", 460]]),
    ...L(676, [["รายวิชาพื้นฐาน", 58], ["รายวิชาพื้นฐาน", 321]]), ...L(679, [["7.5(300)", 275], ["7(280)", 527]]),
    ...L(656, [["ท", 72], ["31101", 78], ["ภาษาไทย1", 116], ["1.0(40)", 285], ["ท", 337], ["31102", 342], ["ภาษาไทย2", 384], ["1.0(40)", 533]]),
    ...L(600, [["รวมเวลาเรียนทั้งสิ้น", 58], ["700", 280], ["รวมเวลาเรียนทั้งสิ้น", 321], ["680", 530]]),
  ];
  const s = parsePdfPages([{ page: 17, items }], "x.pdf", "h");
  assertEquals(s.rows.map((r) => [r.code, r.term, r.section, r.grade, r.plan, r.credits, r.hours, r.ref.page]), [
    ["ท31101", 1, "basic", "M4", "แผนวิทย์-คณิต", 1, 40, 17], ["ท31102", 2, "basic", "M4", "แผนวิทย์-คณิต", 1, 40, 17]]);
  assertEquals(s.declared.map((d) => [d.term, d.total, d.basic]), [[1, 700, "7.5(300)"], [2, 680, "7(280)"]]);
});
