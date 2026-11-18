/** ประเภทหลักสูตรและเกณฑ์ประเมิน — อ่านข้อมูลจริงผ่าน RLS เดิม · เขียนผ่าน RPC ของ migration 20261203000100 (ต้องติดตั้งก่อน) */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { callRpc } from "@/features/master-data/api";
import { schoolGrade } from "@/features/mapping/match";
import type { ActivityRow, Category, EvidenceRow, LinkStatus, ProgramRow, StoredLink, SubjectRow, TargetType } from "./classify";

const sb = () => requireSupabase();
export const catKey = ["curriculum-categories"] as const;
/** ตาราง/ฟังก์ชันยังไม่ถูกติดตั้งบนฐานข้อมูลนี้ */
export const isMissing = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === "PGRST205" || x.code === "PGRST202" || x.code === "42P01" || /schema cache|does not exist/i.test(x.message ?? ""));
};
async function all<T>(build: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const r = await build(a, a + 999);
    if (r.error) throw r.error;
    const d = (r.data ?? []) as T[];
    out.push(...d);
    if (d.length < 1000) return out;
  }
}

export interface Criterion {
  id: string; parent_id: string | null; seq: number; code: string; title_th: string; issuer: string | null; edition: string | null; year_be: number | null;
  quality_level: string | null; categories: Category[]; report_section: string | null; requirement_th: string | null; source_document_id: string | null;
  source_locator: string | null; status: "draft" | "verified" | "retired"; verified_at: string | null; note: string | null;
}
export interface CategoryData {
  programs: ProgramRow[]; subjects: SubjectRow[]; activities: ActivityRow[];
  installed: boolean; links: StoredLink[]; criteria: Criterion[]; evidence: EvidenceRow[];
}

export function useCategoryData(versionId: string | null) {
  return useQuery({
    queryKey: [...catKey, versionId], enabled: !!versionId,
    queryFn: async (): Promise<CategoryData> => {
      const v = versionId!;
      const [programs, subjects, offerings, activities] = await Promise.all([
        all<ProgramRow>((a, b) => sb().from("study_programs").select("id, code, name_th, stage, source_document_id, source_locator").eq("curriculum_version_id", v).order("code").range(a, b)),
        all<{ id: string; code: string; name_th: string; subject_type: string; description_th: string | null; credits: number | null; learning_hours: number | null; source_document_id: string | null; source_locator: string | null; grade_levels: { code: string } | null }>((a, b) =>
          sb().from("subjects").select("id, code, name_th, subject_type, description_th, credits, learning_hours, source_document_id, source_locator, grade_levels(code)").eq("curriculum_version_id", v).order("code").range(a, b)),
        all<{ subject_id: string; study_program_id: string | null }>((a, b) => sb().from("subject_offerings").select("subject_id, study_program_id").eq("curriculum_version_id", v).range(a, b)),
        all<{ id: string; activity_type: string; name_th: string; activity_hours: number; study_program_id: string | null; source_document_id: string; source_locator: string; grade_levels: { code: string } | null }>((a, b) =>
          sb().from("learning_activities").select("id, activity_type, name_th, activity_hours, study_program_id, source_document_id, source_locator, grade_levels(code)").eq("curriculum_version_id", v).range(a, b)),
      ]);
      const progOf = new Map<string, Set<string>>();
      for (const o of offerings) if (o.study_program_id) (progOf.get(o.subject_id) ?? progOf.set(o.subject_id, new Set()).get(o.subject_id)!).add(o.study_program_id);
      let installed = true;
      let links: StoredLink[] = [], criteria: Criterion[] = [], evidence: EvidenceRow[] = [];
      try {
        [links, criteria, evidence] = await Promise.all([
          all<StoredLink>((a, b) => sb().from("curriculum_category_links").select("id, category, target_type, target_id, status, reason, source_document_id, source_locator, decided_at").eq("curriculum_version_id", v).range(a, b)),
          all<Criterion>((a, b) => sb().from("assessment_criteria").select("id, parent_id, seq, code, title_th, issuer, edition, year_be, quality_level, categories, report_section, requirement_th, source_document_id, source_locator, status, verified_at, note").neq("status", "retired").order("code").range(a, b)),
          all<EvidenceRow>((a, b) => sb().from("criteria_evidence").select("id, criterion_id, target_type, target_id, result, status, note, source_document_id, source_locator, decided_at").eq("curriculum_version_id", v).range(a, b)),
        ]);
      } catch (e) {
        if (!isMissing(e)) throw e;
        installed = false; // migration ยังไม่ติดตั้ง — แสดงข้อเสนอจากข้อมูลจริงได้ แต่บันทึกผลตรวจ/เกณฑ์ยังไม่ได้
      }
      return {
        programs,
        subjects: subjects.map((s) => ({ id: s.id, code: s.code, name_th: s.name_th, subject_type: s.subject_type, description_th: s.description_th, grade: schoolGrade(s.grade_levels?.code),
          program_ids: [...(progOf.get(s.id) ?? [])], source_document_id: s.source_document_id, source_locator: s.source_locator, hours: s.learning_hours, credits: s.credits })),
        activities: activities.map((x) => ({ id: x.id, activity_type: x.activity_type, name_th: x.name_th, activity_hours: x.activity_hours, study_program_id: x.study_program_id,
          grade: schoolGrade(x.grade_levels?.code), source_document_id: x.source_document_id, source_locator: x.source_locator })),
        installed, links, criteria, evidence,
      };
    },
  });
}

export const setCategory = (a: { versionId: string; category: Category; targetType: TargetType; targetId: string; status: LinkStatus; reason: string; docId?: string | null; locator?: string | null }) =>
  callRpc<string>("curriculum_category_set", { p_version_id: a.versionId, p_category: a.category, p_target_type: a.targetType, p_target_id: a.targetId, p_status: a.status,
    p_reason: a.reason, p_source_document_id: a.docId ?? null, p_source_locator: a.locator ?? null });
export const saveCriterion = (id: string | null, data: Record<string, unknown>) => callRpc<string>("assessment_criterion_save", { p_id: id, p_data: data });
export const verifyCriterion = (id: string, status: "draft" | "verified" | "retired") => callRpc("assessment_criterion_verify", { p_id: id, p_status: status });
export const setEvidence = (a: { criterionId: string; versionId: string; targetType: string; targetId: string; result: EvidenceRow["result"]; status: LinkStatus; note?: string | null; docId?: string | null; locator?: string | null }) =>
  callRpc<string>("criteria_evidence_set", { p_criterion_id: a.criterionId, p_version_id: a.versionId, p_target_type: a.targetType, p_target_id: a.targetId, p_result: a.result,
    p_status: a.status, p_note: a.note ?? null, p_source_document_id: a.docId ?? null, p_source_locator: a.locator ?? null });
