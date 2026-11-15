import type { ComplianceRow, ComplianceStatus } from "./api";
import { programNameByCode } from "./program-labels";

/**
 * แปลผลตรวจตามเกณฑ์เป็นภาษาที่ครูเข้าใจ — แปลงเฉพาะการแสดงผล
 * สูตรตรวจ/ผลประเมิน/รหัสเดิมไม่เปลี่ยน (รหัสเทคนิคอยู่ใน `tech` สำหรับส่วน “รายละเอียดเพิ่มเติม”)
 */
export const CHECK_STATUS_LABELS: Record<ComplianceStatus, string> = {
  pass: "ผ่าน",
  fail: "ไม่ผ่าน",
  insufficient_data: "ข้อมูลไม่เพียงพอ",
  warning: "ต้องตรวจเพิ่มเติม",
};
export const CHECK_STATUS_ORDER: ComplianceStatus[] = ["fail", "insufficient_data", "warning", "pass"];

const gradeThai = (g: string) => g.replace(/^M(\d)/, "ม.$1").replace(/^P(\d)/, "ป.$1");
const unit = (n: string, u: string) => (/^\d+(\.\d+)?$/.test(n.trim()) ? `${n.trim()} ${u}` : n);

function translateExpected(r: ComplianceRow): string {
  const e = (r.expected ?? "").trim();
  const hours = /^(eq|gte|lte) (\d+(?:\.\d+)?) ชม\.$/.exec(e);
  if (hours) return `${hours[1] === "eq" ? "ต้องเท่ากับ" : hours[1] === "gte" ? "ไม่น้อยกว่า" : "ไม่เกิน"} ${hours[2]} ชั่วโมง`;
  const map: Record<string, string> = {
    "framework confirmed + is_complete": "ยืนยันกรอบหลักสูตรแกนกลางแล้ว และมีตัวชี้วัดครบ",
    "> 0 รายการ": "ต้องมีมากกว่า 0 รายการ",
    "0 ข้อที่ยังไม่ตัดสิน": "ไม่เหลือข้อขัดแย้งที่ยังไม่ตัดสิน",
    "0 รายวิชาที่ไม่มีคำอธิบาย": "ทุกรายวิชามีคำอธิบาย",
    "0 ตัวชี้วัดที่ยังไม่มี mapping": "ทุกตัวชี้วัดแกนกลางมีการจับคู่ที่ยืนยันแล้ว",
    "≥ 1 รุ่น": "อย่างน้อย 1 รุ่น",
  };
  return map[e] ?? e.replace(/ชม\./g, "ชั่วโมง").replace(/นก\./g, "หน่วยกิต");
}

function translateActual(r: ComplianceRow): string {
  const a = (r.actual ?? "").trim();
  if (!a) return "–";
  switch (r.rule_code) {
    case "SYS-DATA": return unit(a, "รายการ");
    case "SYS-DESC": return unit(a, "รายวิชาที่ไม่มีคำอธิบาย");
    case "SYS-CONFLICT": return unit(a, "ข้อที่ยังไม่ตัดสิน");
    case "SYS-COVERAGE": return unit(a, "ตัวชี้วัดที่ยังไม่มีการจับคู่");
    case "SYS-COHORT": return unit(a, "รุ่น");
    case "SYS-FRAMEWORK": {
      const m = /^(.*?) · (confirmed|provisional) · complete=(.*)$/.exec(a);
      if (m) return `กรอบ: ${m[1] === "–" ? "ยังไม่ระบุ" : m[1]} · สถานะ: ${m[2] === "confirmed" ? "ยืนยันแล้ว" : "ชั่วคราว (ยังไม่ยืนยัน)"} · ตัวชี้วัด: ${m[3] === "true" ? "ครบ" : "ยังไม่ครบ/ไม่มีข้อมูล"}`;
      return a;
    }
    default: return a.replace(/ชม\./g, "ชั่วโมง").replace(/นก\./g, "หน่วยกิต");
  }
}

function translateScope(scope: string, programs?: { code: string; name_th: string }[]): string {
  const s = (scope ?? "").trim();
  if (!s) return "";
  const m = /^(.+?) · (.+)$/.exec(s);
  if (m) return `${programNameByCode(m[1], programs)} · ${(m[2] ?? "").split(",").map(gradeThai).join(", ")}`;
  if (/^[PM]\d/.test(s)) return s.split(",").map(gradeThai).join(", ");
  return s;
}

function nextAction(r: ComplianceRow): string {
  if (r.status === "pass") return "ไม่ต้องดำเนินการ";
  const detail = r.detail ?? "";
  switch (r.rule_code) {
    case "SYS-DATA": return "สร้างทะเบียนจากหลักฐานนำเข้าที่หน้า “ทะเบียนรายวิชากลาง”";
    case "SYS-DESC": return "ตรวจรายวิชาที่ไม่มีคำอธิบาย — ต้นฉบับไม่มีให้ ผู้ดูแลหลักสูตรตัดสินว่าจะเว้นว่างหรือให้เจ้าของวิชาเติมภายหลัง";
    case "SYS-CONFLICT": return r.status === "insufficient_data" ? "ระบุเอกสารประกาศใช้ที่หน้า “ฉบับหลักสูตร”" : "ตัดสินข้อขัดแย้งที่เหลือที่หน้า “ข้อขัดแย้ง”";
    case "SYS-FRAMEWORK": return "นำเข้าเอกสารหลักสูตรแกนกลางฉบับทางการ แล้วยืนยันกรอบที่หน้า “ฉบับหลักสูตร”";
    case "SYS-COVERAGE": return "จับคู่และยืนยันตัวชี้วัดแกนกลางที่ยังขาด";
    case "SYS-COHORT": return "กำหนดรุ่นนักเรียนที่ใช้หลักสูตรฉบับนี้ที่หน้า “ฉบับหลักสูตร”";
    default:
      if (detail.includes("ยังไม่ได้รับการยืนยัน")) return "ผู้ดูแลหลักสูตรตรวจเกณฑ์เทียบเอกสารอ้างอิง แล้วยืนยันเกณฑ์";
      if (detail.includes("ไม่มีข้อมูล")) return "สร้างทะเบียนและการจัดวิชาของชั้น/แผนนี้ก่อน";
      return "ตรวจชั่วโมงเรียนเทียบเอกสารต้นฉบับ แล้วแก้การจัดวิชา หรือยืนยันว่าเกณฑ์ถูกต้อง";
  }
}

export interface CheckView {
  title: string;
  scope: string;
  status: ComplianceStatus;
  statusLabel: string;
  detail: string;
  expected: string;
  actual: string;
  action: string;
  /** ข้อมูลเทคนิคสำหรับส่วน “รายละเอียดเพิ่มเติม” เท่านั้น */
  tech: { code: string; version: number; category: string; source: string; rawScope: string; rawExpected: string; rawActual: string };
}

export function checkView(r: ComplianceRow, programs?: { code: string; name_th: string }[]): CheckView {
  return {
    title: r.title_th,
    scope: translateScope(r.scope, programs),
    status: r.status,
    statusLabel: CHECK_STATUS_LABELS[r.status],
    detail: r.detail ?? (r.status === "pass" ? "เป็นไปตามเกณฑ์" : ""),
    expected: translateExpected(r),
    actual: translateActual(r),
    action: nextAction(r),
    tech: { code: r.rule_code, version: r.rule_version, category: r.category, source: r.source, rawScope: r.scope, rawExpected: r.expected ?? "", rawActual: r.actual ?? "" },
  };
}
