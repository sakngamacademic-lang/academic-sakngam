// deno test --config supabase/functions/deno.json --unstable-sloppy-imports scripts/local-match.test.ts — ข้อมูลจำลองเท่านั้น
import { assert, assertEquals } from "jsr:@std/assert@1";
import { analyzeLocal, checkCode, parseCode, readLocalCsv } from "../src/features/curriculum/categories/local-match.ts";

const CSV = `﻿ตารางที่,แถวที่,รหัสตัวชี้วัดตามต้นฉบับ,สาระการเรียนรู้แกนกลางตามต้นฉบับ,สาระการเรียนรู้ท้องถิ่นตามต้นฉบับ,สถานะ,แหล่งอ้างอิง
1,2,"ท 1.1
ม. 1/1",- การอ่านออกเสียงบทร้อยกรอง,- บทร้อยกรอง จังหวัดตัวอย่าง,รอตรวจสอบกับมาตรฐานปัจจุบัน,ต้นฉบับ: ตัวอย่าง.docx
2,3,"มฐ. ส. 1.1
ม.1/1",- พุทธประวัติ,"- วัดในท้องถิ่น ""ตัวอย่าง""",รอตรวจสอบกับมาตรฐานปัจจุบัน,ต้นฉบับ: ตัวอย่าง.docx
3,4,"ค 5.1
ม. 4.6/1",- สถิติ,- ข้อมูลท้องถิ่น,รอตรวจสอบกับมาตรฐานปัจจุบัน,ต้นฉบับ: ตัวอย่าง.docx
4,5,ต 2.1.1,- วัฒนธรรม,- ประเพณีท้องถิ่น,รอตรวจสอบกับมาตรฐานปัจจุบัน,ต้นฉบับ: ตัวอย่าง.docx
5,6,"ต 1.1
ม. 2/1",- การอ่านออกเสียงข้อความภาษาอังกฤษ,- ป้ายในชุมชน,รอตรวจสอบกับมาตรฐานปัจจุบัน,ต้นฉบับ: ตัวอย่าง.docx
6,7,"ว 1.1
ม. 1/1",- ระบบนิเวศ,- ป่าชุมชน,รอตรวจสอบกับมาตรฐานปัจจุบัน,ต้นฉบับ: ตัวอย่าง.docx`;

Deno.test("อ่าน CSV ครบ เก็บรหัส/ข้อความตามต้นฉบับ (คำพูดซ้อน ขึ้นบรรทัด)", () => {
  const { items, errors } = readLocalCsv(CSV);
  assertEquals(errors, []);
  assertEquals(items.length, 6);
  assertEquals(items[0]!.codeRaw, "ท 1.1\nม. 1/1");
  assertEquals(items[1]!.localText, '- วัดในท้องถิ่น "ตัวอย่าง"');
  assertEquals(items[0]!.key, "1-2");
});

Deno.test("แยกรหัส: รูปแบบที่อ่านได้ / ไม่ชัดเจน (ไม่เดาหรือแก้รหัส)", () => {
  assertEquals(parseCode("ท 1.1\nม. 1/1")?.norm, "ท1.1ม.1/1");
  assertEquals(parseCode("มฐ. ส. 1.1\nม.1/1")?.norm, "ส1.1ม.1/1");
  assertEquals(parseCode("ค 5.1\nม. 4.6/1"), null); // “4.6” ไม่สรุปว่าเป็น 4-6
  assertEquals(parseCode("ต 2.1.1"), null);
  assertEquals(parseCode("ส 4.1 ม.4-6/2")?.grade, "ม.4-6");
});

Deno.test("ตรวจรหัสกับฐาน: พบ / ไม่พบในฉบับปรับปรุง / ไม่มีฐาน / ไม่ชัดเจน", () => {
  const { items } = readLocalCsv(CSV);
  const ref = { codes: new Set(["ท1.1ม.1/1"]), standards: new Set(["ว1.1", "ท1.1"]) };
  assertEquals(checkCode(items[0]!, ref), "found");
  assertEquals(checkCode(items[5]!, ref), "not_in_revised");
  assertEquals(checkCode(items[1]!, ref), "no_reference");
  assertEquals(checkCode(items[2]!, ref), "unclear");
});

const SUB = (id: string, code: string, name: string, grade: string, description: string | null, outcomes: string[] = []) =>
  ({ id, code, name, grade, description, outcomes, locator: "pdf:1", sourceDocId: "d" });

Deno.test("จับคู่จากกลุ่มสาระ+ชั้น+เนื้อหา · ภาษาต่างประเทศ (ต) ↔ รหัสวิชา อ · ชั้นอื่นไม่จับ", () => {
  const { items } = readLocalCsv(CSV);
  const r = analyzeLocal(items, [
    SUB("th1", "ท21101", "ภาษาไทย 1 (ตัวอย่าง)", "M1", "ฝึกการอ่านออกเสียงบทร้อยกรองและร้อยแก้ว"),
    SUB("th2", "ท22101", "ภาษาไทย 3 (ตัวอย่าง)", "M2", "การอ่านออกเสียงบทร้อยกรอง"),
    SUB("en2", "อ22101", "ภาษาอังกฤษ 3 (ตัวอย่าง)", "M2", "อ่านออกเสียงข้อความภาษาอังกฤษ ป้าย คำแนะนำ"),
  ]);
  const th = r.links.find((l) => l.itemKey === "1-2");
  assertEquals(th?.subjectId, "th1");
  assertEquals(th?.confidence, "high");
  assert(!r.links.some((l) => l.itemKey === "1-2" && l.subjectId === "th2"));
  assert(r.links.some((l) => l.itemKey === "5-6" && l.subjectId === "en2"));
});

Deno.test("คำว่า “ท้องถิ่น/ชุมชน” อย่างเดียวไม่ทำให้จับคู่ · ไม่มีรายวิชาชั้นนั้น → แจ้งแยก", () => {
  const { items } = readLocalCsv(CSV);
  const r = analyzeLocal(items, [SUB("sc", "ว21101", "วิทยาศาสตร์ 1 (ตัวอย่าง)", "M1", "ศึกษาชุมชน ท้องถิ่น และป่าในท้องถิ่น")]);
  assert(!r.links.some((l) => l.itemKey === "6-7")); // ไม่มีเนื้อหาระบบนิเวศ
  assert(r.unmatched.includes("6-7"));
  assert(r.noSubject.includes("1-2")); // ไม่มีวิชาภาษาไทย ม.1 ในชุดนี้
  assert(r.unmatched.includes("3-4")); // รหัสไม่ชัดเจน
});
