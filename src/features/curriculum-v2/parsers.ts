/**
 * อ่านไฟล์หลักสูตร (XLSX / DOCX / PDF) ในเบราว์เซอร์ → ParsedSource
 * - ไม่เขียนฐานข้อมูล ไม่แก้ค่า · ทุกแถวมีอ้างอิงตำแหน่งในไฟล์
 * - ชั้น/แผน/ภาคเรียน อ่านจากหัวตารางของไฟล์เท่านั้น ถ้าไม่พบเป็น null
 * - แยกตารางโครงสร้างออกจากคำอธิบายรายวิชา
 */
import { readXlsx, unzip } from "../../lib/xlsx-read";
import { parseStructureWorkbook } from "../curriculum/structure-workbook";
import { clean, CODE_RE, normCode, parseCredit, thaiDigits, type ParsedSource, type Ref, type SourceKind, type V2Declared, type V2Description, type V2Row } from "./model";

export async function sha256Hex(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function kindOf(name: string): SourceKind | null {
  const n = name.toLowerCase();
  return n.endsWith(".xlsx") ? "xlsx" : n.endsWith(".docx") ? "docx" : n.endsWith(".pdf") ? "pdf" : null;
}
const empty = (kind: SourceKind, fileName: string, sha256: string): ParsedSource => ({ kind, fileName, sha256, rows: [], activities: [], declared: [], descriptions: [], notes: [] });
const gradeOf = (s: string) => { const m = /ชั้นมัธยมศึกษาปีที่\s*([1-6])(?:\s*\/\s*(\d+))?/.exec(thaiDigits(s)); return m ? { grade: `M${m[1]}`, room: m[2] ? `${m[1]}/${m[2]}` : null } : null; };
function planOf(title: string, head: string): string | null {
  // ลำดับ: ชื่อแผนที่ตามหลัง “ชั้นมัธยมศึกษาปีที่ N” (ทั้งข้อความรวมวงเล็บ) → ชื่อในวงเล็บของหัว “โครงสร้างหลักสูตรชั้นปี (…)”
  const h = /ชั้นมัธยมศึกษาปีที่\s*[\d๐-๙]+(?:\s*\/\s*[\d๐-๙]+)?\s*((?:แผน|ห้องเรียน).+)$/.exec(clean(head))?.[1];
  if (h) return clean(h);
  const t = /โครงสร้างหลักสูตรชั้นปี\s*\(([^)]+)\)/.exec(clean(title))?.[1];
  return t && !/ชั้นมัธยม/.test(t) ? clean(t) : null;
}

// ---------------------------------------------------------------- XLSX (ใช้ตัวอ่านโครงสร้างเดิม)
export async function parseXlsx(buf: ArrayBuffer, fileName: string): Promise<ParsedSource> {
  const src = empty("xlsx", fileName, await sha256Hex(buf));
  const { blocks, skipped } = parseStructureWorkbook(await readXlsx(buf));
  if (skipped.length) src.notes.push(`ข้ามชีตที่ไม่ใช่ตารางโครงสร้าง: ${skipped.map((s) => s.trim()).join(", ")}`);
  for (const b of blocks) {
    const ref = (cell: string): Ref => ({ file: fileName, sheet: b.sheet, cell });
    for (const s of b.subjects) src.rows.push({ grade: b.grade, plan: b.plan, room: b.room, term: b.term as 1 | 2, section: s.section, code: s.code, codeRaw: s.codeRaw, name: clean(s.name), credits: s.credits, hours: s.hours, raw: s.raw, ref: ref(s.cell) });
    for (const a of b.activities) src.activities.push({ grade: b.grade, plan: b.plan, term: b.term as 1 | 2, name: clean(a.name), hours: a.hours, ref: ref(a.cell) });
    src.declared.push({ grade: b.grade, plan: b.plan, term: b.term as 1 | 2, total: b.declared.total, basic: b.declared.basic, additional: b.declared.additional, activities: b.declared.activities, ref: ref(b.declared.cells.total ?? `${b.col}3`) });
  }
  return src;
}

// ---------------------------------------------------------------- คำอธิบายรายวิชา (ใช้ร่วม PDF/DOCX)
const DESC_HEAD = /^([ก-ฮ]{1,2}\s?\d{5}|IS\s?\d)\s+(.+?)\s+กลุ่มสาระ/i;
const DESC_STOP = /^(ผลการเรียนรู้|ตัวชี้วัด|รหัสตัวชี้วัด|โครงสร้างรายวิชา|โครงสร้างหน่วย|รวม\s*\d+\s*ตัวชี้วัด|รวมทั้งหมด)/;
export function extractDescriptions(lines: { text: string; ref: Ref }[]): V2Description[] {
  const out: V2Description[] = [];
  let cur: V2Description | null = null; let stopped = false;
  for (const l of lines) {
    const t = clean(l.text);
    const h = DESC_HEAD.exec(t);
    if (h) { cur = { code: normCode(h[1]!), name: clean(h[2]!), text: "", ref: l.ref }; out.push(cur); stopped = false; continue; }
    if (!cur || stopped || !t) continue;
    if (DESC_STOP.test(t) || /^โครงสร้างหลักสูตร/.test(t)) { stopped = true; continue; }
    if (/^ชั้นมัธยมศึกษาปีที่.*(เวลา|หน่วยกิต)/.test(t) || /^คำอธิบายรายวิชา/.test(t)) continue;
    if (cur.text.length < 2500) cur.text += (cur.text ? " " : "") + t;
  }
  // คงไว้เฉพาะที่มีเนื้อความ · รหัสซ้ำใช้ฉบับแรก (อ้างอิงหน้า/ตำแหน่งแรก)
  const seen = new Set<string>();
  return out.filter((d) => d.text.length > 20 && !seen.has(d.code) && seen.add(d.code));
}

// ---------------------------------------------------------------- ตารางสองภาคเรียน (ใช้ร่วม PDF/DOCX)
const ITEM = /([ก-ฮ]{1,2}\s?\d{5}|[Ii][Ss]\s?\d)\s+(.*?)\s*(\d+(?:\.\d+)?)\s*\(\s*(\d+)\s*\)/g;
interface Ctx { grade: string | null; room: string | null; plan: string | null; section: [V2Row["section"], V2Row["section"]]; declared: [V2Declared | null, V2Declared | null] }
/** ประมวลข้อความหนึ่งช่องภาคเรียน (term) ของหนึ่งบรรทัด/แถว */
function handleCell(src: ParsedSource, ctx: Ctx, term: 1 | 2, text: string, ref: Ref) {
  const t = thaiDigits(clean(text)); if (!t) return;
  const i = term - 1;
  const sec = /(รายวิชาพื้นฐาน|รายวิชาเพิ่มเติม)\s*([\d.]+\s*\(\s*[\d.]+\s*\))?/.exec(t);
  if (sec) {
    ctx.section[i] = sec[1] === "รายวิชาพื้นฐาน" ? "basic" : "additional";
    const d = (ctx.declared[i] ??= { grade: ctx.grade, plan: ctx.plan, term, total: null, basic: null, additional: null, activities: null, ref });
    if (sec[2]) d[ctx.section[i] === "basic" ? "basic" : "additional"] = sec[2].replace(/\s/g, "");
    return;
  }
  const act = /^กิจกรรมพัฒนาผู้เรียน\s*(\d+)?/.exec(t);
  if (act) { ctx.section[i] = null; const d = (ctx.declared[i] ??= { grade: ctx.grade, plan: ctx.plan, term, total: null, basic: null, additional: null, activities: null, ref }); if (act[1]) d.activities = Number(act[1]); return; }
  const tot = /รวมเวลาเรียนทั้งสิ้น\s*([\d,]+)/.exec(t);
  if (tot) { const d = (ctx.declared[i] ??= { grade: ctx.grade, plan: ctx.plan, term, total: null, basic: null, additional: null, activities: null, ref }); d.total = Number(tot[1]!.replace(/,/g, "")); d.ref = ref; return; }
  for (const m of t.matchAll(ITEM)) {
    const code = normCode(m[1]!); if (!CODE_RE.test(m[1]!.replace(/\s/g, ""))) continue;
    const c = parseCredit(`${m[3]}(${m[4]})`);
    src.rows.push({ grade: ctx.grade, plan: ctx.plan, room: ctx.room, term, section: ctx.section[i] ?? null, code, codeRaw: m[1]!, name: clean(m[2]!), credits: c?.credits ?? null, hours: c?.hours ?? null, raw: `${m[3]}(${m[4]})`, ref });
  }
}
function flushCtx(src: ParsedSource, ctx: Ctx) { for (const d of ctx.declared) if (d) src.declared.push(d); ctx.declared = [null, null]; }

// ---------------------------------------------------------------- DOCX
const wText = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]!).join("")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
/** แยกองค์ประกอบลูกระดับบนสุดตามชื่อแท็ก (นับความลึก — รองรับตารางซ้อนตาราง) */
export function topLevel(xml: string, tags: string[]): { tag: string; xml: string }[] {
  const re = new RegExp(`<(/?)w:(${tags.join("|")})(?=[\\s>/])[^>]*?(/?)>`, "g");
  const out: { tag: string; xml: string }[] = [];
  let depth = 0, start = 0, cur = "";
  for (const m of xml.matchAll(re)) {
    const close = m[1] === "/", self = m[3] === "/";
    if (self) { if (depth === 0) out.push({ tag: m[2]!, xml: m[0] }); continue; }
    if (!close) { if (depth === 0) { start = m.index!; cur = m[2]!; } depth++; }
    else { depth--; if (depth === 0) out.push({ tag: cur, xml: xml.slice(start, m.index! + m[0].length) }); }
  }
  return out;
}
const inner = (xml: string) => xml.slice(xml.indexOf(">") + 1, xml.lastIndexOf("</"));
export async function parseDocx(buf: ArrayBuffer, fileName: string): Promise<ParsedSource> {
  const src = empty("docx", fileName, await sha256Hex(buf));
  const files = await unzip(buf);
  const xml = new TextDecoder().decode(files.get("word/document.xml") ?? new Uint8Array());
  if (!xml) { src.notes.push("ไม่พบเนื้อหาเอกสาร (word/document.xml)"); return src; }
  const body = inner(xml.slice(xml.indexOf("<w:body"), xml.lastIndexOf("</w:body>") + 9));
  const paras: { text: string; ref: Ref }[] = [];
  let tableNo = 0, p = 0;
  const recent: string[] = []; // ย่อหน้าก่อนตาราง (หัวตารางที่พิมพ์ไว้นอกตาราง)
  for (const el of topLevel(body, ["tbl", "p"])) {
    if (el.tag === "p") {
      p++; const t = wText(el.xml);
      if (t.trim()) { paras.push({ text: t, ref: { file: fileName, table: 0, row: p } }); recent.push(clean(t)); if (recent.length > 6) recent.shift(); }
      continue;
    }
    processTable(el.xml); recent.length = 0;
  }
  function processTable(tblXml: string) {
    const no = ++tableNo;
    // ตารางซ้อนในเซลล์: แยกประมวลเป็นตารางของตัวเอง และตัดออกจากข้อความเซลล์ชั้นนอก
    const rows = topLevel(inner(tblXml), ["tr"]).map((r) => topLevel(inner(r.xml), ["tc"]).map((c) => {
      const nested = topLevel(inner(c.xml), ["tbl"]);
      let text = c.xml; for (const n of nested) { text = text.replace(n.xml, ""); processTable(n.xml); }
      return wText(text);
    }));
    const flat = rows.flat().join(" ");
    if (!/ภาคเรียนที่/.test(flat) || !/\d\s*\(\s*\d+\s*\)/.test(flat)) { for (const r of rows) paras.push({ text: r.join(" "), ref: { file: fileName, table: no, row: 0 } }); return; }
    // หัวตาราง: ในตาราง หรือย่อหน้าก่อนตาราง (ไม่เดา — ถ้าไม่พบเป็น null)
    const pool = [...recent, ...rows.flat().map(clean)];
    let titleCell = pool.find((c) => /โครงสร้างหลักสูตร/.test(c)) ?? "";
    const gradeCell = [...pool].find((c) => /ชั้นมัธยมศึกษาปีที่/.test(c)) ?? "";
    const g = gradeOf(gradeCell);
    const ctx: Ctx = { grade: g?.grade ?? null, room: g?.room ?? null, plan: planOf(titleCell, gradeCell), section: [null, null], declared: [null, null] };
    rows.forEach((cells, ri) => {
      const ref: Ref = { file: fileName, table: no, row: ri + 1 };
      const text = cells.map(clean).join(" ");
      if (!text) return;
      if (/โครงสร้างหลักสูตร/.test(text)) titleCell = text;
      // หัวตารางชุดใหม่ภายในตารางเดียวกัน (หลายแผนต่อกัน) → เริ่มบริบทใหม่
      const ng = /ชั้นมัธยมศึกษาปีที่/.test(text) ? gradeOf(text) : null;
      if (ng && ri > 1) { flushCtx(src, ctx); Object.assign(ctx, { grade: ng.grade, room: ng.room, plan: planOf(titleCell, text), section: [null, null] }); return; }
      if (/ภาคเรียนที่/.test(text) || /ชั้นมัธยมศึกษาปีที่|โครงสร้างหลักสูตร/.test(text)) return;
      // ตารางสองภาคเรียนวางคู่: เซลล์ครึ่งแรก = ภาค 1 · ครึ่งหลัง = ภาค 2
      const half = cells.length / 2;
      handleCell(src, ctx, 1, cells.filter((_, i) => i < half).join(" "), ref);
      handleCell(src, ctx, 2, cells.filter((_, i) => i >= half).join(" "), ref);
    });
    flushCtx(src, ctx);
  }
  src.descriptions = extractDescriptions(paras);
  if (!src.rows.length) src.notes.push("ไม่พบตารางโครงสร้างหลักสูตรในไฟล์นี้");
  return src;
}

// ---------------------------------------------------------------- PDF
export interface PdfItem { str: string; x: number; y: number; w: number }
export interface PdfPage { page: number; items: PdfItem[] }
/** รวม item เป็นบรรทัดตามแกน y แล้วแบ่งซ้าย/ขวาตามตำแหน่งคอลัมน์ภาคเรียนที่ 2 */
export function pageLines(items: PdfItem[]) {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfItem[][] = [];
  for (const it of sorted) { const l = lines.find((x) => Math.abs(x[0]!.y - it.y) < 4); if (l) l.push(it); else lines.push([it]); }
  return lines.map((l) => l.sort((a, b) => a.x - b.x));
}
const joinItems = (l: PdfItem[]) => l.reduce((s, it, k) => s + (k && it.x - (l[k - 1]!.x + l[k - 1]!.w) > 1.5 ? " " : "") + it.str, "");
export function parsePdfPages(pages: PdfPage[], fileName: string, sha256: string): ParsedSource {
  const src = empty("pdf", fileName, sha256);
  const descLines: { text: string; ref: Ref }[] = [];
  for (const pg of pages) {
    const lines = pageLines(pg.items);
    const texts = lines.map(joinItems);
    const ref: Ref = { file: fileName, page: pg.page };
    const isStructure = texts.slice(0, 8).some((t) => /โครงสร้างหลักสูตรชั้นปี/.test(t)) && texts.some((t) => /ภาคเรียนที่\s*2/.test(thaiDigits(t)));
    if (!isStructure) { for (const t of texts) descLines.push({ text: t, ref }); continue; }
    // ตำแหน่งแบ่งคอลัมน์: x ของรหัสวิชาตัวที่สองในบรรทัดที่มีสองรหัส (หรือหัว “ภาคเรียนที่ 2”)
    const xs: number[] = [];
    for (const l of lines) {
      // จุดเริ่มรหัสวิชา: item ที่เป็นรหัสเต็ม หรือ อักษรนำ + ตัวเลข 5 หลักที่ถูกแยกเป็นสอง item
      const starts: number[] = [];
      l.forEach((it, k) => {
        const t = thaiDigits(it.str.trim());
        if (/^([ก-ฮ]{1,2}\s?\d{5}|IS\s?\d)/i.test(t)) starts.push(it.x);
        else if (/^\d{5}/.test(t) && k > 0 && /^[ก-ฮ]{1,2}$/.test(l[k - 1]!.str.trim())) starts.push(l[k - 1]!.x);
      });
      if (starts.length >= 2) xs.push(starts[1]!);
      for (const re of [/ภาคเรียนที่/, /รายวิชาพื้นฐาน/, /รายวิชาเพิ่มเติม/, /กิจกรรมพัฒนาผู้เรียน/, /รวมเวลาเรียนทั้งสิ้น/]) {
        const hs = l.filter((i) => re.test(i.str)); if (hs.length >= 2) xs.push(hs[1]!.x);
      }
    }
    if (!xs.length) { src.notes.push(`หน้า ${pg.page}: หาแนวแบ่งภาคเรียนไม่ได้ — ไม่อ่านหน้านี้`); continue; }
    const split = Math.min(...xs) - 6;
    const head = texts.slice(0, 8).join(" ");
    const g = gradeOf(head);
    const titleLine = texts.find((t) => /โครงสร้างหลักสูตรชั้นปี/.test(t)) ?? "";
    const gradeLine = texts.find((t) => /ชั้นมัธยมศึกษาปีที่/.test(t)) ?? "";
    const ctx: Ctx = { grade: g?.grade ?? null, room: g?.room ?? null, plan: planOf(titleLine, gradeLine), section: [null, null], declared: [null, null] };
    for (const l of lines) {
      const left = l.filter((i) => i.x < split), right = l.filter((i) => i.x >= split);
      handleCell(src, ctx, 1, joinItems(left), ref);
      handleCell(src, ctx, 2, joinItems(right), ref);
    }
    flushCtx(src, ctx);
  }
  src.descriptions = extractDescriptions(descLines);
  if (!src.rows.length) src.notes.push("ไม่พบหน้าตารางโครงสร้างหลักสูตรชั้นปีในไฟล์นี้ (อาจเป็นไฟล์คำอธิบายรายวิชา)");
  return src;
}
