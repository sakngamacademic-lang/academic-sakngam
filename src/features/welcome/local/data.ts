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

// คำสั้นที่กำกวมถูกตัดออก (เช่น “วัด” ตรงกับ “จังหวัด”)
/**
 * หัวข้อท้องถิ่น — ⚠️ เป็น "การสังเคราะห์ข้อมูล" (จัดหมวดด้วยคำสำคัญในช่องสาระการเรียนรู้ท้องถิ่น) ไม่ใช่หมวดที่ระบุในเอกสาร
 * 1 รายการอยู่ได้หลายหัวข้อ · ไม่มีคำสำคัญตรง = "ชุมชนและท้องถิ่นทั่วไป"
 */
export interface Topic { key: string; label: string; words: RegExp }
export const TOPICS: Topic[] = [
  { key: "lit", label: "ภาษา วรรณกรรม และเรื่องเล่า", words: /วรรณกรรม|วรรณคดี|นิทาน|ตำนาน|เรื่องเล่า|ภาษาถิ่น|ร้อยกรอง|อาขยาน|สำนวน|สุภาษิต|ปริศนา|บทร้อง|กล่อมเด็ก|ทุ่งมหาราช|ท้าวแสนปม|พรานกระต่าย|คำคล้องจอง/ },
  { key: "hist", label: "ประวัติศาสตร์และโบราณสถาน", words: /ประวัติ|โบราณ|มรดกโลก|นครชุม|ชากังราว|อุทยานประวัติศาสตร์|เหตุการณ์สำคัญ|สถานที่สำคัญ/ },
  { key: "trad", label: "ประเพณี วัฒนธรรม และความเชื่อ", words: /ประเพณี|วัฒนธรรม|พิธี|ขนบธรรมเนียม|ศาสนา|บำรุงรักษาวัด|วัดใน|พระภิกษุ|ความเชื่อ/ },
  { key: "art", label: "ศิลปะ ดนตรี และนาฏศิลป์พื้นบ้าน", words: /ทัศนศิลป์|ดนตรี|เพลง|นาฏศิลป์|ลิเก|ละคร|ฟ้อน|รำวง|การรำ|การแสดง|หัตถกรรม|ศิลปกรรม|ขับร้อง/ },
  { key: "job", label: "อาชีพ ผลิตภัณฑ์ และเศรษฐกิจชุมชน", words: /อาชีพ|ผลิตภัณฑ์|บรรจุภัณฑ์|สินค้า|ค้าขาย|ค้า|ขาย|ตลาด|บัญชี|ครัวเรือน|กองทุน|สหกรณ์|ร้านค้า|เกษตร|ปลูก|วิสาหกิจ|ภูมิปัญญา/ },
  { key: "nature", label: "ธรรมชาติ ทรัพยากร และสิ่งแวดล้อม", words: /ธรรมชาติ|ทรัพยากร|สิ่งแวดล้อม|น้ำตก|แม่น้ำ|ปิง|คลองลาน|ป่า|ดิน|พลังงาน|ภัย|อุทยานแห่งชาติ|สัตว์|พืช/ },
  { key: "health", label: "สุขภาพ อาหาร และกีฬาพื้นบ้าน", words: /สุขภาพ|อาหาร|กีฬา|การละเล่น|เกม|ออกกำลัง|สมุนไพร|โรค|ยาพื้นบ้าน|สารเสพติด|พฤติกรรมเสี่ยง|อนามัย|นันทนาการ/ },
  { key: "place", label: "สถานที่ แหล่งเรียนรู้ และการท่องเที่ยว", words: /ท่องเที่ยว|แหล่งเรียนรู้|แหล่งการเรียนรู้|สถานที่|เส้นทาง|แผนผัง|เมืองเก่า|ระยะทาง/ },
  { key: "data", label: "ข้อมูล สถิติ และเทคโนโลยีในชีวิตประจำวัน", words: /ข้อมูล|สถิติ|กราฟ|สำรวจ|ความน่าจะเป็น|สารสนเทศ|คอมพิวเตอร์|เทคโนโลยี|โปรแกรม|ชีวิตประจำวัน|คาดคะเน|ปริมาตร|พื้นที่/ },
  { key: "civic", label: "การเมือง การปกครอง และพลเมือง", words: /การเมือง|ปกครอง|เทศบาล|อบต|เลือกตั้ง|กฎหมาย|กฎ|ระเบียบ|พลเมือง|สิทธิ/ },
];
export const OTHER_TOPIC: Topic = { key: "other", label: "ชุมชนและท้องถิ่นทั่วไป", words: /$^/ };
export const ALL_TOPICS = [...TOPICS, OTHER_TOPIC];

export function topicsOf(r: LocalRecord): string[] {
  const hit = TOPICS.filter((t) => t.words.test(r.local)).map((t) => t.key);
  return hit.length ? hit : [OTHER_TOPIC.key];
}

/** นับจำนวนรายการ (แถวเอกสาร) ตามกลุ่มสาระ × ระดับ */
export function countBy(records: LocalRecord[], areas: string[], levels: string[]) {
  return areas.map((area) => {
    const rs = records.filter((r) => r.area === area);
    return { area, total: rs.length, byLevel: levels.map((lv) => rs.filter((r) => r.level === lv).length) };
  });
}

export const sourceText = (d: LocalData, r: LocalRecord) => `${d.meta.title} · ตารางที่ ${r.source.table} แถวที่ ${r.source.row}`;
