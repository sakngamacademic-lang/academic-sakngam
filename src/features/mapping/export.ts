/** ส่งออกผล Mapping — Excel (xlsx-lite เดิม) และ PDF (พิมพ์จากเบราว์เซอร์) · ข้อมูลจากผลเปรียบเทียบจริงเท่านั้น */
import { downloadXlsx, type Cell } from "@/lib/xlsx-lite";
import { RESULT_LABEL, type CompareOutput, type RefIndicator, type SchoolSubject } from "./match";
import type { UnitMeta } from "./api";

export interface ReportContext { schoolCurriculum: string; reference: string; referenceOfficial: boolean; scope: string; generatedAt: Date }
const LEVEL = ["ยืนยันโดยฝ่ายวิชาการ", "ระดับ 1 รหัสตรง", "ระดับ 2 หลักฐานจากเนื้อหา", "ระดับ 3 ระบบเสนอ"];
const VERIFY = { verified: "ยืนยันแล้ว", rejected: "ปฏิเสธแล้ว", unverified: "ยังไม่ยืนยัน" } as const;

function rowsA(out: CompareOutput, subjects: SchoolSubject[], inds: RefIndicator[], meta: Map<string, UnitMeta>): Cell[][] {
  const by = new Map(inds.map((i) => [i.key, i]));
  const rows: Cell[][] = [];
  for (const s of subjects) for (const u of s.units) {
    const ps = out.pairs.filter((p) => p.subjectId === s.id && p.unitId === u.id);
    const unit = u.kind === "unit" ? u.title : "คำอธิบายรายวิชา (ยังไม่มีหน่วย)";
    const hrs = meta.get(u.id)?.hours ?? null;
    if (!ps.length) { rows.push([s.code, s.name, s.grade, unit, hrs, "", "", "", u.parts.length ? RESULT_LABEL.not_found : RESULT_LABEL.insufficient, "", "", "", ""]); continue; }
    for (const p of ps) {
      const i = by.get(p.indicatorKey);
      rows.push([s.code, s.name, s.grade, unit, hrs, i?.standardCode, i?.code, i?.statement, RESULT_LABEL[p.result], LEVEL[p.level], p.reasons.join(" | "),
        [p.schoolSnippet, `อ้างอิงโรงเรียน: ${u.locator ?? s.locator ?? "-"}`, `อ้างอิงแกนกลาง: ${i?.locator ?? "-"}`].filter(Boolean).join(" | "), VERIFY[p.verification]]);
    }
  }
  return rows;
}
function rowsB(out: CompareOutput, subjects: SchoolSubject[]): Cell[][] {
  const sb = new Map(subjects.map((s) => [s.id, s]));
  return out.indicatorRows.map((r) => {
    const sup = [...new Set(r.pairs.map((p) => { const s = sb.get(p.subjectId); const u = s?.units.find((x) => x.id === p.unitId); return `${s?.code} ${u?.kind === "unit" ? u.title : "คำอธิบายรายวิชา"}`; }))].join("; ");
    return [r.indicator.standardCode, r.indicator.code, r.indicator.grade, r.indicator.statement, sup || "-", RESULT_LABEL[r.result], r.best ? r.best.reasons.join(" | ") : r.note,
      r.indicator.locator ?? "-", r.best ? VERIFY[r.best.verification] : "-"];
  });
}
const HEAD_A = ["รหัสวิชา", "รายวิชา", "ชั้น", "หน่วยการเรียนรู้", "ชั่วโมง", "มาตรฐาน", "รหัสตัวชี้วัด", "ข้อความตัวชี้วัด", "ผลเทียบ", "ระดับการจับคู่", "เหตุผล", "หลักฐาน", "สถานะการยืนยัน"];
const HEAD_B = ["มาตรฐาน", "รหัสตัวชี้วัด", "ชั้น", "ข้อความตัวชี้วัด", "รายวิชา/หน่วยที่รองรับ", "ผลเทียบ", "เหตุผล", "อ้างอิงแกนกลาง", "สถานะการยืนยัน"];
const draftNote = (ctx: ReportContext, out: CompareOutput) => !ctx.referenceOfficial || out.pairs.some((p) => p.verification === "unverified");

export function exportExcel(ctx: ReportContext, out: CompareOutput, subjects: SchoolSubject[], inds: RefIndicator[], meta: Map<string, UnitMeta>) {
  const info: Cell[][] = [
    ["รายงานเปรียบเทียบหลักสูตร (Curriculum Mapping)"],
    ...(draftNote(ctx, out) ? [["ผลเปรียบเทียบเบื้องต้น — ยังไม่รับรอง"]] : []),
    ["หลักสูตรสถานศึกษา", ctx.schoolCurriculum], ["หลักสูตรแกนกลางที่อ้างอิง", ctx.reference], ["สถานะฐานอ้างอิง", ctx.referenceOfficial ? "รับรองแล้ว" : "ผลอ่านอัตโนมัติ ยังไม่รับรอง"],
    ["ขอบเขต", ctx.scope], ["วันที่ออกรายงาน", ctx.generatedAt.toLocaleString("th-TH")], [],
    ["สรุป (จำนวนตัวชี้วัด)"], ...Object.entries(out.counts).map(([k, v]) => [RESULT_LABEL[k as keyof typeof RESULT_LABEL], v]),
  ];
  downloadXlsx(`mapping-${ctx.scope.replace(/[\\/:*?"<>| ·]+/g, "_")}.xlsx`, [
    { name: "ข้อมูลรายงาน", rows: info },
    { name: "โรงเรียน→แกนกลาง", rows: [HEAD_A, ...rowsA(out, subjects, inds, meta)] },
    { name: "แกนกลาง→โรงเรียน", rows: [HEAD_B, ...rowsB(out, subjects)] },
  ]);
}

const esc = (v: Cell) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const table = (head: string[], rows: Cell[][]) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

export function exportPdf(ctx: ReportContext, out: CompareOutput, subjects: SchoolSubject[], inds: RefIndicator[], meta: Map<string, UnitMeta>) {
  const w = window.open("", "_blank");
  if (!w) { alert("เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง"); return; }
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Curriculum Mapping — ${esc(ctx.scope)}</title>
<style>@page{size:A4 landscape;margin:12mm}body{font-family:"IBM Plex Sans Thai","Sarabun",Tahoma,sans-serif;font-size:10.5pt;line-height:1.55;color:#17233b}
h1{font-size:16pt;margin:0 0 4px}h2{font-size:13pt;margin:18px 0 6px;color:#173b78}.draft{border:2px solid #b45309;color:#b45309;padding:4px 8px;display:inline-block;font-weight:700;margin:6px 0}
dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:6px 0}dt{color:#64748b}table{width:100%;border-collapse:collapse;font-size:9pt}th,td{border:1px solid #cbd5e1;padding:3px 5px;vertical-align:top;text-align:left}th{background:#eef2f8}tr{break-inside:avoid}</style></head><body>
<h1>รายงานเปรียบเทียบหลักสูตร (Curriculum Mapping)</h1>${draftNote(ctx, out) ? `<div class="draft">ผลเปรียบเทียบเบื้องต้น — ยังไม่รับรอง</div>` : ""}
<dl><dt>หลักสูตรสถานศึกษา</dt><dd>${esc(ctx.schoolCurriculum)}</dd><dt>หลักสูตรแกนกลางที่อ้างอิง</dt><dd>${esc(ctx.reference)} (${ctx.referenceOfficial ? "รับรองแล้ว" : "ยังไม่รับรอง"})</dd>
<dt>ขอบเขต</dt><dd>${esc(ctx.scope)}</dd><dt>วันที่ออกรายงาน</dt><dd>${esc(ctx.generatedAt.toLocaleString("th-TH"))}</dd>
<dt>สรุป</dt><dd>${Object.entries(out.counts).map(([k, v]) => `${RESULT_LABEL[k as keyof typeof RESULT_LABEL]} ${v}`).join(" · ")} (ตัวชี้วัด)</dd></dl>
<h2>มุมมอง A — หลักสูตรโรงเรียน → แกนกลาง</h2>${table(HEAD_A, rowsA(out, subjects, inds, meta))}
<h2>มุมมอง B — หลักสูตรแกนกลาง → โรงเรียน</h2>${table(HEAD_B, rowsB(out, subjects))}
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}
