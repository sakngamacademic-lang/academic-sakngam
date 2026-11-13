/**
 * อ่าน "หัวคำอธิบายรายวิชา" จากข้อความหน้า PDF เล่มหลักสูตร (ไม่มี dependency — ใช้ทั้ง Edge Function และสคริปต์ตรวจ)
 *
 * หลักการ (C1.5):
 * - รหัสวิชาเก็บ "ตามที่พิมพ์" — ไม่ตัด ไม่เติม ไม่แก้เลข (เช่น "ว 221201" → ว221201 ไม่ใช่ ว22120)
 * - รหัสที่ไม่ใช่รูปแบบอักษรไทย + 5 หลัก ให้ติดธง code_nonstandard เพื่อให้คนตรวจ — ห้ามจับคู่กับรหัสอื่นเอง
 * - IS ("IS 1") ไม่มีกลุ่มสาระในหัว → area_name = null
 * - หัวรองรับ: "เวลา/เวลาเรียน N ชั่วโมง", "N ชั่วโมง/ภาคเรียน", แผนทวิศึกษาในบรรทัดชั้น, หน่วยกิตขึ้นบรรทัดถัดไป
 */
export interface CourseHeader {
  code: string;
  code_printed: string;
  code_nonstandard: boolean;
  name_th: string;
  area_name: string | null;
  is_activity_heading: boolean;
  grades: string | null;
  term_no: number | null;
  hours: number | null;
  credits: number | null;
  program_text: string | null;
}

const HEAD = /^\s*(?:รายวิชา\s*)?([ก-ฮ]|I\s?S)\s?(\d{5,6}(?!\d)|\d(?!\d))\s*(.*?)\s*(?:กลุ่มสาระ(?:การเรียนรู้)?\s*(.*)|(กิจกรรมพัฒนาผู้เรียน).*)?$/i;

/** ตรวจว่าบรรทัด i เป็นหัวรายวิชาหรือไม่ (ต้องตามด้วยบรรทัด "ชั้นมัธยมศึกษาปีที่ … ชั่วโมง") */
export function parseCourseHeader(lines: string[], i: number): CourseHeader | null {
  const line = lines[i] ?? "";
  if (line.length >= 170) return null;
  const m = HEAD.exec(line);
  if (!m) return null;
  const next = (lines[i + 1] ?? "").trimStart();
  if (!/^(ชั้น|ระดับ)/.test(next)) return null;
  const meta = `${next} ${lines[i + 2] ?? ""}`;
  if (!meta.split("ชั่วโมง")[0]!.includes("ชั้นมัธยมศึกษาปีที่") || !meta.includes("ชั่วโมง")) return null;

  const prefix = m[1]!.replace(/\s/g, "");
  const isIS = /^IS$/i.test(prefix);
  const digits = m[2]!;
  const code = (isIS ? "IS" : prefix) + digits;
  const g = /ชั้นมัธยมศึกษาปีที่\s*([\d\s\-–,]+)/.exec(meta);
  const term = /ภาคเรียนที่\s*(\d)/.exec(meta);
  const hours = /(\d+)\s*ชั่วโมง/.exec(meta);
  const credits = /(\d+(?:\.\d+)?)\s*หน่วยกิต/.exec(meta);
  const program = /(แผน[^\s(]*\s*\([^)]+\)|ห้องเรียน\S+)/.exec(meta);
  return {
    code,
    code_printed: line.slice(0, line.indexOf(digits) + digits.length).trim(),
    code_nonstandard: isIS ? false : digits.length !== 5,
    name_th: m[3]!.trim(),
    area_name: m[4]?.trim() || null,
    is_activity_heading: Boolean(m[5]),
    grades: g ? g[1]!.replace(/\s/g, "").replace(/[–,]$/, "") : null,
    term_no: term ? Number(term[1]) : null,
    hours: hours ? Number(hours[1]) : null,
    credits: credits ? Number(credits[1]) : null,
    program_text: program ? program[1]! : null,
  };
}

/** หัวข้อหมวดล่าสุดก่อนหัวรายวิชา: "คำอธิบายรายวิชาพื้นฐาน" / "คำอธิบายรายวิชาเพิ่มเติม" */
export function sectionType(textBeforeHeader: string): "basic" | "additional" | null {
  const all = [...textBeforeHeader.matchAll(/คำอธิบายรายวิชา(พื้นฐาน|เพิ่มเติม)/g)];
  const last = all.at(-1)?.[1];
  return last === "พื้นฐาน" ? "basic" : last === "เพิ่มเติม" ? "additional" : null;
}

/** ยอดที่เอกสารประกาศ เช่น "รวมทั้งหมด 6 ตัวชี้วัด" — ใช้ตรวจจำนวนที่ parser อ่านได้ (ไม่ใช้เติมค่า) · ยอดรวมของวิชา = ค่ามากสุด (ยอดย่อยระหว่างทาง/ปลายทาง ≤ ยอดรวม) */
export function declaredTotals(text: string): number[] {
  return [...text.matchAll(/^รวม(?:ทั้งหมด|ทั้งสิ้น)?\s*(?:ตัวชี้วัด)?\s*(\d+)\s*(?:ตัวชี้วัด|ผลการเรียนรู้|ข้อ)/gm)].map((x) => Number(x[1]));
}

/** อ้างอิงตัวชี้วัดในข้อความ เช่น "มฐ. ท 5.1 ม.1/1, ม.1/2" → ["ท 5.1 ม.1/1", "ท 5.1 ม.1/2"] พร้อมชนิดตามหัวข้อ (ระหว่างทาง/ปลายทาง) */
export function indicatorRefs(text: string): { kind: "interim" | "final" | "unspecified"; ref: string }[] {
  const out: { kind: "interim" | "final" | "unspecified"; ref: string }[] = [];
  let kind: "interim" | "final" | "unspecified" = "unspecified";
  for (const l of text.split("\n")) {
    if (l.includes("ระหว่างทาง")) kind = "interim";
    else if (l.includes("ปลายทาง")) kind = "final";
    // บรรทัดอ้างอิงต้องขึ้นต้นด้วยรหัสสาระ (มี/ไม่มี "มฐ.") — รองรับ "ม.1/2" และ "(4-6/1, 4-6/3)"
    const s = /^\s*(?:มฐ\.?\s*)?([ก-ฮ])\s?(\d)\.(\d)\b/.exec(l);
    if (!s) continue;
    for (const g of l.slice(s[0].length).matchAll(/(?:ม\.\s?)?(\d(?:\s?-\s?\d)?)\s*\/\s*(\d+)/g)) {
      out.push({ kind, ref: `${s[1]} ${s[2]}.${s[3]} ม.${g[1]!.replace(/\s/g, "")}/${g[2]}` });
    }
  }
  return out;
}

/** นับข้อผลการเรียนรู้ที่ขึ้นต้นด้วยเลขข้อ ("1. …" หรือ "3.รู้…") หลังหัวข้อ "ผลการเรียนรู้" */
export function countNumberedOutcomes(text: string): number {
  if (!/^(ผลการเรียนรู|จุดประสงค์)/.test(text)) return 0;
  return [...text.matchAll(/^\s*(\d{1,2})\.\s*\.?\s*[ก-๙A-Za-z(]/gm)].length;
}
