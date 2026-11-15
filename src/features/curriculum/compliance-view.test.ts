import { describe, expect, it } from "vitest";
import type { ComplianceRow } from "./api";
import { checkView } from "./compliance-view";

const row = (o: Partial<ComplianceRow>): ComplianceRow => ({ rule_code: "TS-AR-M1", rule_version: 1, title_th: "ศิลปะ ม.1 ตามโครงสร้างเวลาเรียน", category: "learning_hours", source: "SRC-01 pdf:10", scope: "DVE-ACC · M1", status: "fail", expected: "eq 80 ชม.", actual: "60 ชม.", detail: "ไม่ตรงกับเกณฑ์ในเอกสารอ้างอิง", ...o });
const programs = [{ code: "DVE-ACC", name_th: "แผนการเรียนทวิศึกษา (บัญชี)" }];

describe("checkView — แปลผลตรวจเป็นภาษาไทย (ไม่เปลี่ยนสูตร/ผล)", () => {
  it("เกณฑ์ชั่วโมง: ใช้ชื่อแผนไทย ไม่แสดงรหัสแผน/รหัสเกณฑ์ในข้อความปกติ", () => {
    const v = checkView(row({}), programs);
    expect(v.scope).toBe("แผนการเรียนทวิศึกษา (บัญชี) · ม.1");
    expect(v.expected).toBe("ต้องเท่ากับ 80 ชั่วโมง");
    expect(v.actual).toBe("60 ชั่วโมง");
    expect(v.statusLabel).toBe("ไม่ผ่าน");
    expect(`${v.title}${v.scope}${v.detail}${v.expected}${v.actual}${v.action}`).not.toMatch(/DVE|TS-|SYS-|v1/);
    expect(v.tech.code).toBe("TS-AR-M1"); // รหัสเดิมยังอยู่ในข้อมูลเทคนิค
  });
  it("ชื่อแผนที่ไม่รู้จัก = รอยืนยันชื่อแผนการเรียน (ไม่เดา)", () => {
    expect(checkView(row({ scope: "XYZ · M2" }), programs).scope).toBe("รอยืนยันชื่อแผนการเรียน · ม.2");
  });
  it("SYS-*: แปลค่าที่คาดหวัง/ค่าจริง และบอกสิ่งที่ต้องทำ", () => {
    const v = checkView(row({ rule_code: "SYS-CONFLICT", title_th: "ข้อขัดแย้งของเอกสารต้นทางได้รับการตัดสินแล้ว", scope: "", status: "warning", expected: "0 ข้อที่ยังไม่ตัดสิน", actual: "36", detail: null }), programs);
    expect(v.expected).toBe("ไม่เหลือข้อขัดแย้งที่ยังไม่ตัดสิน");
    expect(v.actual).toBe("36 ข้อที่ยังไม่ตัดสิน");
    expect(v.statusLabel).toBe("ต้องตรวจเพิ่มเติม");
    expect(v.action).toContain("ข้อขัดแย้ง");
  });
  it("ข้อมูลไม่เพียงพอ และผ่าน แยกสถานะชัดเจน", () => {
    expect(checkView(row({ rule_code: "SYS-FRAMEWORK", status: "insufficient_data", expected: "framework confirmed + is_complete", actual: "– · provisional · complete=–", scope: "" })).actual).toBe("กรอบ: ยังไม่ระบุ · สถานะ: ชั่วคราว (ยังไม่ยืนยัน) · ตัวชี้วัด: ยังไม่ครบ/ไม่มีข้อมูล");
    expect(checkView(row({ status: "insufficient_data" })).statusLabel).toBe("ข้อมูลไม่เพียงพอ");
    const ok = checkView(row({ status: "pass", detail: null }));
    expect(ok.statusLabel).toBe("ผ่าน");
    expect(ok.action).toBe("ไม่ต้องดำเนินการ");
  });
});
