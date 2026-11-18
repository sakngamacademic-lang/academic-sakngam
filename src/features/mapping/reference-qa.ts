/**
 * ตรวจคุณภาพ/ความครบของฐานตัวชี้วัดอ้างอิง (ไม่มี dependency · ทดสอบ scripts/reference-qa.test.ts)
 * ไม่แต่ง/อนุมานข้อความ — รายงานเฉพาะสิ่งที่ตรวจได้จากข้อมูลที่สกัดจากเอกสาร:
 *  - รหัสซ้ำที่ข้อความต่างกัน (ต่างหน้า/ต่างฉบับ) · เลขตัวชี้วัดขาดช่วงในมาตรฐาน×ชั้นเดียวกัน
 *  - มาตรฐานที่ไม่มีตัวชี้วัด · ตัวชี้วัดที่ไม่มีมาตรฐาน · จำนวนรายกลุ่มสาระ×ชั้น
 *  - รหัสจากเอกสารโรงเรียนที่ไม่อยู่ในฐาน (อาจเป็นรหัสต่างฉบับ/ยกเลิก)
 * “ครบถ้วน” ต้องให้ฝ่ายวิชาการตรวจกับเอกสารต้นทางและยืนยัน — ระบบไม่ยืนยันเอง
 */
export interface RefRow { code: string; standard: string; grade: string; statement: string; locator: string | null }
export interface QaIssue { kind: "variant" | "gap" | "orphan_standard" | "no_standard" | "bad_code" | "low_count"; key: string; detail: string; locators: string[] }
export interface CellCount { area: string; grade: string; standards: number; indicators: number; issues: number }
export interface QaResult { cells: CellCount[]; issues: QaIssue[]; total: number; distinct: number }

const TH = "๐๑๒๓๔๕๖๗๘๙";
const digits = (s: string) => s.replace(/[๐-๙]/g, (d) => String(TH.indexOf(d)));
const norm = (s: string) => digits(s).replace(/\s+/g, "");
const CODE = /^([ก-ฮ])(\d+)\.(\d+)([มป])\.(\d(?:-\d)?)\/(\d+)$/;
const cleanText = (s: string) => digits(s).replace(/\s+/g, "");

export function referenceQa(rows: RefRow[], standards: string[] = []): QaResult {
  const byCode = new Map<string, RefRow[]>();
  const issues: QaIssue[] = [];
  for (const r of rows) {
    const k = norm(r.code);
    if (!CODE.test(k)) { issues.push({ kind: "bad_code", key: r.code, detail: "รูปแบบรหัสไม่ตรงแบบ “ก 1.1 ม.1/1”", locators: r.locator ? [r.locator] : [] }); continue; }
    (byCode.get(k) ?? byCode.set(k, []).get(k)!).push(r);
  }
  // รหัสเดียวกันแต่ข้อความต่าง → ต้องตรวจว่าฉบับ/หน้าใดถูกต้อง (ไม่เลือกให้)
  for (const [k, rs] of byCode) {
    const texts = new Set(rs.map((r) => cleanText(r.statement)));
    if (texts.size > 1) issues.push({ kind: "variant", key: k, detail: `พบ ${texts.size} ข้อความต่างกันในเอกสาร`, locators: [...new Set(rs.map((r) => r.locator).filter((x): x is string => !!x))] });
  }
  // เลขตัวชี้วัดขาดช่วง (เช่น /1 /2 /4) ในมาตรฐาน×ชั้นเดียวกัน
  const seq = new Map<string, number[]>();
  for (const k of byCode.keys()) {
    const m = CODE.exec(k)!;
    const g = `${m[1]}${m[2]}.${m[3]}|${m[4]}.${m[5]}`;
    (seq.get(g) ?? seq.set(g, []).get(g)!).push(Number(m[6]));
  }
  for (const [g, ns] of seq) {
    const max = Math.max(...ns), have = new Set(ns);
    const miss = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !have.has(n));
    if (miss.length) { const [st, gr] = g.split("|"); issues.push({ kind: "gap", key: `${st} ${gr}`, detail: `ไม่พบตัวชี้วัดข้อ ${miss.join(", ")} (มีถึงข้อ ${max})`, locators: [] }); }
  }
  const stdSet = new Set(standards.map(norm));
  const usedStd = new Set([...byCode.keys()].map((k) => { const m = CODE.exec(k)!; return `${m[1]}${m[2]}.${m[3]}`; }));
  for (const s of stdSet) if (!usedStd.has(s)) issues.push({ kind: "orphan_standard", key: s, detail: "มีมาตรฐานแต่ไม่พบตัวชี้วัด ม.1–ม.6 ในข้อมูลที่สกัด", locators: [] });
  if (stdSet.size) for (const s of usedStd) if (!stdSet.has(s)) issues.push({ kind: "no_standard", key: s, detail: "มีตัวชี้วัดแต่ไม่พบข้อความมาตรฐาน", locators: [] });
  // จำนวนรายกลุ่มสาระ×ชั้น
  const cells = new Map<string, { std: Set<string>; n: number }>();
  for (const k of byCode.keys()) {
    const m = CODE.exec(k)!;
    const key = `${m[1]}|${m[4]}.${m[5]}`;
    const c = cells.get(key) ?? cells.set(key, { std: new Set(), n: 0 }).get(key)!;
    c.std.add(`${m[2]}.${m[3]}`); c.n++;
  }
  // จำนวนน้อยผิดปกติเมื่อเทียบค่ากลางของชั้นอื่นในกลุ่มสาระเดียวกัน → อาจสกัดไม่ครบ (สัญญาณให้ตรวจ ไม่ใช่ข้อสรุป)
  const byArea = new Map<string, number[]>();
  for (const [k, v] of cells) { const a = k.split("|")[0]!; (byArea.get(a) ?? byArea.set(a, []).get(a)!).push(v.n); }
  for (const [k, v] of cells) {
    const [area, grade] = k.split("|") as [string, string];
    const ns = [...(byArea.get(area) ?? [])].sort((a, b) => a - b);
    const med = ns[Math.floor(ns.length / 2)] ?? 0;
    if (ns.length >= 3 && v.n < med * 0.5) issues.push({ kind: "low_count", key: `${area} ${grade}`, detail: `มี ${v.n} ตัวชี้วัด น้อยกว่าครึ่งหนึ่งของค่ากลางชั้นอื่นในกลุ่มสาระ (${med}) — ตรวจกับเอกสารต้นทางว่าสกัดครบหรือไม่`, locators: [] });
  }
  const issueAt = (area: string, grade: string) => issues.filter((x) => x.key.startsWith(area) && x.key.includes(grade)).length;
  return {
    cells: [...cells].map(([k, v]) => { const [area, grade] = k.split("|") as [string, string]; return { area, grade, standards: v.std.size, indicators: v.n, issues: issueAt(area, grade) }; })
      .sort((a, b) => a.area.localeCompare(b.area, "th") || a.grade.localeCompare(b.grade)),
    issues, total: rows.length, distinct: byCode.size,
  };
}

/** รหัสจากเอกสารโรงเรียน (เช่น ตารางสาระท้องถิ่น) เทียบกับฐาน: อยู่ในฐาน / ฐานมีมาตรฐานนี้แต่ไม่มีรหัส (อาจต่างฉบับ/ยกเลิก) / ฐานไม่ครอบคลุม */
export function crossEdition(schoolCodes: string[], refCodes: Set<string>, refStandards: Set<string>) {
  const out = { found: [] as string[], notInEdition: [] as string[], uncovered: [] as string[] };
  for (const c of schoolCodes) {
    const k = norm(c), m = CODE.exec(k);
    if (!m) continue;
    if (refCodes.has(k)) out.found.push(c);
    else if (refStandards.has(`${m[1]}${m[2]}.${m[3]}`)) out.notInEdition.push(c);
    else out.uncovered.push(c);
  }
  return out;
}
