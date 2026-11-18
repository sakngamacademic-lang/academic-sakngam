/**
 * ชุดตรวจทานโครงสร้างหลักสูตร (ระยะ Preview) — อ่านจากไฟล์ JSON ที่ฝ่ายวิชาการเตรียม ไม่เขียนฐานข้อมูล
 * ไม่มีข้อมูลหลักสูตรจริงในโค้ด · ข้อมูลอยู่ในไฟล์ชุดตรวจทานที่ผู้ใช้เปิดในเบราว์เซอร์เท่านั้น
 */
export type ItemKind = "add" | "rename" | "conflict" | "credit";
export type Choice = "agree" | "propose" | "escalate";
export interface SourceValue { value: string | null; ref: string | null }
export interface ReviewItem {
  id: string; area: string; grade: string; code: string; name: string; kind: ItemKind; issue: string;
  pdf: SourceValue; xls: SourceValue; reg: SourceValue; evidence: string | null; plans: string; proposal: string | null; dependsOn: number[];
}
export interface SchoolDecision { no: number; title: string; affects: string; refs: string }
export interface ReviewPackage {
  kind: "curriculum-structure-review"; version: 1; title: string;
  source: { pdf: string; xlsx: string; registry: string };
  areas: { code: string; name: string }[]; decisions: SchoolDecision[]; items: ReviewItem[];
}
export interface Opinion { choice: Choice; note: string }

export const KIND_LABEL: Record<ItemKind, string> = { add: "เสนอเพิ่มเข้าระบบ", rename: "เสนอแก้ชื่อในระบบ", conflict: "PDF กับ Excel ไม่ตรงกัน", credit: "หน่วยกิต/ชั่วโมงไม่สัมพันธ์" };
export const CHOICE_LABEL: Record<Choice, string> = { agree: "เห็นด้วย", propose: "เสนอแก้ไข", escalate: "ส่งให้ฝ่ายวิชาการ" };
export const gradeLabel = (g: string) => `ม.${g.replace(/\D/g, "")}`;

const str = (v: unknown) => typeof v === "string";
const src = (v: unknown): v is SourceValue => !!v && typeof v === "object" && "value" in v && "ref" in v;

/** ตรวจรูปแบบไฟล์ — คืนข้อความผิดพลาดภาษาไทยถ้าไม่ใช่ชุดตรวจทาน */
export function parseReviewPackage(text: string): ReviewPackage {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("ไฟล์ไม่ใช่ JSON ที่อ่านได้"); }
  const p = raw as Partial<ReviewPackage>;
  if (!p || p.kind !== "curriculum-structure-review" || p.version !== 1) throw new Error("ไม่ใช่ไฟล์ชุดตรวจทานโครงสร้างหลักสูตร (kind/version ไม่ตรง)");
  if (!Array.isArray(p.items) || !Array.isArray(p.areas) || !Array.isArray(p.decisions)) throw new Error("ไฟล์ชุดตรวจทานไม่ครบ (items/areas/decisions)");
  const ids = new Set<string>();
  for (const it of p.items) {
    if (!it || !str(it.id) || !str(it.area) || !str(it.code) || !str(it.issue) || !src(it.pdf) || !src(it.xls) || !src(it.reg) || !Array.isArray(it.dependsOn))
      throw new Error(`รายการไม่ครบ: ${String((it as { id?: unknown })?.id ?? "?")}`);
    if (ids.has(it.id)) throw new Error(`รหัสประเด็นซ้ำ: ${it.id}`);
    ids.add(it.id);
  }
  return p as ReviewPackage;
}

/** ขอบเขตการมองเห็น: ใช้สิทธิ์เดิมเท่านั้น — ฝ่ายวิชาการ/ผู้บริหารเห็นทั้งหมด · หัวหน้ากลุ่มสาระเห็นเฉพาะกลุ่มที่ได้รับมอบหมาย */
export function visibleAreaCodes(roles: readonly string[], myAreaCodes: readonly string[], all: readonly string[]): string[] {
  if (roles.some((r) => ["system_admin", "academic_head", "academic_staff", "executive"].includes(r))) return [...all];
  if (roles.includes("learning_area_head")) return all.filter((c) => myAreaCodes.includes(c));
  return [];
}

/** ประเด็นที่ขึ้นกับมติระดับโรงเรียน เลือก “เห็นด้วย” ไม่ได้ (ไม่ให้ถูกนับว่าผ่าน) */
export const canAgree = (it: ReviewItem) => it.dependsOn.length === 0;

export function opinionError(it: ReviewItem, o: Opinion | undefined): string | null {
  if (!o) return null;
  if (o.choice === "agree" && !canAgree(it)) return "ประเด็นนี้ขึ้นกับมติระดับโรงเรียน เลือก “เห็นด้วย” ไม่ได้";
  if (o.choice !== "agree" && !o.note.trim()) return "กรุณาระบุเหตุผลหรือค่าที่เสนอ";
  return null;
}

export interface AreaSummary { code: string; name: string; total: number; answered: number; agree: number; propose: number; escalate: number; waitingSchool: number }
export function summarize(pkg: ReviewPackage, opinions: Record<string, Opinion>, areaCodes: readonly string[]): AreaSummary[] {
  return pkg.areas.filter((a) => areaCodes.includes(a.code)).map((a) => {
    const its = pkg.items.filter((i) => i.area === a.code);
    const valid = its.map((i) => opinions[i.id]).filter((o, k): o is Opinion => !!o && !opinionError(its[k]!, o));
    return {
      code: a.code, name: a.name, total: its.length, answered: valid.length,
      agree: valid.filter((o) => o.choice === "agree").length, propose: valid.filter((o) => o.choice === "propose").length,
      escalate: valid.filter((o) => o.choice === "escalate").length, waitingSchool: its.filter((i) => !canAgree(i)).length,
    };
  });
}

/** CSV ความเห็น (ดาวน์โหลดในเครื่อง ไม่บันทึกระบบ) */
export function opinionsCsv(pkg: ReviewPackage, opinions: Record<string, Opinion>): string {
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [["รหัสประเด็น", "กลุ่มสาระ", "ชั้น", "รหัสวิชา", "ประเภท", "ความเห็น", "เหตุผล/หมายเหตุ", "รอมติโรงเรียนข้อ"].map(q).join(",")];
  for (const i of pkg.items) {
    const o = opinions[i.id];
    lines.push([i.id, pkg.areas.find((a) => a.code === i.area)?.name ?? i.area, gradeLabel(i.grade), i.code, KIND_LABEL[i.kind], o ? CHOICE_LABEL[o.choice] : "", o?.note ?? "", i.dependsOn.join(" ")].map(q).join(","));
  }
  return "﻿" + lines.join("\r\n");
}
