/**
 * สถานะหลักสูตรแยก 2 แกน (ไม่มี dependency · ทดสอบด้วย scripts/presentation-status.test.ts)
 *  แกนที่ 1 การยืนยันของโรงเรียน — มีบันทึกยืนยันเอกสารโครงสร้างที่ยังมีผล และไฟล์ปัจจุบันตรงกับไฟล์ที่ยืนยัน (sha256)
 *  แกนที่ 2 การตรวจความสอดคล้องตามเกณฑ์ — ผ่าน / อยู่ระหว่างตรวจทบทวน / พบประเด็นที่ต้องแก้ไข
 * “โรงเรียนยืนยันแล้ว” ไม่ถูกนำไปคำนวณเป็น “ผ่านเกณฑ์” ในทุกกรณี
 */
export interface StatusInput {
  confirmations: { scope: string; status: string; document_sha256: string; source_document_id: string }[];
  documents: { id: string; sha256: string | null }[];
  conflicts: { status: "open" | "needs_decision" | "resolved" }[];
  compliance: { status: "pass" | "warning" | "fail" | "insufficient_data" }[];
  verifiedRules: number;
}
export type SchoolStatus = "confirmed" | "file_changed" | "not_confirmed";
export type ReviewStatus = "passed" | "in_review" | "issues";
export interface CurriculumStatus {
  school: SchoolStatus;
  review: ReviewStatus;
  counts: { suspected: number; confirmedIssues: number; resolved: number; complianceFail: number; complianceOpen: number };
  reasons: string[];
}
export const SCHOOL_LABEL: Record<SchoolStatus, string> = {
  confirmed: "โรงเรียนยืนยันโครงสร้างแล้ว", file_changed: "ไฟล์โครงสร้างเปลี่ยนหลังการยืนยัน — ต้องยืนยันใหม่", not_confirmed: "ยังไม่ได้บันทึกการยืนยันของโรงเรียน",
};
export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  passed: "ผ่านการตรวจความสอดคล้องตามเกณฑ์แล้ว", in_review: "อยู่ระหว่างการตรวจทบทวน", issues: "พบประเด็นที่ต้องแก้ไข",
};

export function curriculumStatus(i: StatusInput): CurriculumStatus {
  const active = i.confirmations.filter((c) => c.scope === "structure" && c.status === "active");
  const sha = new Map(i.documents.map((d) => [d.id, d.sha256]));
  const school: SchoolStatus = !active.length ? "not_confirmed" : active.some((c) => sha.get(c.source_document_id) === c.document_sha256) ? "confirmed" : "file_changed";
  const counts = {
    suspected: i.conflicts.filter((c) => c.status === "open").length,
    confirmedIssues: i.conflicts.filter((c) => c.status === "needs_decision").length,
    resolved: i.conflicts.filter((c) => c.status === "resolved").length,
    complianceFail: i.compliance.filter((c) => c.status === "fail").length,
    complianceOpen: i.compliance.filter((c) => c.status === "warning" || c.status === "insufficient_data").length,
  };
  const reasons: string[] = [];
  if (counts.confirmedIssues) reasons.push(`ประเด็นที่ยืนยันแล้วรอตัดสิน ${counts.confirmedIssues} รายการ`);
  if (counts.complianceFail) reasons.push(`กฎโครงสร้างที่ไม่ผ่าน ${counts.complianceFail} ข้อ`);
  if (counts.suspected) reasons.push(`ข้อสงสัยที่ยังไม่คัดกรอง ${counts.suspected} รายการ`);
  if (counts.complianceOpen) reasons.push(`กฎที่ต้องตรวจเพิ่ม/ข้อมูลไม่พอ ${counts.complianceOpen} ข้อ`);
  if (!i.verifiedRules) reasons.push("ยังไม่มีกฎ/เกณฑ์ที่ยืนยันกับต้นฉบับ");
  if (!i.compliance.length) reasons.push("ยังไม่มีผลตรวจความสอดคล้อง");
  const review: ReviewStatus = counts.confirmedIssues || counts.complianceFail ? "issues"
    : i.verifiedRules > 0 && i.compliance.length > 0 && i.compliance.every((c) => c.status === "pass") && counts.suspected === 0 ? "passed" : "in_review";
  return { school, review, counts, reasons };
}
