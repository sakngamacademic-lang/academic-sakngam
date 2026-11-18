/**
 * การลบ/เก็บเข้าคลังรายการ “ทะเบียนเอกสารต้นทาง” (source_documents)
 * - ตรวจการอ้างอิงแบบอ่านอย่างเดียว (นับแถวที่อ้าง id นี้ใน FK ทุกตาราง — ตรงกับ FK ON DELETE RESTRICT บน Staging)
 * - ตารางที่อ่านไม่ได้ (RLS/ไม่มีตาราง) ถือว่า “ตรวจไม่ได้” → ไม่เสนอให้ลบ
 * - ไม่ลบไฟล์จริงใน Storage ไม่ว่ากรณีใด
 */
export interface RefCheck { table: string; column: string; label: string }

export const SOURCE_REFERENCES: RefCheck[] = [
  { table: "source_documents", column: "parent_id", label: "เอกสารย่อย (เช่น SRC-01-P1…P6)" },
  { table: "source_documents", column: "duplicate_of_id", label: "เอกสารที่ระบุว่าซ้ำกับรายการนี้" },
  { table: "subjects", column: "source_document_id", label: "รายวิชา" },
  { table: "subject_offerings", column: "source_document_id", label: "รายวิชาในโครงสร้าง" },
  { table: "subject_learning_outcomes", column: "source_document_id", label: "ผลการเรียนรู้รายวิชา" },
  { table: "study_programs", column: "source_document_id", label: "แผนการเรียน" },
  { table: "learning_activities", column: "source_document_id", label: "กิจกรรมพัฒนาผู้เรียน" },
  { table: "curriculum_versions", column: "announcement_source_id", label: "ประกาศใช้หลักสูตร" },
  { table: "curriculum_implementations", column: "decided_source_id", label: "การใช้หลักสูตร" },
  { table: "curriculum_rules", column: "source_document_id", label: "เกณฑ์หลักสูตร" },
  { table: "curriculum_indicator_mappings", column: "source_document_id", label: "การจับคู่มาตรฐาน/ตัวชี้วัด" },
  { table: "curriculum_category_links", column: "source_document_id", label: "หมวดหลักสูตร" },
  { table: "assessment_criteria", column: "source_document_id", label: "เกณฑ์การประเมิน" },
  { table: "criteria_evidence", column: "source_document_id", label: "หลักฐานเกณฑ์" },
  { table: "curriculum_document_confirmations", column: "source_document_id", label: "การยืนยันเอกสาร" },
  { table: "curriculum_document_confirmations", column: "evidence_document_id", label: "หลักฐานการยืนยันเอกสาร" },
  { table: "curriculum_highlights", column: "source_document_id", label: "จุดเด่นหลักสูตร" },
  { table: "source_conflicts", column: "doc_a_id", label: "ข้อขัดแย้ง (เอกสาร A)" },
  { table: "source_conflicts", column: "doc_b_id", label: "ข้อขัดแย้ง (เอกสาร B)" },
  { table: "document_analyses", column: "source_document_id", label: "ผลวิเคราะห์เอกสาร" },
  { table: "import_batches", column: "source_document_id", label: "ชุดนำเข้า" },
  { table: "local_content_batches", column: "source_document_id", label: "ทะเบียนสาระท้องถิ่น" },
  { table: "grading_policies", column: "source_document_id", label: "ระเบียบการวัดผล" },
  { table: "activity_groups", column: "policy_document_id", label: "กลุ่มกิจกรรม" },
];

/** ผลการตรวจหนึ่งตาราง: count = จำนวนแถวที่อ้างอิง · null = ตรวจไม่ได้ */
export interface RefResult extends RefCheck { count: number | null }
export type DeleteMode = "archive" | "delete" | "unknown";
export interface DeletePlan { mode: DeleteMode; referenced: RefResult[]; unchecked: RefResult[]; total: number }

export function deletePlan(results: RefResult[]): DeletePlan {
  const referenced = results.filter((r) => (r.count ?? 0) > 0);
  const unchecked = results.filter((r) => r.count === null);
  const total = referenced.reduce((n, r) => n + (r.count ?? 0), 0);
  // มีการอ้างอิง → เก็บเข้าคลังเท่านั้น · ตรวจไม่ครบ → สรุปไม่ได้ (ไม่ลบ) · ไม่มีการอ้างอิงและตรวจครบ → ลบรายการทะเบียนได้
  const mode: DeleteMode = referenced.length ? "archive" : unchecked.length ? "unknown" : "delete";
  return { mode, referenced, unchecked, total };
}

/** Backend ที่ต้องมีก่อนเปิดใช้ปุ่มจริง (ยังไม่มีในระบบ — ตารางไม่มีสิทธิ์ DELETE และคอลัมน์ status แก้จากหน้าเว็บไม่ได้) */
export const BACKEND_READY = false;
