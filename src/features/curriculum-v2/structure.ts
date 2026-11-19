/** มุมมองโครงสร้าง (ชั้น → แผน → ภาค) จากแหล่งข้อมูลที่เลือก — ใช้ร่วมกันทั้งหน้าเว็บและการส่งออก */
import { areaOf, planKey, type V2Description } from "./model";
import type { ConsolidatedRow } from "./consolidate";
import type { Dataset, StoredSource } from "./store";

export const GRADES = ["M1", "M2", "M3", "M4", "M5", "M6"] as const;
export interface PlanInfo { key: string; name: string; rooms: string[] }
export const placedRows = (s: StoredSource | undefined) => (s?.rows ?? []).filter((r) => r.grade && r.plan && r.term);
export function plansOf(s: StoredSource | undefined, grade: string): PlanInfo[] {
  const m = new Map<string, PlanInfo>();
  for (const r of placedRows(s)) if (r.grade === grade) {
    const k = planKey(r.plan); const p = m.get(k) ?? { key: k, name: r.plan!, rooms: [] };
    if (r.room && !p.rooms.includes(r.room)) p.rooms.push(r.room);
    m.set(k, p);
  }
  return [...m.values()];
}
export function rowsOf(s: StoredSource | undefined, grade: string, plan: string, term: 0 | 1 | 2): ConsolidatedRow[] {
  return placedRows(s).filter((r) => r.grade === grade && planKey(r.plan) === plan && (!term || r.term === term))
    .sort((a, b) => (a.term! - b.term!) || sectionOrder(a.section) - sectionOrder(b.section) || a.code.localeCompare(b.code, "th"));
}
const sectionOrder = (s: string | null) => (s === "basic" ? 0 : s === "additional" ? 1 : 2);
export function activitiesOf(s: StoredSource | undefined, grade: string, plan: string, term: 0 | 1 | 2) {
  const decl = (s?.declared ?? []).filter((d) => d.grade === grade && planKey(d.plan) === plan && (!term || d.term === term));
  return { activities: decl.reduce((n, d) => n + (d.activities ?? 0), 0), declaredTotal: decl.every((d) => d.total != null) && decl.length ? decl.reduce((n, d) => n + (d.total ?? 0), 0) : null };
}
export interface Totals { basicH: number; basicC: number; addH: number; addC: number; otherH: number; otherC: number; hours: number; credits: number }
export function totalsOf(rows: ConsolidatedRow[]): Totals {
  const t: Totals = { basicH: 0, basicC: 0, addH: 0, addC: 0, otherH: 0, otherC: 0, hours: 0, credits: 0 };
  for (const r of rows) {
    const h = r.hours ?? 0, c = r.credits ?? 0;
    if (r.section === "basic") { t.basicH += h; t.basicC += c; } else if (r.section === "additional") { t.addH += h; t.addC += c; } else { t.otherH += h; t.otherC += c; }
    t.hours += h; t.credits += c;
  }
  return t;
}
/** คำอธิบายรายวิชาของปีนั้น (จากทุกไฟล์ในปีเดียวกัน — แสดงพร้อมแหล่งอ้างอิง) */
export function descriptionIndex(d: Dataset | undefined): Map<string, V2Description> {
  const m = new Map<string, V2Description>();
  for (const s of d?.sources ?? []) for (const x of s.descriptions) if (!m.has(x.code)) m.set(x.code, x);
  return m;
}
export const sectionLabel = (s: string | null) => (s === "basic" ? "พื้นฐาน" : s === "additional" ? "เพิ่มเติม" : "ไม่ระบุหมวด");
export const fmtN = (n: number | null | undefined) => (n == null ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
export { areaOf };
