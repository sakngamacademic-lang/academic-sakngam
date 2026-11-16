// deno test — ตัววิเคราะห์เอกสารหลักสูตร (ข้อความทดสอบสังเคราะห์ ไม่ใช่ข้อมูลหลักสูตรจริง)
import ExcelJS from "npm:exceljs@4.4.0";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { analyzePdfPages, analyzeXlsxCells, classify } from "./curriculum-analyze.ts";
import { xlsxCells } from "./curriculum-parse.ts";

const corePages = [
  "หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551\n(ฉบับปรับปรุง พ.ศ. 2560)\nกระทรวงศึกษาธิการ",
  "ตัวชี้วัดและสาระการเรียนรู้แกนกลาง\nกลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี\nมาตรฐาน ว 1.1 เข้าใจความหลากหลาย\nของระบบนิเวศ\nม.1/1 อธิบายโครงสร้างเซลล์\nโดยใช้กล้องจุลทรรศน์\nม.1/2 เปรียบเทียบเซลล์พืชและสัตว์",
  "",
  "ว 1.1 ม.1/2 เปรียบเทียบเซลล์พืชและสัตว์\nว 1.1 ม.1/3\nมาตรฐาน ว 1.2 เข้าใจสมบัติของสิ่งมีชีวิต\nม.4-6/1 อธิบายการแบ่งเซลล์",
];

Deno.test("PDF หลายหน้า: จำแนกเป็นหลักสูตรแกนกลาง พร้อมหลักฐานและหน้า", () => {
  const r = analyzePdfPages(corePages);
  assertEquals(r.page_count, 4);
  // เอกสารแกนกลางที่มีตัวชี้วัดจำนวนมาก = core หรือ standards_indicators (บันทึกเข้ากรอบแกนกลางได้ทั้งสองแบบ)
  assert(["core_curriculum", "standards_indicators"].includes(r.doc_class), r.doc_class);
  assertEquals(analyzePdfPages([corePages[0]!, "คำสั่งกระทรวงศึกษาธิการ ที่ สพฐ 1/2560"]).doc_class, "core_curriculum");
  assert(r.class_evidence.every((e) => /^pdf:\d+$/.test(e.locator)));
  assertEquals(r.items.find((i) => i.item_type === "curriculum_year")?.extracted.year_be, 2551);
  assertEquals(r.items.find((i) => i.item_type === "revision")?.extracted.revision_year_be, 2560);
});

Deno.test("สกัดมาตรฐาน/ตัวชี้วัดพร้อมหน้า · ข้อความต่อบรรทัด · ช่วงชั้น", () => {
  const r = analyzePdfPages(corePages);
  const std = r.items.find((i) => i.item_type === "standard" && i.item_key === "ว 1.1")!;
  assertEquals(std.locator, "pdf:2");
  assertEquals(std.extracted.area_name, "วิทยาศาสตร์และเทคโนโลยี");
  assertEquals(std.extracted.statement, "เข้าใจความหลากหลาย ของระบบนิเวศ");
  const i1 = r.items.find((i) => i.item_key === "ว 1.1 ม.1/1")!;
  assertEquals(i1.extracted, { full_code: "ว 1.1 ม.1/1", standard_code: "ว 1.1", grade: "ม.1", number: "1", statement: "อธิบายโครงสร้างเซลล์ โดยใช้กล้องจุลทรรศน์" });
  assertEquals(r.items.find((i) => i.item_key === "ว 1.2 ม.4-6/1")?.extracted.grade, "ม.4-6");
});

Deno.test("ข้อมูลซ้ำข้ามหน้าเก็บทั้งคู่ (ฐานข้อมูลแยก duplicate) · ไม่มีข้อความ = ข้อมูลไม่พอ ไม่เดา", () => {
  const r = analyzePdfPages(corePages);
  const dup = r.items.filter((i) => i.item_key === "ว 1.1 ม.1/2");
  assertEquals(dup.map((i) => i.locator), ["pdf:2", "pdf:4"]);
  assertEquals(dup[0]!.extracted.statement, dup[1]!.extracted.statement);
  const empty = r.items.find((i) => i.item_key === "ว 1.1 ม.1/3")!;
  assertEquals(empty.insufficient, true);
  assertEquals(empty.extracted.statement, null);
  const blank = r.items.find((i) => i.item_type === "unreadable")!;
  assertEquals([blank.locator, blank.insufficient], ["pdf:3", true]);
});

Deno.test("ตัวชี้วัดไม่มีมาตรฐานกำกับ → ข้อมูลไม่พอ (ไม่ผูกมาตรฐานเอง)", () => {
  const r = analyzePdfPages(["ม.2/1 อธิบายบางอย่าง"]);
  const i = r.items.find((x) => x.item_type === "indicator")!;
  assertEquals(i.extracted.standard_code, null);
  assertEquals(i.insufficient, true);
});

Deno.test("หลักสูตรสถานศึกษา: รายวิชา รหัส หน่วยกิต ชั่วโมง ตามที่พิมพ์", () => {
  const pages = [
    "หลักสูตรสถานศึกษา โรงเรียนทดสอบ พุทธศักราช 2569\nโครงสร้างหลักสูตรชั้นปี",
    "คำอธิบายรายวิชาพื้นฐาน\nท21101 ภาษาไทย 1 กลุ่มสาระการเรียนรู้ภาษาไทย\nชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 เวลา 60 ชั่วโมง 1.5 หน่วยกิต\nว 221201 วิทยาศาสตร์ทดสอบ\nชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 เวลา 40 ชั่วโมง",
  ];
  const r = analyzePdfPages(pages);
  assertEquals(r.doc_class, "school_curriculum");
  const s = r.items.filter((i) => i.item_type === "subject");
  assertEquals(s.map((x) => [x.item_key, x.extracted.credits, x.extracted.hours, x.locator]), [["ท21101", 1.5, 60, "pdf:2"], ["ว221201", null, 40, "pdf:2"]]);
  assert(s[1]!.flags!.some((f) => f.code === "CODE_NONSTANDARD"));
  assert(s[1]!.flags!.some((f) => f.code === "NO_CREDITS"));
  assertEquals(r.items.find((i) => i.item_type === "curriculum_year")?.extracted.year_be, 2569);
});

Deno.test("ประกาศ/เวลาเรียน: จำแนก + ตัวเลขโครงสร้างเวลาเรียนติดธงให้คนเทียบหัวตาราง", () => {
  const r = analyzePdfPages(["ประกาศโรงเรียนทดสอบ\nเรื่อง การใช้หลักสูตรสถานศึกษา\nโครงสร้างเวลาเรียน\nภาษาไทย 120 120 120\nประกาศ ณ วันที่ 1 พฤษภาคม 2569"]);
  assertEquals(r.doc_class, "announcement_time");
  const t = r.items.find((i) => i.item_type === "time_structure")!;
  assertEquals((t.extracted.numbers as { value: number }[]).map((n) => n.value), [120, 120, 120]);
  assert(t.flags!.some((f) => f.code === "COLUMNS_UNMAPPED"));
});

Deno.test("ไม่มั่นใจ → unknown (ไม่บังคับจัดประเภท)", () => {
  assertEquals(classify([{ locator: "pdf:1", text: "รายงานการประชุม", early: true }]).doc_class, "unknown");
});

Deno.test("Excel: รายวิชาพร้อมพิกัดเซลล์ · ตัวชี้วัดเต็มรหัส · ไม่มีคอลัมน์หน่วยกิตติดธง", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ม.1");
  ws.getCell("A1").value = "โครงสร้างหลักสูตรชั้นปี หลักสูตรสถานศึกษา";
  ws.getRow(3).values = ["รหัสวิชา", "ชื่อรายวิชา", "เวลาเรียน"];
  ws.getRow(4).values = ["ท21101", "ภาษาไทย 1", 60];
  ws.getRow(5).values = ["หมายเหตุ", "", ""];
  const ws2 = wb.addWorksheet("ตัวชี้วัด");
  ws2.getRow(2).values = ["ว 1.1 ม.1/1", "อธิบายโครงสร้างเซลล์"];
  const cells = await xlsxCells(new Uint8Array(await wb.xlsx.writeBuffer()));
  const r = analyzeXlsxCells(cells);
  const s = r.items.find((i) => i.item_type === "subject")!;
  assertEquals(s.locator, "sheet:ม.1!A4:C4");
  assertEquals(s.extracted.hours, 60);
  assert(s.flags!.some((f) => f.code === "NO_CREDITS"));
  assertEquals(r.items.filter((i) => i.item_type === "subject").length, 1);
  const ind = r.items.find((i) => i.item_type === "indicator")!;
  assertEquals([ind.locator, ind.extracted.statement], ["sheet:ตัวชี้วัด!A2:B2", "อธิบายโครงสร้างเซลล์"]);
});

Deno.test("PDF จริงหลายหน้า (สร้างในเทสต์): ข้อความแยกหน้า หน้าว่าง = ข้อมูลไม่พอ ที่หน้าถูกต้อง", async () => {
  const { PDFDocument, StandardFonts } = await import("npm:pdf-lib@1.17.1");
  const { pdfPages } = await import("./curriculum-parse.ts");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of ["PAGE ONE", "", "PAGE THREE"]) {
    const p = doc.addPage([300, 300]);
    if (t) p.drawText(t, { x: 20, y: 200, size: 14, font });
  }
  const pages = await pdfPages(await doc.save());
  assertEquals(pages.length, 3);
  assert(pages[0]!.includes("PAGE ONE") && pages[2]!.includes("PAGE THREE"));
  const r = analyzePdfPages(pages);
  assertEquals(r.items.filter((i) => i.item_type === "unreadable").map((i) => i.locator), ["pdf:2"]);
  assertEquals(r.doc_class, "unknown");
});

Deno.test("CPU regression: บรรทัดไทยไม่มีวรรคยาว + ตัวเลข ไม่ทำให้ regex backtrack ทวีคูณ", () => {
  const lines = ["ก".repeat(80), "ก".repeat(5000), "ภาษาไทย".repeat(300)].map((s) => `${s} 1 2 3 4 5 6 7 8 9 10 11 12 13 x`);
  const t0 = performance.now();
  analyzePdfPages([`โครงสร้างเวลาเรียน ชั่วโมง\n${lines.join("\n")}`]);
  assert(performance.now() - t0 < 200, `ใช้เวลา ${performance.now() - t0} ms`);
});

Deno.test("timeStructureLine: ตัวเลขในวงเล็บ · ป้ายชื่อมีตัวเลขไม่นับ", async () => {
  const { timeStructureLine } = await import("./curriculum-analyze.ts");
  assertEquals(timeStructureLine("ภาษาไทย 120 (3) 120 (3)"), { label: "ภาษาไทย", numbers: [{ value: 120, paren: 3 }, { value: 120, paren: 3 }] });
  assertEquals(timeStructureLine("ม.1 120 120"), null);
  assertEquals(timeStructureLine("ภาษาไทย 120"), null);
});
