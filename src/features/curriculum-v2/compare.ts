/**
 * เปรียบเทียบหลักสูตรสองปี (เช่น 2568 → 2569) จากข้อมูลที่นำเข้า
 * จับคู่ด้วย ชั้น + รหัส → ชั้น + กลุ่มสาระ + ชื่อเดียวกัน (เปลี่ยนรหัส) → ชื่อใกล้เคียง + ตำแหน่งแผน/ภาค (รอตรวจทาน)
 * ไม่ใช้รหัสอย่างเดียว และกรณีไม่แน่ใจไม่สรุปว่าเพิ่มหรือลบ
 */
import { areaOf, nameKey, planKey, type Ref } from "./model";
import type { ConsolidatedRow } from "./consolidate";

export type ChangeKind = "added" | "removed" | "code_changed" | "renamed" | "hours_changed" | "credits_changed" | "type_changed" | "term_moved" | "plan_moved" | "review";
export const CHANGE_LABEL: Record<ChangeKind, string> = {
  added: "รายวิชาเพิ่มใหม่", removed: "ไม่มีในปีถัดไป", code_changed: "เปลี่ยนรหัสวิชา", renamed: "เปลี่ยนชื่อวิชา", hours_changed: "เปลี่ยนชั่วโมงเรียน",
  credits_changed: "เปลี่ยนหน่วยกิต", type_changed: "เปลี่ยนประเภทวิชา", term_moved: "ย้ายภาคเรียน", plan_moved: "ย้ายแผนการเรียน", review: "รอตรวจทาน",
};
export interface Side { code: string; name: string; section: string | null; credits: number | null; hours: number | null; places: string[]; refs: Ref[] }
export interface Change { kind: ChangeKind; grade: string; area: string; a: Side | null; b: Side | null; detail: string }
export interface PlanChange { grade: string; kind: "plan_added" | "plan_removed" | "plan_review" | "same"; a: string | null; b: string | null; detail: string }
export interface TotalRow { grade: string; plan: string; term: 0 | 1 | 2; a: { hours: number; credits: number } | null; b: { hours: number; credits: number } | null }
export interface CompareResult { changes: Change[]; plans: PlanChange[]; totals: TotalRow[] }

/** ความคล้ายของข้อความ (Dice bigram) */
export function similarity(x: string, y: string): number {
  const a = nameKey(x), b = nameKey(y);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const ga = grams(a), gb = grams(b); let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}

type Placed = ConsolidatedRow & { grade: string; plan: string; term: 1 | 2 };
const placed = (rows: ConsolidatedRow[]) => rows.filter((r): r is Placed => !!r.grade && !!r.plan && !!r.term);
interface Subj { grade: string; code: string; rows: Placed[] }
function subjects(rows: Placed[]) {
  const m = new Map<string, Subj>();
  for (const r of rows) { const k = `${r.grade}|${r.code}`; (m.get(k) ?? m.set(k, { grade: r.grade, code: r.code, rows: [] }).get(k)!).rows.push(r); }
  return m;
}
const place = (r: Placed, planName: (g: string, k: string) => string) => `${planName(r.grade, planKey(r.plan))} ภ.${r.term}`;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export function compareCurricula(rowsA: ConsolidatedRow[], rowsB: ConsolidatedRow[]): CompareResult {
  const A = placed(rowsA), B = placed(rowsB);
  // ---------------- แผนการเรียน (จับคู่ด้วยชื่อมาตรฐาน · ใกล้เคียง = รอตรวจทาน)
  const planNames = new Map<string, string>();
  for (const r of [...A, ...B]) planNames.set(`${r.grade}|${planKey(r.plan)}`, r.plan);
  const planName = (g: string, k: string) => planNames.get(`${g}|${k}`) ?? k;
  const plans: PlanChange[] = [];
  const planMap = new Map<string, string>(); // `${grade}|${keyA}` → keyB (จับคู่ได้แน่นอน)
  const grades = uniq([...A, ...B].map((r) => r.grade)).sort();
  for (const g of grades) {
    const pa = uniq(A.filter((r) => r.grade === g).map((r) => planKey(r.plan))), pb = uniq(B.filter((r) => r.grade === g).map((r) => planKey(r.plan)));
    const restB = new Set(pb);
    for (const k of pa) {
      if (restB.has(k)) { plans.push({ grade: g, kind: "same", a: planName(g, k), b: planName(g, k), detail: "" }); planMap.set(`${g}|${k}`, k); restB.delete(k); continue; }
      const best = [...restB].map((kb) => ({ kb, s: similarity(k, kb) })).sort((x, y) => y.s - x.s)[0];
      if (best && best.s >= 0.5) { plans.push({ grade: g, kind: "plan_review", a: planName(g, k), b: planName(g, best.kb), detail: `ชื่อแผนใกล้เคียง (${Math.round(best.s * 100)}%) — อาจเป็นแผนเดียวกันที่เปลี่ยนชื่อ` }); restB.delete(best.kb); continue; }
      plans.push({ grade: g, kind: "plan_removed", a: planName(g, k), b: null, detail: "ไม่มีแผนนี้ในปีถัดไป" });
    }
    for (const kb of restB) plans.push({ grade: g, kind: "plan_added", a: null, b: planName(g, kb), detail: "แผนการเรียนเพิ่มใหม่" });
  }
  const samePlan = (g: string, ka: string, kb: string) => planMap.get(`${g}|${ka}`) === kb;

  // ---------------- รายวิชา
  const SA = subjects(A), SB = subjects(B);
  const side = (s: Subj): Side => ({ code: s.code, name: s.rows[0]!.name, section: s.rows[0]!.section, credits: s.rows[0]!.credits, hours: s.rows[0]!.hours,
    places: uniq(s.rows.map((r) => place(r, planName))), refs: s.rows.flatMap((r) => r.refs).slice(0, 6) });
  const changes: Change[] = [];
  const pairs: [Subj, Subj, "code" | "name"][] = [];
  const leftA = new Map(SA), leftB = new Map(SB);
  for (const [k, sa] of SA) { const sb = SB.get(k); if (!sb) continue;
    const sim = similarity(sa.rows[0]!.name, sb.rows[0]!.name);
    if (sim < 0.35) { changes.push({ kind: "review", grade: sa.grade, area: areaOf(sa.code), a: side(sa), b: side(sb), detail: `รหัสเดียวกันแต่ชื่อต่างกันมาก (${Math.round(sim * 100)}%) — อาจเป็นคนละวิชา` }); }
    else pairs.push([sa, sb, "code"]);
    leftA.delete(k); leftB.delete(k);
  }
  // ชื่อเดียวกัน ชั้น/กลุ่มสาระเดียวกัน แต่รหัสต่าง → เปลี่ยนรหัส
  for (const [ka, sa] of [...leftA]) {
    const cand = [...leftB].filter(([, sb]) => sb.grade === sa.grade && areaOf(sb.code) === areaOf(sa.code) && nameKey(sb.rows[0]!.name) === nameKey(sa.rows[0]!.name));
    if (cand.length === 1) { const [kb, sb] = cand[0]!; pairs.push([sa, sb, "name"]); leftA.delete(ka); leftB.delete(kb); }
  }
  // ชื่อใกล้เคียง + ตำแหน่งแผน/ภาคเดียวกัน → รอตรวจทาน (ไม่สรุปว่าเพิ่ม/ลบ)
  for (const [ka, sa] of [...leftA]) {
    const posA = new Set(sa.rows.map((r) => `${planKey(r.plan)}|${r.term}`));
    const cand = [...leftB].map(([kb, sb]) => ({ kb, sb, s: similarity(sa.rows[0]!.name, sb.rows[0]!.name), pos: sb.rows.some((r) => [...posA].some((p) => { const [pk, t] = p.split("|"); return samePlan(sa.grade, pk!, planKey(r.plan)) && String(r.term) === t; })) }))
      .filter((c) => c.sb.grade === sa.grade && areaOf(c.sb.code) === areaOf(sa.code) && (c.s >= 0.7 || (c.s >= 0.5 && c.pos))).sort((x, y) => y.s - x.s);
    if (cand.length) { const c = cand[0]!; changes.push({ kind: "review", grade: sa.grade, area: areaOf(sa.code), a: side(sa), b: side(c.sb), detail: `ชื่อใกล้เคียง ${Math.round(c.s * 100)}%${c.pos ? " และอยู่ตำแหน่งแผน/ภาคเดียวกัน" : ""} — อาจเป็นวิชาเดิมที่เปลี่ยนรหัส/ชื่อ` }); leftA.delete(ka); leftB.delete(c.kb); }
  }
  for (const [, sa] of leftA) changes.push({ kind: "removed", grade: sa.grade, area: areaOf(sa.code), a: side(sa), b: null, detail: "ไม่พบในปีถัดไป (ทั้งรหัสและชื่อ)" });
  for (const [, sb] of leftB) changes.push({ kind: "added", grade: sb.grade, area: areaOf(sb.code), a: null, b: side(sb), detail: "ไม่พบในปีก่อน (ทั้งรหัสและชื่อ)" });

  for (const [sa, sb, how] of pairs) {
    const a = side(sa), b = side(sb), base = { grade: sa.grade, area: areaOf(sb.code), a, b };
    if (how === "name") changes.push({ ...base, kind: "code_changed", detail: `${sa.code} → ${sb.code} (ชื่อ ชั้น และกลุ่มสาระเดียวกัน)` });
    if (nameKey(a.name) !== nameKey(b.name)) changes.push({ ...base, kind: "renamed", detail: `“${a.name}” → “${b.name}”` });
    // ค่าเทียบรายตำแหน่ง (แผนเดียวกัน) — ถ้าไม่มีตำแหน่งร่วม เทียบค่าแรก
    const common = sa.rows.flatMap((ra) => sb.rows.filter((rb) => samePlan(sa.grade, planKey(ra.plan), planKey(rb.plan)) && ra.term === rb.term).map((rb) => [ra, rb] as const));
    const cmp = common.length ? common : [[sa.rows[0]!, sb.rows[0]!] as const];
    const hrs = uniq(cmp.filter(([x, y]) => x.hours !== y.hours).map(([x, y]) => `${x.hours ?? "-"} → ${y.hours ?? "-"} ชม.`));
    if (hrs.length) changes.push({ ...base, kind: "hours_changed", detail: hrs.join(", ") });
    const crs = uniq(cmp.filter(([x, y]) => x.credits !== y.credits).map(([x, y]) => `${x.credits ?? "-"} → ${y.credits ?? "-"} นก.`));
    if (crs.length) changes.push({ ...base, kind: "credits_changed", detail: crs.join(", ") });
    const secs = uniq(cmp.filter(([x, y]) => x.section !== y.section).map(([x, y]) => `${secLabel(x.section)} → ${secLabel(y.section)}`));
    if (secs.length) changes.push({ ...base, kind: "type_changed", detail: secs.join(", ") });
    // ย้ายภาค: แผนเดียวกันแต่ภาคต่าง · ย้ายแผน: แผนที่มีทั้งสองปีแต่วิชาอยู่ต่างแผน
    const plansA = uniq(sa.rows.map((r) => planKey(r.plan))), plansB = uniq(sb.rows.map((r) => planKey(r.plan)));
    const moved: string[] = [];
    for (const pa of plansA) for (const pb of plansB) if (samePlan(sa.grade, pa, pb)) {
      const ta = uniq(sa.rows.filter((r) => planKey(r.plan) === pa).map((r) => r.term)).sort(), tb = uniq(sb.rows.filter((r) => planKey(r.plan) === pb).map((r) => r.term)).sort();
      if (ta.join() !== tb.join()) moved.push(`${planName(sa.grade, pa)}: ภ.${ta.join(",")} → ภ.${tb.join(",")}`);
    }
    if (moved.length) changes.push({ ...base, kind: "term_moved", detail: moved.join(" · ") });
    const bothYears = (k: string, side_: "a" | "b") => side_ === "a" ? !!planMap.get(`${sa.grade}|${k}`) : [...planMap.values()].includes(k);
    const lostPlans = plansA.filter((pa) => bothYears(pa, "a") && !plansB.some((pb) => samePlan(sa.grade, pa, pb)));
    const newPlans = plansB.filter((pb) => bothYears(pb, "b") && !plansA.some((pa) => samePlan(sa.grade, pa, pb)));
    if (lostPlans.length || newPlans.length) changes.push({ ...base, kind: "plan_moved", detail: [lostPlans.length && `ไม่อยู่ใน: ${lostPlans.map((k) => planName(sa.grade, k)).join(", ")}`, newPlans.length && `เพิ่มใน: ${newPlans.map((k) => planName(sa.grade, k)).join(", ")}`].filter(Boolean).join(" · ") });
  }

  // ---------------- ยอดรวมต่อภาค / ต่อปี ต่อแผน
  const agg = (rows: Placed[]) => {
    const m = new Map<string, { hours: number; credits: number }>();
    for (const r of rows) for (const t of [r.term, 0] as const) {
      const k = `${r.grade}|${planKey(r.plan)}|${t}`; const v = m.get(k) ?? { hours: 0, credits: 0 };
      v.hours += r.hours ?? 0; v.credits += r.credits ?? 0; m.set(k, v);
    }
    return m;
  };
  const ta = agg(A), tb = agg(B);
  const totals: TotalRow[] = [];
  for (const pc of plans) {
    const ka = pc.a ? planKey(pc.a) : null, kb = pc.b ? planKey(pc.b) : null;
    for (const t of [1, 2, 0] as const) totals.push({ grade: pc.grade, plan: pc.b ?? pc.a ?? "", term: t, a: ka ? round(ta.get(`${pc.grade}|${ka}|${t}`)) : null, b: kb ? round(tb.get(`${pc.grade}|${kb}|${t}`)) : null });
  }
  const order: ChangeKind[] = ["review", "added", "removed", "code_changed", "renamed", "hours_changed", "credits_changed", "type_changed", "term_moved", "plan_moved"];
  changes.sort((x, y) => x.grade.localeCompare(y.grade) || order.indexOf(x.kind) - order.indexOf(y.kind) || (x.b?.code ?? x.a?.code ?? "").localeCompare(y.b?.code ?? y.a?.code ?? ""));
  return { changes, plans, totals };
}
const round = (v: { hours: number; credits: number } | undefined) => (v ? { hours: Math.round(v.hours * 100) / 100, credits: Math.round(v.credits * 100) / 100 } : null);
export const secLabel = (s: string | null) => (s === "basic" ? "พื้นฐาน" : s === "additional" ? "เพิ่มเติม" : "ไม่ระบุ");
