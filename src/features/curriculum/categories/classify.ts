/**
 * จัดหมวดหลักสูตร (ข้อเสนอของระบบ) จากข้อมูลจริง — ไม่มี dependency · ทดสอบด้วย scripts/curriculum-classify.test.ts
 * หลักการ:
 *  - หลักฐานเชิงโครงสร้าง (เป็นแผนการเรียน/เปิดเฉพาะในแผน/เป็นกิจกรรมพัฒนาผู้เรียน) = “หลักฐานโครงสร้าง”
 *  - คำสำคัญในชื่อ/คำอธิบาย (เช่น “อาชีพ” “ท้องถิ่น”) = “พบคำสำคัญเท่านั้น” — ไม่ใช่หลักฐานว่าผ่านเกณฑ์
 *  - ทุกข้อเสนอ = “รอตรวจความสอดคล้อง” จนกว่าผู้ดูแลหลักสูตรยืนยัน (ไม่เปลี่ยนประเภทรายวิชาทางการ)
 */
export type Category = "general" | "vocational" | "local" | "specialized" | "activities";
export const CATEGORIES: { key: Category; label: string; short: string }[] = [
  { key: "general", label: "หลักสูตรสถานศึกษาทั่วไป", short: "ทั่วไป" },
  { key: "vocational", label: "หลักสูตรสมรรถนะอาชีพ", short: "สมรรถนะอาชีพ" },
  { key: "local", label: "หลักสูตรท้องถิ่นและภูมิปัญญาชุมชน", short: "ท้องถิ่น" },
  { key: "specialized", label: "หลักสูตรเฉพาะทางและแผนการเรียน", short: "เฉพาะทาง" },
  { key: "activities", label: "กิจกรรมพัฒนาผู้เรียน", short: "กิจกรรม" },
];
export type TargetType = "subject" | "program" | "activity";
/** structural = โครงสร้างหลักสูตร · content = องค์ประกอบสมรรถนะในคำอธิบาย/ผลการเรียนรู้ · keyword = พบคำสำคัญเท่านั้น · insufficient = ข้อมูลไม่พอให้ตรวจ */
export type Strength = "structural" | "content" | "partial" | "keyword" | "insufficient";
export const STRENGTH_LABEL: Record<Strength, string> = {
  structural: "หลักฐานเชิงโครงสร้าง", content: "พบองค์ประกอบสมรรถนะในเนื้อหา", partial: "พบองค์ประกอบบางส่วน", keyword: "พบคำสำคัญเท่านั้น", insufficient: "ข้อมูลไม่เพียงพอ",
};
export type Stage = "lower" | "upper" | null;
export const STAGE_LABEL = { lower: "ม.ต้น", upper: "ม.ปลาย" } as const;
export type LinkStatus = "proposed" | "confirmed" | "rejected";

export interface ProgramRow { id: string; code: string; name_th: string; stage: string | null; source_document_id: string | null; source_locator: string | null }
export interface SubjectRow { id: string; code: string; name_th: string; subject_type: string; description_th: string | null; outcomes?: string[]; grade: string | null; program_ids: string[]; source_document_id: string | null; source_locator: string | null; hours: number | null; credits: number | null }
export interface ActivityRow { id: string; activity_type: string; name_th: string; activity_hours: number; study_program_id: string | null; grade: string | null; source_document_id: string; source_locator: string }
export interface StoredLink { id: string; category: Category; target_type: TargetType; target_id: string; status: LinkStatus; reason: string; source_document_id: string | null; source_locator: string | null; decided_at: string | null }

export interface Candidate {
  category: Category;
  targetType: TargetType;
  targetId: string;
  label: string;
  sub: string;
  strength: Strength;
  reasons: string[];
  stage: Stage;
  /** องค์ประกอบสมรรถนะที่พบ (เฉพาะหมวดอาชีพ) พร้อมข้อความหลักฐาน */
  competencies: { label: string; evidence: string }[];
  sourceDocId: string | null;
  locator: string | null;
  /** สถานะจากการตรวจของผู้ดูแล (ถ้ามี) */
  status: LinkStatus;
  stored: StoredLink | null;
}

const VOC_PROGRAM = /ทวิศึกษา|อาชีพ|ปวช|ทวิภาคี/;
const GENERAL_PROGRAM = /ทั่วไป/;
const VOC_WORD = /อาชีพ|ช่าง|บัญชี|ธุรกิจ|ประกอบการ/;
const LOCAL_WORD = /ท้องถิ่น|ภูมิปัญญา|ชุมชน|สักงาม|กำแพงเพชร/;
/**
 * องค์ประกอบสมรรถนะอาชีพที่ตรวจในคำอธิบายรายวิชา/ผลการเรียนรู้
 *  - content  = ทักษะปฏิบัติ + มิติเศรษฐกิจ (การตลาด/จำหน่าย หรือ บัญชี/ต้นทุน)
 *  - partial  = (เฉพาะกลุ่มสาระการงานอาชีพ) พบทักษะปฏิบัติ/การมุ่งอาชีพ แต่ไม่พบมิติเศรษฐกิจ
 * เป็นข้อเสนอให้ฝ่ายวิชาการตรวจ ไม่ใช่การรับรองสมรรถนะ
 */
export const VOC_SIGNALS: { key: string; label: string; re: RegExp }[] = [
  { key: "practice", label: "ทักษะปฏิบัติงานจริง", re: /ปฏิบัติ(?:การ|งาน)?|ลงมือ|ทักษะกระบวนการทำงาน/ },
  { key: "product", label: "สร้างผลผลิต/ชิ้นงาน/บริการ", re: /ผลผลิต|ผลิตภัณฑ์|การผลิต|ชิ้นงาน|ให้บริการ/ },
  { key: "market", label: "การตลาด/จัดจำหน่าย", re: /จัดจำหน่าย|จำหน่ายผลผลิต|ราคาขาย|ตลาด|ค่าบริการ/ },
  { key: "account", label: "บัญชี/ต้นทุน/กำไร", re: /บัญชีรายรับ|รายรับ-?รายจ่าย|ค่าใช้จ่าย|ต้นทุน|กำไร/ },
  { key: "career", label: "การมุ่งสู่อาชีพ", re: /ประกอบอาชีพ|สร้างอาชีพ|งานอาชีพ/ },
];
const clean = (t: string) => t.replace(/([\u0e00-\u0e7f])\s*\n\s*(?=[\u0e00-\u0e7f])/g, "$1").replace(/\s+/g, " ");
function snippet(text: string, re: RegExp) {
  const t = clean(text), m = re.exec(t);
  if (!m) return "";
  const a = Math.max(0, m.index - 30), b = Math.min(t.length, m.index + m[0].length + 50);
  return `${a > 0 ? "…" : ""}${t.slice(a, b)}${b < t.length ? "…" : ""}`;
}
export function vocSignals(desc: string | null, outcomes: string[]) {
  const out: { key: string; label: string; evidence: string }[] = [];
  for (const sg of VOC_SIGNALS) {
    const src = [desc ?? "", ...outcomes].find((x) => sg.re.test(clean(x)));
    if (src) out.push({ key: sg.key, label: sg.label, evidence: `${outcomes.includes(src) ? "ผลการเรียนรู้" : "คำอธิบายรายวิชา"}: ${snippet(src, sg.re)}` });
  }
  return out;
}
export function stageOf(grade: string | null, programStage?: string | null): Stage {
  const n = Number(/(\d)/.exec(grade ?? "")?.[1] ?? NaN);
  if (grade?.startsWith("ม") && n >= 1 && n <= 3) return "lower";
  if (grade?.startsWith("ม") && n >= 4 && n <= 6) return "upper";
  return programStage === "lower_secondary" ? "lower" : programStage === "upper_secondary" ? "upper" : null;
}
const found = (re: RegExp, s: string | null) => (s ? [...new Set(s.match(new RegExp(re.source, "g")) ?? [])] : []);

export function classify(input: { programs: ProgramRow[]; subjects: SubjectRow[]; activities: ActivityRow[]; links: StoredLink[] }): Candidate[] {
  const { programs, subjects, activities, links } = input;
  const prog = new Map(programs.map((p) => [p.id, p]));
  const out = new Map<string, Candidate>();
  const add = (c0: Omit<Candidate, "status" | "stored" | "competencies"> & { competencies?: Candidate["competencies"] }) => {
    const c = { competencies: [], ...c0 };
    const k = `${c.category}|${c.targetType}|${c.targetId}`;
    const prev = out.get(k);
    const rank: Record<Strength, number> = { structural: 4, content: 3, partial: 2, keyword: 1, insufficient: 0 };
    if (prev) {
      prev.reasons.push(...c.reasons.filter((r) => !prev.reasons.includes(r)));
      if (rank[c.strength] > rank[prev.strength]) prev.strength = c.strength;
      for (const k of c.competencies) if (!prev.competencies.some((x) => x.label === k.label)) prev.competencies.push(k);
      return;
    }
    out.set(k, { ...c, status: "proposed", stored: null });
  };
  const vocPrograms = new Set(programs.filter((p) => VOC_PROGRAM.test(p.name_th)).map((p) => p.id));
  const generalPrograms = new Set(programs.filter((p) => GENERAL_PROGRAM.test(p.name_th)).map((p) => p.id));
  const specialPrograms = new Set(programs.filter((p) => !generalPrograms.has(p.id)).map((p) => p.id));

  for (const p of programs) {
    const base = { targetType: "program" as const, targetId: p.id, label: p.name_th, sub: `แผนการเรียน ${p.code}${p.stage === "upper_secondary" ? " · ม.ปลาย" : p.stage === "lower_secondary" ? " · ม.ต้น" : ""}`,
      sourceDocId: p.source_document_id, locator: p.source_locator, stage: stageOf(null, p.stage) };
    if (generalPrograms.has(p.id)) add({ ...base, category: "general", strength: "structural", reasons: ["เป็นแผนการเรียนทั่วไปในทะเบียนหลักสูตร"] });
    if (vocPrograms.has(p.id)) add({ ...base, category: "vocational", strength: "structural", reasons: [`ชื่อแผนการเรียนระบุเป็นแผนสายอาชีพ (“${found(VOC_PROGRAM, p.name_th).join(", ")}”) — ต้องตรวจกับเอกสารหลักสูตร`] });
    if (specialPrograms.has(p.id)) add({ ...base, category: "specialized", strength: "structural", reasons: ["เป็นแผนการเรียนเฉพาะ (ไม่ใช่แผนทั่วไป) ในทะเบียนหลักสูตร"] });
  }

  for (const s of subjects) {
    const inProgs = s.program_ids.map((id) => prog.get(id)).filter((p): p is ProgramRow => !!p);
    const base = { targetType: "subject" as const, targetId: s.id, label: `${s.code} ${s.name_th}`,
      sub: `${s.subject_type === "basic" ? "พื้นฐาน" : "เพิ่มเติม"}${s.grade ? ` · ${s.grade}` : ""}${inProgs.length ? ` · ${inProgs.map((p) => p.code).join(", ")}` : " · ยังไม่ผูกแผนการเรียน"}`,
      sourceDocId: s.source_document_id, locator: s.source_locator, stage: stageOf(s.grade, inProgs[0]?.stage) };
    const outcomes = s.outcomes ?? [];
    const sig = s.subject_type !== "basic" ? vocSignals(s.description_th, outcomes) : [];
    const onlyVoc = inProgs.length > 0 && inProgs.every((p) => vocPrograms.has(p.id));
    const onlySpecial = inProgs.length > 0 && inProgs.every((p) => specialPrograms.has(p.id));
    if (s.subject_type === "basic") add({ ...base, category: "general", strength: "structural", reasons: ["รายวิชาพื้นฐานตามโครงสร้างหลักสูตร"] });
    if (onlyVoc) add({ ...base, category: "vocational", strength: "structural", competencies: sig, reasons: [`เปิดสอนเฉพาะในแผนสายอาชีพ: ${inProgs.map((p) => p.name_th).join(", ")}`] });
    // รายวิชาเพิ่มเติมนอกแผนทวิศึกษา: ตรวจองค์ประกอบสมรรถนะจากคำอธิบาย/ผลการเรียนรู้
    const has = (k: string) => sig.some((x) => x.key === k);
    const economic = has("market") || has("account");
    const careerArea = s.code.trim().startsWith("ง");
    if (has("practice") && economic) {
      add({ ...base, category: "vocational", strength: "content", competencies: sig,
        reasons: [`พบทักษะปฏิบัติและมิติเศรษฐกิจในคำอธิบาย/ผลการเรียนรู้ (${sig.map((x) => x.label).join(", ")}) — ต้องให้ฝ่ายวิชาการตรวจยืนยัน`] });
    } else if (careerArea && !onlyVoc && s.subject_type !== "basic" && (has("practice") || has("career"))) {
      add({ ...base, category: "vocational", strength: "partial", competencies: sig,
        reasons: [`พบ${sig.map((x) => x.label).join(", ")} แต่ไม่พบการผลิต/จำหน่าย/บัญชีในข้อมูลระบบ — ตรวจกับเล่มหลักสูตรว่าครบองค์ประกอบสมรรถนะอาชีพหรือไม่`] });
    } else if (!onlyVoc && s.subject_type !== "basic") {
      const w = found(VOC_WORD, s.name_th);
      if (w.length) add({ ...base, category: "vocational", strength: "keyword", competencies: sig, reasons: [`พบคำ “${w.join(", ")}” ในชื่อวิชาเท่านั้น — ยังไม่ใช่หลักฐานสมรรถนะอาชีพ ต้องตรวจคำอธิบาย/ผลการเรียนรู้`] });
      else if (s.code.trim().startsWith("ง") && !s.description_th?.trim() && !outcomes.length)
        add({ ...base, category: "vocational", strength: "insufficient", reasons: ["รายวิชาเพิ่มเติมกลุ่มสาระการงานอาชีพ แต่ไม่มีคำอธิบายรายวิชาและผลการเรียนรู้ในระบบ — ตรวจกับเล่มหลักสูตรก่อนจัดหมวด"] });
    }
    if (onlySpecial && !onlyVoc) add({ ...base, category: "specialized", strength: "structural", reasons: [`เปิดสอนเฉพาะในแผนการเรียน: ${inProgs.map((p) => p.name_th).join(", ")}`] });
    const ln = found(LOCAL_WORD, s.name_th), ld = found(LOCAL_WORD, [s.description_th ?? "", ...outcomes].join(" "));
    if (ln.length || ld.length) add({ ...base, category: "local", strength: "keyword",
      reasons: [ln.length ? `พบคำ “${ln.join(", ")}” ในชื่อวิชา` : `พบคำ “${ld.join(", ")}” ในคำอธิบาย/ผลการเรียนรู้เท่านั้น`, "คำสำคัญอย่างเดียวไม่ใช่หลักฐานว่าเป็นหลักสูตรท้องถิ่น — ต้องตรวจเนื้อหาและแหล่งเรียนรู้"] });
  }

  for (const a of activities) {
    const p = a.study_program_id ? prog.get(a.study_program_id) : null;
    add({ category: "activities", targetType: "activity", targetId: a.id, label: a.name_th, sub: `${a.activity_type} · ${a.activity_hours} ชม.${a.grade ? ` · ${a.grade}` : ""}${p ? ` · ${p.code}` : ""}`,
      strength: "structural", reasons: ["บันทึกเป็นกิจกรรมพัฒนาผู้เรียนในโครงสร้างเวลาเรียน"], sourceDocId: a.source_document_id, locator: a.source_locator,
      stage: stageOf(a.grade, p?.stage) });
  }

  // ผลการตรวจของผู้ดูแลหลักสูตรมาก่อนข้อเสนอ (รวมรายการที่ผู้ดูแลเพิ่มเองนอกข้อเสนอ)
  for (const l of links) {
    const k = `${l.category}|${l.target_type}|${l.target_id}`;
    const c = out.get(k);
    if (c) { c.status = l.status; c.stored = l; if (l.source_locator) { c.locator = l.source_locator; c.sourceDocId = l.source_document_id; } continue; }
    const t = l.target_type === "program" ? prog.get(l.target_id) : l.target_type === "subject" ? subjects.find((s) => s.id === l.target_id) : activities.find((a) => a.id === l.target_id);
    if (!t) continue;
    out.set(k, { category: l.category, targetType: l.target_type, targetId: l.target_id, label: "code" in t && l.target_type === "subject" ? `${t.code} ${t.name_th}` : t.name_th, sub: "เพิ่มโดยผู้ดูแลหลักสูตร",
      strength: "structural", reasons: [], sourceDocId: l.source_document_id, locator: l.source_locator, status: l.status, stored: l,
      stage: l.target_type === "subject" ? stageOf((t as SubjectRow).grade) : l.target_type === "program" ? stageOf(null, (t as ProgramRow).stage) : stageOf((t as ActivityRow).grade), competencies: [] });
  }
  return [...out.values()];
}

// ------------------------------------------------------------------ หลักฐานตามเกณฑ์
export type EvidenceResult = "direct" | "partial" | "pending" | "none";
export const EVIDENCE_LABEL: Record<EvidenceResult, string> = {
  direct: "พบหลักฐานตรงเกณฑ์", partial: "พบหลักฐานสนับสนุนบางส่วน", pending: "รอตรวจความสอดคล้อง", none: "ยังไม่มีหลักฐานยืนยัน",
};
export interface EvidenceRow { id: string; criterion_id: string; target_type: string; target_id: string; result: EvidenceResult; status: LinkStatus; note: string | null; source_document_id: string | null; source_locator: string | null; decided_at: string | null }
/** สถานะของเกณฑ์ข้อหนึ่ง: ตรงเกณฑ์/บางส่วนนับเฉพาะหลักฐานที่ผู้ดูแลยืนยันแล้ว */
export function criterionResult(ev: EvidenceRow[]): EvidenceResult {
  const ok = ev.filter((e) => e.status === "confirmed");
  if (ok.some((e) => e.result === "direct")) return "direct";
  if (ok.some((e) => e.result === "partial")) return "partial";
  if (ev.some((e) => e.status === "proposed")) return "pending";
  return "none";
}
