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

/** ป้ายภาษาไทยของตาราง/คอลัมน์ที่อ้างอิง (จากผลของฐานข้อมูล) */
export const refLabel = (table: string, column: string) =>
  SOURCE_REFERENCES.find((r) => r.table === table.replace(/^public\./, "") && r.column === column)?.label ?? `${table}.${column}`;

/** ผลจาก RPC ฝั่งฐานข้อมูล (migration 20261206000100) */
export interface ServerRef { table: string; column: string; count: number }
export interface ActionResult { result: "archived" | "deleted" | "rejected"; cause?: "referenced" | "reference_check_failed" | "already_archived"; references?: ServerRef[]; file_id?: string | null }

/** แปลงผลเป็นข้อความ — สำเร็จเฉพาะเมื่อฐานข้อมูลยืนยัน archived/deleted เท่านั้น */
export function resultMessage(r: ActionResult): { ok: boolean; text: string } {
  if (r.result === "archived") return { ok: true, text: "เก็บเข้าคลังแล้ว — ความสัมพันธ์กับหลักฐานเดิมยังอยู่ครบ" };
  if (r.result === "deleted") return { ok: true, text: "ลบรายการทะเบียนแล้ว — ไฟล์ใน Storage ไม่ถูกลบ" };
  if (r.cause === "referenced") return { ok: false, text: `ลบไม่ได้: มีการอ้างอิง ${(r.references ?? []).map((x) => `${refLabel(x.table, x.column)} ${x.count}`).join(", ")} — ใช้การเก็บเข้าคลังแทน` };
  if (r.cause === "reference_check_failed") return { ok: false, text: "ลบไม่ได้: ระบบตรวจการอ้างอิงไม่สำเร็จ จึงไม่ลบเพื่อความปลอดภัย" };
  if (r.cause === "already_archived") return { ok: false, text: "เอกสารนี้อยู่ในคลังแล้ว" };
  return { ok: false, text: "ดำเนินการไม่สำเร็จ (ผลจากเซิร์ฟเวอร์ไม่ชัดเจน) — ยังไม่มีการเปลี่ยนแปลง" };
}

/** ผลที่ไม่ตรงรูปแบบ → ถือว่าไม่สำเร็จ (ไม่แสดงว่าสำเร็จทั้งที่ยังไม่ได้ลบ) */
export function parseActionResult(x: unknown): ActionResult {
  const r = x as Partial<ActionResult> | null;
  if (r && (r.result === "archived" || r.result === "deleted" || r.result === "rejected")) return r as ActionResult;
  return { result: "rejected" };
}

export function serverPlan(refs: ServerRef[]): DeletePlan {
  const referenced = refs.filter((r) => r.count > 0).map((r) => ({ table: r.table, column: r.column, label: refLabel(r.table, r.column), count: r.count }));
  return { mode: referenced.length ? "archive" : "delete", referenced, unchecked: [], total: referenced.reduce((n, r) => n + (r.count ?? 0), 0) };
}
