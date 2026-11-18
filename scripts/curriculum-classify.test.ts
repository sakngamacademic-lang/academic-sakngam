// deno test --config supabase/functions/deno.json scripts/curriculum-classify.test.ts — ข้อมูลจำลองเท่านั้น
import { assert, assertEquals } from "jsr:@std/assert@1";
import { classify, criterionResult, stageOf, type EvidenceRow } from "../src/features/curriculum/categories/classify.ts";

const P = (id: string, code: string, name: string) => ({ id, code, name_th: name, stage: "upper_secondary", source_document_id: "d", source_locator: "pdf:5" });
const S = (id: string, code: string, name: string, type: string, progs: string[], desc: string | null = null) =>
  ({ id, code, name_th: name, subject_type: type, description_th: desc, grade: "ม.4", program_ids: progs, source_document_id: "d", source_locator: "pdf:9", hours: 40, credits: 1 });
const programs = [P("pg", "GEN-L", "ห้องเรียนทั่วไป"), P("pv", "DVE-AUTO", "แผนการเรียนทวิศึกษา (ช่างยนต์)"), P("ps", "SCI10", "ห้องเรียนวิทยาศาสตร์พลังสิบ")];
const subjects = [
  S("s1", "ง30237", "งานวัดละเอียดช่างยนต์", "additional", ["pv"]),
  S("s2", "ง21101", "การงานอาชีพ 1", "basic", ["pg", "ps"]),
  S("s3", "อ22101", "ภาษาอังกฤษพื้นฐาน 3", "basic", ["pg"], "สื่อสารเรื่องชุมชนของตนเอง"),
  S("s4", "ศ32201", "นาฏศิลป์ท้องถิ่น 1", "additional", ["pg"]),
  S("s5", "ว30201", "ฟิสิกส์เพิ่มเติม", "additional", ["ps"]),
];
const activities = [{ id: "a1", activity_type: "กิจกรรมนักเรียน", name_th: "ลูกเสือ", activity_hours: 20, study_program_id: "pg", grade: "ม.1", source_document_id: "d", source_locator: "pdf:30" }];
const find = (r: ReturnType<typeof classify>, cat: string, id: string) => r.find((c) => c.category === cat && c.targetId === id);

Deno.test("แผนทวิศึกษาและวิชาที่เปิดเฉพาะในแผนนั้น = หลักฐานโครงสร้าง (ยังรอตรวจ)", () => {
  const r = classify({ programs, subjects, activities, links: [] });
  assertEquals(find(r, "vocational", "pv")?.strength, "structural");
  assertEquals(find(r, "vocational", "s1")?.strength, "structural");
  assert(r.every((c) => c.status === "proposed"));
});
Deno.test("คำว่า “อาชีพ”/“ท้องถิ่น”/“ชุมชน” อย่างเดียว = พบคำสำคัญเท่านั้น ไม่ใช่หลักฐาน", () => {
  const r = classify({ programs, subjects, activities, links: [] });
  assertEquals(find(r, "vocational", "s2"), undefined); // วิชาพื้นฐานการงานอาชีพไม่ถูกจัดเป็นหลักสูตรอาชีพจากชื่อ
  assertEquals(find(r, "local", "s3")?.strength, "keyword");
  assert(find(r, "local", "s3")!.reasons.some((x) => x.includes("ไม่ใช่หลักฐาน")));
  assertEquals(find(r, "local", "s4")?.strength, "keyword");
});
Deno.test("หนึ่งรายวิชาอยู่ได้หลายหมวด · กิจกรรมพัฒนาผู้เรียน · แผนเฉพาะ", () => {
  const r = classify({ programs, subjects, activities, links: [] });
  assert(find(r, "general", "s3") && find(r, "local", "s3"));
  assertEquals(find(r, "activities", "a1")?.strength, "structural");
  assert(find(r, "specialized", "ps") && find(r, "specialized", "s5") && !find(r, "specialized", "pg"));
});
Deno.test("ผลการตรวจของผู้ดูแลมาก่อนข้อเสนอ", () => {
  const r = classify({ programs, subjects, activities, links: [{ id: "l1", category: "local", target_type: "subject", target_id: "s4", status: "confirmed", reason: "ตรวจกับ PDF หน้า 200", source_document_id: "d", source_locator: "pdf:200", decided_at: "x" }] });
  assertEquals(find(r, "local", "s4")?.status, "confirmed");
  assertEquals(find(r, "local", "s4")?.locator, "pdf:200");
});
Deno.test("สถานะเกณฑ์: ตรงเกณฑ์นับเฉพาะที่ยืนยันแล้ว", () => {
  const e = (result: EvidenceRow["result"], status: EvidenceRow["status"]): EvidenceRow => ({ id: "e", criterion_id: "c", target_type: "program", target_id: "pv", result, status, note: null, source_document_id: "d", source_locator: "pdf:1", decided_at: null });
  assertEquals(criterionResult([]), "none");
  assertEquals(criterionResult([e("pending", "proposed")]), "pending");
  assertEquals(criterionResult([e("partial", "confirmed"), e("pending", "proposed")]), "partial");
  assertEquals(criterionResult([e("direct", "confirmed")]), "direct");
});

Deno.test("สมรรถนะอาชีพ ม.ต้น จากเนื้อหา: ปฏิบัติ + มิติเศรษฐกิจ = content · ไม่มีมิติเศรษฐกิจ = partial · ไม่มีข้อมูล = insufficient", () => {
  const sub = (id: string, code: string, grade: string, desc: string | null, outcomes: string[] = []) =>
    ({ ...S(id, code, "x (ตัวอย่าง)", "additional", ["pg"], desc), grade, outcomes });
  const r = classify({ programs, activities: [], links: [], subjects: [
    sub("m1", "ง21262", "ม.1", "ปฏิบัติการเตรียมดิน ปลูก ดูแลรักษา เก็บเกี่ยว และจัดผลผลิตจำหน่าย คำนวณค่าใช้จ่าย กำหนดราคาขาย"),
    sub("m2", "ง22263", "ม.2", "มีทักษะกระบวนการทำงาน เจตคติที่ดีต่อการประกอบอาชีพ"),
    sub("m3", "ง23265", "ม.3", null),
    sub("m4", "ง21261", "ม.1", null, ["ทำบัญชีรายรับรายจ่าย กำหนดราคาขายสินค้า", "ปฏิบัติทำขนมไทยชนิดต่าง ๆ ได้"]),
  ] });
  const v = (id: string) => r.find((c) => c.category === "vocational" && c.targetId === id);
  assertEquals(v("m1")?.strength, "content");
  assertEquals(v("m1")?.stage, "lower");
  assert(v("m1")!.competencies.some((k) => k.label.includes("บัญชี") && k.evidence.includes("ค่าใช้จ่าย")));
  assertEquals(v("m2")?.strength, "partial");
  assertEquals(v("m3")?.strength, "insufficient");
  assertEquals(v("m4")?.strength, "content"); // หลักฐานจากผลการเรียนรู้
  assert(v("m4")!.competencies.some((k) => k.evidence.startsWith("ผลการเรียนรู้")));
  assert(r.every((c) => c.status === "proposed"));
});

Deno.test("ไม่จัดวิชาอื่นเป็นสมรรถนะอาชีพจากคำทั่วไป (ปฏิบัติ/ชิ้นงาน/จำหน่ายออกจากห้องสมุด)", () => {
  const r = classify({ programs, activities: [], links: [], subjects: [
    { ...S("x1", "ศ23202", "ทักษะนาฏศิลป์ (ตัวอย่าง)", "additional", ["pg"], "การฝึกปฏิบัติการทำงานกลุ่มจัดการแสดง การประดิษฐ์เครื่องแต่งกาย"), grade: "ม.3" },
    { ...S("x2", "ท23201", "ห้องสมุด (ตัวอย่าง)", "additional", ["pg"], "ศึกษา ปฏิบัติ การซ่อมแซมหนังสือ การสำรวจและการจำหน่ายออกจากห้องสมุด นำความรู้ไปประกอบอาชีพได้"), grade: "ม.3" },
    { ...S("x3", "ว20286", "ออกแบบ (ตัวอย่าง)", "additional", ["pg"], "ฝึกปฏิบัติทักษะ สร้างสรรค์ชิ้นงานตามแบบ"), grade: "ม.2" },
  ] });
  assertEquals(r.filter((c) => c.category === "vocational" && c.targetType === "subject").length, 0);
});

Deno.test("ช่วงชั้นจากระดับชั้น/แผนการเรียน", () => {
  assertEquals(stageOf("ม.3"), "lower");
  assertEquals(stageOf("ม.4"), "upper");
  assertEquals(stageOf(null, "upper_secondary"), "upper");
});
