/**
 * แยกข้อความเกณฑ์ที่คัดลอก/ถอดจากแบบประเมินต้นฉบับ (PDF/ภาพ) เป็นเกณฑ์หลัก + องค์ประกอบย่อย พร้อมหน้าอ้างอิง
 * ไม่มี dependency · ไม่แต่งข้อความ: ใช้ข้อความตามที่วางทุกตัวอักษร (ตัดเฉพาะช่องว่างหัวท้าย)
 *
 * รูปแบบที่รองรับ (หนึ่งรายการต่อบรรทัด):
 *   หน้า 12            ← ตั้งเลขหน้า PDF ของบรรทัดถัดไป (หรือ [หน้า 12], p.12)
 *   ระดับ 5 ...        ← ระดับคุณภาพของรายการถัดไป
 *   1. ข้อความ / ข้อ 1 ข้อความ   ← เกณฑ์หลัก
 *   1.1 ข้อความ        ← องค์ประกอบย่อยของ 1
 *   (1) ข้อความ / - ข้อความ      ← ย่อยของรายการล่าสุด
 *   บรรทัดอื่น         ← ต่อท้ายข้อความของรายการล่าสุด
 */
export interface ParsedCriterion {
  code: string;
  parentCode: string | null;
  text: string;
  page: number | null;
  level: string | null;
  line: number;
}
export interface ParseResult { items: ParsedCriterion[]; warnings: string[] }

const TH = "๐๑๒๓๔๕๖๗๘๙";
const digits = (s: string) => s.replace(/[๐-๙]/g, (d) => String(TH.indexOf(d)));
const PAGE = /^\[?\s*(?:หน้า|page|p\.)\s*(\d+)\s*\]?$/i;
const LEVEL = /^ระดับ(?:คุณภาพ)?\s*(\d)\b/;
const NUM = /^(?:ข้อ(?:ที่)?\s*)?(\d+(?:\.\d+)*)[.)]?\s+(.+)$/;
const SUB = /^(?:\((\d+)\)|[-•●])\s*(.+)$/;

export function parseCriteriaText(raw: string, prefix = ""): ParseResult {
  const items: ParsedCriterion[] = [];
  const warnings: string[] = [];
  let page: number | null = null;
  let level: string | null = null;
  const byCode = new Map<string, ParsedCriterion>();
  const lines = raw.split(/\r?\n/);
  lines.forEach((orig, i) => {
    const line = digits(orig).trim();
    if (!line) return;
    const pm = PAGE.exec(line);
    if (pm) { page = Number(pm[1]); return; }
    const lm = LEVEL.exec(line);
    if (lm) { level = lm[1]!; return; }
    const nm = NUM.exec(line);
    if (nm) {
      const code = `${prefix}${nm[1]}`;
      const parts = nm[1]!.split(".");
      const parentCode = parts.length > 1 ? `${prefix}${parts.slice(0, -1).join(".")}` : null;
      if (byCode.has(code)) warnings.push(`บรรทัด ${i + 1}: รหัส ${code} ซ้ำ — ตรวจต้นฉบับ`);
      if (parentCode && !byCode.has(parentCode)) warnings.push(`บรรทัด ${i + 1}: ไม่พบรายการแม่ ${parentCode} ของ ${code}`);
      const it = { code, parentCode, text: orig.trim().replace(/^(?:ข้อ(?:ที่)?\s*)?[0-9๐-๙]+(?:\.[0-9๐-๙]+)*[.)]?\s+/, ""), page, level, line: i + 1 };
      items.push(it); byCode.set(code, it);
      return;
    }
    const sm = SUB.exec(line);
    const last = items.at(-1);
    if (sm && last) {
      const base = last.parentCode && /\(\d+\)$/.test(last.code) ? last.parentCode : last.code;
      const n = items.filter((x) => x.parentCode === base && /\(\d+\)$/.test(x.code)).length + 1;
      const code = `${base}(${sm[1] ?? n})`;
      const it = { code, parentCode: base, text: orig.trim().replace(/^(?:\([0-9๐-๙]+\)|[-•●])\s*/, ""), page, level, line: i + 1 };
      items.push(it); byCode.set(code, it);
      return;
    }
    if (last) { last.text = `${last.text} ${orig.trim()}`; return; }
    warnings.push(`บรรทัด ${i + 1}: ไม่ทราบว่าเป็นของเกณฑ์ข้อใด — ใส่เลขข้อนำหน้า`);
  });
  for (const it of items) if (it.page == null) warnings.push(`${it.code}: ไม่มีเลขหน้าอ้างอิง — ยืนยันเกณฑ์ไม่ได้จนกว่าจะระบุหน้า`);
  if (!items.length) warnings.push("ไม่พบรายการเกณฑ์ — ตรวจรูปแบบเลขข้อ");
  return { items, warnings };
}
