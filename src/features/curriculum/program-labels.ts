/**
 * ชื่อแผนการเรียนสำหรับแสดงผล — ใช้ชื่อภาษาไทยจากฐานข้อมูลจริงเท่านั้น (ไม่เดา)
 * รหัสแผน (code) ยังเก็บในฐานข้อมูลเพื่อเชื่อมข้อมูล แต่ไม่แสดงให้ผู้ใช้ทั่วไป
 * ถ้าชื่อว่าง หรือมีแต่รหัสภาษาอังกฤษ → "รอยืนยันชื่อแผนการเรียน" (ฝ่ายวิชาการตรวจที่หน้าแผนการเรียน)
 */
export const PROGRAM_NAME_PENDING = "รอยืนยันชื่อแผนการเรียน";
export const ALL_PROGRAMS_LABEL = "ทุกแผน";

export function isProgramNameConfirmed(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return n.length > 0 && !/^[A-Za-z0-9_\- ]+$/.test(n);
}

export function programName(name: string | null | undefined): string {
  return isProgramNameConfirmed(name) ? (name as string).trim() : PROGRAM_NAME_PENDING;
}

/** แปลงรหัสแผน → ชื่อไทย (ไม่พบ/ไม่ชัดเจน = รอยืนยัน; ไม่มีรหัส = ทุกแผน) */
export function programNameByCode(code: string | null | undefined, programs: { code: string; name_th: string }[] | undefined): string {
  if (!code || code === "–") return ALL_PROGRAMS_LABEL;
  return programName(programs?.find((p) => p.code === code)?.name_th);
}
