/**
 * เทียบบล็อกจากสมุดงานโครงสร้าง (ต้นฉบับที่โรงเรียนยืนยัน) กับทะเบียนรายวิชาในระบบ — อ่านอย่างเดียว ไม่แก้ข้อมูล
 * การจับคู่แผน: ใช้สัดส่วนรหัสวิชาที่ตรงกันในชั้น/ภาคเดียวกัน (ไม่เดาจากชื่อ) — ถ้าไม่ชัดเจนให้ระบุว่า “ต้องให้ฝ่ายวิชาการเลือก”
 */
import { normSubjectCode, type WbBlock } from "./structure-workbook";

export interface RegOffering { programId: string; programCode: string; programName: string; grade: string; term: number; code: string; name: string; credits: number | null; hours: number | null; kind: string }
export type DiffKind = "missing_in_db" | "extra_in_db" | "name" | "name_minor" | "credits" | "hours" | "total";
export interface DiffRow { kind: DiffKind; code: string; file: string; db: string; cell: string }
export interface BlockCompare {
  block: WbBlock; programCode: string | null; programName: string | null; score: number; ambiguous: boolean;
  candidates: { code: string; name: string; score: number }[];
  diffs: DiffRow[]; totals: { fileCredits: number; fileHours: number; dbCredits: number; dbHours: number };
}

const clean = (s: string) => s.replace(/\s+/g, "").replace(/[()（）]/g, "");
/** ต่างเฉพาะรูปแบบ (ช่องว่าง ขีด เลขไทย วงเล็บต่อท้าย เช่น “(English 1)”) */
const loose = (s: string) => normSubjectCode(s).replace(/\([^)]*\)/g, "").replace(/[\s\-–.]/g, "").replace(/เเ/g, "แ");
const fmt = (n: number | null) => (n == null ? "-" : String(Number(n.toFixed(2))));

export function compareBlocks(blocks: WbBlock[], reg: RegOffering[]): BlockCompare[] {
  return blocks.map((b) => {
    const pool = reg.filter((o) => o.grade === b.grade && o.term === b.term);
    const byProg = new Map<string, RegOffering[]>();
    for (const o of pool) byProg.set(o.programId, [...(byProg.get(o.programId) ?? []), o]);
    const fileCodes = new Set(b.subjects.map((s) => s.code));
    const candidates = [...byProg.values()].map((rows) => {
      const db = new Set(rows.map((r) => normSubjectCode(r.code)));
      const inter = [...fileCodes].filter((c) => db.has(c)).length;
      return { id: rows[0]!.programId, code: rows[0]!.programCode, name: rows[0]!.programName, score: inter / new Set([...fileCodes, ...db]).size };
    }).sort((x, y) => y.score - x.score);
    const best = candidates[0];
    const ambiguous = !best || best.score < 0.5 || (candidates[1] != null && best.score - candidates[1].score < 0.05);
    const rows = best ? byProg.get(best.id)! : [];
    const dbBy = new Map(rows.map((r) => [normSubjectCode(r.code), r]));
    const diffs: DiffRow[] = [];
    for (const s of b.subjects) {
      const d = dbBy.get(s.code);
      if (!d) { diffs.push({ kind: "missing_in_db", code: s.codeRaw, file: `${s.name} ${s.raw}`, db: "-", cell: s.cell }); continue; }
      if (clean(d.name) !== clean(s.name)) diffs.push({ kind: loose(d.name) === loose(s.name) ? "name_minor" : "name", code: s.codeRaw, file: s.name, db: d.name, cell: s.cell });
      if (s.credits != null && d.credits != null && Math.abs(s.credits - d.credits) > 0.01) diffs.push({ kind: "credits", code: s.codeRaw, file: fmt(s.credits), db: fmt(d.credits), cell: s.cell });
      if (s.hours != null && d.hours != null && Math.abs(s.hours - d.hours) > 0.01) diffs.push({ kind: "hours", code: s.codeRaw, file: fmt(s.hours), db: fmt(d.hours), cell: s.cell });
    }
    for (const [c, d] of dbBy) if (!fileCodes.has(c)) diffs.push({ kind: "extra_in_db", code: d.code, file: "-", db: `${d.name} ${fmt(d.credits)}(${fmt(d.hours)})`, cell: "" });
    const fileCredits = b.subjects.reduce((a, s) => a + (s.credits ?? 0), 0), fileHours = b.subjects.reduce((a, s) => a + (s.hours ?? 0), 0);
    const dbCredits = rows.reduce((a, r) => a + (r.credits ?? 0), 0), dbHours = rows.reduce((a, r) => a + (r.hours ?? 0), 0);
    if (rows.length && (Math.abs(fileCredits - dbCredits) > 0.01 || Math.abs(fileHours - dbHours) > 0.01))
      diffs.push({ kind: "total", code: "รวมรายวิชา", file: `${fmt(fileCredits)}(${fmt(fileHours)})`, db: `${fmt(dbCredits)}(${fmt(dbHours)})`, cell: b.declared.cells.total ?? "" });
    return { block: b, programCode: best?.code ?? null, programName: best?.name ?? null, score: best?.score ?? 0, ambiguous,
      candidates: candidates.slice(0, 3).map(({ code, name, score }) => ({ code, name, score })), diffs, totals: { fileCredits, fileHours, dbCredits, dbHours } };
  });
}

export const DIFF_LABEL: Record<DiffKind, string> = {
  missing_in_db: "มีในไฟล์ ไม่มีในระบบ", extra_in_db: "มีในระบบ ไม่มีในไฟล์", name: "ชื่อวิชาต่างกัน", name_minor: "ชื่อต่างเฉพาะรูปแบบ",
  credits: "หน่วยกิตต่างกัน", hours: "ชั่วโมงต่างกัน", total: "ยอดรวมต่างกัน",
};

/** ข้อเสนอผูกห้อง: ใช้เฉพาะห้องที่ระบุในไฟล์ (เช่น “1/1”) และมีห้องนั้นในระบบ — ไม่สร้างหรือเดาเลขห้อง */
export function roomProposals(cmp: BlockCompare[], classrooms: { grade: string; room: number }[]) {
  const seen = new Map<string, { room: string; grade: string; sheet: string; cell: string; programCode: string | null; programName: string | null; existsInDb: boolean; ambiguous: boolean }>();
  for (const c of cmp) {
    const b = c.block;
    if (!b.room || !b.grade) continue;
    const key = `${b.room}|${c.programCode}`;
    if (seen.has(key)) continue;
    const n = Number(b.room.split("/")[1]);
    seen.set(key, { room: b.room, grade: b.grade, sheet: b.sheet, cell: `${b.col}2`, programCode: c.programCode, programName: c.programName,
      existsInDb: classrooms.some((x) => x.grade === b.grade && x.room === n), ambiguous: c.ambiguous });
  }
  return [...seen.values()];
}
