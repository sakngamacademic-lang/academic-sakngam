/** ข้อมูลโหมดนำเสนอ/ตรวจสอบภายใน — อ่านอย่างเดียวผ่าน RLS เดิม · ตาราง migration 20261204000100 ถ้ายังไม่ติดตั้งจะแสดงว่า “ยังไม่ได้บันทึก” */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { callRpc } from "@/features/master-data/api";
import { isMissing } from "../categories/api";

const sb = () => requireSupabase();
export const presKey = ["curriculum-presentation"] as const;

export interface Confirmation { id: string; source_document_id: string; scope: string; document_sha256: string; confirmed_by_role: string; confirmed_on: string; evidence_document_id: string | null; evidence_locator: string | null; note: string | null; status: string; revoked_reason: string | null }
export interface Highlight { id: string; kind: "vision" | "mission" | "goal" | "focus" | "highlight"; seq: number; text_th: string; source_document_id: string; source_locator: string; status: "draft" | "confirmed" | "retired" }
export const HIGHLIGHT_LABEL: Record<Highlight["kind"], string> = { vision: "วิสัยทัศน์", mission: "พันธกิจ", goal: "เป้าหมาย", focus: "จุดเน้น", highlight: "จุดเด่นของหลักสูตร" };

export interface PresentationExtras { installed: boolean; confirmations: Confirmation[]; highlights: Highlight[]; verifiedRules: number; verifiedMappings: number; pendingMappings: number }

export function usePresentationExtras(versionId: string | null) {
  return useQuery({
    queryKey: [...presKey, versionId], enabled: !!versionId,
    queryFn: async (): Promise<PresentationExtras> => {
      const v = versionId!;
      const [rules, maps] = await Promise.all([
        sb().from("curriculum_rules").select("id", { count: "exact", head: true }).eq("status", "verified"),
        sb().from("curriculum_indicator_mappings").select("status").eq("curriculum_version_id", v).limit(5000),
      ]);
      const mapRows = (maps.data ?? []) as { status: string }[];
      let installed = true;
      let confirmations: Confirmation[] = [], highlights: Highlight[] = [];
      const [c, h] = await Promise.all([
        sb().from("curriculum_document_confirmations").select("id, source_document_id, scope, document_sha256, confirmed_by_role, confirmed_on, evidence_document_id, evidence_locator, note, status, revoked_reason").eq("curriculum_version_id", v).order("created_at", { ascending: false }),
        sb().from("curriculum_highlights").select("id, kind, seq, text_th, source_document_id, source_locator, status").eq("curriculum_version_id", v).neq("status", "retired").order("kind").order("seq"),
      ]);
      if (c.error || h.error) {
        if (!isMissing(c.error ?? h.error)) throw c.error ?? h.error;
        installed = false;
      } else { confirmations = c.data as Confirmation[]; highlights = h.data as Highlight[]; }
      return { installed, confirmations, highlights, verifiedRules: rules.count ?? 0,
        verifiedMappings: mapRows.filter((m) => m.status === "verified").length, pendingMappings: mapRows.filter((m) => m.status === "pending_review").length };
    },
  });
}

export const confirmDocument = (a: { versionId: string; documentId: string; scope: string; role: string; date: string; evidenceDocId?: string | null; evidenceLocator?: string | null; note?: string | null }) =>
  callRpc<string>("curriculum_document_confirm", { p_version_id: a.versionId, p_document_id: a.documentId, p_scope: a.scope, p_confirmed_by_role: a.role, p_confirmed_on: a.date,
    p_evidence_document_id: a.evidenceDocId ?? null, p_evidence_locator: a.evidenceLocator ?? null, p_note: a.note ?? null });
export const revokeConfirmation = (id: string, reason: string) => callRpc("curriculum_document_confirmation_revoke", { p_id: id, p_reason: reason });
export const saveHighlight = (a: { id: string | null; versionId: string; kind: string; seq: number; text: string; documentId: string; locator: string }) =>
  callRpc<string>("curriculum_highlight_save", { p_id: a.id, p_version_id: a.versionId, p_kind: a.kind, p_seq: a.seq, p_text: a.text, p_document_id: a.documentId, p_locator: a.locator });
export const setHighlightStatus = (id: string, status: "draft" | "confirmed" | "retired") => callRpc("curriculum_highlight_set_status", { p_id: id, p_status: status });

/** บันทึกข้อสังเกตใหม่ในทะเบียนข้อขัดแย้งเดิม (CF) — ไม่แก้ข้อมูลหลักสูตร (สิทธิ์: ผู้ดูแลหลักสูตร ตาม RLS เดิม) */
export async function addObservation(a: { code: string; docA: string; docB: string | null; locatorA: string; locatorB: string | null; subject: string | null; description: string;
  category: string; valueA: string | null; valueB: string | null; recommendation: string | null; impact: "blocking" | "warning" }) {
  const r = await sb().from("source_conflicts").insert({ conflict_code: a.code, doc_a_id: a.docA, doc_b_id: a.docB, locator_a: a.locatorA, locator_b: a.locatorB, subject_ref: a.subject,
    description: a.description, impact: a.impact, category: a.category, value_a: a.valueA, value_b: a.valueB, recommendation: a.recommendation, decision_authority: "academic_head" }).select("id").single();
  if (r.error) throw r.error;
  return (r.data as { id: string }).id;
}
