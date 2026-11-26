import { assertEquals } from "jsr:@std/assert@1";
import { areaOfCode, gradeWarning, parsePlanHeader } from "../src/features/curriculum-v2/plans.ts";

// หัวแผนรูปแบบเดียวกับไฟล์จริง (ชื่อครูสมมติ)
Deno.test("อ่านหัวแผนแบบมาตรฐาน", () => {
  const p = parsePlanHeader([
    "แผนการจัดการเรียนรู้ที่ 19",
    "รายวิชา คณิตศาสตร์ 1 รหัสวิชา ค 21101 ชั้นมัธยมศึกษาปีที่ 1",
    "หน่วยการเรียนรู้ที่ 2 จำนวนตรรกยะ เวลาเรียน 10 ชั่วโมง",
    "เรื่อง การบวกเศษส่วน เวลาเรียน 50 นาที",
    "กลุ่มสาระการเรียนรู้คณิตศาสตร์ ภาคเรียนที่ 1 ปีการศึกษา",
    "2569",
    "ครูผู้สอน นายทดสอบ ระบบ วันที่ ... เดือน ...... พ.ศ.2569",
  ]);
  assertEquals(p, { planNo: 19, subject: "คณิตศาสตร์ 1", code: "ค21101", grade: 1, unit: "2 จำนวนตรรกยะ", topic: "การบวกเศษส่วน", term: "1", year: "2569", teacher: "นายทดสอบ ระบบ" });
  assertEquals(areaOfCode(p.code), "area-2");
  assertEquals(gradeWarning(p), null);
});

Deno.test("อ่านหัวแผนแบบ 'วิชา … รหัส' และเตือนชั้นไม่ตรงรหัส", () => {
  const p = parsePlanHeader([
    "แผนการจัดการเรียนรู้ที่ 1", "วิชา งานบ้าน รหัส ง 33101", "ชั้นมัธยมศึกษาปีที่ 3 กลุ่มสาระการงานอาชีพ",
    "หน่วยการเรียนรู้ที่4 ผ้าและเครื่องแต่งกาย", "ภาคเรียนที่ 1 ปีการศึกษา 2569", "เวลา 50 นาทีผู้สอน ครูทดสอบ สมมติ",
  ]);
  assertEquals([p.code, p.subject, p.grade, p.unit, p.teacher], ["ง33101", "งานบ้าน", 3, "4 ผ้าและเครื่องแต่งกาย", "ครูทดสอบ สมมติ"]);
  assertEquals(areaOfCode(p.code), "area-7");
  assertEquals(gradeWarning(p), "ควรตรวจ: รหัส ง33101 ปกติเป็น ม.6 แต่แผนระบุ ม.3");
});

Deno.test("ไม่มีรหัสวิชา → ไม่จัดกลุ่มเอง", () => {
  const p = parsePlanHeader(["บันทึกหลังสอน"]);
  assertEquals(areaOfCode(p.code), null);
});
