/**
 * วิเคราะห์เอกสารหลักสูตรแบบ rule-based (ไม่มี dependency — ใช้ใน Edge Function และทดสอบด้วย deno test)
 *
 * หลักการ
 * - จำแนกประเภทเอกสารจากวลีที่พบจริง พร้อมหน้า/เซลล์ที่พบ (class_evidence) · คะแนนต่ำ/ใกล้เคียงกัน → unknown (ให้คนหรือ AI ช่วย)
 * - สกัดเฉพาะค่าที่ปรากฏในข้อความ ทุกรายการมีพิกัด pdf:N หรือ sheet:ชื่อ!A1 — ไม่เติม/เดาค่า
 * - อ่านไม่ได้ (หน้าไม่มีข้อความ / ไม่มีข้อความตัวชี้วัด) → insufficient = “ข้อมูลไม่พอ”
 * - รหัสวิชาใช้ parseCourseHeader เดิม (เก็บรหัสตามที่พิมพ์)
 */
import { parseCourseHeader } from "./curriculum-pdf-text.ts";
import { END_GRADES, REPAIRED_MARK } from "./pdf-layout.ts";

/** เลขไทย → เลขอารบิก (ใช้กับรหัส/ปี/ชั้นเท่านั้น — ข้อความตัวชี้วัดเก็บตามต้นฉบับ) */
export const toArabic = (s: string) => s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));

export type DocClass = "core_curriculum" | "school_curriculum" | "learning_area_curriculum" | "standards_indicators" | "announcement_time" | "unknown";
export type ItemType = "curriculum_year" | "revision" | "learning_area" | "grade_level" | "standard" | "indicator" | "subject" | "time_structure" | "study_program" | "unreadable";

export interface Flag {
  code: string;
  message_th: string;
}
export interface AnalysisItem {
  item_type: ItemType;
  item_key: string;
  extracted: Record<string, unknown>;
  locator: string | null;
  excerpt?: string;
  confidence: number;
  insufficient?: boolean;
  proposed_by?: "parser" | "ai";
  flags?: Flag[];
}
export interface Evidence {
  class: DocClass;
  phrase: string;
  locator: string;
}
export interface AnalysisResult {
  doc_class: DocClass;
  class_confidence: number;
  class_evidence: Evidence[];
  meta: Record<string, unknown>;
  page_count: number | null;
  items: AnalysisItem[];
}
export interface SheetCell {
  sheet: string;
  address: string;
  row: number;
  col: number;
  text: string;
}

export const LEARNING_AREAS = [
  "ภาษาไทย", "คณิตศาสตร์", "วิทยาศาสตร์และเทคโนโลยี", "วิทยาศาสตร์", "สังคมศึกษา ศาสนา และวัฒนธรรม", "สังคมศึกษาศาสนาและวัฒนธรรม",
  "สุขศึกษาและพลศึกษา", "ศิลปะ", "การงานอาชีพ", "การงานอาชีพและเทคโนโลยี", "ภาษาต่างประเทศ",
];

const CLASS_RULES: { cls: Exclude<DocClass, "unknown">; re: RegExp; w: number }[] = [
  { cls: "core_curriculum", re: /หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน\s*(?:พุทธศักราช|พ\.ศ\.)\s*25\d\d/, w: 2 },
  { cls: "core_curriculum", re: /กระทรวงศึกษาธิการ/, w: 1 },
  { cls: "core_curriculum", re: /คำสั่งกระทรวงศึกษาธิการ/, w: 2 },
  { cls: "school_curriculum", re: /หลักสูตรสถานศึกษา/, w: 2 },
  { cls: "school_curriculum", re: /โครงสร้างหลักสูตรชั้นปี|โครงสร้างหลักสูตรสถานศึกษา/, w: 2 },
  { cls: "school_curriculum", re: /คำอธิบายรายวิชา/, w: 1 },
  { cls: "learning_area_curriculum", re: /หลักสูตรกลุ่มสาระการเรียนรู้/, w: 3 },
  { cls: "standards_indicators", re: /ตัวชี้วัดและสาระการเรียนรู้แกนกลาง/, w: 3 },
  { cls: "standards_indicators", re: /มาตรฐาน\s*[ก-ฮ]\s?\d+\.\d+/, w: 1 },
  { cls: "announcement_time", re: /^\s*ประกาศ(?:โรงเรียน|สำนักงาน|กระทรวง)/m, w: 3 },
  { cls: "announcement_time", re: /ประกาศ\s*ณ\s*วันที่/, w: 2 },
  { cls: "announcement_time", re: /โครงสร้างเวลาเรียน|การบริหารจัดการเวลาเรียน/, w: 2 },
];

const pdfLoc = (p: number) => `pdf:${p}`;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** จำแนกประเภทจากข้อความรายส่วน (หน้า PDF หรือชีต) — หน้าแรก ๆ มีน้ำหนักมากกว่า */
export function classify(parts: { locator: string; text: string; early: boolean }[]): { doc_class: DocClass; confidence: number; evidence: Evidence[]; scores: Record<string, number> } {
  const scores: Record<string, number> = {};
  const evidence: Evidence[] = [];
  for (const rule of CLASS_RULES) {
    let hits = 0;
    for (const p of parts) {
      const m = rule.re.exec(p.text);
      if (!m) continue;
      hits++;
      scores[rule.cls] = (scores[rule.cls] ?? 0) + rule.w * (p.early ? 3 : 1);
      if (evidence.filter((e) => e.class === rule.cls).length < 5) evidence.push({ class: rule.cls, phrase: clean(m[0]).slice(0, 120), locator: p.locator });
      if (hits >= 10) break; // ไม่ให้วลีที่ซ้ำทุกหน้าครอบงำ
    }
  }
  // ตัวชี้วัดจำนวนมาก = เอกสารมาตรฐานและตัวชี้วัด
  const indicatorLines = parts.reduce((n, p) => n + (p.text.match(INDICATOR_LINE_G) ?? []).length, 0);
  if (indicatorLines >= 10) scores.standards_indicators = (scores.standards_indicators ?? 0) + Math.min(10, indicatorLines / 5);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  const [top, second] = ranked;
  if (!top || top[1] < 3) return { doc_class: "unknown", confidence: 0, evidence, scores };
  const confidence = Math.round((top[1] / total) * 1000) / 1000;
  // ใกล้เคียงกันมาก = ไม่มั่นใจ
  if (second && second[1] / top[1] > 0.85) return { doc_class: "unknown", confidence: Math.min(confidence, 0.4), evidence, scores };
  return { doc_class: top[0] as DocClass, confidence, evidence, scores };
}

// ---------------------------------------------------------------- PDF
// รับทั้งเลขอารบิกและเลขไทย (เอกสารแกนกลางพิมพ์ “ว ๑.๑ ม.๑/๑”)
const INDICATOR_LINE = /^\s*(?:([ก-ฮ])\s?([0-9๐-๙]+)\.([0-9๐-๙]+)\s+)?([มป])\.\s?([1-6๑-๖](?:\s?-\s?[1-6๑-๖])?)\s*\/\s*([0-9๐-๙]{1,3})(?![0-9๐-๙])\s*(.*)$/;
const INDICATOR_LINE_G = /(?:^|\n)\s*(?:[ก-ฮ]\s?[0-9๐-๙]+\.[0-9๐-๙]+\s+)?[มป]\.\s?[1-6๑-๖](?:\s?-\s?[1-6๑-๖])?\s*\/\s*[0-9๐-๙]{1,3}|@@GRADE /g;
const STANDARD_LINE = /^\s*มาตรฐาน\s*([ก-ฮ])\s?([0-9๐-๙]+)\.([0-9๐-๙]+)\s*(.*)$/;
/** ตัวชี้วัดแบบเลขข้อในตารางชั้น: “๑. ระบุ…” */
const NUMBERED = /^\s*(?:-\s+)?([0-9๐-๙]{1,2})\.\s*(.*)$/;
/** ตารางแบบแถวละชั้น: “ม.๑ ๑. …” */
const GRADE_ROW = /^\s*([ปม])\.\s*([1-6๑-๖])(?:\s*-\s*([1-6๑-๖]))?\s+(?:([0-9๐-๙]{1,2})\.\s*(.*))?$/;
const GRADE_BLOCK = /^@@GRADE ([ปม]\.[1-6](?:-[1-6])?)@@$/;
const STOP_LINE = /^\s*(มาตรฐาน|สาระที่|สาระการเรียนรู้แกนกลาง|ชั้น|ตัวชี้วัด|รวม|กลุ่มสาระ)/;

function continuation(lines: string[], i: number, max = 4): { text: string; used: number } {
  const out: string[] = [];
  let j = i + 1;
  for (; j < lines.length && out.length < max; j++) {
    const l = lines[j]!.trim();
    if (!l || l.startsWith("@@") || l === "-" || INDICATOR_LINE.test(l) || STANDARD_LINE.test(l) || STOP_LINE.test(l) || /^(?:-\s+)?[0-9๐-๙]{1,2}\.\s/.test(l) || GRADE_ROW.test(l)) break;
    out.push(l);
  }
  return { text: out.join(" "), used: j - i - 1 };
}

const NUM = /^\d{1,4}(?:\.\d)?$/;
const PAREN = /^\((\d{1,4}(?:\.\d)?)\)$/;
/** แยก “ป้ายชื่อ + ตัวเลขท้ายบรรทัด” แบบเส้นตรง (ไม่มี backtracking) — ตัวเลข ≥ 2 ค่า ป้ายชื่อเป็นข้อความไทย ไม่มีตัวเลข */
export function timeStructureLine(line: string): { label: string; numbers: { value: number; paren: number | null }[] } | null {
  if (line.length > 400 || !/\d/.test(line)) return null;
  const tokens = line.trim().split(/\s+/);
  const numbers: { value: number; paren: number | null }[] = [];
  let k = tokens.length - 1;
  for (; k >= 0; k--) {
    const tok = tokens[k]!;
    const p = PAREN.exec(tok);
    if (p) {
      const prev = tokens[k - 1];
      if (!prev || !NUM.test(prev)) break;
      numbers.unshift({ value: Number(prev), paren: Number(p[1]) });
      k--;
      continue;
    }
    if (!NUM.test(tok)) break;
    numbers.unshift({ value: Number(tok), paren: null });
  }
  if (numbers.length < 2 || numbers.length > 13 || k < 0) return null;
  const label = tokens.slice(0, k + 1).join(" ");
  if (/\d/.test(label) || !/[ก-๙]/.test(label) || label.length > 120) return null;
  return { label, numbers };
}

const garbled = (t: string) => t.length > 0 && [...t].filter((c) => /[-�]/.test(c)).length / t.length > 0.01;

export function analyzePdfPages(pages: string[]): AnalysisResult {
  const items: AnalysisItem[] = [];
  const meta: Record<string, unknown> = { page_count: pages.length };
  let area: string | null = null;
  let std: { code: string; area_code: string } | null = null;
  const years = new Map<string, number>();
  const revisions = new Set<string>();

  pages.forEach((raw, idx) => {
    const page = idx + 1;
    const loc = pdfLoc(page);
    const text = raw ?? "";
    if (!text.trim()) {
      items.push({ item_type: "unreadable", item_key: loc, extracted: { reason: "หน้านี้ไม่มีข้อความที่สกัดได้ (อาจเป็นภาพสแกน)" }, locator: loc, confidence: 0, insufficient: true,
        flags: [{ code: "NO_TEXT", message_th: "ข้อมูลไม่พอ — ต้องอ่านจากภาพต้นฉบับ" }] });
      return;
    }
    const pageFlags: Flag[] = garbled(text) ? [{ code: "GARBLED_TEXT", message_th: "ข้อความไทยที่สกัดได้อาจเพี้ยน — ตรวจกับภาพหน้าต้นฉบับ" }] : [];
    if (text.startsWith(REPAIRED_MARK)) {
      pageFlags.push({ code: "TEXT_REPAIRED", message_th: "ซ่อมการถอดอักขระไทยจากฟอนต์ (นิคหิต/สระอา/รูปวรรณยุกต์) — ตรวจกับภาพหน้าต้นฉบับ" });
    }
    let grade: { code: string; from: "layout" | "row" } | null = null;

    for (const m of text.matchAll(/หลักสูตร[^\n]{0,80}?(?:พุทธศักราช|พ\.ศ\.)\s*((?:25|๒๕)[0-9๐-๙]{2})/g)) {
      const y = toArabic(m[1]!);
      if (!years.has(y)) {
        years.set(y, page);
        items.push({ item_type: "curriculum_year", item_key: y, extracted: { year_be: Number(y), phrase: clean(m[0]) }, locator: loc, excerpt: clean(m[0]), confidence: 0.8 });
      }
    }
    for (const m of text.matchAll(/ฉบับปรับปรุง\s*(?:พุทธศักราช|พ\.ศ\.)?\s*((?:25|๒๕)[0-9๐-๙]{2})/g)) {
      const y = toArabic(m[1]!);
      if (revisions.has(y)) continue; // หัวกระดาษซ้ำทุกหน้า → เก็บครั้งแรก
      revisions.add(y);
      items.push({ item_type: "revision", item_key: y, extracted: { revision_year_be: Number(y), phrase: clean(m[0]) }, locator: loc, excerpt: clean(m[0]), confidence: 0.8 });
    }
    for (const name of LEARNING_AREAS) {
      if (text.includes(`กลุ่มสาระการเรียนรู้${name}`) || text.includes(`กลุ่มสาระการเรียนรู้ ${name}`)) {
        items.push({ item_type: "learning_area", item_key: name, extracted: { name_th: name }, locator: loc, confidence: 0.9 });
      }
    }
    for (const m of text.matchAll(/ชั้น(มัธยม|ประถม)ศึกษาปีที่\s*([1-6๑-๖])(?![0-9๐-๙])/g)) {
      const code = `${m[1] === "มัธยม" ? "ม" : "ป"}.${toArabic(m[2]!)}`;
      items.push({ item_type: "grade_level", item_key: code, extracted: { code }, locator: loc, confidence: 0.9 });
    }
    for (const m of text.matchAll(/แผนการเรียน\s*([^\n]{2,60})/g)) {
      const name = clean(m[1]!).replace(/[\s:：]+$/, "");
      items.push({ item_type: "study_program", item_key: name, extracted: { name_th: name }, locator: loc, excerpt: clean(m[0]), confidence: 0.5,
        flags: [{ code: "VERIFY_NAME", message_th: "ชื่อแผนการเรียนอ่านจากข้อความ — ตรวจกับต้นฉบับ" }] });
    }

    const lines = text.split("\n");
    const timeContext = /เวลาเรียน|ชั่วโมง/.test(text);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line === REPAIRED_MARK) continue;
      const gb = GRADE_BLOCK.exec(line);
      if (gb) { grade = { code: gb[1]!, from: "layout" }; continue; }
      if (line === END_GRADES) { grade = null; continue; }
      const areaM = /กลุ่มสาระการเรียนรู้\s*([ก-๙ ]{2,40}?)(?:\s{2,}|$)/.exec(line);
      if (areaM) {
        const found = LEARNING_AREAS.find((n) => clean(areaM[1]!).startsWith(n.replace(/\s+/g, " ")) || clean(areaM[1]!).replace(/\s/g, "").startsWith(n.replace(/\s/g, "")));
        if (found) area = found;
      }
      const s = STANDARD_LINE.exec(line);
      if (s) {
        const code = `${s[1]} ${toArabic(s[2]!)}.${toArabic(s[3]!)}`;
        const cont = continuation(lines, i, 6);
        grade = null;
        const statement = clean(`${s[4] ?? ""} ${cont.text}`);
        std = { code, area_code: s[1]! };
        items.push({
          item_type: "standard", item_key: code, locator: loc, excerpt: clean(lines.slice(i, i + 1 + cont.used).join(" ")).slice(0, 600),
          extracted: { code, area_code: s[1], area_name: area, statement: statement || null },
          confidence: statement && area ? 0.85 : 0.5, insufficient: !statement,
          flags: [...pageFlags, ...(area ? [] : [{ code: "NO_AREA", message_th: "ไม่พบชื่อกลุ่มสาระก่อนมาตรฐานนี้ — ระบุจากต้นฉบับ" }])],
        });
        continue;
      }
      const ind = INDICATOR_LINE.exec(line);
      if (ind) {
        const stdCode = ind[1] ? `${ind[1]} ${toArabic(ind[2]!)}.${toArabic(ind[3]!)}` : (std as { code: string } | null)?.code ?? null;
        const grade = `${ind[4]}.${toArabic(ind[5]!.replace(/\s/g, ""))}`;
        const number = toArabic(ind[6]!);
        const cont = continuation(lines, i);
        const statement = clean(`${ind[7] ?? ""} ${cont.text}`);
        const full = stdCode ? `${stdCode} ${grade}/${number}` : `${grade}/${number}`;
        const flags: Flag[] = [...pageFlags];
        if (!stdCode) flags.push({ code: "NO_STANDARD", message_th: "ไม่พบมาตรฐานที่กำกับตัวชี้วัดนี้ — ระบุจากต้นฉบับ" });
        if (!statement) flags.push({ code: "NO_STATEMENT", message_th: "ข้อมูลไม่พอ — ไม่พบข้อความตัวชี้วัด" });
        items.push({
          item_type: "indicator", item_key: full, locator: loc, excerpt: clean(lines.slice(i, i + 1 + cont.used).join(" ")).slice(0, 600),
          extracted: { full_code: full, standard_code: stdCode, grade, number, statement: statement || null },
          confidence: stdCode && statement ? (ind[1] ? 0.85 : 0.7) : 0.3, insufficient: !statement || !stdCode, flags,
        });
        i += cont.used;
        continue;
      }
      // ตารางแถวละชั้น: “ม.๑ ๑. …” → ตั้งชั้นจากต้นแถว
      const gr = std ? GRADE_ROW.exec(line) : null;
      if (gr) {
        grade = { code: `${gr[1]}.${toArabic(gr[2]!)}${gr[3] ? `-${toArabic(gr[3])}` : ""}`, from: "row" };
        if (!gr[4]) continue;
      }
      const nm = grade ? (gr && gr[4] ? [line, gr[4], gr[5] ?? ""] : NUMBERED.exec(line)) : null;
      if (nm && grade) {
        const stdCode = (std as { code: string } | null)?.code ?? null;
        const number = toArabic(nm[1]!);
        const cont = continuation(lines, i, 30);
        const statement = clean(`${nm[2] ?? ""} ${cont.text}`);
        const full = stdCode ? `${stdCode} ${grade.code}/${number}` : `${grade.code}/${number}`;
        const flags: Flag[] = [...pageFlags, grade.from === "layout"
          ? { code: "GRADE_FROM_LAYOUT", message_th: "ระบุชั้นจากตำแหน่งคอลัมน์ในตาราง — ตรวจกับต้นฉบับ" }
          : { code: "GRADE_FROM_ROW", message_th: "ระบุชั้นจากต้นแถวของตาราง — ตรวจกับต้นฉบับ" }];
        if (!stdCode) flags.push({ code: "NO_STANDARD", message_th: "ไม่พบมาตรฐานที่กำกับตัวชี้วัดนี้ — ระบุจากต้นฉบับ" });
        if (!statement) flags.push({ code: "NO_STATEMENT", message_th: "ข้อมูลไม่พอ — ไม่พบข้อความตัวชี้วัด" });
        items.push({
          item_type: "indicator", item_key: full, locator: loc, excerpt: clean([nm[0], ...lines.slice(i + 1, i + 1 + cont.used)].join(" ")).slice(0, 600),
          extracted: { full_code: full, standard_code: stdCode, grade: grade.code, number, statement: statement || null },
          confidence: stdCode && statement ? 0.7 : 0.3, insufficient: !statement || !stdCode, flags,
        });
        i += cont.used;
        continue;
      }
      const h = parseCourseHeader(lines, i);
      if (h) {
        const flags: Flag[] = [...pageFlags];
        if (h.code_nonstandard) flags.push({ code: "CODE_NONSTANDARD", message_th: "รหัสวิชาไม่ใช่รูปแบบอักษร + 5 หลัก — เก็บตามที่พิมพ์ ตรวจกับต้นฉบับ" });
        if (h.credits == null) flags.push({ code: "NO_CREDITS", message_th: "ไม่พบหน่วยกิตในหัวรายวิชา" });
        if (h.hours == null) flags.push({ code: "NO_HOURS", message_th: "ไม่พบชั่วโมงเรียนในหัวรายวิชา" });
        items.push({ item_type: "subject", item_key: h.code, locator: loc, excerpt: clean(lines.slice(i, i + 2).join(" ")).slice(0, 600),
          extracted: { ...h }, confidence: h.credits != null && h.hours != null ? 0.85 : 0.6, flags });
        continue;
      }
      // โครงสร้างเวลาเรียน: ชื่อกลุ่มสาระ/รายการ ตามด้วยตัวเลข ≥ 2 ค่า (ไม่ทราบว่าแต่ละคอลัมน์คือชั้นใดจนกว่าคนเทียบหัวตาราง)
      // ใช้ตัวแยก token แบบเส้นตรง — regex เดิมแบบ (?:[ก-๙]+\s?){1,6} backtrack ทวีคูณกับบรรทัดไทยไม่มีวรรค (CPU เกินกำหนดของ Edge Function)
      const t = timeStructureLine(line);
      if (t && timeContext) {
        if (LEARNING_AREAS.some((n) => t.label.replace(/\s/g, "").includes(n.replace(/\s/g, ""))) || /รวม|กิจกรรม/.test(t.label)) {
          items.push({ item_type: "time_structure", item_key: `${t.label} @${loc}`, locator: loc, excerpt: clean(line).slice(0, 600),
            extracted: { label: t.label, numbers: t.numbers, raw: clean(line) }, confidence: 0.4,
            flags: [{ code: "COLUMNS_UNMAPPED", message_th: "ยังไม่ทราบว่าแต่ละตัวเลขเป็นชั้น/ภาคเรียนใด — เทียบหัวตารางในต้นฉบับก่อนยอมรับ" }] });
        }
      }
    }
  });

  if (years.size) meta.curriculum_years = [...years.keys()].map(Number);
  const cls = classify(pages.map((t, i) => ({ locator: pdfLoc(i + 1), text: t ?? "", early: i < 3 })));
  return { doc_class: cls.doc_class, class_confidence: cls.confidence, class_evidence: cls.evidence, meta: { ...meta, class_scores: cls.scores }, page_count: pages.length, items };
}

// ---------------------------------------------------------------- Excel
const SUBJECT_CODE = /^(?:[ก-ฮ]\s?\d{5,6}|IS\s?\d)$/i;
const FULL_INDICATOR = /^([ก-ฮ])\s?(\d+)\.(\d+)\s+([มป])\.\s?([1-6](?:-[1-6])?)\s*\/\s*(\d{1,3})$/;
const colLetter = (n: number) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export function analyzeXlsxCells(cells: SheetCell[]): AnalysisResult {
  const items: AnalysisItem[] = [];
  const sheets = [...new Set(cells.map((c) => c.sheet))];
  for (const sheet of sheets) {
    const sc = cells.filter((c) => c.sheet === sheet && c.text.trim());
    const rows = new Map<number, SheetCell[]>();
    for (const c of sc) rows.set(c.row, [...(rows.get(c.row) ?? []), c]);
    // หัวตาราง: แถวที่มี “รหัส” และ (หน่วยกิต | ชั่วโมง | เวลา)
    let header: { row: number; cols: Record<string, number> } | null = null;
    for (const [r, rc] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const find = (re: RegExp) => rc.find((c) => re.test(c.text))?.col;
      const code = find(/รหัส/);
      if (code && (find(/หน่วยกิต/) || find(/ชั่วโมง|เวลา/))) {
        header = { row: r, cols: { code, name_th: find(/ชื่อ|รายวิชา/) ?? 0, credits: find(/หน่วยกิต/) ?? 0, hours: find(/ชั่วโมง|เวลา/) ?? 0 } };
        break;
      }
    }
    for (const [r, rc] of rows) {
      const byCol = new Map(rc.map((c) => [c.col, c.text.trim()]));
      for (const c of rc) {
        const t = c.text.trim();
        const fi = FULL_INDICATOR.exec(t);
        if (fi) {
          const next = byCol.get(c.col + 1) ?? "";
          const full = `${fi[1]} ${fi[2]}.${fi[3]} ${fi[4]}.${fi[5]}/${fi[6]}`;
          items.push({ item_type: "indicator", item_key: full, locator: `sheet:${sheet}!${c.address}${next ? `:${colLetter(c.col + 1)}${r}` : ""}`,
            extracted: { full_code: full, standard_code: `${fi[1]} ${fi[2]}.${fi[3]}`, grade: `${fi[4]}.${fi[5]}`, number: fi[6], statement: next || null },
            confidence: next ? 0.8 : 0.3, insufficient: !next, excerpt: `${t} ${next}`.trim() });
        }
      }
      if (!header || r <= header.row) continue;
      const code = byCol.get(header.cols.code!) ?? "";
      if (!SUBJECT_CODE.test(code)) continue;
      const maxCol = Math.max(...Object.values(header.cols));
      const minCol = Math.min(...Object.values(header.cols).filter((x) => x > 0));
      const get = (k: string) => (header!.cols[k] ? byCol.get(header!.cols[k]!) ?? null : null);
      const credits = get("credits");
      const hours = get("hours");
      const flags: Flag[] = [];
      if (!header.cols.credits || credits == null) flags.push({ code: "NO_CREDITS", message_th: "ไม่พบหน่วยกิตในแถวนี้" });
      if (!header.cols.hours || hours == null) flags.push({ code: "NO_HOURS", message_th: "ไม่พบชั่วโมงเรียนในแถวนี้" });
      items.push({ item_type: "subject", item_key: code.replace(/\s/g, ""), locator: `sheet:${sheet}!${colLetter(minCol)}${r}:${colLetter(maxCol)}${r}`,
        extracted: { code: code.replace(/\s/g, ""), code_printed: code, name_th: get("name_th"), credits: credits != null && !isNaN(Number(credits)) ? Number(credits) : credits,
          hours: hours != null && !isNaN(Number(hours)) ? Number(hours) : hours, sheet },
        confidence: flags.length ? 0.6 : 0.85, flags, excerpt: [...byCol.values()].join(" | ").slice(0, 600) });
    }
  }
  const parts = sheets.map((s) => ({ locator: `sheet:${s}!A1`, text: cells.filter((c) => c.sheet === s).map((c) => c.text).join("\n"), early: true }));
  const cls = classify(parts);
  return { doc_class: cls.doc_class, class_confidence: cls.confidence, class_evidence: cls.evidence, meta: { sheets, class_scores: cls.scores }, page_count: null, items };
}

/** สรุปจำนวนตามชนิด (แสดงในหน้าเว็บ) */
export const countByType = (items: AnalysisItem[]) =>
  items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.item_type]: (a[i.item_type] ?? 0) + 1 }), {});
