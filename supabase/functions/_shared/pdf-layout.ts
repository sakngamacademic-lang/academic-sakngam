/**
 * แปลงชิ้นข้อความของ pdf.js (getTextContent().items) เป็นข้อความรายหน้า — ไม่มี dependency (ทดสอบด้วยชิ้นข้อความสังเคราะห์ได้)
 *
 * 1) ซ่อมการถอดอักขระไทยจากฟอนต์ “ต่อฟอนต์” ด้วยกฎที่ตรวจสอบได้ (ไม่เดาคำ):
 *    - PUA U+F700–F71A = รูปเลื่อนตำแหน่งของสระ/วรรณยุกต์ในฟอนต์ไทย Windows → อักขระมาตรฐาน (ตารางคงที่)
 *    - U+FFFD ที่อยู่หน้า [วรรณยุกต์]?[า|ำ] = นิคหิตที่ฟอนต์ไม่มีแผนที่ Unicode → รวมกับสระอาเป็น “ำ”
 *    - ฟอนต์ที่แมปรูปสระอาเป็น U+0E33 (หลักฐาน: มี FFFD+ำ หรือ ำ เดี่ยวจำนวนมากโดยไม่มี “า” เลย) → ำ เดี่ยวในฟอนต์นั้น = “า”
 *      ฟอนต์อื่นไม่แตะ · ไม่มีหลักฐานพอ = ไม่แก้
 * 2) ตารางตัวชี้วัดแบบ “คอลัมน์ละชั้น” (หัวตาราง ป. ๑ … ป. ๖ / ม. ๔-๖): จัดข้อความตามพิกัด x ของหัวคอลัมน์
 *    แล้วเขียนเป็นบล็อก “@@GRADE ป.1@@ … @@END_GRADES@@” ให้ตัวสกัดรู้ชั้นของแต่ละข้อ (ข้อความเรียงบรรทัดของ pdf.js บอกไม่ได้)
 * ถ้าซ่อมอักขระในหน้านั้น จะขึ้นต้นด้วยบรรทัด “@@TEXT_REPAIRED@@” ให้ตัวสกัดติดธงให้ผู้ตรวจเทียบภาพต้นฉบับ
 */

export interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
  fontName?: string;
}

export const REPAIRED_MARK = "@@TEXT_REPAIRED@@";
export const gradeMark = (g: string) => `@@GRADE ${g}@@`;
export const END_GRADES = "@@END_GRADES@@";

/** ตาราง PUA ของฟอนต์ไทย (Microsoft/Apple) → อักขระมาตรฐาน */
const PUA: Record<number, string> = {
  0xf700: "ฐ", 0xf701: "ิ", 0xf702: "ี", 0xf703: "ึ", 0xf704: "ื",
  0xf705: "่", 0xf706: "้", 0xf707: "๊", 0xf708: "๋", 0xf709: "์",
  0xf70a: "่", 0xf70b: "้", 0xf70c: "๊", 0xf70d: "๋", 0xf70e: "์",
  0xf70f: "ญ", 0xf710: "ั", 0xf711: "ํ", 0xf712: "็", 0xf713: "่",
  0xf714: "้", 0xf715: "๊", 0xf716: "๋", 0xf717: "์", 0xf718: "ุ",
  0xf719: "ู", 0xf71a: "ฺ",
};
const PUA_RE = /[-]/g;
const NIKHAHIT_AM = /�([่-๋]?)[าำ]/g;
const AM_SENTINEL = "\u0000";

/** ตัดสินต่อฟอนต์: ฟอนต์นี้แมปรูปสระอาเป็น “ำ” หรือไม่ (จากข้อความทั้งหน้าในฟอนต์นั้น) */
export function fontsWithAaAsAm(items: PdfTextItem[]): Set<string> {
  const byFont = new Map<string, string>();
  for (const it of items) if (it.str) byFont.set(it.fontName ?? "", (byFont.get(it.fontName ?? "") ?? "") + it.str);
  const out = new Set<string>();
  for (const [font, raw] of byFont) {
    const text = raw.replace(PUA_RE, (c) => PUA[c.charCodeAt(0)]!);
    const fffdAm = (text.match(/�[่-๋]?ำ/g) ?? []).length;
    const rest = text.replace(NIKHAHIT_AM, "");
    const loneAa = (rest.match(/า/g) ?? []).length;
    const loneAm = (rest.match(/ำ/g) ?? []).length;
    // ฟอนต์ภาษาไทยปกติต้องมี “า” — ไม่มีเลยแต่มี ำ เดี่ยวมาก หรือมีนิคหิต+ำ = สระอาถูกแมปเป็น ำ
    if (loneAa === 0 && (fffdAm > 0 || loneAm >= 5)) out.add(font);
  }
  return out;
}

export function repairThaiText(s: string, aaAsAm: boolean): string {
  let t = s.replace(PUA_RE, (c) => PUA[c.charCodeAt(0)]!);
  t = t.replace(NIKHAHIT_AM, (_m, tone: string) => `${tone}${AM_SENTINEL}`);
  if (aaAsAm) t = t.replace(/ำ/g, "า");
  t = t.replace(/\u0000/g, "ำ");
  // “ำา” ไม่มีในอักขรวิธีไทย = ฟอนต์แยกสระอำเป็นนิคหิต+สระอาแล้วถอดซ้ำ → “ำ”
  return t.replace(/ำา/g, "ำ");
}

const GRADE_LABEL = /([ปม])\.\s*([0-9๐-๙])(?:\s*-\s*([0-9๐-๙]))?/g;
const TH_DIGIT = (s: string) => s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
const REGION_END = /^\s*(มาตรฐาน|สาระที่|ตัวชี้วัด|สาระการเรียนรู้แกนกลาง)/;

interface Pos { s: string; x: number; y: number; w: number; eol: boolean }
interface Row { y: number; items: Pos[]; text: string }

function rowsOf(items: Pos[]): Row[] {
  const rows: Row[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const r = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (r) r.items.push(it);
    else rows.push({ y: it.y, items: [it], text: "" });
  }
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.text = joinLine(r.items);
  }
  return rows.sort((a, b) => b.y - a.y);
}
function joinLine(items: Pos[]) {
  let out = "";
  let end = -Infinity;
  for (const it of items) {
    if (out && it.x - end > 2 && !/\s$/.test(out) && !/^\s/.test(it.s)) out += " ";
    out += it.s;
    end = it.x + it.w;
  }
  return out.replace(/\s+$/, "");
}

/** หัวตารางชั้น: แถวที่มีแต่ป้ายชั้น (≥ 2 ป้าย หรือ 1 ป้ายใต้คำว่า “ตัวชี้วัด”) → คืนป้ายพร้อมพิกัด x */
function gradeHeader(row: Row, above: Row[]): { grade: string; x: number }[] | null {
  const labels: { grade: string; x: number }[] = [];
  for (const it of row.items) {
    const t = it.s.trim();
    if (!t) continue;
    GRADE_LABEL.lastIndex = 0;
    const m = GRADE_LABEL.exec(t);
    if (m && m.index === 0 && m[0].length === t.length) {
      labels.push({ grade: `${m[1]}.${TH_DIGIT(m[2]!)}${m[3] ? `-${TH_DIGIT(m[3])}` : ""}`, x: it.x });
    } else if (labels.length && /^[0-9๐-๙](\s*-\s*[0-9๐-๙])?$/.test(t) && /\.\s*$/.test(row.items[row.items.indexOf(it) - 1]?.s ?? "")) {
      // ป้ายถูกแยกเป็น “ป.” + “๑”
      const last = labels.pop()!;
      labels.push({ grade: `${last.grade}${TH_DIGIT(t.replace(/\s/g, ""))}`, x: last.x });
    } else if (/^[ปม]\.$/.test(t)) {
      labels.push({ grade: `${t}`, x: it.x });
    } else {
      return null; // มีข้อความอื่นในแถว = ไม่ใช่หัวตารางชั้น
    }
  }
  const ok = labels.filter((l) => /^[ปม]\.[1-6](-[1-6])?$/.test(l.grade));
  if (ok.length !== labels.length || !ok.length) return null;
  if (ok.length === 1 && !above.slice(-3).some((r) => /ตัวชี้วัด/.test(r.text))) return null;
  return ok;
}

/** ข้อความของหน้า (ซ่อมอักขระ + จัดตารางตามคอลัมน์ชั้น) */
export function layoutPageText(rawItems: PdfTextItem[]): string {
  const items = rawItems.filter((it) => it.str != null);
  const aaFonts = fontsWithAaAsAm(items);
  let repaired = false;
  const fixed = items.map((it) => {
    const s = repairThaiText(it.str!, aaFonts.has(it.fontName ?? ""));
    if (s !== it.str) repaired = true;
    return { ...it, str: s };
  });
  const plain = () => fixed.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("");
  const withPos = fixed.every((it) => Array.isArray(it.transform) && it.transform.length >= 6);
  let body = plain();
  if (withPos) {
    const pos: Pos[] = fixed.map((it) => ({ s: it.str!, x: it.transform![4]!, y: it.transform![5]!, w: it.width ?? 0, eol: !!it.hasEOL }));
    const rows = rowsOf(pos.filter((p) => p.s.trim() || p.eol));
    const headers: { idx: number; labels: { grade: string; x: number }[] }[] = [];
    rows.forEach((r, i) => {
      const h = gradeHeader(r, rows.slice(0, i));
      if (h) headers.push({ idx: i, labels: h });
    });
    if (headers.length) {
      const out: string[] = [];
      let i = 0;
      for (let h = 0; h < headers.length; h++) {
        const { idx, labels } = headers[h]!;
        for (; i < idx; i++) out.push(rows[i]!.text);
        i = idx + 1;
        const stop = headers[h + 1]?.idx ?? rows.length;
        let end = i;
        while (end < stop && !REGION_END.test(rows[end]!.text)) end++;
        const bounds = labels.map((l, k) => (k === 0 ? -Infinity : (labels[k - 1]!.x + l.x) / 2));
        const cols: Pos[][] = labels.map(() => []);
        for (const r of rows.slice(i, end)) {
          if (/^\s*[0-9๐-๙]{1,4}\s*$/.test(r.text)) continue; // เลขหน้า ไม่ใช่เนื้อหาในช่อง
          for (const it of r.items) {
            let k = labels.length - 1;
            while (k > 0 && it.x < bounds[k]!) k--;
            cols[k]!.push({ ...it, y: r.y });
          }
        }
        labels.forEach((l, k) => {
          out.push(gradeMark(l.grade));
          for (const r of rowsOf(cols[k]!)) out.push(r.text);
        });
        out.push(END_GRADES);
        i = end;
      }
      for (; i < rows.length; i++) out.push(rows[i]!.text);
      body = out.join("\n");
    }
  }
  return repaired ? `${REPAIRED_MARK}\n${body}` : body;
}
