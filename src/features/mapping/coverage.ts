/**
 * Coverage ของหลักสูตรสถานศึกษาเทียบฐานตัวชี้วัดอ้างอิง (ไม่มี dependency นอก match · ทดสอบ scripts/coverage.test.ts)
 * สถานะต่อตัวชี้วัด (ระบบเสนอ — ไม่รับรองอัตโนมัติ):
 *  code     = ตรงกันตามรหัส: เอกสารโรงเรียนระบุรหัสนี้ (ผลการเรียนรู้/โครงสร้างรายวิชา/ตารางสาระท้องถิ่น)
 *  content  = มีหลักฐานเนื้อหา: ข้อความรายวิชาสอดคล้องสูง (ไม่มีการระบุรหัส)
 *  suggest  = เสนอให้ตรวจ: สอดคล้องบางส่วน
 *  none     = ยังไม่พบ
 * ร้อยละแสดงเฉพาะเมื่อฐานอ้างอิงผ่านการยืนยันว่าครบ (official && complete) — นอกนั้นเป็น “ผลเบื้องต้น”
 */
import { gradeMatches, normCode, type CompareOutput, type Pair, type RefIndicator } from "./match";

export type CovStatus = "code" | "content" | "suggest" | "none";
export const COV_LABEL: Record<CovStatus, string> = { code: "ตรงกันตามรหัส", content: "มีหลักฐานเนื้อหา", suggest: "เสนอให้ตรวจ", none: "ยังไม่พบ" };
export interface LocalCodeRef { key: string; codeNorm: string | null; table: string; row: string; localText: string }
export interface IndicatorCoverage { indicator: RefIndicator; status: CovStatus; pairs: Pair[]; local: LocalCodeRef[]; verified: boolean }
export interface CellCoverage { area: string; grade: string; total: number; counts: Record<CovStatus, number>; percent: number | null }

const RANK: Record<CovStatus, number> = { code: 3, content: 2, suggest: 1, none: 0 };

export function coverage(indicators: RefIndicator[], out: CompareOutput, local: LocalCodeRef[], referenceComplete: boolean) {
  const rows: IndicatorCoverage[] = indicators.map((ind) => {
    const pairs = out.pairs.filter((p) => p.indicatorKey === ind.key);
    const loc = local.filter((l) => l.codeNorm === ind.key);
    let status: CovStatus = "none";
    const bump = (s: CovStatus) => { if (RANK[s] > RANK[status]) status = s; };
    if (loc.length) bump("code");
    for (const p of pairs) {
      if (p.decision?.status === "rejected") continue;
      if (p.origin === "declared" || p.origin === "confirmed") bump(p.level === 1 || p.origin === "confirmed" ? "code" : "content");
      else if (p.level === 2) bump("content");
      else bump("suggest");
    }
    return { indicator: ind, status, pairs, local: loc, verified: pairs.some((p) => p.verification === "verified") };
  });
  const cells = new Map<string, CellCoverage>();
  for (const r of rows) {
    const k = `${r.indicator.areaCode}|${r.indicator.grade}`;
    const c = cells.get(k) ?? cells.set(k, { area: r.indicator.areaCode, grade: r.indicator.grade, total: 0, counts: { code: 0, content: 0, suggest: 0, none: 0 }, percent: null }).get(k)!;
    c.total++; c.counts[r.status]++;
  }
  // ร้อยละ = (ตรงตามรหัส + มีหลักฐานเนื้อหา) ÷ ทั้งหมด — เฉพาะฐานที่ยืนยันว่าครบ
  if (referenceComplete) for (const c of cells.values()) c.percent = c.total ? Math.round(((c.counts.code + c.counts.content) / c.total) * 100) : null;
  return { rows, cells: [...cells.values()].sort((a, b) => a.area.localeCompare(b.area, "th") || a.grade.localeCompare(b.grade)) };
}

/** แปลงรหัสในตารางสาระท้องถิ่นเป็นรหัสมาตรฐาน (ไม่แก้รหัส — รูปแบบไม่ชัดเจนได้ null) */
export const localRef = (it: { key: string; table: string; row: string; localText: string; parsed: { norm: string } | null }): LocalCodeRef =>
  ({ key: it.key, codeNorm: it.parsed ? normCode(it.parsed.norm) : null, table: it.table, row: it.row, localText: it.localText });

/** ตัวชี้วัดที่อยู่ในชั้นของรายวิชาใดบ้าง (ใช้กรองขอบเขต) */
export const indicatorInGrades = (ind: RefIndicator, grades: string[]) => grades.some((g) => gradeMatches(g, ind.grade) === true);
