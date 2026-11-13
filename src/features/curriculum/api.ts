/**
 * Curriculum Intelligence — data access (C1.1–C2)
 * อ่านผ่าน RLS · เปลี่ยนสถานะ/อนุมัติ/commit ผ่าน RPC เท่านั้น · ไม่มีข้อมูลหลักสูตรฝังในโค้ด
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { callRpc } from "@/features/master-data/api";

export const curriculumKey = ["curriculum"] as const;
export const PAGE_SIZE = 25;

export type VersionStatus = "draft" | "under_review" | "approved" | "active" | "retired";
export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  draft: "ฉบับร่าง",
  under_review: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  active: "ใช้งานอยู่",
  retired: "เลิกใช้",
};
export const SUBJECT_TYPE_LABELS = { basic: "รายวิชาพื้นฐาน", additional: "รายวิชาเพิ่มเติม" } as const;
export const STAGE_LABELS: Record<string, string> = {
  primary: "ประถมศึกษา",
  lower_secondary: "มัธยมศึกษาตอนต้น",
  upper_secondary: "มัธยมศึกษาตอนปลาย",
  other: "อื่น ๆ",
};
export const BATCH_KIND_LABELS: Record<string, string> = {
  study_programs: "แผนการเรียน",
  subjects: "รายวิชา",
  subject_offerings: "โครงสร้างรายวิชา",
  learning_activities: "กิจกรรมพัฒนาผู้เรียน",
  learning_outcomes: "ผลการเรียนรู้ / ตัวชี้วัดระหว่างทาง",
  indicator_mappings: "Mapping ตัวชี้วัด",
};
export const BATCH_STATUS_LABELS: Record<string, string> = {
  uploaded: "รออ่านไฟล์",
  parsed: "อ่านไฟล์แล้ว",
  validated: "ตรวจแล้ว",
  needs_review: "รอตรวจรายแถว",
  approved: "อนุมัติแล้ว (รอบันทึก)",
  committed: "บันทึกแล้ว",
  rejected: "ปฏิเสธ",
  failed: "อ่านไฟล์ไม่สำเร็จ",
};
export const ROW_STATUS_LABELS: Record<string, string> = {
  pending: "รอตรวจ",
  valid: "ถูกต้อง",
  warning: "มีคำเตือน",
  error: "ผิดพลาด",
  needs_review: "ต้องตรวจโดยคน",
  approved: "อนุมัติ",
  skipped: "ข้าม",
  committed: "บันทึกแล้ว",
};
export const DOC_TYPE_LABELS: Record<string, string> = {
  curriculum_book: "เล่มหลักสูตร",
  announcement: "ประกาศใช้หลักสูตร",
  learning_area_curriculum: "หลักสูตรกลุ่มสาระ",
  assessment_regulation: "ระเบียบวัดผล",
  structure_workbook: "ไฟล์โครงสร้าง (Excel)",
  other: "อื่น ๆ",
};

/** รูปแบบช่องที่ต้องกรอกต่อชนิดการนำเข้า (ตรงกับ private.curriculum_validate) */
export const NORMALIZED_FIELDS: Record<string, string[]> = {
  study_programs: ["code", "name_th", "stage"],
  subjects: ["code", "name_th", "name_en", "learning_area_code", "subject_type", "grade_code", "credits", "learning_hours", "description_th", "subject_category", "education_stage"],
  subject_offerings: ["subject_code", "program_code", "grade_code", "term_no", "offering_kind", "hours_per_week", "sort_order"],
  learning_activities: ["activity_type", "name_th", "program_code", "grade_code", "term_no", "activity_hours"],
  learning_outcomes: ["subject_code", "outcome_kind", "code", "statement_th", "indicator_full_code"],
  indicator_mappings: ["subject_code", "indicator_full_code", "coverage"],
};

export interface CurriculumVersion {
  id: string;
  school_curriculum_id: string;
  framework_version_id: string | null;
  framework_status: "confirmed" | "provisional";
  version_label: string;
  effective_year_be: number | null;
  hours_per_credit: number | null;
  status: VersionStatus;
  announcement_source_id: string | null;
  announcement_locator: string | null;
  based_on_version_id: string | null;
  approved_at: string | null;
}
export interface SchoolCurriculum {
  id: string;
  name_th: string;
  versions: CurriculumVersion[];
}

export function useCurricula() {
  return useQuery({
    queryKey: [...curriculumKey, "curricula"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("school_curricula")
        .select("id, name_th, versions:curriculum_versions(id, school_curriculum_id, framework_version_id, framework_status, version_label, effective_year_be, hours_per_credit, status, announcement_source_id, announcement_locator, based_on_version_id, approved_at)")
        .order("name_th");
      if (error) throw error;
      return data as unknown as SchoolCurriculum[];
    },
  });
}

export const allVersions = (c: SchoolCurriculum[] | undefined) =>
  (c ?? []).flatMap((x) => x.versions.map((v) => ({ ...v, curriculum_name: x.name_th })));

export interface FrameworkVersion {
  id: string;
  version_label: string;
  status: string;
  is_complete: boolean;
  framework: { code: string; name_th: string } | null;
}
export function useFrameworkVersions() {
  return useQuery({
    queryKey: [...curriculumKey, "framework-versions"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("framework_versions")
        .select("id, version_label, status, is_complete, framework:curriculum_frameworks(code, name_th)")
        .order("version_label");
      if (error) throw error;
      return data as unknown as FrameworkVersion[];
    },
  });
}

export interface SourceDocument {
  id: string;
  register_code: string;
  title: string;
  doc_type: string;
  reliability: string;
  content_status: string;
  status: string;
  page_count: number | null;
  page_offset: number | null;
  declared_curriculum_ref: string | null;
  sha256: string | null;
  file_id: string | null;
  parent_id: string | null;
  notes: string | null;
}
export function useSourceDocuments() {
  return useQuery({
    queryKey: [...curriculumKey, "sources"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("source_documents")
        .select("id, register_code, title, doc_type, reliability, content_status, status, page_count, page_offset, declared_curriculum_ref, sha256, file_id, parent_id, notes")
        .order("register_code");
      if (error) throw error;
      return data as SourceDocument[];
    },
  });
}

export interface SourceConflict {
  id: string;
  conflict_code: string;
  doc_a_id: string;
  doc_b_id: string | null;
  description: string;
  impact: "blocking" | "warning";
  status: ConflictStatus;
  resolution: string | null;
  category: ConflictCategory;
  subject_ref: string | null;
  locator_a: string | null;
  locator_b: string | null;
  value_a: string | null;
  value_b: string | null;
  difference: string | null;
  impact_note: string | null;
  recommendation: string | null;
  decision_authority: DecisionAuthority;
  resolved_at: string | null;
  updated_at: string;
}
export type ConflictStatus = "open" | "needs_decision" | "resolved";
export type ConflictCategory =
  | "page_reference" | "credits" | "learning_hours" | "program_total" | "duplicate_code" | "subject_name"
  | "subject_type" | "subject_code" | "missing_data" | "framework" | "other";
export type DecisionAuthority = "academic_head" | "learning_area_head" | "academic_committee" | "director";
export const CONFLICT_STATUS_LABELS: Record<ConflictStatus, string> = { open: "เปิด", needs_decision: "รอตัดสินใจ", resolved: "ตัดสินแล้ว" };
export const CONFLICT_CATEGORY_LABELS: Record<ConflictCategory, string> = {
  page_reference: "เลขหน้า/ที่มา", credits: "หน่วยกิต", learning_hours: "ชั่วโมงเรียน", program_total: "ยอดรวมแผนการเรียน",
  duplicate_code: "รหัสซ้ำ/ชื่อต่าง", subject_name: "ชื่อรายวิชา", subject_type: "ประเภทรายวิชา", subject_code: "รหัสวิชา",
  missing_data: "ข้อมูลไม่ครบ", framework: "กรอบหลักสูตรแกนกลาง", other: "อื่น ๆ",
};
export const AUTHORITY_LABELS: Record<DecisionAuthority, string> = {
  academic_head: "หัวหน้าฝ่ายวิชาการ", learning_area_head: "หัวหน้ากลุ่มสาระ", academic_committee: "คณะกรรมการวิชาการ", director: "ผู้อำนวยการ",
};
export function useConflicts() {
  return useQuery({
    queryKey: [...curriculumKey, "conflicts"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("source_conflicts")
        .select("id, conflict_code, doc_a_id, doc_b_id, description, impact, status, resolution, category, subject_ref, locator_a, locator_b, value_a, value_b, difference, impact_note, recommendation, decision_authority, resolved_at, updated_at")
        .order("conflict_code");
      if (error) throw error;
      return data as SourceConflict[];
    },
  });
}

export interface StudyProgram {
  id: string;
  curriculum_version_id: string;
  code: string;
  name_th: string;
  stage: string;
  is_active: boolean;
  source_locator: string;
}
export function usePrograms(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "programs", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("study_programs")
        .select("id, curriculum_version_id, code, name_th, stage, is_active, source_locator")
        .eq("curriculum_version_id", versionId!)
        .order("code");
      if (error) throw error;
      return data as StudyProgram[];
    },
  });
}

export interface Subject {
  id: string;
  code: string;
  name_th: string;
  name_en: string | null;
  /** null ได้เฉพาะรายวิชา IS (subject_category = "is") */
  learning_area_id: string | null;
  subject_type: "basic" | "additional";
  subject_category: "regular" | "is";
  /** ใช้กับ IS เท่านั้น — แยก IS ม.ต้น/ม.ปลาย ที่ใช้รหัสเดียวกัน */
  education_stage: "lower_secondary" | "upper_secondary" | null;
  grade_level_id: string | null;
  credits: number;
  learning_hours: number;
  description_th: string | null;
  source_document_id: string;
  source_locator: string;
  import_row_id: string | null;
}
const SUBJECT_COLS = "id, code, name_th, name_en, learning_area_id, subject_type, grade_level_id, credits, learning_hours, description_th, source_document_id, source_locator, import_row_id, subject_category, education_stage";

export function useSubjects(versionId: string | undefined, f: { search: string; area: string; type: string; grade: string; page: number }) {
  return useQuery({
    queryKey: [...curriculumKey, "subjects", versionId, f],
    enabled: !!versionId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = requireSupabase().from("subjects").select(SUBJECT_COLS, { count: "exact" }).eq("curriculum_version_id", versionId!);
      if (f.area) q = q.eq("learning_area_id", f.area);
      if (f.type) q = q.eq("subject_type", f.type);
      if (f.grade) q = q.eq("grade_level_id", f.grade);
      if (f.search.trim()) {
        const s = f.search.trim().replace(/[%,()]/g, "");
        q = q.or(`code.ilike.%${s}%,name_th.ilike.%${s}%`);
      }
      const from = f.page * PAGE_SIZE;
      const { data, error, count } = await q.order("code").range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data as Subject[], total: count ?? 0 };
    },
  });
}

export interface SubjectDetail extends Subject {
  source: { register_code: string; title: string; reliability: string; status: string } | null;
  outcomes: { id: string; outcome_kind: string; code: string; statement_th: string; source_locator: string }[];
  mappings: {
    id: string;
    status: string;
    coverage: string;
    source_locator: string;
    indicator: { full_code: string; statement_th: string; standard: { code: string; statement_th: string } | null } | null;
  }[];
}
export function useSubjectDetail(id: string | null) {
  return useQuery({
    queryKey: [...curriculumKey, "subject", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("subjects")
        .select(
          `${SUBJECT_COLS}, source:source_documents(register_code, title, reliability, status),
           outcomes:subject_learning_outcomes(id, outcome_kind, code, statement_th, source_locator),
           mappings:curriculum_indicator_mappings(id, status, coverage, source_locator, indicator:indicators(full_code, statement_th, standard:learning_standards(code, statement_th)))`,
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SubjectDetail | null;
    },
  });
}

export interface StructureRow {
  id: string;
  term_no: number | null;
  offering_kind: string;
  hours_per_week: number | null;
  sort_order: number;
  source_locator: string;
  subject: Pick<Subject, "id" | "code" | "name_th" | "subject_type" | "credits" | "learning_hours" | "learning_area_id"> | null;
}
export interface ActivityRow {
  id: string;
  activity_type: string;
  name_th: string;
  term_no: number | null;
  activity_hours: number;
  source_locator: string;
}
export function useStructure(versionId: string | undefined, programId: string, gradeId: string, term: string) {
  return useQuery({
    queryKey: [...curriculumKey, "structure", versionId, programId, gradeId, term],
    enabled: !!versionId && !!gradeId,
    queryFn: async () => {
      const sb = requireSupabase();
      let o = sb
        .from("subject_offerings")
        .select("id, term_no, offering_kind, hours_per_week, sort_order, source_locator, subject:subjects(id, code, name_th, subject_type, credits, learning_hours, learning_area_id)")
        .eq("curriculum_version_id", versionId!)
        .eq("grade_level_id", gradeId);
      let a = sb.from("learning_activities").select("id, activity_type, name_th, term_no, activity_hours, source_locator").eq("curriculum_version_id", versionId!).eq("grade_level_id", gradeId);
      // แผนการเรียน: รายการเฉพาะแผน + รายการที่ใช้ทุกแผน (study_program_id = null)
      o = programId ? o.or(`study_program_id.eq.${programId},study_program_id.is.null`) : o.is("study_program_id", null);
      a = programId ? a.or(`study_program_id.eq.${programId},study_program_id.is.null`) : a.is("study_program_id", null);
      if (term) {
        o = o.or(`term_no.eq.${term},term_no.is.null`);
        a = a.or(`term_no.eq.${term},term_no.is.null`);
      }
      const [offerings, activities] = await Promise.all([o.order("sort_order"), a.order("name_th")]);
      if (offerings.error) throw offerings.error;
      if (activities.error) throw activities.error;
      return { offerings: offerings.data as unknown as StructureRow[], activities: activities.data as ActivityRow[] };
    },
  });
}

export interface Implementation {
  id: string;
  curriculum_version_id: string;
  study_program_id: string | null;
  entry_academic_year_id: string;
  entry_grade_level_id: string;
  status: string;
  decided_locator: string;
}
export function useImplementations() {
  return useQuery({
    queryKey: [...curriculumKey, "implementations"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("curriculum_implementations")
        .select("id, curriculum_version_id, study_program_id, entry_academic_year_id, entry_grade_level_id, status, decided_locator");
      if (error) throw error;
      return data as Implementation[];
    },
  });
}

export interface ClassroomCurriculum {
  classroom_id: string;
  academic_year_id: string;
  grade_level_id: string;
  room_no: number;
  study_program_id: string | null;
  resolution: "resolved" | "unresolved" | "ambiguous";
  curriculum_version_id: string | null;
  entry_year_be: number | null;
}
export function useClassroomCurriculum(yearId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "classroom-curriculum", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("v_classroom_curriculum").select("*").eq("academic_year_id", yearId!).order("room_no");
      if (error) throw error;
      return data as ClassroomCurriculum[];
    },
  });
}

export interface ImportBatch {
  id: string;
  source_document_id: string;
  curriculum_version_id: string;
  kind: string;
  learning_area_id: string | null;
  status: string;
  parser: string | null;
  column_mapping: Record<string, unknown> | null;
  counts: Record<string, number>;
  status_note: string | null;
  created_by: string;
  approved_by: string | null;
  created_at: string;
}
export function useBatches() {
  return useQuery({
    queryKey: [...curriculumKey, "batches"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("import_batches")
        .select("id, source_document_id, curriculum_version_id, kind, learning_area_id, status, parser, column_mapping, counts, status_note, created_by, approved_by, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ImportBatch[];
    },
  });
}

export interface ImportRow {
  id: string;
  row_no: number;
  source_sheet: string | null;
  source_cell_range: string | null;
  source_page: number | null;
  raw: Record<string, unknown>;
  normalized: Record<string, string>;
  issues: { code: string; field: string | null; severity: "error" | "warning" | "info"; message_th: string }[];
  status: string;
  proposed_by: string;
  decision_note: string | null;
}
export function useBatchRows(batchId: string | undefined, status: string, page: number) {
  return useQuery({
    queryKey: [...curriculumKey, "rows", batchId, status, page],
    enabled: !!batchId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = requireSupabase()
        .from("import_rows")
        .select("id, row_no, source_sheet, source_cell_range, source_page, raw, normalized, issues, status, proposed_by, decision_note", { count: "exact" })
        .eq("batch_id", batchId!);
      if (status) q = q.eq("status", status);
      const from = page * PAGE_SIZE;
      const { data, error, count } = await q.order("row_no").range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data as ImportRow[], total: count ?? 0 };
    },
  });
}

export interface CoverageRow {
  indicator_id: string;
  full_code: string;
  area_code: string;
  grade_code: string;
  framework_complete: boolean;
  verified_count: number;
  pending_count: number;
  rejected_count: number;
  coverage_status: "verified" | "pending_review" | "unmapped";
  evidence_incomplete: boolean;
  possible_duplicate: boolean;
}
export function useCoverage(versionId: string | undefined, status: string, page: number) {
  return useQuery({
    queryKey: [...curriculumKey, "coverage", versionId, status, page],
    enabled: !!versionId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const sb = requireSupabase();
      let q = sb.from("v_indicator_coverage").select("*", { count: "exact" }).eq("curriculum_version_id", versionId!);
      if (status === "evidence") q = q.eq("evidence_incomplete", true);
      else if (status === "duplicate") q = q.eq("possible_duplicate", true);
      else if (status) q = q.eq("coverage_status", status);
      const from = page * PAGE_SIZE;
      const [list, ...counts] = await Promise.all([
        q.order("full_code").range(from, from + PAGE_SIZE - 1),
        ...["verified", "pending_review", "unmapped"].map((s) =>
          sb.from("v_indicator_coverage").select("indicator_id", { count: "exact", head: true }).eq("curriculum_version_id", versionId!).eq("coverage_status", s),
        ),
      ]);
      if (list.error) throw list.error;
      const [v, p, u] = counts.map((c) => c.count ?? 0);
      return { rows: list.data as CoverageRow[], total: list.count ?? 0, verified: v!, pending: p!, unmapped: u! };
    },
  });
}

export interface PendingMapping {
  id: string;
  status: string;
  coverage: string;
  source_locator: string;
  subject: { code: string; name_th: string } | null;
  indicator: { full_code: string; statement_th: string } | null;
}
export function usePendingMappings(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "pending-mappings", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("curriculum_indicator_mappings")
        .select("id, status, coverage, source_locator, subject:subjects(code, name_th), indicator:indicators(full_code, statement_th)")
        .eq("curriculum_version_id", versionId!)
        .eq("status", "pending_review")
        .limit(100);
      if (error) throw error;
      return data as unknown as PendingMapping[];
    },
  });
}

export interface IndicatorRow {
  id: string;
  full_code: string;
  indicator_kind: string;
  statement_th: string;
  source_citation: string;
}
export function useIndicators(frameworkVersionId: string | undefined, search: string, page: number) {
  return useQuery({
    queryKey: [...curriculumKey, "indicators", frameworkVersionId, search, page],
    enabled: !!frameworkVersionId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = requireSupabase()
        .from("indicators")
        .select("id, full_code, indicator_kind, statement_th, source_citation", { count: "exact" })
        .eq("framework_version_id", frameworkVersionId!);
      if (search.trim()) q = q.or(`full_code.ilike.%${search.trim().replace(/[%,()]/g, "")}%,statement_th.ilike.%${search.trim().replace(/[%,()]/g, "")}%`);
      const from = page * PAGE_SIZE;
      const { data, error, count } = await q.order("full_code").range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data as IndicatorRow[], total: count ?? 0 };
    },
  });
}

/** ตัวนับจริงสำหรับ Dashboard (ไม่มีตัวเลขสมมติ) */
export function useCurriculumCounts() {
  return useQuery({
    queryKey: [...curriculumKey, "counts"],
    queryFn: async () => {
      const sb = requireSupabase();
      const head = (t: string) => sb.from(t).select("id", { count: "exact", head: true });
      const [programs, subjects, indicators, pendingRows, openBatches, openConflicts, blocking] = await Promise.all([
        head("study_programs"),
        head("subjects"),
        head("indicators"),
        sb.from("import_rows").select("id", { count: "exact", head: true }).in("status", ["pending", "valid", "warning", "error", "needs_review"]),
        sb.from("import_batches").select("id", { count: "exact", head: true }).not("status", "in", "(committed,rejected)"),
        sb.from("source_conflicts").select("id", { count: "exact", head: true }).neq("status", "resolved"),
        sb.from("source_conflicts").select("id", { count: "exact", head: true }).neq("status", "resolved").eq("impact", "blocking"),
      ]);
      const c = (r: { count: number | null }) => r.count ?? 0;
      return {
        programs: c(programs),
        subjects: c(subjects),
        indicators: c(indicators),
        pendingRows: c(pendingRows),
        openBatches: c(openBatches),
        openConflicts: c(openConflicts),
        blockingConflicts: c(blocking),
      };
    },
  });
}

// ---------------------------------------------------------------- mutations (RPC / RLS)
export const rpc = callRpc;

export async function insertRow(table: string, values: Record<string, unknown>) {
  const { error } = await requireSupabase().from(table).insert(values);
  if (error) throw error;
}

// ---------------------------------------------------------------- Review queue / ข้อมูลรอตรวจ (อ่านอย่างเดียว · ยังไม่ยืนยัน)
export interface StagedStructureRow {
  grade_code: string;
  program_code: string | null;
  term_no: number | null;
  subject_type: "basic" | "additional" | "unresolved";
  subjects: number;
  credits: number;
  learning_hours: number;
  unresolved: number;
}
export function useStagedStructure(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "staged-structure", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => (await callRpc<StagedStructureRow[]>("curriculum_staged_structure", { p_version_id: versionId })) ?? [],
  });
}
export interface ReviewQueueRow {
  batch_id: string;
  row_id: string;
  row_no: number;
  kind: string;
  source_page: number | null;
  row_status: string;
  ref_kind: "subject" | "program";
  ref_code: string;
  resolution: "committed" | "staged" | "staged_error" | "missing";
}
export function useReviewQueue(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "review-queue", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => {
      const sb = requireSupabase();
      const args = { p_version_id: versionId };
      // นับฝั่งเซิร์ฟเวอร์ (ไม่ดึงทุกแถว — PostgREST จำกัด 1,000 แถว) + ดึงเฉพาะรายการที่มีปัญหา
      const count = async (res: ReviewQueueRow["resolution"]) => {
        const { count: n, error } = await sb.rpc("curriculum_review_queue", args, { count: "exact", head: true }).eq("resolution", res);
        if (error) throw error;
        return n ?? 0;
      };
      const [committed, staged, stagedError, missing] = await Promise.all([count("committed"), count("staged"), count("staged_error"), count("missing")]);
      const { data, error } = await sb.rpc("curriculum_review_queue", args).in("resolution", ["staged_error", "missing"]).order("kind").order("row_no").limit(500);
      if (error) throw error;
      return { counts: { committed, staged, staged_error: stagedError, missing }, problems: (data ?? []) as ReviewQueueRow[] };
    },
  });
}

// ---------------------------------------------------------------- Compliance / Analytics (ข้อมูลจริงจากฐานข้อมูลเท่านั้น)
export type ComplianceStatus = "pass" | "warning" | "fail" | "insufficient_data";
export interface ComplianceRow {
  rule_code: string;
  rule_version: number;
  title_th: string;
  category: string;
  source: string;
  scope: string;
  status: ComplianceStatus;
  expected: string | null;
  actual: string | null;
  detail: string | null;
}
export const COMPLIANCE_LABELS: Record<ComplianceStatus, string> = { pass: "ผ่าน", warning: "เตือน", fail: "ไม่ผ่าน", insufficient_data: "ข้อมูลไม่พอ" };
export function useCompliance(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "compliance", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => (await callRpc<ComplianceRow[]>("curriculum_compliance_check", { p_version_id: versionId })) ?? [],
  });
}
export interface CurriculumRule {
  id: string;
  code: string;
  version: number;
  title_th: string;
  category: string;
  rule_type: string;
  params: Record<string, unknown>;
  source_locator: string | null;
  source_document_id: string | null;
  status: "draft" | "verified" | "retired";
  proposed_by: string;
  note: string | null;
  verified_at: string | null;
}
export function useRules() {
  return useQuery({
    queryKey: [...curriculumKey, "rules"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("curriculum_rules")
        .select("id, code, version, title_th, category, rule_type, params, source_locator, source_document_id, status, proposed_by, note, verified_at").order("code");
      if (error) throw error;
      return data as CurriculumRule[];
    },
  });
}
export interface StructureSummaryRow { grade_code: string; program_code: string | null; subject_type: "basic" | "additional"; subjects: number; credits: number; learning_hours: number }
export function useStructureSummary(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "structure-summary", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => (await callRpc<StructureSummaryRow[]>("curriculum_structure_summary", { p_version_id: versionId })) ?? [],
  });
}
/** สถานะแถวนำเข้าต่อชนิดชุด — จาก import_batches.counts (คำนวณโดยฐานข้อมูลทุกครั้งที่แถวเปลี่ยน) */
export function useImportPipeline(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "pipeline", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("import_batches").select("kind, status, counts").eq("curriculum_version_id", versionId!).neq("status", "rejected");
      if (error) throw error;
      const out: Record<string, Record<string, number>> = {};
      for (const b of (data ?? []) as { kind: string; counts: Record<string, number> }[]) {
        const o = (out[b.kind] ??= {});
        for (const [k, v] of Object.entries(b.counts ?? {})) o[k] = (o[k] ?? 0) + Number(v);
      }
      return out;
    },
  });
}
export function useMappingCounts(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "mapping-counts", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => {
      const sb = requireSupabase();
      const c = async (st: string) => (await sb.from("curriculum_indicator_mappings").select("id", { count: "exact", head: true }).eq("curriculum_version_id", versionId!).eq("status", st)).count ?? 0;
      const [verified, pending, rejected] = await Promise.all([c("verified"), c("pending_review"), c("rejected")]);
      return { verified, pending, rejected };
    },
  });
}
