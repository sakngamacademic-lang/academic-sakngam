import type { SourceConflict } from "./api";
import { consistent, HOURS_PER_CREDIT, ITEM, SOURCE_LABELS } from "./conflict-insight";

/**
 * จัดกลุ่มข้อขัดแย้งตามประเด็น เพื่อให้ผู้ดูแลหลักสูตรตัดสินทีละกลุ่ม — คำนวณจากข้อความ A/B ที่บันทึกไว้เท่านั้น
 * ไม่แก้ข้อมูล ไม่ตัดสินแทน (มติบันทึกผ่าน source_conflict_resolve เมื่อผู้ดูแลกดเอง)
 */
export type Tier = "evidence" | "source_error" | "decide";
export const TIER_LABELS: Record<Tier, string> = {
  evidence: "1. ปิดได้ด้วยหลักฐานที่ชัดเจน",
  source_error: "2. ข้อผิดพลาดในต้นฉบับ PDF (เล่มขัดแย้งกันเอง)",
  decide: "3. ต้องให้ผู้ดูแลหลักสูตรตัดสิน",
};
export interface GroupOption { label: string }
export interface EvidenceLine { source: string; page: number; text: string }
export interface GroupItem {
  conflict: SourceConflict;
  subjectCode: string | null;
  title: string;
  evidence: EvidenceLine[];
  impact: string;
}
export interface DecisionGroup { id: string; tier: Tier; title: string; summary: string; options: GroupOption[]; items: GroupItem[] }

const SPECIAL: Record<string, { id: string; tier: Tier }> = {
  "CF-08": { id: "close_page", tier: "evidence" },
  "CF-87": { id: "close_is", tier: "evidence" },
  "CF-84": { id: "code_format", tier: "decide" },
  "CF-85": { id: "type_typo", tier: "source_error" },
  "CF-86": { id: "type_conflict", tier: "decide" },
  // ยังไม่ได้ตรวจหน้าคำอธิบายรายวิชาของ ง30274/ง30275 — แม้ผลรวมจะตรงหัวตารางหากแก้ชั่วโมง จึงไม่จัดเป็นหลักฐานชัดเจน
  "CF-33": { id: "hours_unverified", tier: "decide" },
  "CF-34": { id: "hours_unverified", tier: "decide" },
};

const GROUP_META: Record<string, { tier: Tier; title: (k: string, name?: string) => string; summary: string; options: string[] }> = {
  close_page: { tier: "evidence", title: () => "เลขหน้าประกาศใช้หลักสูตร", summary: "ตรวจข้อความ PDF แล้ว: หน้า 3 ของไฟล์ที่ใช้จริงเป็นหน้าประกาศใช้หลักสูตร — ค่า “หน้า 4” ในทะเบียนเดิมไม่ตรงกับไฟล์", options: ["ปิดข้อขัดแย้ง: ยืนยัน PDF หน้า 3 เป็นหน้าประกาศใช้หลักสูตร (ตรวจจากไฟล์จริง)"] },
  close_is: { tier: "evidence", title: () => "รายวิชา IS ม.ต้น/ม.ปลาย คำอธิบายต่างกัน", summary: "IS แยกตามช่วงชั้นอยู่แล้ว (ม.ต้น หน้า 477/478, ม.ปลาย หน้า 480/481) ไม่สังกัดกลุ่มสาระ — ระบบเก็บเป็น 4 รายการ จึงไม่ใช่ข้อขัดแย้งของข้อมูล", options: ["ปิดข้อขัดแย้ง: IS ม.ต้นและ ม.ปลายเป็นคนละช่วงชั้น คำอธิบายต่างกันตามเอกสาร และระบบแยกเก็บแล้ว"] },
  typo_row: { tier: "source_error", title: (k, n) => `ตัวเลขของ ${n ?? k} ในตารางโครงสร้างไม่ตรงหัวตาราง`, summary: "แถวนี้ระบุหน่วยกิต/ชั่วโมงไม่ตรงเกณฑ์ 40 ชั่วโมง/หน่วยกิต แต่ถ้าแก้ให้ตรงเกณฑ์ ผลรวมจะตรงหัวตารางพอดี — เล่มขัดแย้งกันเอง", options: ["ถือหัวตารางและเกณฑ์เป็นหลัก (ตัวเลขแถวนี้ในตารางเป็นข้อผิดพลาดของต้นฉบับ)", "ถือตัวเลขในแถวเป็นหลัก (หัวตารางผิด)"] },
  typo_value: { tier: "source_error", title: (k, n) => `ค่าของ ${n ?? k} ที่ไม่ตรงเกณฑ์ 40 ชั่วโมง/หน่วยกิต`, summary: "มีค่าเดียวที่ไม่ตรงเกณฑ์ ขณะที่ค่าอื่นสอดคล้อง — น่าจะเป็นตัวเลขที่พิมพ์ผิด", options: ["ถือค่าที่ตรงเกณฑ์", "ถือค่าที่ระบุไว้ในต้นฉบับ"] },
  type_typo: { tier: "source_error", title: () => "หัวข้อ “พื้นฐาน/เพิ่มเติม” ของ ว221202 ขัดกับหน้าอื่น", summary: "หน้า 98 ระบุพื้นฐาน แต่หน้า 97 (วิชาคู่กัน) ตารางโครงสร้างหน้า 11 และหลักที่ 3 ของรหัส ระบุเพิ่มเติม", options: ["ถือเป็นรายวิชาเพิ่มเติม", "ถือเป็นรายวิชาพื้นฐาน"] },
  header_unexplained: { tier: "decide", title: () => "ยอดรวมวิชาเพิ่มเติมของแผนทวิศึกษาเกินหัวตาราง", summary: "ส่วนต่างมาก และไม่มีแถวเดียวที่อธิบายได้ — ห้ามแก้ยอดเพื่อให้ตรง", options: ["ถือหัวตารางเป็นหลัก", "ถือผลรวมรายวิชาเป็นหลัก"] },
  values_differ: { tier: "decide", title: () => "หน่วยกิต/ชั่วโมงต่างกันระหว่างตารางโครงสร้างกับคำอธิบายรายวิชา", summary: "ทุกค่าสอดคล้องเกณฑ์ 40 ชั่วโมง/หน่วยกิตแต่ต่างกัน — หลักฐานไม่พอชี้ว่าค่าใดถูก", options: ["ใช้ค่าตามคำอธิบายรายวิชา", "ใช้ค่าตามตารางโครงสร้าง"] },
  dup_rename: { tier: "decide", title: () => "รหัสเดียวกัน ชื่อในตารางโครงสร้างต่างจากชื่อในคำอธิบายรายวิชา", summary: "คำอธิบายรายวิชาใช้ชื่อเดียวกันทุกหน้า แต่ตารางโครงสร้างใช้ชื่ออื่น (หน่วยกิตเท่ากัน)", options: ["ใช้ชื่อตามคำอธิบายรายวิชา", "ใช้ชื่อตามตารางโครงสร้าง"] },
  dup_different: { tier: "decide", title: () => "รหัสเดียวกันถูกใช้กับรายวิชาคนละชื่อ", summary: "เล่มใช้รหัสเดียวกันกับรายวิชาต่างกัน — ระบบไม่เปลี่ยนรหัสเองโดยไม่มีหลักฐาน", options: ["เก็บรหัสไว้กับรายวิชาที่มีคำอธิบายรายวิชา และให้โรงเรียนกำหนดรหัสใหม่ให้อีกรายวิชา (ต้องมีเอกสารยืนยัน)", "เก็บเป็นรายการแยกตามแผนจนกว่าจะมีเอกสารยืนยัน"] },
  dup_sequence: { tier: "decide", title: () => "รายวิชาลำดับที่ 1 และ 2 ใช้รหัสเดียวกัน", summary: "ชื่อต่างกันเฉพาะเลขลำดับ — น่าจะพิมพ์รหัสซ้ำ", options: ["คงรหัสไว้ที่รายวิชาลำดับที่ 1 และให้โรงเรียนยืนยันรหัสของลำดับถัดไป"] },
  code_format: { tier: "decide", title: () => "รหัส ว221201/ว221202 (คำอธิบาย) ต่างจาก ว21201/ว21202 (ตารางโครงสร้าง)", summary: "เล่มพิมพ์รหัสไม่ตรงกันเอง และแถวหลักฐานในทะเบียนอ่านเป็น “ว22120”", options: ["ใช้รหัส ว21201/ว21202 (ตามตารางโครงสร้างและสรุป)", "ใช้รหัส ว221201/ว221202 (ตามคำอธิบายรายวิชา)"] },
  type_conflict: { tier: "decide", title: () => "ง30250 พื้นฐานหรือเพิ่มเติม", summary: "หัวข้อคำอธิบายระบุพื้นฐาน แต่หลักที่ 3 ของรหัสและโครงสร้างชี้ว่าเพิ่มเติม (120 ชั่วโมง เกินโควตาพื้นฐาน)", options: ["ถือเป็นรายวิชาเพิ่มเติม", "ถือเป็นรายวิชาพื้นฐาน"] },
  hours_unverified: { tier: "decide", title: () => "ชั่วโมงของรายวิชา ง30274/ง30275 (ทวิศึกษา) ไม่ตรงเกณฑ์ 40 ชั่วโมง/หน่วยกิต", summary: "ถ้าแก้เป็น 160 ชั่วโมง ผลรวมจะตรงหัวตาราง แต่ยังไม่ได้ตรวจหน้าคำอธิบายรายวิชา จึงยังไม่ถือเป็นหลักฐานยืนยัน", options: ["ถือหัวตารางเป็นหลัก (160 ชั่วโมง)", "ถือตัวเลขในแถวเป็นหลัก (120 ชั่วโมง)"] },
  other: { tier: "decide", title: () => "ข้อขัดแย้งอื่น", summary: "ตัดสินเป็นรายข้อ", options: ["ตัดสินเอง พร้อมระบุเหตุผล"] },
};

const nameKey = (s: string) => s.replace(/[\s\d\-–.]/g, "");
const parseItems = (c: SourceConflict) => [...`${c.value_a ?? ""}; ${c.value_b ?? ""}`.matchAll(ITEM)].map((m) => ({ src: m[1] as string, page: Number(m[2]), name: (m[3] as string).trim(), credits: Number(m[4]), hours: Number(m[5]) }));

function parseHeader(c: SourceConflict) {
  const head = /หัวตาราง หน้า (\d+): (รายวิชา\S+) (\d+(?:\.\d+)?)\((\d+)\)/.exec(c.value_a ?? "");
  if (!head) return null;
  const rows = [...(c.value_b ?? "").matchAll(/([ก-ฮ]\d{5,6}) (\d+(?:\.\d+)?)\((\d+)\)/g)].map((m) => ({ code: m[1] as string, credits: Number(m[2]), hours: Number(m[3]) }));
  const headHours = Number(head[4]);
  const bad = rows.filter((r) => !consistent(r.credits, r.hours));
  const sum = rows.reduce((s, r) => s + r.hours, 0);
  const fixed = rows.reduce((s, r) => s + (bad.includes(r) ? HOURS_PER_CREDIT * r.credits : r.hours), 0);
  return { page: Number(head[1]), section: head[2] as string, headHours, headCredits: Number(head[3]), sum, bad, culprit: bad.length === 1 && fixed === headHours ? bad[0]! : null };
}

interface Classified { id: string; key: string; subjectCode: string | null; title: string; evidence: EvidenceLine[]; impact: string }

function classify(c: SourceConflict, nameOf: (code: string) => string | undefined): Classified {
  const items = parseItems(c);
  const ev: EvidenceLine[] = items.map((i) => ({ source: SOURCE_LABELS[i.src] ?? i.src, page: i.page, text: `${i.name} ${i.credits.toFixed(1)} หน่วยกิต / ${i.hours} ชั่วโมง` }));
  const code = /^[ก-ฮ]\d{5,6}$/.test(c.subject_ref ?? "") ? c.subject_ref : null;
  const sp = SPECIAL[c.conflict_code];
  if (sp) return { id: sp.id, key: sp.id, subjectCode: code, title: c.subject_ref ?? c.conflict_code, evidence: ev, impact: "" };
  const h = parseHeader(c);
  if (h) {
    const ev2: EvidenceLine[] = [{ source: "หัวตารางโครงสร้าง", page: h.page, text: `${h.section} ${h.headCredits.toFixed(1)} หน่วยกิต / ${h.headHours} ชั่วโมง` }, { source: "ผลรวมรายวิชาในตาราง", page: h.page, text: `${h.sum} ชั่วโมง` }];
    if (h.culprit) {
      const r = h.culprit;
      return { id: "typo_row", key: `typo_row:${r.code}`, subjectCode: r.code, title: `${r.code} ${nameOf(r.code) ?? ""}`.trim(), evidence: [...ev2, { source: "แถวที่ไม่ตรงเกณฑ์", page: h.page, text: `${r.code} ${r.credits.toFixed(1)} หน่วยกิต / ${r.hours} ชั่วโมง (เกณฑ์ ${HOURS_PER_CREDIT * r.credits})` }], impact: `ถ้าถือหัวตาราง: ผลรวมหน้า ${h.page} เปลี่ยน ${h.sum} → ${h.headHours} ชั่วโมง (ตรงหัวตาราง) · ถ้าถือแถว: หัวตารางหน้า ${h.page} ต้องเป็น ${h.sum} ชั่วโมง` };
    }
    return { id: "header_unexplained", key: "header_unexplained", subjectCode: null, title: `${h.section} หน้า ${h.page}`, evidence: ev2, impact: `ส่วนต่างหัวตารางกับผลรวม ${h.headHours - h.sum > 0 ? "+" : ""}${h.headHours - h.sum} ชั่วโมง` };
  }
  if (c.category === "duplicate_code") {
    const cores = [...new Set(items.map((i) => nameKey(i.name)))];
    const digitSets = [...new Set(items.map((i) => i.name.replace(/\D/g, "")))].filter(Boolean);
    const desc = [...new Set(items.filter((i) => i.src !== "G").map((i) => nameKey(i.name)))];
    const grid = [...new Set(items.filter((i) => i.src === "G").map((i) => nameKey(i.name)))];
    const kind = cores.length === 1 && digitSets.length > 1 ? "dup_sequence" : desc.length === 1 && grid.length === 1 && desc[0] !== grid[0] ? "dup_rename" : "dup_different";
    return { id: kind, key: kind, subjectCode: code, title: `${c.subject_ref ?? ""} ${[...new Set(items.map((i) => i.name))].join(" / ")}`.trim(), evidence: ev, impact: "ชื่อ/รหัสของรายวิชาในทะเบียนและการจัดวิชาที่อ้างรหัสนี้" };
  }
  if (items.length) {
    const vals = new Map<string, number>();
    for (const i of items) vals.set(`${i.credits}|${i.hours}`, (vals.get(`${i.credits}|${i.hours}`) ?? 0) + 1);
    const bad = [...vals.keys()].filter((k) => { const [cr, hr] = k.split("|").map(Number) as [number, number]; return !consistent(cr, hr); });
    const label = (k: string) => { const [cr, hr] = k.split("|").map(Number) as [number, number]; return `${cr.toFixed(1)} หน่วยกิต / ${hr} ชั่วโมง`; };
    if (vals.size > 1 && bad.length === 1) return { id: "typo_value", key: `typo_value:${code ?? c.conflict_code}`, subjectCode: code, title: `${code ?? ""} ${(code && nameOf(code)) || items[0]?.name || ""}`.trim(), evidence: ev, impact: `ค่าที่ไม่ตรงเกณฑ์: ${label(bad[0]!)}` };
    return { id: "values_differ", key: "values_differ", subjectCode: code, title: `${code ?? ""} ${(code && nameOf(code)) || items[0]?.name || ""}`.trim(), evidence: ev, impact: [...vals.keys()].map(label).join(" หรือ ") };
  }
  return { id: "other", key: "other", subjectCode: code, title: c.subject_ref ?? c.conflict_code, evidence: ev, impact: "" };
}

export function groupConflicts(conflicts: SourceConflict[], nameOf: (code: string) => string | undefined = () => undefined): DecisionGroup[] {
  const map = new Map<string, DecisionGroup>();
  for (const c of conflicts) {
    if (c.status === "resolved") continue;
    const k = classify(c, nameOf);
    const meta = GROUP_META[k.id]!;
    let g = map.get(k.key);
    if (!g) {
      const code = k.key.includes(":") ? k.key.split(":")[1]! : undefined;
      g = { id: k.key, tier: meta.tier, title: meta.title(code ?? "", code ? nameOf(code) : undefined), summary: meta.summary, options: meta.options.map((label) => ({ label })), items: [] };
      map.set(k.key, g);
    }
    g.items.push({ conflict: c, subjectCode: k.subjectCode, title: k.title, evidence: k.evidence, impact: k.impact });
  }
  const order: Tier[] = ["evidence", "source_error", "decide"];
  return [...map.values()].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || b.items.length - a.items.length);
}
