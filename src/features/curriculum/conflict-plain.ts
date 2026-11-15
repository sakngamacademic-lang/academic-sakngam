import type { SourceConflict } from "./api";
import { HOURS_PER_CREDIT, SOURCE_LABELS } from "./conflict-insight";

/** คำอธิบายภาษาไทยง่าย ๆ ต่อข้อขัดแย้ง: ขัดกันตรงไหน · ทางเลือก 1/2 (ตัวเลขจริง) · คำแนะนำของ AI (ไม่ใช่มติ) */
export interface PlainOption { label: string; detail: string }
export interface PlainAi { pick: number | null; reason: string; pages: number[] }
export interface PlainView { problem: string; options: PlainOption[]; ai: PlainAi }
export interface PItem { src: string; page: number; name: string; credits: number; hours: number }
export interface PHeader { page: number; section: string; headHours: number; headCredits: number; sum: number; bad: { code: string; credits: number; hours: number }[] }

const nameKey = (s: string) => s.replace(/[\s\d\-–.]/g, "");
const cu = (c: number, h: number) => `${c.toFixed(1)} หน่วยกิต / ${h} ชั่วโมง`;
const ok = (c: number, h: number) => h === HOURS_PER_CREDIT * c;
const uniq = <T,>(a: T[]) => [...new Set(a)];
const pagesText = (items: PItem[]) => {
  const by = new Map<string, number[]>();
  for (const i of items) by.set(SOURCE_LABELS[i.src] ?? i.src, [...(by.get(SOURCE_LABELS[i.src] ?? i.src) ?? []), i.page]);
  return [...by].map(([s, p]) => { const u = uniq(p); return `${s} หน้า ${u.slice(0, 4).join(", ")}${u.length > 4 ? ` (และอีก ${u.length - 4} หน้า)` : ""}`; }).join(" · ");
};
const pageList = (items: PItem[]) => uniq(items.map((i) => i.page)).slice(0, 8);
const lev = (a: string, b: string) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]); for (let j = 1; j <= b.length; j++) d[0]![j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length]![b.length]!; };
const UNDECIDED = (reason: string, pages: number[] = []): PlainAi => ({ pick: null, reason: `ยังตัดสินไม่ได้ — ${reason}`, pages });

export function buildPlain(c: SourceConflict, kind: string, items: PItem[], h: PHeader | null, code: string | null, gap?: string): PlainView {
  const id = kind.split(":")[0]!;
  const name = (code ?? "").length ? `${code} ${items[0]?.name ?? ""}`.trim() : (c.subject_ref ?? c.conflict_code);

  if (id === "close_page") return {
    problem: "ผลตรวจเดิมบันทึกว่าหน้าประกาศใช้หลักสูตรคือ PDF หน้า 4 แต่ไฟล์ 547 หน้าที่ได้รับ มีประกาศอยู่หน้า 3 และสารบัญ (หน้า 2) ก็ระบุหน้า 3",
    options: [{ label: "ยืนยันว่าประกาศใช้หลักสูตรอยู่ PDF หน้า 3", detail: "ปิดข้อขัดแย้งนี้ และไม่ปรับการเลื่อนเลขหน้าย้อนหลัง" }],
    ai: { pick: 0, reason: "ตรวจข้อความ PDF หน้า 3 พบ “ประกาศโรงเรียนสักงามวิทยา เรื่อง ให้ใช้หลักสูตร…” จริง และสารบัญหน้า 2 ระบุหน้า 3 ตรงกัน", pages: [3, 2] },
  };
  if (id === "close_is") return {
    problem: "รายวิชา IS1/IS2 มี 2 ชุด คือ ม.ต้น (หน้า 477, 478) และ ม.ปลาย (หน้า 480, 481) ใช้รหัสเดียวกันแต่คำอธิบายต่างกัน และไม่ระบุกลุ่มสาระ",
    options: [{ label: "ถือเป็นรายวิชา IS 2 ชุดแยกตามช่วงชั้น (ม.ต้น / ม.ปลาย)", detail: "ระบบเก็บแยกชุดอยู่แล้ว ปิดข้อขัดแย้งนี้" }],
    ai: { pick: 0, reason: "แต่ละชุดอยู่คนละช่วงชั้น (ม.2 และ ม.5–6) และคำอธิบายต่างกันตามเอกสาร ระบบรองรับการเก็บ IS แยกช่วงชั้นแล้ว", pages: [477, 478, 480, 481] },
  };
  if (id === "code_format") return {
    problem: "รหัสวิชาวิทยาศาสตร์พลังสิบพิมพ์ไม่ตรงกัน: หน้าคำอธิบายรายวิชา (97, 98) ใช้ ว221201 / ว221202 แต่ตารางโครงสร้าง (หน้า 11) และหน้าสรุป (หน้า 83) ใช้ ว21201 / ว21202",
    options: [{ label: "ใช้รหัส ว21201 / ว21202", detail: "ตามตารางโครงสร้างหน้า 11 และสรุปหน้า 83" }, { label: "ใช้รหัส ว221201 / ว221202", detail: "ตามหน้าคำอธิบายรายวิชา 97 และ 98" }],
    ai: { pick: 0, reason: "ตารางโครงสร้างและหน้าสรุปใช้รหัส 5 หลักเหมือนรายวิชาอื่นทั้งหมดในเล่ม ส่วนรหัส 6 หลักพบเฉพาะหน้าคำอธิบายรายวิชา 2 หน้านี้", pages: [11, 83, 97, 98] },
  };
  if (id === "type_typo") return {
    problem: "ว221202: หน้า 98 เขียนหัวข้อว่า “รายวิชาพื้นฐาน” แต่หน้า 97 (วิชาคู่กัน ว221201) ตารางโครงสร้างหน้า 11 และเลขหลักที่ 3 ของรหัส ระบุว่าเป็น “รายวิชาเพิ่มเติม”",
    options: [{ label: "ถือเป็นรายวิชาเพิ่มเติม", detail: "ตรงกับหน้า 97, หน้า 11 และรหัส" }, { label: "ถือเป็นรายวิชาพื้นฐาน", detail: "ตามหัวข้อหน้า 98" }],
    ai: { pick: 0, reason: "มี 3 แหล่ง (หน้า 97, หน้า 11, เลขหลักที่ 3 ของรหัส) ชี้ว่าเพิ่มเติม ขัดกับหัวข้อหน้า 98 เพียงแหล่งเดียว", pages: [97, 98, 11] },
  };
  if (id === "type_conflict") return {
    problem: "ง30250: หน้าคำอธิบาย (หน้า 365) เขียนว่า “รายวิชาพื้นฐาน” แต่หน้าสรุป (หน้า 283) เลขหลักที่ 3 ของรหัสบอกว่าเพิ่มเติม และ 120 ชั่วโมงเกินโควตาพื้นฐานการงานอาชีพ ม.ปลาย 60 ชั่วโมง (หน้า 10)",
    options: [{ label: "ถือเป็นรายวิชาเพิ่มเติม", detail: "ตามเลขรหัส หน้าสรุป 283 และโควตาหน้า 10" }, { label: "ถือเป็นรายวิชาพื้นฐาน", detail: "ตามหัวข้อหน้า 365 (จะเกินโควตาพื้นฐาน 60 ชั่วโมง)" }],
    ai: { pick: 0, reason: "เลขรหัส หน้าสรุป และโควตาหน้า 10 สอดคล้องกันว่าเพิ่มเติม ขัดกับหัวข้อหน้า 365 เพียงจุดเดียว", pages: [365, 283, 10] },
  };

  if ((id === "typo_row" || id === "hours_unverified") && h) {
    const r = h.bad[0];
    const fixed = r ? HOURS_PER_CREDIT * r.credits : 0;
    const diff = h.headHours - h.sum;
    const problem = `ตารางโครงสร้างหน้า ${h.page} (${h.section}) เขียนยอดรวมไว้ ${h.headHours} ชั่วโมง แต่บวกรายวิชาในตารางได้ ${h.sum} ชั่วโมง (ต่างกัน ${Math.abs(diff)} ชั่วโมง)${r ? ` สาเหตุที่หาได้คือ ${r.code} เขียน ${cu(r.credits, r.hours)} ซึ่งไม่ตรงเกณฑ์ 40 ชั่วโมงต่อ 1 หน่วยกิต` : ""}`;
    const options: PlainOption[] = r ? [
      { label: `ถือว่า ${r.code} = ${cu(r.credits, fixed)}`, detail: `ยอดรวมหน้า ${h.page} จะเป็น ${h.headHours} ชั่วโมง ตรงกับหัวตาราง` },
      { label: `ถือว่า ${r.code} = ${cu(r.credits, r.hours)} ตามแถวในตาราง`, detail: `หัวตารางหน้า ${h.page} ต้องเป็น ${h.sum} ชั่วโมง` },
    ] : [];
    if (id === "hours_unverified") return { problem, options, ai: UNDECIDED(gap ?? "หลักฐานยังไม่พอ", [h.page]) };
    const desc: Record<string, { p: number; t: string }> = { ว31101: { p: 105, t: "คำอธิบายรายวิชาหน้า 105 ระบุ 40 ชั่วโมง / 1.0 หน่วยกิต" }, ว32101: { p: 109, t: "คำอธิบายรายวิชาหน้า 109 ระบุ 40 ชั่วโมง / 1.0 หน่วยกิต" }, ว32103: { p: 103, t: "หน้าสรุป 103 ระบุ 40 ชั่วโมง / 1.0 หน่วยกิต (ไม่พบหน้าคำอธิบายรายวิชา จึงมีหลักฐานรองรับน้อยกว่าวิชาอื่น)" } };
    const d = r ? desc[r.code] : undefined;
    return { problem, options, ai: r && d ? { pick: 0, reason: `ตรงเกณฑ์ 40 ชั่วโมง/หน่วยกิต, แก้แล้วยอดรวมตรงหัวตารางพอดี และ${d.t}`, pages: [h.page, d.p] } : UNDECIDED("ไม่พบหน้าคำอธิบายรายวิชาที่ยืนยันค่าของแถวนี้", [h.page]) };
  }
  if (id === "header_unexplained" && h) {
    const diff = h.headHours - h.sum;
    return {
      problem: `หัวตารางหน้า ${h.page} (${h.section}) ระบุ ${h.headHours} ชั่วโมง แต่บวกรายวิชาในตารางได้ ${h.sum} ชั่วโมง (ผลรวม${diff > 0 ? "น้อยกว่า" : "มากกว่า"}หัวตาราง ${Math.abs(diff)} ชั่วโมง) และไม่มีแถวใดแถวเดียวที่อธิบายส่วนต่างนี้ได้`,
      options: [{ label: `ถือหัวตาราง ${h.headHours} ชั่วโมง`, detail: "ต้องตรวจต่อว่ารายวิชาใดเกิน" }, { label: `ถือผลรวมรายวิชา ${h.sum} ชั่วโมง`, detail: "หัวตารางต้องแก้ให้ตรง" }],
      ai: UNDECIDED("ส่วนต่างมาก และไม่มีหลักฐานชี้ว่าหัวตารางหรือรายวิชาฝั่งใดผิด", [h.page]),
    };
  }

  // ---- หมวดที่อ่านค่าจากรายการ G/A/D ----
  const byValue = new Map<string, PItem[]>();
  for (const i of items) byValue.set(`${i.credits}|${i.hours}`, [...(byValue.get(`${i.credits}|${i.hours}`) ?? []), i]);
  const vals = [...byValue].sort((a, b) => b[1].length - a[1].length);
  const vo = (k: string, list: PItem[]): PlainOption => { const [cr, hr] = k.split("|").map(Number) as [number, number]; return { label: `ใช้ ${cu(cr, hr)}`, detail: pagesText(list) }; };

  if (id === "typo_value" && vals.length >= 2) {
    const good = vals.find(([k]) => ok(...(k.split("|").map(Number) as [number, number])))!;
    const bad = vals.find(([k]) => !ok(...(k.split("|").map(Number) as [number, number])))!;
    const [bc, bh] = bad[0].split("|").map(Number) as [number, number];
    return {
      problem: `${name}: เอกสารระบุตัวเลขไม่ตรงกัน — ${pagesText(good[1])} ระบุ ${cu(...(good[0].split("|").map(Number) as [number, number]))} แต่ ${pagesText(bad[1])} ระบุ ${cu(bc, bh)}`,
      options: [vo(good[0], good[1]), vo(bad[0], bad[1])],
      ai: { pick: 0, reason: `${cu(...(good[0].split("|").map(Number) as [number, number]))} ตรงเกณฑ์ 40 ชั่วโมง/หน่วยกิต และพบใน ${good[1].length} จุด ส่วน ${cu(bc, bh)} ไม่ตรงเกณฑ์และพบ ${bad[1].length} จุด`, pages: pageList(items) },
    };
  }
  if (id === "values_differ" && vals.length >= 2) {
    const [a, b] = vals;
    const allOk = vals.every(([k]) => ok(...(k.split("|").map(Number) as [number, number])));
    return {
      problem: `${name}: ตัวเลขหน่วยกิต/ชั่วโมงไม่ตรงกัน — ${vals.slice(0, 3).map(([k, l]) => `${cu(...(k.split("|").map(Number) as [number, number]))} (${pagesText(l)})`).join(" ต่างจาก ")}`,
      options: [vo(a![0], a![1]), vo(b![0], b![1])],
      ai: UNDECIDED(allOk ? "ทุกค่าตรงเกณฑ์ 40 ชั่วโมง/หน่วยกิตเหมือนกัน ไม่มีหลักฐานชี้ว่าค่าใดถูก" : "ค่าหนึ่งไม่ตรงเกณฑ์ 40 ชั่วโมง/หน่วยกิต แต่หน่วยกิตของแต่ละค่าต่างกัน จึงไม่ใช่การพิมพ์ชั่วโมงผิดอย่างชัดเจน", pageList(items)),
    };
  }
  if (id.startsWith("dup_")) {
    const groups = new Map<string, PItem[]>();
    const keyOf = (n: string) => n.replace(/\s+/g, "");
    for (const i of items) groups.set(keyOf(i.name), [...(groups.get(keyOf(i.name)) ?? []), i]);
    const gs = [...groups.values()];
    const nm = (l: PItem[]) => l[0]!.name;
    const [x, y] = gs;
    const codeText = c.subject_ref ?? "";
    if (id === "dup_sequence" && x && y) return {
      problem: `รหัส ${codeText} ถูกใช้ 2 ครั้ง: “${nm(x)}” (${pagesText(x)}) และ “${nm(y)}” (${pagesText(y)}) ชื่อต่างกันเฉพาะเลขลำดับ`,
      options: [{ label: "ถือเป็น 2 รายวิชา (ลำดับที่ 1 และ 2) ที่พิมพ์รหัสซ้ำ", detail: "ให้โรงเรียนยืนยันรหัสของลำดับที่ 2 (ระบบไม่ตั้งรหัสเอง)" }, { label: "ถือเป็นรายวิชาเดียวกัน", detail: "รวมคำอธิบายไว้ที่รหัสเดียว" }],
      ai: UNDECIDED("ไม่มีเอกสารที่บอกรหัสของลำดับที่ 2 ระบบจึงเดารหัสให้ไม่ได้", pageList(items)),
    };
    if (x && y) {
      const similar = lev(nameKey(nm(x)), nameKey(nm(y))) <= 4 && !(id === "dup_sequence");
      const rename = id === "dup_rename" || similar;
      return {
        problem: rename ? `รหัส ${codeText}: ชื่อรายวิชาในเอกสารไม่ตรงกัน — “${nm(x)}” (${pagesText(x)}) กับ “${nm(y)}” (${pagesText(y)}) หน่วยกิตเท่ากัน` : `รหัส ${codeText} ถูกใช้กับรายวิชาคนละชื่อ — “${nm(x)}” (${pagesText(x)}) กับ “${nm(y)}” (${pagesText(y)})`,
        options: rename
          ? [{ label: `ใช้ชื่อ “${nm(x)}”`, detail: pagesText(x) }, { label: `ใช้ชื่อ “${nm(y)}”`, detail: pagesText(y) }]
          : [{ label: `เก็บรหัสนี้ไว้ที่ “${nm(x)}” และให้โรงเรียนกำหนดรหัสใหม่ให้ “${nm(y)}”`, detail: "ต้องมีเอกสารยืนยันรหัสใหม่" }, { label: `เก็บรหัสนี้ไว้ที่ “${nm(y)}” และให้โรงเรียนกำหนดรหัสใหม่ให้ “${nm(x)}”`, detail: "ต้องมีเอกสารยืนยันรหัสใหม่" }],
        ai: UNDECIDED(rename ? (similar ? "ชื่อสองหน้าต่างกันเพียงเล็กน้อย (สะกด/เลขลำดับ) แต่ไม่มีเอกสารที่ระบุว่าชื่อใดเป็นชื่อทางการ" : "ไม่มีเอกสารที่ระบุว่าชื่อใดเป็นชื่อทางการของรายวิชานี้") : "เป็นรายวิชาคนละชื่อที่ใช้รหัสเดียวกัน ต้องให้โรงเรียนกำหนดรหัสใหม่ ระบบเดารหัสให้ไม่ได้", pageList(items)),
      };
    }
    if (x) return {
      problem: `รหัส ${codeText}: ${pagesText(x)}`, options: [{ label: "ตัดสินเอง พร้อมระบุเหตุผล", detail: "" }], ai: UNDECIDED("หลักฐานไม่พอจะเสนอทางเลือก", pageList(items)),
    };
  }
  return { problem: c.description || `${c.conflict_code}`, options: [{ label: "ตัดสินเอง พร้อมระบุเหตุผล", detail: "" }], ai: UNDECIDED("หลักฐานไม่พอจะเสนอทางเลือก", pageList(items)) };
}
