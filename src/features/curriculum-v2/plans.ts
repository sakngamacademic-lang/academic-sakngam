/**
 * แผนการจัดการเรียนรู้ (PDF) — อ่านหัวแผนหน้าแรก: แผนที่ รายวิชา รหัสวิชา ชั้น หน่วย เรื่อง ภาค/ปี ผู้สอน
 * ใช้ตามที่เขียนในไฟล์เท่านั้น (ไม่เดา) · ถ้าข้อมูลขัดกันแสดงเป็น "ควรตรวจ" ไม่แก้ให้
 */
export interface PlanMeta {
  planNo?: number; subject?: string; code?: string; grade?: number; unit?: string; topic?: string;
  term?: string; year?: string; teacher?: string;
}

export function parsePlanHeader(lines: string[]): PlanMeta {
  const t = lines.slice(0, 14).join("\n");
  const m = (re: RegExp) => t.match(re)?.[1]?.trim() || undefined;
  const code = t.match(/รหัส(?:วิชา)?\s*([ก-ฮ])\s*(\d{5})/);
  const planNo = m(/แผนการจัดการเรียนรู้\s*ที่\s*(\d+)/);
  const grade = m(/มัธยมศึกษาปีที่\s*(\d)/);
  const unit = t.match(/หน่วยการเรียนรู้ที่\s*(\d+)\s*([^\n]*?)\s*(?:เวลาเรียน[^\n]*)?(?:\n|$)/);
  return {
    planNo: planNo ? Number(planNo) : undefined,
    subject: m(/(?:รายวิชา|วิชา)\s*([^\n]+?)\s*รหัส/),
    code: code ? `${code[1]}${code[2]}` : undefined,
    grade: grade ? Number(grade) : undefined,
    unit: unit ? `${unit[1]}${unit[2] ? ` ${unit[2]}` : ""}` : undefined,
    topic: m(/^เรื่อง\s+([^\n]+?)\s*(?:เวลาเรียน[^\n]*)?$/m),
    term: m(/ภาคเรียนที่\s*(\d)/),
    year: m(/ปีการศึกษา\s*(\d{4})/),
    teacher: m(/ผู้สอน\s*([^\n]+?)\s*(?:วันที่[^\n]*)?$/m),
  };
}

/** อักษรนำหน้ารหัสวิชา → ปุ่มกลุ่มสาระ (ตามระบบรหัสวิชาหลักสูตรแกนกลาง) */
const PREFIX_AREA: Record<string, string> = {
  ท: "area-1", ค: "area-2", ว: "area-3", ส: "area-4", พ: "area-5", ศ: "area-6", ง: "area-7",
  อ: "area-8", จ: "area-8", ญ: "area-8", ฝ: "area-8", ข: "area-8", ร: "area-8", ต: "area-8", ก: "area-8", ม: "area-8", บ: "area-8",
};
export const areaOfCode = (code?: string) => (code ? PREFIX_AREA[code[0]!] ?? null : null);

/** ระดับชั้นตามรหัส (หลักที่ 2: 2=ม.ต้น 3=ม.ปลาย, หลักที่ 3: ปีที่) — ใช้เตือนเท่านั้น */
export function gradeWarning(p: PlanMeta): string | null {
  if (!p.code || !p.grade) return null;
  const lvl = p.code[1], yr = Number(p.code[2]);
  const g = lvl === "2" ? yr : lvl === "3" ? yr + 3 : null;
  return g && g !== p.grade ? `ควรตรวจ: รหัส ${p.code} ปกติเป็น ม.${g} แต่แผนระบุ ม.${p.grade}` : null;
}

export const planTitle = (p: PlanMeta, fileName: string) =>
  p.planNo ? `แผนที่ ${p.planNo}${p.topic ? ` · ${p.topic}` : ""}` : fileName.replace(/\.pdf$/i, "");
