/**
 * Phase 3 — คำอธิบายรายวิชา/โครงสร้างรายวิชา: อ่าน/เขียนผ่าน RLS + RPC (ฐานข้อมูลตรวจสิทธิ์ทุกครั้ง)
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { callRpc } from "@/features/master-data/api";

export const syllabusKey = ["syllabus"] as const;
export type SyllabusStatus = "draft" | "submitted" | "returned" | "reviewed" | "approved" | "retired";
export const SYLLABUS_STATUS: Record<SyllabusStatus, string> = {
  draft: "ร่าง", submitted: "รอตรวจ", returned: "ส่งกลับแก้ไข", reviewed: "หัวหน้ากลุ่มสาระเห็นชอบ", approved: "อนุมัติแล้ว", retired: "เลิกใช้",
};
export const SYLLABUS_TONE: Record<SyllabusStatus, "secondary" | "warning" | "destructive" | "info" | "success" | "outline"> = {
  draft: "secondary", submitted: "warning", returned: "destructive", reviewed: "info", approved: "success", retired: "outline",
};

export interface MySubject {
  subject_id: string; code: string; name_th: string; name_en: string | null; subject_type: "basic" | "additional"; learning_area: string | null; grade_code: string | null;
  credits: number; learning_hours: number; version_label: string; version_status: string; effective_year_be: number | null;
  syllabus_id: string | null; syllabus_status: SyllabusStatus | null; syllabus_version: number | null;
}
export interface Target { id: string; indicator_id: string | null; learning_outcome_id: string | null; code: string; statement_th: string; verified: boolean | null }
export interface Unit { id: string; seq: number; title: string; essence: string | null; objectives: string | null; hours: number | null; max_score: number | null;
  tasks: string | null; assessment_methods: string | null; target_ids: string[] }
export interface SyllabusData {
  syllabus: { id: string; status: SyllabusStatus; version_no: number; essence: string | null; learning_process: string | null; expected_skills: string | null;
    assessment_note: string | null; competency_ids: string[]; return_note: string | null; can_write: boolean; owner_name: string | null; owner_teacher_id: string | null;
    submitted_at: string | null; approved_at: string | null };
  subject: { id: string; code: string; name_th: string; name_en: string | null; subject_type: string; credits: number; learning_hours: number; description_th: string | null;
    learning_area: string | null; learning_area_id: string; grade_code: string | null; version_label: string; version_status: string; framework_version_id: string | null; source_locator: string };
  outcomes: { id: string; code: string; statement_th: string; kind: string }[];
  targets: Target[];
  units: Unit[];
}
export interface CheckRow { check_code: string; status: "ok" | "warning" | "insufficient" | "info"; message_th: string; target: string }

export const useMySubjects = () => useQuery({ queryKey: [...syllabusKey, "subjects"], queryFn: async () => (await callRpc<MySubject[]>("my_course_subjects", {})) ?? [] });
export const useSyllabus = (id: string | null) =>
  useQuery({ queryKey: [...syllabusKey, "one", id], enabled: !!id, queryFn: () => callRpc<SyllabusData>("course_syllabus_get", { p_syllabus_id: id }) });
export const useSyllabusCheck = (id: string | null) =>
  useQuery({ queryKey: [...syllabusKey, "check", id], enabled: !!id, queryFn: async () => (await callRpc<CheckRow[]>("course_syllabus_check", { p_syllabus_id: id })) ?? [] });

export function useIndicatorSearch(frameworkVersionId: string | null | undefined, q: string) {
  return useQuery({
    queryKey: [...syllabusKey, "ind-search", frameworkVersionId, q],
    enabled: !!frameworkVersionId && q.trim().length >= 1,
    queryFn: async () => {
      const t = q.trim().replace(/[%,()]/g, "");
      const { data, error } = await requireSupabase().from("indicators").select("id, full_code, statement_th")
        .eq("framework_version_id", frameworkVersionId!).or(`full_code.ilike.%${t}%,statement_th.ilike.%${t}%`).order("full_code").limit(30);
      if (error) throw error;
      return data as { id: string; full_code: string; statement_th: string }[];
    },
  });
}
export interface Competency { id: string; kind: string; code: string; name_th: string }
export const useCompetencies = (frameworkVersionId: string | null | undefined) =>
  useQuery({
    queryKey: [...syllabusKey, "competencies", frameworkVersionId], enabled: !!frameworkVersionId,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("framework_competencies").select("id, kind, code, name_th").eq("framework_version_id", frameworkVersionId!).order("kind").order("code");
      if (error) throw error;
      return data as Competency[];
    },
  });

const sb = () => requireSupabase();
const ok = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };
export const openSyllabus = (subjectId: string) => callRpc<string>("course_syllabus_open", { p_subject_id: subjectId });
export const transitionSyllabus = (id: string, action: "submit" | "review" | "return" | "approve", note?: string) =>
  callRpc<string>("course_syllabus_transition", { p_syllabus_id: id, p_action: action, p_note: note ?? null });
export const updateSyllabus = async (id: string, patch: Partial<Pick<SyllabusData["syllabus"], "essence" | "learning_process" | "expected_skills" | "assessment_note" | "competency_ids">>) =>
  ok(await sb().from("course_syllabi").update(patch).eq("id", id).select("id").single());
export const addTarget = async (syllabusId: string, t: { indicator_id?: string; learning_outcome_id?: string }) =>
  ok(await sb().from("course_syllabus_targets").insert({ syllabus_id: syllabusId, ...t }).select("id").single());
export const removeTarget = async (id: string) => ok(await sb().from("course_syllabus_targets").delete().eq("id", id));
export const saveUnit = async (syllabusId: string, u: Partial<Unit> & { seq: number; title: string }) => {
  const { id, target_ids: _t, ...row } = u;
  return id ? ok(await sb().from("course_units").update(row).eq("id", id).select("id").single())
    : ok(await sb().from("course_units").insert({ ...row, syllabus_id: syllabusId }).select("id").single());
};
export const deleteUnit = async (id: string) => ok(await sb().from("course_units").delete().eq("id", id));
export const setUnitTarget = async (unitId: string, targetId: string, on: boolean) =>
  on ? ok(await sb().from("course_unit_targets").insert({ unit_id: unitId, target_id: targetId }))
    : ok(await sb().from("course_unit_targets").delete().eq("unit_id", unitId).eq("target_id", targetId));
