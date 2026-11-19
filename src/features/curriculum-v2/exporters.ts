/**
 * ส่งออก Excel / Word / PDF — ใช้ข้อมูลชุดเดียวกับที่แสดงบนหน้าเว็บ (ไม่สร้างตัวเลขหรือรายวิชาเอง)
 */
import { downloadXlsx, type Cell, type Sheet } from "../../lib/xlsx-lite";
import { areaOf, gradeLabel, refText } from "./model";
import { CHANGE_LABEL, secLabel, type CompareResult } from "./compare";
import { activitiesOf, fmtN, GRADES, plansOf, rowsOf, sectionLabel, totalsOf } from "./structure";
import type { Dataset, StoredSource } from "./store";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const stamp = () => new Date().toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });

// ---------------------------------------------------------------- ตาราง (ใช้ร่วมทุกรูปแบบ)
export interface Table { title: string; head: string[]; rows: Cell[][] }
export function structureTables(d: Dataset, s: StoredSource): Table[] {
  const out: Table[] = [];
  for (const g of GRADES) for (const p of plansOf(s, g)) for (const t of [1, 2] as const) {
    const rows = rowsOf(s, g, p.key, t); if (!rows.length) continue;
    const tot = totalsOf(rows), act = activitiesOf(s, g, p.key, t);
    out.push({ title: `${d.label || d.year} · ${gradeLabel(g)} · ${p.name} · ภาคเรียนที่ ${t}`, head: ["รหัสวิชา", "ชื่อวิชา", "กลุ่มสาระ", "ประเภท", "ชั่วโมง", "หน่วยกิต", "อ้างอิง"],
      rows: [...rows.map((r) => [r.code, r.name, areaOf(r.code), sectionLabel(r.section), r.hours, r.credits, refText(r.ref)] as Cell[]),
        ["", "รวมรายวิชาพื้นฐาน", "", "", tot.basicH, tot.basicC, ""], ["", "รวมรายวิชาเพิ่มเติม", "", "", tot.addH, tot.addC, ""],
        ...(tot.otherH ? [["", "รวมไม่ระบุหมวด", "", "", tot.otherH, tot.otherC, ""] as Cell[]] : []),
        ["", "กิจกรรมพัฒนาผู้เรียน (ตามไฟล์)", "", "", act.activities || null, null, ""],
        ["", "รวมเวลาเรียน (รายวิชา + กิจกรรม)", "", "", tot.hours + act.activities, tot.credits, act.declaredTotal != null ? `ไฟล์ระบุ ${act.declaredTotal}` : ""]] });
  }
  return out;
}
export function registryTable(d: Dataset, s: StoredSource): Table {
  const rows = [...s.rows].sort((a, b) => (a.grade ?? "").localeCompare(b.grade ?? "") || a.code.localeCompare(b.code, "th"));
  return { title: `ทะเบียนรายวิชา ${d.label || d.year}`, head: ["ชั้น", "แผนการเรียน", "ภาค", "รหัสวิชา", "ชื่อวิชา", "กลุ่มสาระ", "ประเภท", "ชั่วโมง", "หน่วยกิต", "อ้างอิง"],
    rows: rows.map((r) => [gradeLabel(r.grade), r.plan ?? "ไม่ระบุ", r.term ?? "ไม่ระบุ", r.code, r.name, areaOf(r.code), sectionLabel(r.section), r.hours, r.credits, r.refs.map(refText).join(" | ")]) };
}
export function compareTables(yearA: string, yearB: string, c: CompareResult): Table[] {
  const sideTxt = (x: { code: string; name: string; hours: number | null; credits: number | null; section: string | null } | null) => (x ? `${x.code} ${x.name} · ${secLabel(x.section)} ${fmtN(x.credits)} นก./${fmtN(x.hours)} ชม.` : "—");
  const counts = new Map<string, number>(); for (const x of c.changes) counts.set(CHANGE_LABEL[x.kind], (counts.get(CHANGE_LABEL[x.kind]) ?? 0) + 1);
  return [
    { title: `สรุปการเปลี่ยนแปลง ${yearA} → ${yearB}`, head: ["ประเภทการเปลี่ยนแปลง", "จำนวน"], rows: [...counts] },
    { title: `ตารางเปรียบเทียบรายวิชา ${yearA} → ${yearB}`, head: ["ชั้น", "กลุ่มสาระ", "การเปลี่ยนแปลง", yearA, yearB, "รายละเอียด", `อ้างอิง ${yearA}`, `อ้างอิง ${yearB}`],
      rows: c.changes.map((x) => [gradeLabel(x.grade), x.area, CHANGE_LABEL[x.kind], sideTxt(x.a), sideTxt(x.b), x.detail, (x.a?.refs ?? []).map(refText).slice(0, 3).join(" | "), (x.b?.refs ?? []).map(refText).slice(0, 3).join(" | ")]) },
    { title: `แผนการเรียน ${yearA} → ${yearB}`, head: ["ชั้น", "ผล", yearA, yearB, "รายละเอียด"],
      rows: c.plans.map((p) => [gradeLabel(p.grade), { same: "ตรงกัน", plan_added: "แผนเพิ่ม", plan_removed: "แผนลด", plan_review: "รอตรวจทาน" }[p.kind], p.a ?? "—", p.b ?? "—", p.detail]) },
    { title: `ชั่วโมงและหน่วยกิตรวม ${yearA} → ${yearB}`, head: ["ชั้น", "แผน", "ช่วง", `ชม. ${yearA}`, `ชม. ${yearB}`, `นก. ${yearA}`, `นก. ${yearB}`],
      rows: c.totals.map((t) => [gradeLabel(t.grade), t.plan, t.term ? `ภาค ${t.term}` : "ทั้งปี", t.a?.hours ?? null, t.b?.hours ?? null, t.a?.credits ?? null, t.b?.credits ?? null]) },
  ];
}
export function hoursSummaryTable(d: Dataset, s: StoredSource): Table {
  const rows: Cell[][] = [];
  for (const g of GRADES) for (const p of plansOf(s, g)) {
    const t1 = totalsOf(rowsOf(s, g, p.key, 1)), t2 = totalsOf(rowsOf(s, g, p.key, 2)), a1 = activitiesOf(s, g, p.key, 1), a2 = activitiesOf(s, g, p.key, 2);
    rows.push([gradeLabel(g), p.name, t1.credits, t1.hours + a1.activities, t2.credits, t2.hours + a2.activities, t1.credits + t2.credits, t1.hours + a1.activities + t2.hours + a2.activities]);
  }
  return { title: `สรุปชั่วโมงและหน่วยกิต ${d.label || d.year}`, head: ["ชั้น", "แผนการเรียน", "นก. ภาค 1", "ชม. ภาค 1", "นก. ภาค 2", "ชม. ภาค 2", "นก. ทั้งปี", "ชม. ทั้งปี"], rows };
}

// ---------------------------------------------------------------- รูปแบบไฟล์
const safe = (s: string) => s.replace(/[\\/:*?"<>|·]/g, "_");
export function toExcel(fileName: string, tables: Table[], source: string) {
  const sheets: Sheet[] = tables.map((t, i) => ({ name: (i + 1 + " " + t.title).slice(0, 31), rows: [[t.title], [`แหล่งข้อมูล: ${source} · สร้างเมื่อ ${stamp()}`], [], t.head, ...t.rows] }));
  downloadXlsx(safe(fileName) + ".xlsx", sheets);
}
function html(title: string, tables: Table[], source: string) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:"TH SarabunPSK","Sarabun","IBM Plex Sans Thai",Tahoma,sans-serif;font-size:14pt;color:#17233b}h1{font-size:19pt;margin:0 0 4px;color:#173b78}h2{font-size:15pt;margin:14px 0 4px;color:#173b78;page-break-after:avoid}table{width:100%;border-collapse:collapse;font-size:12pt;page-break-inside:auto}th,td{border:1px solid #94a3b8;padding:2px 5px;text-align:left;vertical-align:top}th{background:#eef2f8}td.n{text-align:right}.m{font-size:11pt;color:#64748b}</style></head><body><h1>${esc(title)}</h1><p class="m">แหล่งข้อมูล: ${esc(source)} · สร้างเมื่อ ${esc(stamp())}</p>
${tables.map((t) => `<h2>${esc(t.title)}</h2><table><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${t.rows.map((r) => `<tr>${r.map((v) => `<td${typeof v === "number" ? ' class="n"' : ""}>${esc(typeof v === "number" ? fmtN(v) : v)}</td>`).join("")}</tr>`).join("")}</table>`).join("")}</body></html>`;
}
export function toWord(fileName: string, title: string, tables: Table[], source: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + html(title, tables, source)], { type: "application/msword" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: safe(fileName) + ".doc" });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toPdf(title: string, tables: Table[], source: string) {
  const w = window.open("", "_blank"); if (!w) return false;
  w.document.open(); w.document.write(html(title, tables, source).replace("</body>", "<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body>")); w.document.close();
  return true;
}
