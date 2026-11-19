/**
 * ตรวจและรวมข้อมูลที่อ่านได้จากไฟล์หนึ่งไฟล์ ก่อนให้ผู้ใช้ยืนยัน
 * - แถวที่เหมือนกันทุกค่าจากตารางซ้ำ (เช่น ชีตสำเนา) รวมเป็นแถวเดียวโดยเก็บอ้างอิงครบ
 * - แถวซ้ำที่ค่าไม่ตรงกัน / ไม่ระบุชั้น-แผน-ภาค / หน่วยกิตไม่สัมพันธ์ชั่วโมง / ยอดไม่ตรง / รหัสไม่ตรงชั้น → แจ้งเป็นประเด็น ไม่แก้ค่าเอง
 */
import { gradeFromCode, gradeLabel, planKey, type ParsedSource, type V2Issue, type V2Row } from "./model";

export interface ConsolidatedRow extends V2Row { refs: V2Row["ref"][] }
export interface Consolidated { rows: ConsolidatedRow[]; issues: V2Issue[] }

export function consolidate(src: ParsedSource, hoursPerCredit = 40): Consolidated {
  const issues: V2Issue[] = [];
  const byKey = new Map<string, ConsolidatedRow[]>();
  const out: ConsolidatedRow[] = [];
  for (const r of src.rows) {
    if (!r.grade || !r.plan || !r.term) {
      issues.push({ level: "error", kind: "ambiguous", text: `${r.codeRaw} ${r.name}: ไม่ระบุ${[!r.grade && "ชั้น", !r.plan && "แผน", !r.term && "ภาคเรียน"].filter(Boolean).join("/")} — ไม่นำไปจัดโครงสร้างจนกว่าจะยืนยัน`, ref: r.ref });
    } else if (!r.section) {
      const hint = /^[ก-ฮ]{1,2}\d\d1/.test(r.code) ? "พื้นฐาน" : /^[ก-ฮ]{1,2}\d\d2/.test(r.code) ? "เพิ่มเติม" : null;
      issues.push({ level: "warning", kind: "no_section", text: `${r.codeRaw} ${r.name}: ตารางไม่ระบุหมวดพื้นฐาน/เพิ่มเติม — แสดงเป็น “ไม่ระบุหมวด”${hint ? ` (หลักที่ 3 ของรหัสบ่งชี้ว่าเป็น${hint})` : ""}`, ref: r.ref });
    }
    const key = [r.grade, planKey(r.plan), r.term, r.code].join("|");
    const same = byKey.get(key) ?? [];
    const twin = same.find((x) => x.name === r.name && x.credits === r.credits && x.hours === r.hours && x.section === r.section);
    if (twin) { twin.refs.push(r.ref); continue; }
    if (same.length) issues.push({ level: "error", kind: "duplicate", text: `${r.codeRaw}: รหัสซ้ำใน ${gradeLabel(r.grade)} ${r.plan ?? ""} ภาค ${r.term ?? "-"} แต่ข้อมูลไม่ตรงกัน (${same[0]!.name} ${same[0]!.raw} / ${r.name} ${r.raw})`, ref: r.ref });
    const row: ConsolidatedRow = { ...r, refs: [r.ref] };
    byKey.set(key, [...same, row]); out.push(row);
    if (r.credits == null || r.hours == null) issues.push({ level: "error", kind: "credit_unreadable", text: `${r.codeRaw}: อ่านหน่วยกิต/ชั่วโมงไม่ได้ (“${r.raw}”)`, ref: r.ref });
    else if (Math.abs(r.credits * hoursPerCredit - r.hours) > 0.01) issues.push({ level: "warning", kind: "credit_hours", text: `${r.codeRaw}: ${r.raw} — หน่วยกิตไม่สัมพันธ์กับชั่วโมง (1 นก. = ${hoursPerCredit} ชม.)`, ref: r.ref });
    if (/[๐-๙]/.test(r.codeRaw)) issues.push({ level: "info", kind: "thai_digit", text: `${r.codeRaw}: รหัสมีเลขไทย (แสดงเป็น ${r.code})`, ref: r.ref });
    const g = gradeFromCode(r.code);
    if (g && r.grade && g !== r.grade) issues.push({ level: "warning", kind: "grade_mismatch", text: `${r.codeRaw}: รหัสเป็นของ ${gradeLabel(g)} แต่ตารางระบุ ${gradeLabel(r.grade)}`, ref: r.ref });
    if (!r.name.trim()) issues.push({ level: "warning", kind: "no_name", text: `${r.codeRaw}: ไม่มีชื่อวิชา`, ref: r.ref });
  }
  // รหัสเดียวกันแต่ชื่อต่างกันภายในไฟล์เดียว
  const names = new Map<string, Set<string>>();
  for (const r of out) names.set(r.code, (names.get(r.code) ?? new Set()).add(r.name));
  for (const [code, set] of names) if (set.size > 1) {
    const r = out.find((x) => x.code === code)!;
    issues.push({ level: "warning", kind: "name_conflict", text: `${code}: ใช้หลายชื่อในไฟล์เดียว (${[...set].join(" / ")})`, ref: r.ref });
  }
  // ยอดรวมที่ไฟล์ระบุ เทียบผลรวมจริง
  for (const d of src.declared) {
    if (d.total == null) continue;
    const rows = out.filter((r) => r.grade === d.grade && planKey(r.plan) === planKey(d.plan) && r.term === d.term);
    const actTotal = d.activities ?? 0;
    const sum = rows.reduce((n, r) => n + (r.hours ?? 0), 0) + actTotal;
    if (rows.length && Math.abs(sum - d.total) > 0.01) issues.push({ level: "warning", kind: "total_mismatch", text: `${gradeLabel(d.grade)} ${d.plan ?? ""} ภาค ${d.term}: ยอดที่ไฟล์ระบุ ${d.total} ชม. ≠ ผลรวม ${sum} ชม.`, ref: d.ref });
  }
  return { rows: out, issues };
}
