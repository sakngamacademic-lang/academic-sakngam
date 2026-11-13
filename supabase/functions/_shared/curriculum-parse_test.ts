// deno test — ตัวอ่าน Excel ของระบบนำเข้าหลักสูตร (ไฟล์ทดสอบสร้างในเทสต์ ไม่ใช่ข้อมูลจริง)
import ExcelJS from "npm:exceljs@4.4.0";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { parseXlsx } from "./curriculum-parse.ts";

async function workbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ม.1 ทดสอบ");
  ws.getCell("A1").value = "โครงสร้างทดสอบ หลักสูตร 2561";
  ["รหัส", "ชื่อ", "หน่วยกิต", "ชั่วโมง"].forEach((h, i) => (ws.getRow(3).getCell(i + 1).value = h));
  ws.getRow(4).values = ["TEST101", "วิชาทดสอบ", 1, 20];
  ws.getRow(5).values = ["TEST102", "วิชาทดสอบสอง", { formula: "1+0.5", result: 1.5 }, 60];
  ws.getCell("B6").value = "รวม";
  ws.getCell("C6").value = 2.5;
  ws.mergeCells("A7:B7");
  ws.getCell("A7").value = "TEST103 รวมเซลล์";
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const mapping = { sheet: "ม.1 ทดสอบ", header_row: 3, first_row: 4, columns: { code: "A", name_th: "B", credits: "C", learning_hours: "D" }, constants: { grade_code: "M1" }, expected_year_be: 2569 };

Deno.test("อ่านแถวตาม mapping + เก็บ Sheet/Cell + ค่าคงที่ที่ผู้ตรวจกำหนด", async () => {
  const rows = await parseXlsx(await workbook(), mapping);
  assertEquals(rows.length, 4);
  assertEquals(rows[0]!.source_sheet, "ม.1 ทดสอบ");
  assertEquals(rows[0]!.source_cell_range, "A4:D4");
  assertEquals(rows[0]!.normalized, { grade_code: "M1", code: "TEST101", name_th: "วิชาทดสอบ", credits: "1", learning_hours: "20" });
});

Deno.test("ไม่เขียนทับค่าต้นฉบับ: 1 หน่วยกิต = 20 ชม. คงเดิม · สูตรใช้ค่าที่คำนวณ + แจ้ง", async () => {
  const rows = await parseXlsx(await workbook(), mapping);
  assertEquals(rows[0]!.normalized.learning_hours, "20");
  assertEquals(rows[1]!.normalized.credits, "1.5");
  const codes = (rows[1]!.raw.parser_issues as { code: string }[]).map((i) => i.code);
  assertEquals(codes.includes("FORMULA"), true);
});

Deno.test("แถวรวมยอด / เซลล์ผสาน / ปีหลักสูตรในหัวชีตไม่ตรง (V62) ถูกแจ้ง", async () => {
  const rows = await parseXlsx(await workbook(), mapping);
  const codes = (r: number) => (rows[r]!.raw.parser_issues as { code: string }[]).map((i) => i.code);
  assertEquals(codes(2).includes("SUMMARY_ROW"), true);
  assertEquals(codes(3).includes("MERGED_CELL"), true);
  assertEquals(codes(0).includes("V62"), true);
});

Deno.test("mapping ไม่ครบ / ชีตไม่มี → error ไม่เดา", async () => {
  await assertRejects(() => parseXlsx(new Uint8Array(), { sheet: "", first_row: 0, columns: {} }));
  await assertRejects(() => parseXlsx(new Uint8Array(0), { ...mapping, columns: { code: "1A" } }));
});
