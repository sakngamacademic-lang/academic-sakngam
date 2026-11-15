import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/features/master-data/api";
import { requireSupabase } from "@/lib/supabase";

/** โมดูลวัดผล — ข้อมูลจริงจากฐานข้อมูล · สิทธิ์ตรวจที่ RLS/RPC (ครูเห็นเฉพาะกลุ่มที่สอน) */
export const assessmentKey = ["assessment"] as const;

export interface SectionRow {
  id: string;
  status: string;
  label: string;
  term: string;
}
export function useSections() {
  return useQuery({
    queryKey: [...assessmentKey, "sections"],
    queryFn: async (): Promise<SectionRow[]> => {
      const { data, error } = await requireSupabase().from("course_sections")
        .select("id, status, section_label, subject_offering_id, learning_activity_id, offering:subject_offerings(subject:subjects(code, name_th)), activity:learning_activities(name_th), term:terms(term_no, academic_year:academic_years(year_be))")
        .neq("status", "cancelled").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data as unknown as Array<{ id: string; status: string; section_label: string | null; offering: { subject: { code: string; name_th: string } | null } | null; activity: { name_th: string } | null; term: { term_no: number; academic_year: { year_be: number } | null } | null }>).map((s) => ({
        id: s.id, status: s.status,
        label: `${s.offering?.subject ? `${s.offering.subject.code} ${s.offering.subject.name_th}` : s.activity?.name_th ?? "กลุ่มเรียน"}${s.section_label ? ` · ${s.section_label}` : ""}`,
        term: s.term ? `ภาค ${s.term.term_no}/${s.term.academic_year?.year_be ?? ""}` : "",
      }));
    },
  });
}

export interface Student { id: string; student_code: string; prefix: string; first_name: string; last_name: string }
export interface Component { id: string; name: string; kind: string; max_score: number; sort_order: number }
export interface Score { component_id: string; student_id: string; score: number | null; status: string }
export interface Attendance { student_id: string; session_date: string; period_no: number; status: string }
export interface Grade { student_id: string; total_score: number | null; max_score: number | null; attendance_percent: number | null; grade: string | null; special_reason: string | null; status: "draft" | "submitted" | "approved" }
export interface Progress { student_id: string; pending_work: number; attendance_percent: number | null }

export function useSectionData(sectionId: string | undefined) {
  return useQuery({
    queryKey: [...assessmentKey, "section", sectionId],
    enabled: Boolean(sectionId),
    queryFn: async () => {
      const sb = requireSupabase();
      const [enr, comps, grades, prog, sec] = await Promise.all([
        sb.from("course_enrollments").select("student:students(id, student_code, prefix, first_name, last_name)").eq("course_section_id", sectionId!).eq("status", "enrolled"),
        sb.from("assessment_components").select("id, name, kind, max_score, sort_order").eq("course_section_id", sectionId!).order("sort_order").order("name"),
        sb.from("course_grades").select("student_id, total_score, max_score, attendance_percent, grade, special_reason, status").eq("course_section_id", sectionId!),
        sb.from("v_section_student_progress").select("student_id, pending_work, attendance_percent").eq("course_section_id", sectionId!),
        sb.from("course_sections").select("curriculum_version_id, term:terms(academic_year_id)").eq("id", sectionId!).single(),
      ]);
      for (const r of [enr, comps, grades, prog, sec]) if (r.error) throw r.error;
      const students = (enr.data as unknown as { student: Student | null }[]).map((e) => e.student).filter((s): s is Student => Boolean(s)).sort((a, b) => a.student_code.localeCompare(b.student_code));
      const ids = (comps.data as Component[]).map((c) => c.id);
      const scores = ids.length ? await sb.from("assessment_scores").select("component_id, student_id, score, status").in("component_id", ids) : { data: [], error: null };
      if (scores.error) throw scores.error;
      const att = await sb.from("attendance_records").select("student_id, session_date, period_no, status").eq("course_section_id", sectionId!).order("session_date", { ascending: false }).limit(2000);
      if (att.error) throw att.error;
      const s = sec.data as unknown as { curriculum_version_id: string; term: { academic_year_id: string } | null };
      const pol = await sb.from("grading_policies").select("id, status").eq("curriculum_version_id", s.curriculum_version_id).eq("academic_year_id", s.term?.academic_year_id ?? "").eq("status", "verified").maybeSingle();
      return {
        students, components: comps.data as Component[], scores: scores.data as Score[], attendance: att.data as Attendance[],
        grades: grades.data as Grade[], progress: prog.data as Progress[], policyVerified: Boolean(pol.data),
        locked: (grades.data as Grade[]).some((g) => g.status === "approved"),
      };
    },
  });
}

export const GRADE_STATUS_LABELS = { draft: "ร่าง", submitted: "ส่งแล้ว รออนุมัติ", approved: "อนุมัติแล้ว" } as const;
export const KIND_LABELS: Record<string, string> = { formative: "คะแนนเก็บ", midterm: "กลางภาค", final: "ปลายภาค", project: "ชิ้นงาน", other: "อื่น ๆ" };
export const ATT_LABELS: Record<string, string> = { present: "มา", late: "สาย", absent: "ขาด", leave: "ลา" };

export async function addComponent(sectionId: string, name: string, kind: string, max: number) {
  const { error } = await requireSupabase().from("assessment_components").insert({ course_section_id: sectionId, name: name.trim(), kind, max_score: max });
  if (error) throw error;
}
export async function saveScore(componentId: string, studentId: string, score: number | null, status: string) {
  const { error } = await requireSupabase().from("assessment_scores").upsert(
    { component_id: componentId, student_id: studentId, score: status === "recorded" ? score : null, status }, { onConflict: "component_id,student_id" });
  if (error) throw error;
}
export async function saveAttendance(sectionId: string, studentId: string, date: string, period: number, status: string) {
  const { error } = await requireSupabase().from("attendance_records").upsert(
    { course_section_id: sectionId, student_id: studentId, session_date: date, period_no: period, status }, { onConflict: "course_section_id,student_id,session_date,period_no" });
  if (error) throw error;
}
export const computeGrades = (sectionId: string) => callRpc<{ status: string; reason?: string; students?: number }>("course_grades_compute", { p_section_id: sectionId });
export const submitGrades = (sectionId: string) => callRpc<number>("course_grades_submit", { p_section_id: sectionId });
export const approveGrades = (sectionId: string) => callRpc<number>("course_grades_approve", { p_section_id: sectionId });
export const setSpecialGrade = (sectionId: string, studentId: string, grade: string, reason: string) =>
  callRpc("course_grade_set_special", { p_section_id: sectionId, p_student_id: studentId, p_grade: grade, p_reason: reason });
