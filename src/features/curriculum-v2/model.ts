/**
 * Curriculum V2 — แบบข้อมูลกลาง (แยกจากตารางหลักสูตรเดิมทั้งหมด)
 * ทุกแถวมีอ้างอิงแหล่ง (ไฟล์ + ชีต/เซลล์ หรือหน้า PDF หรือ ตาราง/แถว DOCX) · ไม่เดาชั้น/แผน/ภาคเรียน: ค่าที่อ่านไม่ได้เป็น null และถูกแจ้งเป็นประเด็น
 */
export type SourceKind = "xlsx" | "pdf" | "docx";
export type Section = "basic" | "additional";
export interface Ref { file: string; sheet?: string; cell?: string; page?: number; table?: number; row?: number }
export interface V2Row {
  grade: string | null; plan: string | null; room: string | null; term: 1 | 2 | null; section: Section | null;
  code: string; codeRaw: string; name: string; credits: number | null; hours: number | null; raw: string; ref: Ref;
}
export interface V2Activity { grade: string | null; plan: string | null; term: 1 | 2 | null; name: string; hours: number | null; ref: Ref }
export interface V2Declared { grade: string | null; plan: string | null; term: 1 | 2 | null; total: number | null; basic: string | null; additional: string | null; activities: number | null; ref: Ref }
export interface V2Description { code: string; name: string; text: string; ref: Ref }
export interface ParsedSource {
  kind: SourceKind; fileName: string; sha256: string;
  rows: V2Row[]; activities: V2Activity[]; declared: V2Declared[]; descriptions: V2Description[]; notes: string[];
}
export type IssueLevel = "error" | "warning" | "info";
export interface V2Issue { level: IssueLevel; kind: string; text: string; ref: Ref }

const TH = "๐๑๒๓๔๕๖๗๘๙";
export const thaiDigits = (s: string) => s.replace(/[๐-๙]/g, (d) => String(TH.indexOf(d)));
export const normCode = (s: string) => thaiDigits(s).replace(/\s+/g, "").toUpperCase();
export const CODE_RE = /^(?:[ก-ฮ]{1,2}\s?[\d๐-๙]{5}|IS\s?\d)$/i;
export const CREDIT_RE = /^\s*([\d.]+)\s*\(\s*([\d.]+)\s*\)\s*$/;
/** ทำความสะอาดข้อความแสดงผล (ไม่เปลี่ยนความหมาย) */
export const clean = (s: string) => thaiDigits(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
/** คีย์จัดกลุ่มแผน (เทียบชื่อแบบไม่สนช่องว่าง/ขีด/คำนำหน้า “แผน/แผนการเรียน”) — ใช้จัดกลุ่มเท่านั้น ชื่อที่แสดงคงตามไฟล์ */
export const planKey = (s: string | null) => (s ? clean(s).replace(/^(แผนการเรียน|แผน|ห้องเรียน)\s*/, "").replace(/[\s\-–(),.]/g, "") : "");
export const nameKey = (s: string) => clean(s).replace(/\([^)]*\)/g, "").replace(/[\s\-–.]/g, "").replace(/เเ/g, "แ");

export const AREAS: [string, string][] = [["ท", "ภาษาไทย"], ["ค", "คณิตศาสตร์"], ["ว", "วิทยาศาสตร์และเทคโนโลยี"], ["ส", "สังคมศึกษา ศาสนา และวัฒนธรรม"], ["พ", "สุขศึกษาและพลศึกษา"], ["ศ", "ศิลปะ"], ["ง", "การงานอาชีพ"], ["อ", "ภาษาต่างประเทศ"], ["จ", "ภาษาต่างประเทศ"], ["ญ", "ภาษาต่างประเทศ"], ["ฝ", "ภาษาต่างประเทศ"], ["I", "การศึกษาค้นคว้าอิสระ (IS)"]];
/** กลุ่มสาระตามอักษรนำหน้ารหัสวิชา (หลักเกณฑ์การกำหนดรหัสวิชาของ สพฐ.) */
export const areaOf = (code: string) => AREAS.find(([p]) => code.toUpperCase().startsWith(p))?.[1] ?? "ไม่ระบุ";
/** ชั้นที่รหัสวิชาระบุ (หลักที่ 1 = ระดับ 2 ม.ต้น / 3 ม.ปลาย · หลักที่ 2 = ปี 1–3, 0 = ไม่ระบุปี) */
export function gradeFromCode(code: string): string | null {
  const m = /^[ก-ฮ]{1,2}(\d)(\d)\d{3}$/.exec(code);
  if (!m || m[2] === "0") return null;
  if (m[1] === "2") return `M${m[2]}`;
  if (m[1] === "3") return `M${Number(m[2]) + 3}`;
  return null;
}
export const gradeLabel = (g: string | null) => (g ? `ม.${g.replace(/\D/g, "")}` : "ไม่ระบุชั้น");
export const refText = (r: Ref) => [r.file, r.sheet != null ? `${r.sheet.trim()}!${r.cell ?? ""}` : "", r.page != null ? `หน้า ${r.page}` : "", r.table != null ? `ตารางที่ ${r.table} แถว ${r.row}` : ""].filter(Boolean).join(" · ");
export const parseCredit = (raw: string) => { const m = CREDIT_RE.exec(thaiDigits(raw)); return m ? { credits: Number(m[1]), hours: Number(m[2]) } : null; };
