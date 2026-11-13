/**
 * Curriculum import parsers (C1.2) — สร้างแถว staging จากไฟล์ต้นฉบับเท่านั้น ไม่เติม/เดาค่า
 * - Excel (.xlsx): exceljs — อ่านตาม column mapping ที่ผู้ตรวจกำหนด, เก็บ Sheet/Cell, แจ้ง merged cell / สูตร / แถวรวมยอด / ปีหลักสูตรในหัวชีต (V62)
 * - PDF: unpdf — สกัดข้อความรายหน้า (ไม่ OCR) → แถวละหน้า ให้ผู้ตรวจกรอกค่าจากข้อความ (needs_review)
 * (ไม่ใช้ npm `xlsx@0.18.5` เพราะมีช่องโหว่ที่ทราบแล้วกับไฟล์ที่ผู้ใช้อัปโหลด)
 */
import ExcelJS from "npm:exceljs@4.4.0";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

export interface StagingRow {
  row_no: number;
  source_sheet?: string;
  source_cell_range?: string;
  source_page?: number;
  raw: Record<string, unknown>;
  normalized: Record<string, string>;
}

export interface XlsxMapping {
  sheet: string;
  header_row?: number;
  first_row: number;
  last_row?: number;
  /** field → column letter เช่น { code: "A", name_th: "B", credits: "D" } */
  columns: Record<string, string>;
  /** ค่าที่ผู้ตรวจกำหนดให้ทั้งชีต (เช่น grade_code) — บันทึกไว้ใน raw._constants */
  constants?: Record<string, string>;
  /** ปีหลักสูตรที่คาดว่าหัวชีตจะระบุ (V62) */
  expected_year_be?: number;
}

const issue = (code: string, field: string | null, severity: "error" | "warning" | "info", message_th: string) => ({ code, field, severity, message_th });

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellText(o.result);
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

const colIndex = (letters: string) => [...letters.toUpperCase()].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);

export async function parseXlsx(bytes: Uint8Array, m: XlsxMapping): Promise<StagingRow[]> {
  if (!m?.sheet || !m.first_row || !m.columns || Object.keys(m.columns).length === 0) {
    throw new Error("กรุณากำหนดการจับคู่คอลัมน์ (ชีต, แถวแรก, คอลัมน์) ก่อนอ่านไฟล์ Excel");
  }
  for (const col of Object.values(m.columns)) {
    if (!/^[A-Z]{1,3}$/i.test(col)) throw new Error(`คอลัมน์ "${col}" ไม่ถูกต้อง`);
  }
  const wb = new ExcelJS.Workbook();
  // exceljs ประกาศชนิดเป็น Node Buffer แต่รับ Uint8Array ได้
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(m.sheet);
  if (!ws) throw new Error(`ไม่พบชีต "${m.sheet}" (มี: ${wb.worksheets.map((w) => w.name).join(", ")})`);

  // V62: ปีหลักสูตรที่หัวชีตระบุ
  const headerIssues = [];
  if (m.expected_year_be) {
    const headText = Array.from({ length: Math.max((m.header_row ?? m.first_row - 1), 1) }, (_, i) =>
      (ws.getRow(i + 1).values as unknown[]).map(cellText).join(" "),
    ).join(" ");
    const years = [...new Set(headText.match(/25\d\d/g) ?? [])];
    if (years.length && !years.includes(String(m.expected_year_be))) {
      headerIssues.push(issue("V62", null, "warning", `หัวชีตระบุปี ${years.join(", ")} ไม่ตรงกับหลักสูตรเป้าหมาย ${m.expected_year_be}`));
    }
  }

  const cols = Object.entries(m.columns).map(([field, col]) => ({ field, col: col.toUpperCase(), idx: colIndex(col) }));
  const minCol = cols.reduce((a, c) => (c.idx < a.idx ? c : a)).col;
  const maxCol = cols.reduce((a, c) => (c.idx > a.idx ? c : a)).col;
  const last = Math.min(m.last_row ?? ws.rowCount, ws.rowCount, m.first_row + 5000);
  const rows: StagingRow[] = [];
  for (let r = m.first_row; r <= last; r++) {
    const cells: Record<string, string> = {};
    const normalized: Record<string, string> = { ...(m.constants ?? {}) };
    const parserIssues = [...headerIssues];
    let any = false;
    for (const c of cols) {
      const cell = ws.getCell(`${c.col}${r}`);
      const text = cellText(cell.value);
      cells[`${c.col}${r}`] = text;
      if (text) {
        any = true;
        normalized[c.field] = text;
      }
      if (cell.isMerged && cell.master.address !== cell.address) {
        parserIssues.push(issue("MERGED_CELL", c.field, "warning", `เซลล์ ${cell.address} เป็นส่วนหนึ่งของเซลล์ผสาน ${cell.master.address} — ตรวจค่ากับต้นฉบับ`));
      }
      if (cell.value && typeof cell.value === "object" && "formula" in (cell.value as object)) {
        parserIssues.push(issue("FORMULA", c.field, "info", `เซลล์ ${cell.address} เป็นสูตร — ใช้ค่าที่คำนวณไว้ในไฟล์`));
      }
    }
    if (!any) continue;
    const nameLike = `${normalized.name_th ?? ""} ${normalized.code ?? ""}`;
    if (/รวม|total/i.test(nameLike)) {
      parserIssues.push(issue("SUMMARY_ROW", null, "warning", "แถวรวมยอด — ใช้ตรวจยอด (V34) ไม่ใช่รายการข้อมูล ควรข้าม"));
    }
    rows.push({
      row_no: rows.length + 1,
      source_sheet: ws.name,
      source_cell_range: minCol === maxCol ? `${minCol}${r}` : `${minCol}${r}:${maxCol}${r}`,
      raw: { cells, ...(m.constants ? { _constants: m.constants } : {}), parser_issues: parserIssues },
      normalized,
    });
  }
  return rows;
}

/** แบ่งช่วงหน้า "120-135,140" */
function pageSet(spec: string | undefined, total: number): number[] {
  if (!spec) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map((x) => parseInt(x.trim(), 10));
    if (!a) continue;
    for (let p = a; p <= Math.min(b || a, total); p++) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
}

export async function parsePdf(bytes: Uint8Array, mapping: { pages?: string } | null): Promise<{ rows: StagingRow[]; pageCount: number }> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = pageSet(mapping?.pages, totalPages);
  if (pages.length > 600) throw new Error("ช่วงหน้ามากเกินไป กรุณาแบ่งเป็นหลายชุดนำเข้า");
  const rows: StagingRow[] = pages.map((p, i) => {
    const t = (text[p - 1] ?? "").trim();
    const parserIssues = [];
    if (!t) {
      parserIssues.push(issue("NO_TEXT", null, "warning", "หน้านี้ไม่มีข้อความที่สกัดได้ (อาจเป็นภาพสแกน) — ต้องอ่านจากต้นฉบับ"));
    } else {
      // ฟอนต์ไทยรุ่นเก่ามักแมปสระ/วรรณยุกต์ไว้ใน Private Use Area → ข้อความเพี้ยน
      const bad = [...t].filter((c) => /[-�]/.test(c)).length;
      if (bad / t.length > 0.01) {
        parserIssues.push(issue("GARBLED_TEXT", null, "warning", "ข้อความไทยที่สกัดได้อาจเพี้ยน — ตรวจกับภาพหน้าต้นฉบับ"));
      }
    }
    return { row_no: i + 1, source_page: p, raw: { text: t.slice(0, 20000), parser_issues: parserIssues }, normalized: {} };
  });
  return { rows, pageCount: totalPages };
}
