// Regression tests — ข้อความตัวอย่างคัดจากรูปแบบหัวรายวิชาในเล่มหลักสูตร (ไม่ใช่ไฟล์ต้นฉบับ)
import { assertEquals } from "jsr:@std/assert@1";
import { countNumberedOutcomes, declaredTotals, indicatorRefs, parseCourseHeader, sectionType } from "./curriculum-pdf-text.ts";

Deno.test("รหัส 6 หลักที่พิมพ์ในเล่ม (หน้า 97–98) ต้องไม่ถูกตัดเป็น 5 หลัก และไม่รวมเป็นรายการเดียว", () => {
  const p97 = ["ว 221201 วิทยาศาสตร์พลังสิบ1 กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี", "ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 เวลา 40 ชั่วโมง จำนวน 1.0 หน่วยกิต"];
  const p98 = ["ว 221202 วิทยาศาสตร์พลังสิบ2 กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี", "ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 2 เวลา 40 ชั่วโมง จำนวน 1.0 หน่วยกิต"];
  const a = parseCourseHeader(p97, 0)!;
  const b = parseCourseHeader(p98, 0)!;
  assertEquals([a.code, b.code], ["ว221201", "ว221202"]);
  assertEquals(a.code_nonstandard && b.code_nonstandard, true, "ต้องติดธงให้คนตรวจ");
  assertEquals(a.code === "ว22120" || b.code === "ว22120", false);
  assertEquals([a.term_no, a.hours, a.credits, a.grades], [1, 40, 1, "1"]);
});

Deno.test("รหัสมาตรฐาน 5 หลัก (มีหรือไม่มีช่องว่าง) และ 'เวลาเรียน'", () => {
  const h = parseCourseHeader(["ว 21101 วิทยาศาสตร์ 1 กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี", "ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 เวลาเรียน 60 ชั่วโมง จำนวน 1.5 หน่วยกิต"], 0)!;
  assertEquals([h.code, h.code_nonstandard, h.hours, h.credits, h.area_name], ["ว21101", false, 60, 1.5, "วิทยาศาสตร์และเทคโนโลยี"]);
});

Deno.test("IS ไม่มีกลุ่มสาระ และแยกตามชั้น", () => {
  const lo = parseCourseHeader(["IS 1 การศึกษาค้นคว้าและสร้างองค์ความรู้ (Research and Knowledge Formation)", "ชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 เวลา 40 ชั่วโมง จำนวน 1.0 หน่วยกิต"], 0)!;
  const up = parseCourseHeader(["IS 1 การศึกษาค้นคว้าและสร้างองค์ความรู้ (Research and Knowledge Formation)", "ชั้นมัธยมศึกษาปีที่ 5 ภาคเรียนที่ 2 เวลา 40 ชั่วโมง จำนวน 1.0 หน่วยกิต"], 0)!;
  assertEquals([lo.code, lo.area_name, lo.grades, up.grades], ["IS1", null, "2", "5"]);
});

Deno.test("แผนทวิศึกษาในบรรทัดชั้น + หน่วยกิตขึ้นบรรทัดถัดไป + กลุ่มสาระแบบย่อ", () => {
  const h = parseCourseHeader([
    "ง30259 การบัญชีธุรกิจซื้อขายสินค้า2 กลุ่มสาระการงานอาชีพ",
    "ชั้นมัธยมศึกษาปีที่ 5 แผนทวิศึกษา (บัญชี) ภาคเรียนที่ 1 จำนวน 3 หน่วยกิต",
    "จำนวน 120 ชั่วโมง",
  ], 0)!;
  assertEquals([h.code, h.area_name, h.program_text, h.hours, h.credits], ["ง30259", "การงานอาชีพ", "แผนทวิศึกษา (บัญชี)", 120, 3]);
});

Deno.test("ไม่ใช่หัวรายวิชา: บรรทัดรายการในโครงสร้างกลุ่มสาระ / ไม่มีบรรทัดชั้น", () => {
  assertEquals(parseCourseHeader(["ท21101ภาษาไทย 1 จำนวน 60 ชั่วโมง 1.5 หน่วยกิต", "ท21102ภาษาไทย 2 จำนวน 60 ชั่วโมง 1.5 หน่วยกิต"], 0), null);
  assertEquals(parseCourseHeader(["ว21101 วิทยาศาสตร์ 1", "ศึกษาวิเคราะห์ ..."], 0), null);
});

Deno.test("หัวข้อหมวด: ใช้หัวข้อล่าสุดก่อนหัวรายวิชา", () => {
  assertEquals(sectionType("คำอธิบายรายวิชาเพิ่มเติม\n...\nคำอธิบายรายวิชาพื้นฐาน\n"), "basic");
  assertEquals(sectionType("หลักสูตรสถานศึกษา"), null);
});

Deno.test("ตัวชี้วัด: แยกระหว่างทาง/ปลายทาง และยอดที่เอกสารประกาศ", () => {
  const t = "ตัวชี้วัดระหว่างทาง\nมฐ. ท 5.1 ม.1/1, ม.1/2, ม.1/3, ม.1/4\nรวมตัวชี้วัด 4 ตัวชี้วัด\nตัวชี้วัดปลายทาง\nมฐ. ท 1.1 ม.1/8\nมฐ. ท 5.1 ม.1/5\nรวมตัวชี้วัด 2 ตัวชี้วัด\nรวมทั้งหมด 6 ตัวชี้วัด";
  const r = indicatorRefs(t);
  assertEquals(r.filter((x) => x.kind === "interim").length, 4);
  assertEquals(r.filter((x) => x.kind === "final").map((x) => x.ref), ["ท 1.1 ม.1/8", "ท 5.1 ม.1/5"]);
  assertEquals(declaredTotals(t), [4, 2, 6]);
});

Deno.test("ตัวชี้วัดแบบช่วงชั้นไม่มี 'ม.' และผลการเรียนรู้ที่ไม่มีช่องว่างหลังเลขข้อ", () => {
  const r = indicatorRefs("ตัวชี้วัดปลายทาง\nง 1.1 (4-6/1, 4-6/3, 4-6/4)\nง 2.1 (4-6/1, 4-6/2)\nรวม 5 ตัวชี้วัด");
  assertEquals(r.map((x) => x.ref), ["ง 1.1 ม.4-6/1", "ง 1.1 ม.4-6/3", "ง 1.1 ม.4-6/4", "ง 2.1 ม.4-6/1", "ง 2.1 ม.4-6/2"]);
  assertEquals(indicatorRefs("ศึกษาเรื่อง 1/2 ของปริมาณ"), [], "ข้อความทั่วไปที่มีเศษส่วนไม่ใช่ตัวชี้วัด");
  assertEquals(countNumberedOutcomes("ผลการเรียนรู้\n1. ตั้งประเด็น\n2.รู้และเข้าใจ\n3. .รู้และเข้าใจ\nรวมทั้งหมด 3 ผลการเรียนรู้"), 3);
});
