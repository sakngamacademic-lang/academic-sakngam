/** รายงานตามหัวข้อเกณฑ์ระดับ 5 (Word .doc / PDF ผ่านการพิมพ์) — ทุกบรรทัดมีที่มา · ไม่ประกาศผลระดับคุณภาพ */
import type { CategoryData } from "./api";
import { CATEGORIES, criterionResult, EVIDENCE_LABEL, type Candidate, type Category } from "./classify";

const SECTIONS: { key: string; title: string; cat: Category | null }[] = [
  { key: "structure", title: "1. หลักสูตรสถานศึกษาและโครงสร้างเวลาเรียน", cat: "general" },
  { key: "vocational", title: "2. หลักสูตรสมรรถนะอาชีพ ม.ต้น/ม.ปลาย", cat: "vocational" },
  { key: "local", title: "3. หลักสูตรท้องถิ่นและแหล่งเรียนรู้", cat: "local" },
  { key: "activities", title: "4. กิจกรรมพัฒนาผู้เรียน", cat: "activities" },
  { key: "graduation", title: "5. เกณฑ์การจบการศึกษา", cat: null },
  { key: "community", title: "6. การมีส่วนร่วมของชุมชน", cat: null },
];
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const loc = (l: string | null) => (l ? l.replace(/pdf:(\d+)/g, "PDF หน้า $1") : "ไม่ระบุ");
const STATUS = { proposed: "รอตรวจความสอดคล้อง", confirmed: "ยืนยันแล้ว", rejected: "ไม่เกี่ยวข้อง" } as const;

export function buildReportHtml(versionLabel: string, d: CategoryData, cands: Candidate[]) {
  const label = (id: string) => cands.find((c) => c.targetId === id)?.label ?? "เอกสารหลักฐาน";
  const body = SECTIONS.map((s) => {
    const crit = d.criteria.filter((k) => k.report_section === s.key || (!k.report_section && s.cat && k.categories.includes(s.cat)));
    const items = s.cat ? cands.filter((c) => c.category === s.cat && c.status !== "rejected") : [];
    const confirmed = items.filter((c) => c.status === "confirmed");
    const critHtml = crit.length ? crit.map((k) => {
      const ev = d.evidence.filter((e) => e.criterion_id === k.id);
      return `<h3>${esc(k.code)} ${esc(k.title_th)} <small>(${k.status === "verified" ? "เกณฑ์ยืนยันแล้ว" : "เกณฑ์ร่าง"} · ต้นฉบับ ${esc(loc(k.source_locator))})</small></h3>
        ${k.requirement_th ? `<p>${esc(k.requirement_th)}</p>` : ""}<p><b>สถานะหลักฐาน:</b> ${EVIDENCE_LABEL[criterionResult(ev)]}</p>
        <table><tr><th>หลักฐาน</th><th>ผลตรวจ</th><th>ที่มา</th><th>หมายเหตุ</th></tr>${ev.map((e) => `<tr><td>${esc(label(e.target_id))}</td><td>${e.status === "confirmed" ? EVIDENCE_LABEL[e.result] : STATUS[e.status]}</td><td>${esc(loc(e.source_locator))}</td><td>${esc(e.note)}</td></tr>`).join("") || `<tr><td colspan="4">ยังไม่มีหลักฐานยืนยัน</td></tr>`}</table>`;
    }).join("") : `<p class="muted">ยังไม่มีเกณฑ์ในทะเบียนสำหรับหัวข้อนี้ (ต้องบันทึกจากแบบประเมินต้นฉบับ)</p>`;
    const itemsHtml = s.cat ? `<p><b>รายการจากหลักสูตร:</b> ${items.length} รายการ (ยืนยันแล้ว ${confirmed.length})</p>
      <table><tr><th>รายการ</th><th>รายละเอียด</th><th>สถานะการตรวจ</th><th>เหตุผล</th><th>ที่มา</th></tr>${items.slice(0, 120).map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.sub)}</td><td>${STATUS[c.status]}${c.strength === "keyword" && c.status === "proposed" ? " · พบคำสำคัญเท่านั้น" : ""}</td><td>${esc(c.stored?.reason ?? c.reasons.join(" / "))}</td><td>${esc(loc(c.locator))}</td></tr>`).join("")}</table>${items.length > 120 ? `<p class="muted">แสดง 120 จาก ${items.length} รายการ</p>` : ""}` : "";
    return `<h2>${esc(s.title)}</h2>${critHtml}${itemsHtml}`;
  }).join("");
  const unverified = d.criteria.some((k) => k.status !== "verified") || cands.some((c) => c.status === "proposed") || !d.criteria.length;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานประเภทหลักสูตรและเกณฑ์ประเมิน</title>
<style>@page{size:A4;margin:14mm}body{font-family:"TH SarabunPSK","IBM Plex Sans Thai","Sarabun",Tahoma,sans-serif;font-size:14pt;line-height:1.5;color:#17233b}h1{font-size:20pt;margin:0}h2{font-size:16pt;color:#173b78;margin-top:18px;border-bottom:2px solid #e5a83b}h3{font-size:14pt;margin:10px 0 4px}small{font-weight:normal;color:#64748b}
table{width:100%;border-collapse:collapse;font-size:11pt;margin:4px 0}th,td{border:1px solid #cbd5e1;padding:3px 5px;vertical-align:top;text-align:left}th{background:#eef2f8}.muted{color:#64748b}.note{border:2px solid #b45309;color:#b45309;padding:4px 8px;font-weight:bold;display:inline-block}</style></head><body>
<h1>รายงานประเภทหลักสูตรและเกณฑ์ประเมิน</h1><p>${esc(versionLabel)} · โรงเรียนสักงามวิทยา · ออกรายงาน ${esc(new Date().toLocaleString("th-TH"))}</p>
<p class="note">เอกสารประกอบการพิจารณา — ไม่ใช่การประกาศผลระดับคุณภาพ${unverified ? " · มีข้อมูลที่ยังไม่ผ่านการตรวจยืนยัน" : ""}</p>
<p class="muted">หมวด: ${CATEGORIES.map((c) => c.label).join(" · ")}</p>${body}</body></html>`;
}

export function exportCategoryReport(kind: "word" | "pdf", versionLabel: string, d: CategoryData, cands: Candidate[]) {
  const html = buildReportHtml(versionLabel, d, cands);
  if (kind === "word") {
    const url = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/msword" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "รายงานประเภทหลักสูตรและเกณฑ์.doc" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const w = window.open("", "_blank");
  if (!w) { alert("เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาต Pop-up"); return; }
  w.document.open(); w.document.write(html.replace("</body>", "<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body>")); w.document.close();
}
