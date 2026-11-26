/**
 * ข้อมูลการบูรณาการสาระท้องถิ่น (หน้าเยี่ยมชม)
 * แหล่งข้อมูล: local-curriculum-data.json — แปลงจากตารางในเอกสารต้นฉบับทีละแถว (ไม่แก้ถ้อยคำ)
 * ทุกตัวเลขคำนวณจาก records ตอนแสดงผล (ไม่ Hardcode) · แยกไฟล์ข้อมูลจาก Component เพื่อเปลี่ยนเป็น Supabase ได้ภายหลัง
 * ⚠️ ช่อง indicator คือ "รหัสตัวชี้วัด" ตามเอกสาร — ไม่ใช่รหัสรายวิชา และเอกสารต้นฉบับไม่มีรหัสรายวิชา
 */
export interface LocalRecord {
  id: string;
  area: string;
  /** ระดับสำหรับจัดกลุ่ม: ม.1 / ม.2 / ม.3 / ม.4-6 */
  level: string;
  /** ระดับตามหัวตารางในเอกสาร (บางตารางระบุ ม.5) */
  grade_label: string;
  indicator: string;
  core: string;
  local: string;
  source: { table: number; row: number };
  /** เอกสารฉบับตรวจทานทำเครื่องหมาย “◄ ไม่พบในหลักสูตร 69” ที่รหัสตัวชี้วัดนี้ */
  not_in_69?: boolean;
}
export interface LocalData {
  meta: { title: string; school: string; source_document: string; extraction: string; extracted_on: string; status: string; check_69?: string; /** จำนวนแถวทั้งหมดในเอกสาร ก่อนกรอง (ตั้งค่าตอนโหลด) */ source_rows?: number };
  areas: string[];
  levels: string[];
  tables: { table: number; area: string; grade_label: string; heading: string }[];
  records: LocalRecord[];
}

/** โหลดแบบแยก chunk (ไฟล์ข้อมูลใหญ่) — อนาคตเปลี่ยนเป็น RPC ของ Supabase ได้ที่จุดนี้จุดเดียว */
export const loadLocalData = (): Promise<LocalData> => import("./local-curriculum-data.json").then((m) => {
  const d = m.default as LocalData;
  // ไม่แสดงแถวที่เอกสารฉบับตรวจทานระบุ “◄ ไม่พบในหลักสูตร 69” (ยังเก็บไว้ใน JSON เพื่ออ้างอิง) — ตัวเลข/ร้อยละทั้งหมดคิดจากแถวที่เหลือ
  return { ...d, meta: { ...d.meta, source_rows: d.records.length }, records: d.records.filter((r) => !r.not_in_69) };
});

export const LEVEL_LABEL: Record<string, string> = { "ม.1": "ม.1", "ม.2": "ม.2", "ม.3": "ม.3", "ม.4-6": "ม.4–6" };

/** นับจำนวนรายการ (แถวเอกสาร) ตามกลุ่มสาระ × ระดับ */
export function countBy(records: LocalRecord[], areas: string[], levels: string[]) {
  return areas.map((area) => {
    const rs = records.filter((r) => r.area === area);
    return { area, total: rs.length, byLevel: levels.map((lv) => rs.filter((r) => r.level === lv).length) };
  });
}

export const sourceText = (d: LocalData, r: LocalRecord) => `${d.meta.title} · ตารางที่ ${r.source.table} แถวที่ ${r.source.row}`;
