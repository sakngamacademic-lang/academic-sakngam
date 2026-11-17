// deno test — ซ่อมการถอดอักขระไทยต่อฟอนต์ + จัดตารางตัวชี้วัดตามคอลัมน์ชั้น (ชิ้นข้อความสังเคราะห์ ไม่ใช่ข้อมูลหลักสูตรจริง)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { END_GRADES, fontsWithAaAsAm, layoutPageText, type PdfTextItem, REPAIRED_MARK, repairThaiText } from "./pdf-layout.ts";
import { analyzePdfPages } from "./curriculum-analyze.ts";

const at = (str: string, x: number, y: number, fontName = "F", width = str.length * 5): PdfTextItem => ({ str, transform: [1, 0, 0, 1, x, y], width, fontName });

Deno.test("PUA รูปเลื่อนตำแหน่งของฟอนต์ไทย → อักขระมาตรฐาน", () => {
  assertEquals(repairThaiText("เขา อยา ป เปน แกส ปญหา", false), "เข้า อย่า ปี เป็น แก๊ส ปัญหา");
});

Deno.test("นิคหิตที่ไม่มีแผนที่ (U+FFFD) + สระอา → สระอำ · ลำดับ “ำา” ที่ไม่มีในภาษาไทย → “ำ”", () => {
  assertEquals(repairThaiText("ค�าสั่ง น�้า", false), "คำสั่ง น้ำ");
  assertEquals(repairThaiText("จำานวน", false), "จำนวน");
});

Deno.test("ฟอนต์ที่แมปสระอาเป็น “ำ”: แก้เฉพาะฟอนต์นั้น ฟอนต์ที่ถอดถูกไม่แตะ (บรรทัดผสมหัวข้อตัวหนา + เนื้อหา)", () => {
  // ฟอนต์ B (หัวข้อ) ถอดถูก · ฟอนต์ R (เนื้อหา) สระอา→ำ และสระอำจริง = FFFD+ำ
  const items = [at("มาตรฐาน ", 0, 100, "B"), at("กำรศึกษำ ท�ำงำน ควำมรู้ ", 60, 100, "R"), at("ทำนา จำนวน", 0, 80, "C")];
  assertEquals([...fontsWithAaAsAm(items)], ["R"]);
  const t = layoutPageText(items);
  assert(t.startsWith(REPAIRED_MARK));
  assert(t.includes("มาตรฐาน การศึกษา ทำงาน ความรู้"), t);
  assert(t.includes("ทำนา จำนวน"), "ฟอนต์ C ที่มีทั้ง า และ ำ จริง ต้องไม่ถูกแก้");
});

Deno.test("ไม่มีหลักฐานพอ (ข้อความสั้น) → ไม่แก้สระ", () => {
  assertEquals([...fontsWithAaAsAm([at("ทำ", 0, 0, "X")])], []);
});

Deno.test("หน้าไม่มีตารางชั้น + ไม่ต้องซ่อม → ข้อความเหมือนเดิม (str + EOL)", () => {
  const items: PdfTextItem[] = [{ str: "บรรทัดหนึ่ง", hasEOL: true }, { str: "บรรทัดสอง", hasEOL: false }];
  assertEquals(layoutPageText(items), "บรรทัดหนึ่ง\nบรรทัดสอง");
});

Deno.test("ตารางคอลัมน์ละชั้น: แยกข้อตามพิกัด x · ช่องว่าง “-” · ป้ายแยก “ป.”+“๑” · ตัดเลขหน้า", () => {
  const items = [
    at("มาตรฐาน ว ๑.๑ เข้าใจระบบนิเวศ", 40, 560),
    at("ตัวชี้วัดชั้นปี", 40, 540),
    at("ป.", 100, 520), at("๑", 112, 520, "F", 5), at("ป. ๒", 300, 520), at("ป. ๓", 500, 520),
    // ข้อความในช่อง (เรียงสลับกันเหมือนลำดับใน content stream)
    at("๑. อธิบายโครงสร้าง", 45, 500), at("-", 245, 500), at("๑. เปรียบเทียบ", 445, 500),
    at("ของเซลล์", 45, 486), at("พืชและสัตว์", 445, 486),
    at("๒. สังเกตการเจริญ", 45, 472),
    at("๗", 400, 20), // เลขหน้า
  ];
  const t = layoutPageText(items);
  assertEquals(t.split("\n").slice(2), ["@@GRADE ป.1@@", "๑. อธิบายโครงสร้าง", "ของเซลล์", "๒. สังเกตการเจริญ", "@@GRADE ป.2@@", "-", "@@GRADE ป.3@@", "๑. เปรียบเทียบ", "พืชและสัตว์", END_GRADES]);
  const r = analyzePdfPages([t]);
  const ind = r.items.filter((i) => i.item_type === "indicator").map((i) => [i.item_key, i.extracted.statement]);
  assertEquals(ind, [["ว 1.1 ป.1/1", "อธิบายโครงสร้าง ของเซลล์"], ["ว 1.1 ป.1/2", "สังเกตการเจริญ"], ["ว 1.1 ป.3/1", "เปรียบเทียบ พืชและสัตว์"]]);
  assert(r.items.filter((i) => i.item_type === "indicator").every((i) => i.flags!.some((f) => f.code === "GRADE_FROM_LAYOUT")));
});

Deno.test("ตารางคอลัมน์เดียว (ม. ๔-๖) ใต้คำว่า “ตัวชี้วัด” ได้ชั้นช่วง", () => {
  const t = layoutPageText([at("มาตรฐาน ค ๒.๑ เข้าใจการวัด", 40, 560), at("ตัวชี้วัดช่วงชั้น", 40, 540), at("ม. ๔-๖", 300, 520), at("๑. แก้ปัญหาเกี่ยวกับการวัด", 45, 500)]);
  const r = analyzePdfPages([t]);
  assertEquals(r.items.find((i) => i.item_type === "indicator")?.item_key, "ค 2.1 ม.4-6/1");
});
