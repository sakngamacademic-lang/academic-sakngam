/**
 * อ่านสมุดงานโครงสร้างหลักสูตร (แบบไฟล์ “โครงสร้าง2569.xlsx”) เป็นข้อมูลตามต้นฉบับ พร้อมชีต/เซลล์อ้างอิง
 * รูปแบบ: แต่ละภาคเรียนเป็นบล็อก 4 คอลัมน์ [ตัวกำกับ, รหัส, ชื่อวิชา, “หน่วยกิต(ชั่วโมง)”] · แถว 1 ชื่อโครงสร้าง/แผน · แถว 2 ชั้น/ห้อง · แถว 3 ภาคเรียน
 * ไม่แก้ค่าใด ๆ — เก็บข้อความดิบไว้คู่กับค่าที่แยกได้ · ห้องเรียนอ่านจากข้อความ “ชั้นมัธยมศึกษาปีที่ X/Y” เท่านั้น (ไม่เดา)
 */
import { colName, type XlsxSheet } from "../../lib/xlsx-read";

export interface WbSubject { code: string; codeRaw: string; name: string; credits: number | null; hours: number | null; raw: string; section: "basic" | "additional"; cell: string }
export interface WbActivity { name: string; hours: number | null; cell: string }
export interface WbBlock {
  sheet: string; col: string; title: string; plan: string | null; grade: string | null; room: string | null; term: number;
  subjects: WbSubject[]; activities: WbActivity[];
  declared: { basic: string | null; additional: string | null; activities: number | null; total: number | null; cells: Record<string, string> };
}

const TH = "๐๑๒๓๔๕๖๗๘๙";
export const thaiDigits = (s: string) => s.replace(/[๐-๙]/g, (d) => String(TH.indexOf(d)));
/** รหัสวิชาเทียบได้ (เลขไทย→อารบิก ตัดช่องว่าง ตัวพิมพ์ใหญ่) — ค่าดิบยังเก็บไว้ */
export const normSubjectCode = (s: string) => thaiDigits(s).replace(/\s+/g, "").toUpperCase();
const CODE = /^(?:[ก-ฮ]{1,2}\s*[\d๐-๙]{5}|IS\s*\d)$/i;
const CREDIT = /^\s*([\d.]+)\s*\(\s*([\d.]+)\s*\)\s*$/;
const num = (s: string | undefined) => { const n = Number(thaiDigits(String(s ?? "")).replace(/[^\d.]/g, "")); return s != null && s !== "" && Number.isFinite(n) ? n : null; };

function coveringValue(sh: XlsxSheet, row: number, col: number): string {
  const direct = sh.cells.get(`${colName(col)}${row}`);
  if (direct) return direct;
  const m = sh.merged.find((x) => row >= x.r1 && row <= x.r2 && col >= x.c1 && col <= x.c2);
  return m ? sh.cells.get(`${colName(m.c1)}${m.r1}`) ?? "" : "";
}

export function parseStructureWorkbook(sheets: XlsxSheet[]): { blocks: WbBlock[]; skipped: string[] } {
  const blocks: WbBlock[] = [];
  const skipped: string[] = [];
  for (const sh of sheets) {
    const termCols = [...sh.cells].filter(([k, v]) => /^[A-Z]+3$/.test(k) && /ภาคเรียนที่\s*([12])/.test(v));
    if (!termCols.length) { skipped.push(sh.name); continue; }
    const maxRow = Math.max(...[...sh.cells.keys()].map((k) => Number(/\d+$/.exec(k)![0])));
    for (const [k, v] of termCols) {
      const col = [...k.replace(/\d+$/, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const term = Number(/ภาคเรียนที่\s*([12])/.exec(v)![1]);
      const title = coveringValue(sh, 1, col).replace(/\s+/g, " ").trim();
      const head = coveringValue(sh, 2, col).replace(/\s+/g, " ").trim();
      const gm = /ชั้นมัธยมศึกษาปีที่\s*(\d)(?:\s*\/\s*(\d+))?/.exec(thaiDigits(head));
      const planText = /\(([^)]+)\)/.exec(title)?.[1] ?? /(แผน\S.*)$/.exec(head)?.[1] ?? null;
      const b: WbBlock = { sheet: sh.name, col: colName(col), title, plan: planText?.trim() ?? null, grade: gm ? `M${gm[1]}` : null, room: gm?.[2] ? `${gm[1]}/${gm[2]}` : null, term,
        subjects: [], activities: [], declared: { basic: null, additional: null, activities: null, total: null, cells: {} } };
      let section: "basic" | "additional" | "activities" | null = null;
      for (let r = 4; r <= maxRow; r++) {
        const at = (dc: number) => sh.cells.get(`${colName(col + dc)}${r}`);
        const marker = (at(0) ?? "").trim(), code = (at(1) ?? "").trim(), name = (at(2) ?? "").trim(), cr = (at(3) ?? "").trim();
        const cellOf = (dc: number) => `${colName(col + dc)}${r}`;
        if (/^รายวิชาพื้นฐาน/.test(marker)) { section = "basic"; b.declared.basic = cr || null; b.declared.cells.basic = cellOf(3); continue; }
        if (/^รายวิชาเพิ่มเติม/.test(marker)) { section = "additional"; b.declared.additional = cr || null; b.declared.cells.additional = cellOf(3); continue; }
        if (/^กิจกรรมพัฒนาผู้เรียน/.test(marker)) { section = "activities"; b.declared.activities = num(cr); b.declared.cells.activities = cellOf(3); continue; }
        if (/^รวมเวลาเรียนทั้งสิ้น/.test(marker)) { b.declared.total = num(cr); b.declared.cells.total = cellOf(3); break; }
        if ((section === "basic" || section === "additional") && CODE.test(code)) {
          const m = CREDIT.exec(thaiDigits(cr));
          b.subjects.push({ code: normSubjectCode(code), codeRaw: code, name, credits: m ? Number(m[1]) : null, hours: m ? Number(m[2]) : null, raw: cr, section, cell: cellOf(1) });
        } else if (section === "activities" && (code || name)) {
          const label = (code || name).replace(/^[§\-\s]+/, "").trim();
          if (label) b.activities.push({ name: label, hours: num(cr), cell: cellOf(1) });
        }
      }
      if (b.subjects.length) blocks.push(b);
    }
  }
  return { blocks, skipped };
}

/** ตรวจภายในบล็อก: หน่วยกิตไม่สัมพันธ์กับชั่วโมง (เกณฑ์ 1 นก. = 40 ชม. ตามที่ไฟล์ใช้) และยอดรวมที่ประกาศ ≠ ผลรวมรายวิชา */
export function blockChecks(b: WbBlock, hoursPerCredit = 40) {
  const notes: { cell: string; text: string }[] = [];
  for (const s of b.subjects) {
    if (s.credits == null || s.hours == null) notes.push({ cell: s.cell, text: `${s.codeRaw}: อ่านหน่วยกิต/ชั่วโมงไม่ได้ (“${s.raw}”)` });
    else if (Math.abs(s.credits * hoursPerCredit - s.hours) > 0.01) notes.push({ cell: s.cell, text: `${s.codeRaw}: ${s.raw} — หน่วยกิตไม่สัมพันธ์กับชั่วโมง (${s.credits} นก. ควรเป็น ${s.credits * hoursPerCredit} ชม.)` });
    if (s.codeRaw !== s.code && /[๐-๙]/.test(s.codeRaw)) notes.push({ cell: s.cell, text: `${s.codeRaw}: รหัสมีเลขไทยปน (เทียบเป็น ${s.code})` });
  }
  const sum = (sec: "basic" | "additional") => b.subjects.filter((s) => s.section === sec).reduce((a, s) => ({ cr: a.cr + (s.credits ?? 0), h: a.h + (s.hours ?? 0) }), { cr: 0, h: 0 });
  for (const sec of ["basic", "additional"] as const) {
    const d = CREDIT.exec(thaiDigits(b.declared[sec] ?? ""));
    const s = sum(sec);
    if (d && (Math.abs(Number(d[1]) - s.cr) > 0.01 || Math.abs(Number(d[2]) - s.h) > 0.01))
      notes.push({ cell: b.declared.cells[sec] ?? "", text: `ยอด${sec === "basic" ? "รายวิชาพื้นฐาน" : "รายวิชาเพิ่มเติม"}ที่ระบุ ${b.declared[sec]} ≠ ผลรวมรายวิชา ${s.cr}(${s.h})` });
  }
  const actSum = b.activities.reduce((a, x) => a + (x.hours ?? 0), 0);
  const all = sum("basic").h + sum("additional").h + (b.declared.activities ?? 0);
  if (b.declared.total != null && Math.abs(b.declared.total - all) > 0.01) notes.push({ cell: b.declared.cells.total ?? "", text: `รวมเวลาเรียนที่ระบุ ${b.declared.total} ≠ ผลรวม ${all} (วิชา + กิจกรรม ${b.declared.activities ?? "-"})` });
  if (b.declared.activities != null && actSum && Math.abs(actSum - b.declared.activities) > 0.01) notes.push({ cell: b.declared.cells.activities ?? "", text: `ชั่วโมงกิจกรรมที่ระบุ ${b.declared.activities} ≠ ผลรวมรายการกิจกรรม ${actSum}` });
  return notes;
}
