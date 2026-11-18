import { assertEquals } from "jsr:@std/assert@1";
import type { XlsxSheet } from "../src/lib/xlsx-read.ts";
import { blockChecks, normSubjectCode, parseStructureWorkbook } from "../src/features/curriculum/structure-workbook.ts";
import { compareBlocks, roomProposals } from "../src/features/curriculum/structure-compare.ts";

/** ชีตสังเคราะห์ (ไม่ใช่ข้อมูลจริง) ตามรูปแบบบล็อก 4 คอลัมน์ */
function sheet(name: string, rows: Record<string, string>, merged: XlsxSheet["merged"] = []): XlsxSheet {
  return { name, cells: new Map(Object.entries(rows)), merged };
}
const S = sheet("11", {
  A1: "โครงสร้างหลักสูตรชั้นปี (แผน ก)", A2: "ชั้นมัธยมศึกษาปีที่  1/1", A3: "ภาคเรียนที่ 1",
  A5: "รายวิชาพื้นฐาน", D5: "2.5(100)",
  B6: "ท๒1101", C6: "ภาษาไทย 1", D6: "1.5(60)",
  B7: "ค21101", C7: "คณิตศาสตร์1", D7: "1.0(20)",
  A8: "รายวิชาเพิ่มเติม", D8: "0.5(20)",
  B9: "IS1", C9: "การศึกษาค้นคว้า", D9: "0.5(20)",
  A10: "กิจกรรมพัฒนาผู้เรียน", D10: "60", B11: "§ แนะแนว", D11: "20", B12: "§ ชุมนุม", D12: "40",
  A13: "รวมเวลาเรียนทั้งสิ้น", D13: "160",
}, [{ r1: 1, c1: 1, r2: 1, c2: 8 }]);

Deno.test("parse block: codes (Thai digits), credits/hours, sections, cell refs, room label", () => {
  const { blocks, skipped } = parseStructureWorkbook([S, sheet("คำนวณ", { A1: "x" })]);
  assertEquals(skipped, ["คำนวณ"]);
  assertEquals(blocks.length, 1);
  const b = blocks[0]!;
  assertEquals([b.grade, b.room, b.term, b.plan], ["M1", "1/1", 1, "แผน ก"]);
  assertEquals(b.subjects.map((s) => [s.code, s.section, s.credits, s.hours, s.cell]), [
    ["ท21101", "basic", 1.5, 60, "B6"], ["ค21101", "basic", 1, 20, "B7"], ["IS1", "additional", 0.5, 20, "B9"]]);
  assertEquals(b.activities.map((a) => a.name), ["แนะแนว", "ชุมนุม"]);
  assertEquals(normSubjectCode("ว3126๒"), "ว31262");
});

Deno.test("block checks: credit/hour mismatch, Thai digits, declared totals", () => {
  const t = blockChecks(parseStructureWorkbook([S]).blocks[0]!).map((n) => n.cell);
  // B7: ค21101 1.0(20) หน่วยกิตไม่สัมพันธ์ · B6: รหัสมีเลขไทย · D5: ยอดพื้นฐาน 2.5(100) ≠ 2.5(80) · รวม 160 ตรง (80+20+60)
  assertEquals(t.sort(), ["B6", "B7", "D5"].sort());
});

Deno.test("compare: best program by code overlap, diffs, room proposal only from file label", () => {
  const b = parseStructureWorkbook([S]).blocks;
  const o = (prog: string, code: string, name: string, credits: number, hours: number) =>
    ({ programId: prog, programCode: prog, programName: prog, grade: "M1", term: 1, code, name, credits, hours, kind: "core" });
  const reg = [o("A", "ท21101", "ภาษาไทย 1 (Thai 1)", 1.5, 60), o("A", "ค21101", "คณิตศาสตร์ 1", 1.5, 60), o("A", "ส21101", "สังคม", 1.5, 60), o("B", "ส21101", "สังคม", 1.5, 60)];
  const [c] = compareBlocks(b, reg);
  assertEquals(c!.programCode, "A");
  assertEquals(c!.diffs.map((d) => d.kind).sort(), ["credits", "extra_in_db", "hours", "missing_in_db", "name_minor", "total"].sort());
  const r = roomProposals([c!], [{ grade: "M1", room: 1 }]);
  assertEquals(r.map((x) => [x.room, x.programCode, x.existsInDb]), [["1/1", "A", true]]);
});
