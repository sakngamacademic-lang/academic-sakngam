/**
 * ระบบวิเคราะห์เอกสารหลักสูตรอัตโนมัติ (C4) — อ่านผลจากตาราง document_analyses / document_analysis_items (RLS)
 * การเขียนทุกอย่างผ่าน RPC/Edge Function ที่ฐานข้อมูลตรวจสิทธิ์ academic_head · การอ่านเอกสารแยกจากการอนุมัติ
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { callFunction } from "@/lib/storage";
import { callRpc } from "@/features/master-data/api";
import { curriculumKey } from "./api";

export type DocClass = "core_curriculum" | "school_curriculum" | "learning_area_curriculum" | "standards_indicators" | "announcement_time" | "unknown";
export type ItemStatus = "extracted" | "insufficient" | "duplicate" | "accepted" | "rejected" | "committed";
export type Verdict = "pass" | "fail" | "insufficient_data" | "conflict_pending";

export const DOC_CLASS_LABELS: Record<DocClass, string> = {
  core_curriculum: "หลักสูตรแกนกลาง",
  school_curriculum: "หลักสูตรสถานศึกษา",
  learning_area_curriculum: "หลักสูตรกลุ่มสาระ",
  standards_indicators: "เอกสารมาตรฐานและตัวชี้วัด",
  announcement_time: "ประกาศ / การบริหารเวลาเรียน",
  unknown: "ยังจำแนกไม่ได้ (ข้อมูลไม่พอ)",
};
export const ITEM_TYPE_LABELS: Record<string, string> = {
  curriculum_year: "ปีหลักสูตร", revision: "ฉบับปรับปรุง", learning_area: "กลุ่มสาระ", grade_level: "ระดับชั้น", standard: "มาตรฐานการเรียนรู้",
  indicator: "ตัวชี้วัด", subject: "รายวิชา", time_structure: "โครงสร้างเวลาเรียน", study_program: "แผนการเรียน", unreadable: "หน้าที่อ่านไม่ได้",
};
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  extracted: "รอตรวจ", insufficient: "ข้อมูลไม่พอ", duplicate: "ซ้ำ", accepted: "ยอมรับแล้ว", rejected: "ปฏิเสธ", committed: "บันทึกเข้าฐานแล้ว",
};
export const JOB_STATUS_LABELS: Record<string, string> = { queued: "รอคิว", running: "กำลังวิเคราะห์", done: "เสร็จ", failed: "ล้มเหลว" };
export const AI_STATUS_LABELS: Record<string, string> = {
  not_requested: "ไม่ได้ใช้ AI (ไม่ได้อนุญาต)", not_configured: "AI ยังไม่เปิดใช้", used: "ใช้ AI ช่วยจำแนก", not_needed: "ไม่ต้องใช้ AI (rule-based มั่นใจ)", failed: "เรียก AI ไม่สำเร็จ",
};
export const VERDICT_LABELS: Record<Verdict, string> = { pass: "ผ่าน", fail: "ไม่ผ่าน", insufficient_data: "ข้อมูลไม่พอ", conflict_pending: "รอตรวจข้อขัดแย้ง" };
export const VERDICT_ORDER: Verdict[] = ["fail", "conflict_pending", "insufficient_data", "pass"];
/** บันทึกเข้ากรอบแกนกลางได้เฉพาะเอกสารประเภทนี้ */
export const FRAMEWORK_CLASSES: DocClass[] = ["core_curriculum", "standards_indicators"];

export interface Flag { code: string; message_th: string; existing?: string }
export interface DocumentAnalysis {
  id: string;
  source_document_id: string;
  status: "queued" | "running" | "done" | "failed";
  doc_class: DocClass | null;
  class_confidence: number | null;
  class_evidence: { class: DocClass; phrase: string; locator: string }[];
  meta: Record<string, unknown>;
  engine: string | null;
  ai_status: string;
  ai_note: string | null;
  page_count: number | null;
  item_counts: Record<string, number>;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  pages_done: number;
  chunk_count: number;
  attempts: number;
  heartbeat_at: string | null;
  started_at: string | null;
  phase: "extract" | "analyze";
}
export interface AnalysisItem {
  id: string;
  seq: number;
  item_type: string;
  item_key: string;
  extracted: Record<string, unknown>;
  edited: Record<string, unknown> | null;
  locator: string | null;
  excerpt: string | null;
  confidence: number | null;
  proposed_by: "parser" | "ai";
  flags: Flag[];
  status: ItemStatus;
  decision_note: string | null;
}
export interface ReviewRow {
  rule_code: string;
  rule_version: number;
  title_th: string;
  category: string;
  source: string;
  scope: string;
  raw_status: "pass" | "warning" | "fail" | "insufficient_data";
  verdict: Verdict;
  reason: string;
  expected: string | null;
  actual: string | null;
  open_conflicts: string[];
}

export function useAnalyses() {
  return useQuery({
    queryKey: [...curriculumKey, "analyses"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("document_analyses")
        .select("id, source_document_id, status, doc_class, class_confidence, class_evidence, meta, engine, ai_status, ai_note, page_count, item_counts, error, created_at, finished_at, pages_done, chunk_count, attempts, heartbeat_at, started_at, phase")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as DocumentAnalysis[];
    },
    // ติดตามงานเบื้องหลังโดยไม่บล็อกหน้าเว็บ
    refetchInterval: (q) => ((q.state.data as DocumentAnalysis[] | undefined)?.some(isActive) ? 3000 : false),
  });
}

export function useAnalysisItems(analysisId: string | undefined, type: string, status: string) {
  return useQuery({
    queryKey: [...curriculumKey, "analysis-items", analysisId, type, status],
    enabled: Boolean(analysisId),
    queryFn: async () => {
      let q = requireSupabase().from("document_analysis_items")
        .select("id, seq, item_type, item_key, extracted, edited, locator, excerpt, confidence, proposed_by, flags, status, decision_note")
        .eq("analysis_id", analysisId!).order("seq").limit(1000);
      if (type) q = q.eq("item_type", type);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data as AnalysisItem[];
    },
  });
}

export function useAiCapability() {
  return useQuery({
    queryKey: [...curriculumKey, "ai-capability"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => callFunction<{ version?: string; ai: { enabled: boolean; reason: string | null; model: string | null } }>("curriculum-document-analyze", { probe: true }),
  });
}

export function useComplianceReview(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "compliance-review", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => (await callRpc<ReviewRow[]>("curriculum_compliance_review", { p_version_id: versionId })) ?? [],
  });
}

export interface FrameworkVersionRow { id: string; version_label: string; status: "draft" | "published"; is_complete: boolean; framework: { code: string; name_th: string } | null; indicators: { count: number }[] }
export function useFrameworkVersionsWithCounts() {
  return useQuery({
    queryKey: [...curriculumKey, "framework-versions-counts"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("framework_versions")
        .select("id, version_label, status, is_complete, framework:curriculum_frameworks(code, name_th), indicators(count)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as FrameworkVersionRow[];
    },
  });
}

/** งานค้าง: ยังไม่เสร็จและไม่มีความเคลื่อนไหว 10 นาที (ตรงกับ private.document_analysis_is_stale) */
export const STALE_MS = 10 * 60_000;
export const isStale = (a: DocumentAnalysis, now = Date.now()) =>
  (a.status === "queued" || a.status === "running") && now - new Date(a.heartbeat_at ?? a.started_at ?? a.created_at).getTime() > STALE_MS;
export const isActive = (a: DocumentAnalysis) => (a.status === "queued" || a.status === "running") && !isStale(a);
/** ทำต่องานเดิมที่ล้มเหลว/ค้าง (ไม่สร้างงานใหม่ · อ่านต่อจากหน้าที่บันทึกไว้) */
export const resumeAnalysis = (analysisId: string) => callFunction<{ analysisId: string }>("curriculum-document-analyze", { analysisId, resume: true });
/** ปิดงานค้างเป็น failed พร้อมเหตุผล (เปลี่ยนเฉพาะงานที่ค้างจริง) */
export const reapStale = () => callRpc<number>("document_analysis_reap_stale", {});
export const progressText = (a: DocumentAnalysis) =>
  a.phase === "analyze" ? `อ่านครบ ${a.pages_done} หน้า กำลังวิเคราะห์` : a.page_count ? `อ่านแล้ว ${a.pages_done}/${a.page_count} หน้า` : a.pages_done ? `อ่านแล้ว ${a.pages_done} หน้า` : "เริ่มอ่านไฟล์";

export const startAnalysis = (sourceDocumentId: string, allowAi: boolean) =>
  callFunction<{ analysisId: string }>("curriculum-document-analyze", { sourceDocumentId, allowAi });

export const decideItems = (ids: string[], decision: "accept" | "reject" | "reset", opts: { edited?: Record<string, unknown>; locator?: string; note?: string } = {}) =>
  callRpc<number>("document_analysis_item_decide", { p_item_ids: ids, p_decision: decision, p_edited: opts.edited ?? null, p_locator: opts.locator ?? null, p_note: opts.note ?? null });

export const commitFramework = (analysisId: string, f: { code: string; name: string; label: string; year: number | null }) =>
  callRpc<Record<string, number | string>>("document_analysis_commit_framework", {
    p_analysis_id: analysisId, p_framework_code: f.code, p_framework_name: f.name, p_version_label: f.label, p_published_year_be: f.year,
  });

export const confirmFramework = (id: string, complete: boolean) => callRpc("framework_version_confirm", { p_framework_version_id: id, p_is_complete: complete });

/** ค่าที่ใช้ (ค่าที่ผู้ดูแลแก้ > ค่าที่อ่านได้) */
export const effectiveValue = (i: AnalysisItem) => i.edited ?? i.extracted;

/** ปีที่ตรวจพบต่างจากปีหลักสูตรเป้าหมาย → แจ้งว่าเป็นเอกสารปีอื่น (ไม่สร้าง/คัดลอกหลักสูตรอัตโนมัติ) */
export function otherYears(a: DocumentAnalysis, targetYear: number): number[] {
  const ys = (a.meta.curriculum_years as number[] | undefined) ?? [];
  return ys.filter((y) => y > targetYear);
}

/** แสดงค่าที่อ่านได้เป็นข้อความสั้น */
export function describeValue(type: string, v: Record<string, unknown>): string {
  const s = (k: string) => (v[k] == null || v[k] === "" ? "ข้อมูลไม่พอ" : String(v[k]));
  switch (type) {
    case "standard": return `${s("code")} · ${s("area_name")} — ${s("statement")}`;
    case "indicator": return `${s("full_code")} — ${s("statement")}`;
    case "subject": return `${s("code")} ${v.name_th ?? ""} · ${s("credits")} หน่วยกิต · ${s("hours")} ชม.${v.grades ? ` · ม.${v.grades}` : ""}`;
    case "curriculum_year": return `พ.ศ. ${s("year_be")}`;
    case "revision": return `ฉบับปรับปรุง พ.ศ. ${s("revision_year_be")}`;
    case "time_structure": return `${s("label")}: ${((v.numbers as { value: number; paren: number | null }[] | undefined) ?? []).map((n) => (n.paren != null ? `${n.value} (${n.paren})` : n.value)).join(" · ")}`;
    case "unreadable": return s("reason");
    default: return s("name_th") !== "ข้อมูลไม่พอ" ? s("name_th") : s("code");
  }
}

// ---------------------------------------------------------------- Phase 2.2: ค้นหา/กรอง · ความคืบหน้า · ประวัติ
export interface ItemFilters { type: string; status: string; area: string; standard: string; grade: string; flag: string; search: string }
export const EMPTY_FILTERS: ItemFilters = { type: "", status: "", area: "", standard: "", grade: "", flag: "", search: "" };
export const FLAG_FILTERS: Record<string, string> = {
  any: "มีข้อสังเกตใด ๆ", TEXT_REPAIRED: "ซ่อมการถอดอักขระไทย", VARIANT_IN_DOC: "ค่าขัดแย้งในเอกสาร", VARIANT_FRAMEWORK: "ต่างจากฉบับที่มีในระบบ",
  DUPLICATE_IN_DOC: "ซ้ำในเอกสาร", NO_STANDARD: "ไม่พบมาตรฐานกำกับ", NO_STATEMENT: "ไม่มีข้อความ", GRADE_FROM_LAYOUT: "ชั้นจากตำแหน่งคอลัมน์",
};
/** รายการที่ยอมรับพร้อมกันได้ (ตรงกับเงื่อนไขฝั่งฐานข้อมูล) */
const BLOCKING = ["VARIANT_IN_DOC", "VARIANT_FRAMEWORK", "NO_STANDARD", "NO_STATEMENT", "COMMIT_CONFLICT", "COMMIT_INVALID", "NO_AREA"];
export const bulkAcceptable = (i: AnalysisItem) => i.status === "extracted" && !!i.locator && !i.flags.some((f) => BLOCKING.includes(f.code));

export function useAnalysisSearch(analysisId: string | undefined, f: ItemFilters, limit: number) {
  return useQuery({
    queryKey: [...curriculumKey, "analysis-search", analysisId, f, limit],
    enabled: Boolean(analysisId),
    queryFn: async () => (await callRpc<AnalysisItem[]>("document_analysis_items_search", {
      p_analysis_id: analysisId, p_type: f.type || null, p_status: f.status || null, p_area: f.area || null, p_standard: f.standard.trim() || null,
      p_grade: f.grade || null, p_flag: f.flag || null, p_search: f.search.trim() || null, p_limit: limit, p_offset: 0,
    })) ?? [],
  });
}
export interface SummaryRow { item_type: string; area_code: string | null; grade: string | null; status: ItemStatus; repaired: boolean; conflicted: boolean; n: number }
export function useAnalysisSummary(analysisId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "analysis-summary", analysisId],
    enabled: Boolean(analysisId),
    queryFn: async () => (await callRpc<SummaryRow[]>("document_analysis_summary", { p_analysis_id: analysisId })) ?? [],
  });
}
export interface HistoryRow { at: string; actor_name: string; action: string; status: string | null; decision_note: string | null; edited: Record<string, unknown> | null }
export const itemHistory = async (itemId: string) => (await callRpc<HistoryRow[]>("document_analysis_item_history", { p_item_id: itemId })) ?? [];
