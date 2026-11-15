/**
 * ข้อสังเกตจากหลักฐานของข้อขัดแย้ง — คำนวณจากข้อความ A/B ที่บันทึกไว้ในทะเบียนข้อขัดแย้งเท่านั้น
 * ใช้ช่วยผู้ดูแลหลักสูตรตัดสิน: ไม่แก้ข้อมูล ไม่ตัดสินแทน และไม่เดาค่า
 * เกณฑ์เทียบ: 40 ชั่วโมง/หน่วยกิต (ค่าที่รายวิชาส่วนใหญ่ในเล่มใช้) — ใช้บอก “ค่าใดสอดคล้อง” เท่านั้น
 */
export interface ConflictInsight {
  kind: "header_total" | "subject_values" | "duplicate_code" | "other";
  observations: string[];
  options: string[];
}

const HOURS_PER_CREDIT = 40;
const consistent = (credits: number, hours: number) => Math.abs(hours - HOURS_PER_CREDIT * credits) < 1e-9;
const fmt = (c: number, h: number) => `${c.toFixed(1)} หน่วยกิต / ${h} ชั่วโมง`;
const SOURCE_LABELS: Record<string, string> = { G: "ตารางโครงสร้าง", A: "สรุปโครงสร้างกลุ่มสาระ", D: "คำอธิบายรายวิชา" };

const ITEM = /([GAD]) หน้า (\d+): (.+?) (\d+(?:\.\d+)?)\((\d+)\)/g;

export function conflictInsight(c: { category: string; value_a: string | null; value_b: string | null }): ConflictInsight {
  const a = c.value_a ?? "";
  const b = c.value_b ?? "";

  // 1) หัวตารางไม่ตรงผลรวมรายวิชา
  const head = /หัวตาราง หน้า (\d+): (รายวิชา\S+) (\d+(?:\.\d+)?)\((\d+)\)/.exec(a);
  if (head) {
    const [, page, section, hc, hh] = head;
    const headCredits = Number(hc);
    const headHours = Number(hh);
    const rows = [...b.matchAll(/([ก-ฮ]\d{5,6}) (\d+(?:\.\d+)?)\((\d+)\)/g)].map((m) => ({ code: m[1] as string, credits: Number(m[2]), hours: Number(m[3]) }));
    const sumHours = rows.reduce((s, r) => s + r.hours, 0);
    const bad = rows.filter((r) => !consistent(r.credits, r.hours));
    const fixedHours = rows.reduce((s, r) => s + (bad.includes(r) ? HOURS_PER_CREDIT * r.credits : r.hours), 0);
    const obs = [`หน้า ${page} (${section}): หัวตารางระบุ ${fmt(headCredits, headHours)} แต่ผลรวมรายวิชาในตารางได้ ${sumHours} ชั่วโมง (ต่างกัน ${headHours - sumHours > 0 ? "+" : ""}${headHours - sumHours})`];
    if (bad.length === 1 && fixedHours === headHours) {
      const r = bad[0]!;
      obs.push(`แถว ${r.code} ระบุ ${fmt(r.credits, r.hours)} ซึ่งไม่ตรงเกณฑ์ ${HOURS_PER_CREDIT} ชั่วโมง/หน่วยกิต — ถ้าเป็น ${HOURS_PER_CREDIT * r.credits} ชั่วโมง ผลรวมจะตรงหัวตารางพอดี (จึงมีแนวโน้มว่าตัวเลขของแถวนี้พิมพ์ผิด)`);
      return { kind: "header_total", observations: obs, options: [`ถือหัวตารางเป็นหลัก (ตัวเลขแถว ${r.code} ในตารางเป็นข้อผิดพลาดของต้นฉบับ)`, `ถือตัวเลขในแถวเป็นหลัก (แก้หัวตารางแทน)`, "ตัดสินเอง พร้อมระบุเหตุผล"] };
    }
    obs.push(bad.length ? `แถวที่ไม่ตรงเกณฑ์ ${HOURS_PER_CREDIT} ชั่วโมง/หน่วยกิต: ${bad.map((r) => r.code).join(", ")} แต่แก้แล้วผลรวมยังไม่ตรงหัวตาราง` : "ไม่มีแถวใดที่ผิดเกณฑ์ — ส่วนต่างไม่สามารถอธิบายด้วยแถวเดียวได้");
    return { kind: "header_total", observations: obs, options: ["ถือหัวตารางเป็นหลัก", "ถือผลรวมรายวิชาเป็นหลัก", "ตัดสินเอง พร้อมระบุเหตุผล (ห้ามแก้ยอดเพื่อให้ตรง)"] };
  }

  // 2) รายวิชาเดียวกันมีค่าต่างกันตามแหล่ง / รหัสซ้ำ
  const items = [...`${a}; ${b}`.matchAll(ITEM)].map((m) => ({ src: m[1] as string, page: Number(m[2]), name: (m[3] as string).trim(), credits: Number(m[4]), hours: Number(m[5]) }));
  if (items.length) {
    const byValue = new Map<string, typeof items>();
    for (const it of items) byValue.set(`${it.credits}|${it.hours}`, [...(byValue.get(`${it.credits}|${it.hours}`) ?? []), it]);
    const names = [...new Set(items.map((i) => i.name.replace(/[\s\d\-–.]/g, "")))];
    const obs: string[] = [];
    if (c.category === "duplicate_code" || names.length > 1) {
      obs.push(`รหัสนี้ปรากฏกับชื่อรายวิชา ${[...new Set(items.map((i) => i.name))].join(" / ")}`);
      obs.push(names.length === 1 ? "ชื่อต่างกันเฉพาะเลขลำดับ/ช่องว่าง — น่าจะเป็นรายวิชาลำดับที่ 1, 2 ที่พิมพ์รหัสซ้ำ หรือเป็นการสะกดต่างกัน" : "ชื่อต่างกันชัดเจน — เป็นไปได้ว่าต้นฉบับใช้รหัสเดียวกันกับรายวิชาคนละชื่อ (ระบบไม่เปลี่ยนรหัสเอง)");
    }
    const parts = [...byValue.entries()].map(([k, v]) => {
      const [cr, hr] = k.split("|").map(Number) as [number, number];
      return `${fmt(cr, hr)} ${consistent(cr, hr) ? "(สอดคล้องเกณฑ์ 40 ชม./หน่วยกิต)" : "(ไม่ตรงเกณฑ์ 40 ชม./หน่วยกิต)"} — ${v.map((i) => `${SOURCE_LABELS[i.src] ?? i.src} หน้า ${i.page}`).join(", ")}`;
    });
    if (byValue.size > 1) obs.push(...parts.map((p) => `ค่า: ${p}`));
    const inconsistent = [...byValue.keys()].filter((k) => { const [cr, hr] = k.split("|").map(Number) as [number, number]; return !consistent(cr, hr); });
    if (byValue.size > 1 && inconsistent.length === 1) obs.push("มีเพียงค่าเดียวที่ไม่ตรงเกณฑ์ — มีแนวโน้มว่าเป็นค่าที่พิมพ์ผิด");
    const kind = c.category === "duplicate_code" ? "duplicate_code" : "subject_values";
    const options = kind === "duplicate_code"
      ? ["เก็บรหัสไว้กับรายวิชาที่มีคำอธิบายรายวิชา และให้โรงเรียนกำหนดรหัสใหม่ให้อีกรายวิชา (ต้องมีเอกสารยืนยัน)", "เก็บเป็นรายการแยกตามแผนจนกว่าจะมีเอกสารยืนยัน", "ตัดสินเอง พร้อมระบุเหตุผล"]
      : ["ใช้ค่าตามคำอธิบายรายวิชา", "ใช้ค่าตามตารางโครงสร้าง", "ตัดสินเอง พร้อมระบุเหตุผล"];
    return { kind, observations: obs, options };
  }
  return { kind: "other", observations: [], options: ["ตัดสินเอง พร้อมระบุเหตุผลและหน้าอ้างอิง"] };
}
