/**
 * Curriculum Mapping — อ่านข้อมูลจริงผ่าน RLS เดิมทั้งหมด (ไม่มีตาราง/RPC ใหม่)
 * - ฝั่งโรงเรียน: subjects (คำอธิบายรายวิชา) · subject_learning_outcomes · course_syllabi/course_units/targets · lesson_plans
 * - ฝั่งแกนกลาง: indicators (กรอบที่บันทึกแล้ว) หรือ document_analysis_items (ผลอ่านเอกสาร — ยังไม่รับรอง)
 * - การยืนยัน: curriculum_indicator_mappings + RPC curriculum_mapping_review (เดิม) · ประวัติจาก audit_logs
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { callRpc } from "@/features/master-data/api";
import { findCodes, normCode, schoolGrade, type Decision, type RefIndicator, type SchoolSubject, type SchoolUnit, type TextPart } from "./match";

const sb = () => requireSupabase();
export const mappingKey = ["mapping"] as const;

/** ดึงทุกแถว (เกิน 1,000 แถว) แบบแบ่งหน้า */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await build(from, from + 999);
    if (r.error) throw r.error;
    const data = r.data as T[] | null;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const chunks = <T,>(xs: T[], n = 150) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

// ------------------------------------------------------------------ ตัวเลือก
export interface SubjectLite { id: string; code: string; name_th: string; grade: string | null; learning_area_id: string | null; area_name: string | null }
export function useVersionSubjects(versionId: string | null) {
  return useQuery({
    queryKey: [...mappingKey, "subjects", versionId], enabled: !!versionId,
    queryFn: async () => {
      const rows = await all<{ id: string; code: string; name_th: string; learning_area_id: string | null; grade_levels: { code: string } | null; learning_areas: { name_th: string } | null }>((a, b) =>
        sb().from("subjects").select("id, code, name_th, learning_area_id, grade_levels(code), learning_areas(name_th)").eq("curriculum_version_id", versionId!).order("code").range(a, b));
      return rows.map((r): SubjectLite => ({ id: r.id, code: r.code, name_th: r.name_th, learning_area_id: r.learning_area_id, grade: schoolGrade(r.grade_levels?.code), area_name: r.learning_areas?.name_th ?? null }));
    },
  });
}

export interface ReferenceOption {
  value: string; // "fw:<framework_version_id>" | "an:<analysis_id>"
  kind: "framework" | "analysis";
  id: string;
  label: string;
  /** ผ่านการรับรอง (บันทึกเป็นกรอบแกนกลางแล้ว) */
  official: boolean;
  /** ฐานตัวชี้วัดยืนยันว่าครบ (คำนวณ % ได้) */
  complete: boolean;
  sourceDocId: string | null;
}
export function useReferenceOptions() {
  return useQuery({
    queryKey: [...mappingKey, "refs"],
    queryFn: async () => {
      const [fv, an] = await Promise.all([
        sb().from("framework_versions").select("id, version_label, published_year_be, status, is_complete, curriculum_frameworks(name_th)").order("published_year_be", { ascending: false }),
        sb().from("document_analyses").select("id, status, doc_class, finished_at, source_document_id, source_documents(register_code, title)").eq("status", "done").order("finished_at", { ascending: false }),
      ]);
      if (fv.error) throw fv.error;
      const out: ReferenceOption[] = (fv.data as unknown as { id: string; version_label: string; status: string; is_complete: boolean; curriculum_frameworks: { name_th: string } | null }[]).map((f) => ({
        value: `fw:${f.id}`, kind: "framework", id: f.id, official: true, complete: f.is_complete, sourceDocId: null,
        label: `${f.curriculum_frameworks?.name_th ?? "หลักสูตรแกนกลาง"} ${f.version_label}${f.status === "published" ? "" : " (ร่าง)"}`,
      }));
      // ผลอ่านเอกสาร: ใช้เปรียบเทียบเบื้องต้นได้ แต่ยังไม่ใช่ข้อมูลทางการ (ผู้ใช้ที่ไม่มีสิทธิ์อ่านจะไม่เห็นรายการนี้)
      if (!an.error) {
        const seen = new Set<string>();
        for (const a of an.data as unknown as { id: string; source_document_id: string; finished_at: string | null; source_documents: { register_code: string; title: string } | null }[]) {
          if (seen.has(a.source_document_id)) continue; // ใช้ผลอ่านล่าสุดของแต่ละเอกสาร
          seen.add(a.source_document_id);
          out.push({ value: `an:${a.id}`, kind: "analysis", id: a.id, official: false, complete: false, sourceDocId: a.source_document_id,
            label: `${a.source_documents?.register_code ?? "เอกสาร"} ${a.source_documents?.title ?? ""} — ผลอ่านอัตโนมัติ (ยังไม่รับรอง)` });
        }
      }
      return out;
    },
  });
}

// ------------------------------------------------------------------ ฝั่งแกนกลาง
interface ItemRow { id: string; seq: number; item_type: string; item_key: string; status: string; extracted: Record<string, string>; edited: Record<string, string> | null; locator: string | null; flags: { code: string }[] }
export async function loadReference(ref: ReferenceOption): Promise<{ indicators: RefIndicator[]; standards: Map<string, string>; duplicates: number }> {
  if (ref.kind === "framework") {
    const rows = await all<{ id: string; full_code: string; statement_th: string; source_citation: string; framework_grade_levels: { code: string } | null;
      learning_standards: { code: string; statement_th: string; framework_learning_areas: { code: string } | null } | null }>((a, b) =>
      sb().from("indicators").select("id, full_code, statement_th, source_citation, framework_grade_levels(code), learning_standards(code, statement_th, framework_learning_areas(code))")
        .eq("framework_version_id", ref.id).order("full_code").range(a, b));
    const standards = new Map<string, string>();
    const indicators = rows.map((r): RefIndicator => {
      const st = r.learning_standards;
      if (st) standards.set(st.code, st.statement_th);
      return { key: normCode(r.full_code), id: r.id, code: r.full_code, standardCode: st?.code ?? "", standardText: st?.statement_th ?? null, statement: r.statement_th,
        grade: normCode(r.framework_grade_levels?.code ?? ""), areaCode: st?.framework_learning_areas?.code ?? r.full_code.trim()[0] ?? "", locator: null, sourceDocId: null,
        flags: [r.source_citation] };
    });
    return { indicators, standards, duplicates: 0 };
  }
  const rows = await all<ItemRow>((a, b) =>
    sb().from("document_analysis_items").select("id, seq, item_type, item_key, status, extracted, edited, locator, flags")
      .eq("analysis_id", ref.id).in("item_type", ["indicator", "standard"]).in("status", ["extracted", "accepted", "committed", "duplicate"]).order("seq").range(a, b));
  const standards = new Map<string, string>();
  const seen = new Map<string, RefIndicator>();
  let duplicates = 0;
  for (const r of rows) {
    const v = { ...r.extracted, ...(r.edited ?? {}) };
    if (r.item_type === "standard") { if (!standards.has(v.code ?? r.item_key)) standards.set(v.code ?? r.item_key, v.statement ?? ""); continue; }
    const key = normCode(v.full_code ?? r.item_key);
    if (seen.has(key)) { duplicates++; continue; } // รายการซ้ำ (หน้าอื่นของเอกสาร) — ใช้รายการแรก
    const code = v.full_code ?? r.item_key;
    seen.set(key, { key, id: null, code, standardCode: v.standard_code ?? "", standardText: null, statement: v.statement ?? "", grade: normCode(v.grade ?? ""),
      areaCode: code.trim()[0] ?? "", locator: r.locator, sourceDocId: ref.sourceDocId, flags: (r.flags ?? []).map((f) => f.code) });
  }
  const indicators = [...seen.values()].map((i) => ({ ...i, standardText: standards.get(i.standardCode) ?? null }));
  return { indicators, standards, duplicates };
}

// ------------------------------------------------------------------ ฝั่งโรงเรียน
const PLAN_FIELDS: [string, string][] = [["objective_k", "จุดประสงค์ (K)"], ["objective_p", "จุดประสงค์ (P)"], ["objective_a", "จุดประสงค์ (A)"], ["content", "สาระการเรียนรู้ในแผน"], ["activities", "กิจกรรมการเรียนรู้"]];
export interface UnitMeta { hours: number | null; essence: string | null; objectives: string | null; seq: number | null; syllabusStatus: string | null }
export interface SchoolData { subjects: SchoolSubject[]; unitMeta: Map<string, UnitMeta>; descriptions: Map<string, string | null>; notes: string[] }

export async function loadSchool(subjectIds: string[], codeOf: (indicatorId: string) => string | null): Promise<SchoolData> {
  const notes: string[] = [];
  const subj: { id: string; code: string; name_th: string; description_th: string | null; source_document_id: string; source_locator: string; grade_levels: { code: string } | null }[] = [];
  const outcomes: { id: string; subject_id: string; code: string; statement_th: string; indicator_id: string | null; source_locator: string }[] = [];
  const syl: { id: string; subject_id: string; status: string; version_no: number; essence: string | null; learning_process: string | null; expected_skills: string | null }[] = [];
  for (const ids of chunks(subjectIds)) {
    const [s, o, c] = await Promise.all([
      sb().from("subjects").select("id, code, name_th, description_th, source_document_id, source_locator, grade_levels(code)").in("id", ids),
      sb().from("subject_learning_outcomes").select("id, subject_id, code, statement_th, indicator_id, source_locator").in("subject_id", ids).order("code"),
      sb().from("course_syllabi").select("id, subject_id, status, version_no, essence, learning_process, expected_skills").in("subject_id", ids).neq("status", "retired").order("version_no", { ascending: false }),
    ]);
    if (s.error) throw s.error;
    subj.push(...(s.data as unknown as typeof subj));
    if (o.error) notes.push("อ่านผลการเรียนรู้ของรายวิชาไม่ได้ (สิทธิ์)"); else outcomes.push(...(o.data as typeof outcomes));
    if (c.error) notes.push("อ่านคำอธิบายรายวิชาฉบับครูไม่ได้ (สิทธิ์)"); else syl.push(...(c.data as typeof syl));
  }
  const latest = new Map<string, (typeof syl)[number]>();
  for (const c of syl) if (!latest.has(c.subject_id)) latest.set(c.subject_id, c);
  const sylIds = [...latest.values()].map((c) => c.id);
  const units: { id: string; syllabus_id: string; seq: number; title: string; essence: string | null; objectives: string | null; hours: number | null; tasks: string | null }[] = [];
  const targets: { id: string; syllabus_id: string; indicator_id: string | null; learning_outcome_id: string | null }[] = [];
  const unitTargets: { unit_id: string; target_id: string }[] = [];
  const plans: { unit_id: string | null; subject_id: string; title: string; content: Record<string, string> }[] = [];
  for (const ids of chunks(sylIds)) {
    const [u, t] = await Promise.all([
      sb().from("course_units").select("id, syllabus_id, seq, title, essence, objectives, hours, tasks").in("syllabus_id", ids).order("seq"),
      sb().from("course_syllabus_targets").select("id, syllabus_id, indicator_id, learning_outcome_id").in("syllabus_id", ids),
    ]);
    if (!u.error) units.push(...(u.data as typeof units));
    if (!t.error) targets.push(...(t.data as typeof targets));
  }
  for (const ids of chunks(units.map((u) => u.id))) {
    const ut = await sb().from("course_unit_targets").select("unit_id, target_id").in("unit_id", ids);
    if (!ut.error) unitTargets.push(...(ut.data as typeof unitTargets));
  }
  for (const ids of chunks(subjectIds)) {
    const p = await sb().from("lesson_plans").select("unit_id, subject_id, title, content").in("subject_id", ids).limit(2000);
    if (!p.error) plans.push(...(p.data as typeof plans));
  }

  const outcomeCode = new Map(outcomes.map((o) => [o.id, o]));
  const targetCode = (tid: string) => {
    const t = targets.find((x) => x.id === tid);
    if (!t) return null;
    if (t.indicator_id) { const c = codeOf(t.indicator_id); return c ? normCode(c) : null; }
    const o = t.learning_outcome_id ? outcomeCode.get(t.learning_outcome_id) : null;
    return o ? findCodes(`${o.code} ${o.statement_th}`)[0] ?? null : null;
  };
  const unitMeta = new Map<string, UnitMeta>();
  const descriptions = new Map<string, string | null>();
  const subjects: SchoolSubject[] = subj.map((s) => {
    descriptions.set(s.id, s.description_th);
    const c = latest.get(s.id);
    const myOutcomes = outcomes.filter((o) => o.subject_id === s.id);
    const myUnits = c ? units.filter((u) => u.syllabus_id === c.id) : [];
    const outcomeParts: TextPart[] = myOutcomes.map((o) => ({ field: `outcome:${o.id}`, label: `ผลการเรียนรู้ ${o.code}`, text: o.statement_th }));
    const subjectDeclared = [...new Set([
      ...findCodes(s.description_th ?? ""),
      ...myOutcomes.flatMap((o) => [...findCodes(`${o.code} ${o.statement_th}`), ...(o.indicator_id ? [codeOf(o.indicator_id)].filter(Boolean).map((x) => normCode(x!)) : [])]),
      ...(c ? targets.filter((t) => t.syllabus_id === c.id).map((t) => targetCode(t.id)).filter((x): x is string => !!x) : []),
    ])];
    const out: SchoolUnit[] = [];
    // คำอธิบายรายวิชาจากทะเบียน (+ผลการเรียนรู้) เป็นหลักฐานระดับรายวิชาเสมอ
    out.push({ id: `desc:${s.id}`, kind: "description", title: "คำอธิบายรายวิชา", locator: s.source_locator, sourceDocId: s.source_document_id,
      declared: subjectDeclared,
      parts: [
        ...(s.description_th ? [{ field: "description", label: "คำอธิบายรายวิชา (ทะเบียน)", text: s.description_th }] : []),
        ...(c?.essence ? [{ field: "syllabus_essence", label: "สาระสำคัญ (คำอธิบายฉบับครู)", text: c.essence }] : []),
        ...outcomeParts,
      ] });
    unitMeta.set(`desc:${s.id}`, { hours: null, essence: c?.essence ?? null, objectives: null, seq: null, syllabusStatus: c?.status ?? null });
    for (const u of myUnits) {
      const myPlans = plans.filter((p) => p.unit_id === u.id);
      out.push({ id: u.id, kind: "unit", title: u.title, locator: null, sourceDocId: null,
        declared: unitTargets.filter((x) => x.unit_id === u.id).map((x) => targetCode(x.target_id)).filter((x): x is string => !!x),
        parts: [
          { field: "title", label: "ชื่อหน่วย", text: u.title },
          ...(u.essence ? [{ field: "essence", label: "สาระสำคัญของหน่วย", text: u.essence }] : []),
          ...(u.objectives ? [{ field: "objectives", label: "จุดประสงค์การเรียนรู้", text: u.objectives }] : []),
          ...(u.tasks ? [{ field: "tasks", label: "ภาระงาน/ชิ้นงาน", text: u.tasks }] : []),
          ...myPlans.flatMap((p) => PLAN_FIELDS.filter(([k]) => p.content?.[k]).map(([k, l]) => ({ field: `plan:${k}`, label: `${l} — แผน “${p.title}”`, text: p.content[k]! }))),
        ] });
      unitMeta.set(u.id, { hours: u.hours, essence: u.essence, objectives: u.objectives, seq: u.seq, syllabusStatus: c?.status ?? null });
    }
    return { id: s.id, code: s.code, name: s.name_th, grade: schoolGrade(s.grade_levels?.code), areaCode: s.code.trim()[0] ?? null, units: out, hasUnits: myUnits.length > 0,
      locator: s.source_locator, sourceDocId: s.source_document_id };
  });
  return { subjects, unitMeta, descriptions, notes };
}

// ------------------------------------------------------------------ การยืนยัน (ตาราง/RPC เดิม)
export interface MappingRow { id: string; subject_id: string; indicator_id: string | null; status: "pending_review" | "verified" | "rejected"; review_note: string | null; verified_at: string | null; verified_by: string | null; coverage: string }
export async function loadDecisions(versionId: string, subjectIds: string[], codeOf: (id: string) => string | null): Promise<{ decisions: Decision[]; rows: MappingRow[] }> {
  const rows: MappingRow[] = [];
  for (const ids of chunks(subjectIds)) {
    const r = await sb().from("curriculum_indicator_mappings").select("id, subject_id, indicator_id, status, review_note, verified_at, verified_by, coverage").eq("curriculum_version_id", versionId).in("subject_id", ids);
    if (r.error) throw r.error;
    rows.push(...(r.data as MappingRow[]));
  }
  const decisions = rows.flatMap((r) => {
    const c = r.indicator_id ? codeOf(r.indicator_id) : null;
    return c ? [{ subjectId: r.subject_id, indicatorKey: normCode(c), status: r.status, note: r.review_note, mappingId: r.id, at: r.verified_at }] : [];
  });
  return { decisions, rows };
}

/** ยืนยัน/ปฏิเสธ: สร้างแถวจับคู่ (ถ้ายังไม่มี) แล้วบันทึกผลผ่าน RPC เดิม — ไม่เปลี่ยนสถานะหลักสูตร */
export async function decideMapping(input: { versionId: string; subjectId: string; indicatorId: string; mappingId: string | null; status: "verified" | "rejected" | "pending_review"; note: string | null; sourceDocId: string; locator: string }) {
  let id = input.mappingId;
  if (!id) {
    const r = await sb().from("curriculum_indicator_mappings").insert({ curriculum_version_id: input.versionId, subject_id: input.subjectId, indicator_id: input.indicatorId,
      coverage: "primary", source_document_id: input.sourceDocId, source_locator: input.locator }).select("id").single();
    if (r.error) throw r.error;
    id = (r.data as { id: string }).id;
  }
  await callRpc("curriculum_mapping_review", { p_id: id, p_status: input.status, p_note: input.note });
  return id;
}

export interface HistoryRow { at: string; action: string; status: string | null; note: string | null; actor: string | null }
export async function loadHistory(mappingId: string): Promise<HistoryRow[] | null> {
  const r = await sb().from("audit_logs").select("created_at, action, new_data, actor_id").eq("table_name", "curriculum_indicator_mappings").eq("record_id", mappingId).order("created_at");
  if (r.error) return null; // ประวัติละเอียดดูได้เฉพาะผู้มีสิทธิ์อ่านบันทึกตรวจสอบ
  return (r.data as { created_at: string; action: string; new_data: { status?: string; review_note?: string } | null; actor_id: string | null }[]).map((x) => ({
    at: x.created_at, action: x.action, status: x.new_data?.status ?? null, note: x.new_data?.review_note ?? null, actor: x.actor_id,
  }));
}
