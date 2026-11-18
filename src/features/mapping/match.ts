/**
 * Curriculum Mapping Comparison — ตัวเปรียบเทียบแบบไม่ใช้ AI (ไม่มี dependency · ทดสอบด้วย deno: match.test.ts)
 *
 * ลำดับการตรวจ (ตามข้อกำหนดฝ่ายวิชาการ)
 *  1) รหัสมาตรฐาน/ตัวชี้วัดที่โรงเรียนระบุ (หน่วย/คำอธิบาย/ผลการเรียนรู้)
 *  2) ข้อความตัวชี้วัดเทียบกับข้อความฝั่งโรงเรียน
 *  3) ระดับชั้นและฉบับหลักสูตร
 *  4) สาระสำคัญ/เนื้อหาหน่วย  5) จุดประสงค์/กิจกรรม (ถ้ามี)  6) แสดงหลักฐานทั้งสองฝ่าย
 *
 * หลักการ: ความคล้ายของข้อความ “อย่างเดียว” ไม่ตัดสินว่าครอบคลุม — ได้สูงสุด “ต้องตรวจเพิ่มเติม (ระบบเสนอ)”
 * ผลทุกข้อเป็นข้อเสนอของระบบ จนกว่าฝ่ายวิชาการยืนยันในฐานข้อมูล
 */

export type MatchResult = "covered" | "partial" | "not_found" | "needs_review" | "insufficient";
export const RESULT_LABEL: Record<MatchResult, string> = {
  covered: "ครอบคลุม",
  partial: "ครอบคลุมบางส่วน",
  not_found: "ไม่พบความครอบคลุม",
  needs_review: "ต้องตรวจเพิ่มเติม",
  insufficient: "ข้อมูลไม่เพียงพอ",
};
const RANK: Record<MatchResult, number> = { covered: 4, partial: 3, needs_review: 2, not_found: 1, insufficient: 0 };

export interface RefIndicator {
  key: string; // full_code ปกติ (normCode)
  id: string | null; // indicators.id (เฉพาะกรอบที่บันทึกแล้ว)
  code: string; // รหัสแสดงผล เช่น "ส 5.1 ม.2/1"
  standardCode: string;
  standardText: string | null;
  statement: string;
  grade: string; // "ม.2" | "ม.4-6"
  areaCode: string; // ตัวอักษรกลุ่มสาระ เช่น "ส"
  locator: string | null;
  sourceDocId: string | null;
  flags: string[];
}

export interface TextPart { field: string; label: string; text: string }
export interface SchoolUnit {
  id: string; // unit id หรือ "desc:<subjectId>"
  kind: "unit" | "description";
  title: string;
  parts: TextPart[];
  declared: string[]; // รหัสตัวชี้วัด (normCode) ที่ระบุไว้กับหน่วยนี้
  locator: string | null;
  sourceDocId: string | null;
}
export interface SchoolSubject {
  id: string;
  code: string;
  name: string;
  grade: string | null; // "ม.2"
  areaCode: string | null;
  units: SchoolUnit[];
  hasUnits: boolean;
  locator: string | null;
  sourceDocId: string | null;
}

export interface Decision { subjectId: string; indicatorKey: string; status: "verified" | "rejected" | "pending_review"; note: string | null; mappingId: string; at: string | null }

export interface Pair {
  subjectId: string;
  unitId: string;
  indicatorKey: string;
  /** ผลสุดท้าย: “ครอบคลุม” ได้เฉพาะเมื่อฝ่ายวิชาการยืนยันแล้ว */
  result: MatchResult;
  /** สิ่งที่ระบบเสนอ (ก่อนการยืนยัน) */
  proposed: MatchResult;
  /** 1 = รหัสตรง · 2 = หลักฐานจากเนื้อหา (มีรหัส) · 3 = ระบบเสนอจากความหมาย (ไม่มีรหัส) · 0 = ยืนยันด้วยมือ */
  level: 0 | 1 | 2 | 3;
  verification: "verified" | "rejected" | "unverified";
  origin: "declared" | "suggested" | "confirmed";
  score: number;
  matched: string[];
  reasons: string[];
  schoolField: string | null;
  schoolSnippet: string | null;
  decision: Decision | null;
}

export interface IndicatorRow { indicator: RefIndicator; result: MatchResult; best: Pair | null; pairs: Pair[]; note: string }
export interface UnknownCode { subjectId: string; unitId: string; code: string }

// ------------------------------------------------------------------ normalize
const TH_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
export const thaiDigits = (s: string) => s.replace(/[๐-๙]/g, (d) => String(TH_DIGITS.indexOf(d)));
/** ลบช่องว่าง/ขึ้นบรรทัดที่แทรกระหว่างอักษรไทย (เกิดจากการตัดบรรทัดใน PDF) */
export const joinThai = (s: string) =>
  thaiDigits(s).replace(/[​‌‍﻿]/g, "").replace(/([฀-๿])[ \t\r\n]+(?=[฀-๿])/g, "$1").replace(/\s+/g, " ").trim();
/** รหัสตัวชี้วัดเทียบได้: "ส ๕.๑ ม.๒/๑" → "ส5.1ม.2/1" */
export const normCode = (s: string) => thaiDigits(s).replace(/\s+/g, "").replace(/[–—]/g, "-");
const CODE_RE = /([ก-ฮ])\s*(\d+)\s*\.\s*(\d+)\s*([ปม])\s*\.?\s*(\d)(?:\s*[-–]\s*(\d))?\s*\/\s*(\d+)/g;
/** หารหัสตัวชี้วัดในข้อความ (คำอธิบายรายวิชามักลงท้ายด้วยรายการรหัส) */
export function findCodes(text: string): string[] {
  const out = new Set<string>();
  for (const m of thaiDigits(text).matchAll(CODE_RE)) out.add(`${m[1]}${m[2]}.${m[3]}${m[4]}.${m[5]}${m[6] ? `-${m[6]}` : ""}/${m[7]}`);
  return [...out];
}

/** "M2" → "ม.2" · "P3" → "ป.3" · "ม.2" คงเดิม */
export function schoolGrade(code: string | null | undefined): string | null {
  if (!code) return null;
  const s = thaiDigits(code).trim();
  const m = /^([MP])\s*(\d)$/i.exec(s);
  if (m) return `${m[1]!.toUpperCase() === "M" ? "ม" : "ป"}.${m[2]}`;
  const t = /^([มป])\.?\s*(\d)$/.exec(s);
  return t ? `${t[1]}.${t[2]}` : s;
}
/** ชั้นของรายวิชาอยู่ในชั้น/ช่วงชั้นของตัวชี้วัดหรือไม่ (เช่น ม.5 อยู่ใน ม.4-6) */
export function gradeMatches(subjectGrade: string | null, indicatorGrade: string): boolean | null {
  if (!subjectGrade) return null;
  const a = /^([มป])\.(\d)$/.exec(subjectGrade);
  const b = /^([มป])\.(\d)(?:-(\d))?$/.exec(normCode(indicatorGrade));
  if (!a || !b) return null;
  if (a[1] !== b[1]) return false;
  const n = Number(a[2]), lo = Number(b[2]), hi = Number(b[3] ?? b[2]);
  return n >= lo && n <= hi;
}

// ------------------------------------------------------------------ text evidence
const STOP = new Set([
  "และ", "หรือ", "การ", "ความ", "ของ", "ใน", "ที่", "ซึ่ง", "เพื่อ", "ให้", "ได้", "มี", "เป็น", "กับ", "จาก", "โดย", "ต่อ", "ต่าง", "ตาม", "อย่าง", "เกี่ยว",
  "ด้าน", "เกี่ยวกับ", "รวมทั้ง", "ตลอดจน", "ทั้ง", "แต่", "จะ", "ไป", "มา", "นั้น", "นี้", "สามารถ", "ศึกษา", "อธิบาย", "วิเคราะห์", "ระบุ",
  "บอก", "เข้าใจ", "เห็น", "ใช้", "สรุป", "เปรียบเทียบ", "สืบค้น", "อภิปราย", "นำเสนอ", "แสดง", "ปฏิบัติ", "ตน", "ตนเอง", "เรื่อง", "สิ่ง",
  "แบบ", "ลักษณะ", "ทาง", "ระหว่าง", "ทำ", "เกิด", "ผล", "อื่น", "ไม่", "คือ", "แก่", "แห่ง", "เช่น", "ดังกล่าว", "เหมาะสม", "ประยุกต์",
  "สำคัญ", "คุณค่า", "พร้อม", "ทั้งนี้", "ด้วย", "เพื่อให้", "กระบวนการ", "ความรู้", "ความเข้าใจ",
]);
type Seg = { segment(s: string): Iterable<{ segment: string; isWordLike?: boolean }> };
let segmenter: Seg | null | undefined;
function getSegmenter(): Seg | null {
  if (segmenter !== undefined) return segmenter;
  try {
    const I = Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => Seg };
    segmenter = I.Segmenter ? new I.Segmenter("th", { granularity: "word" }) : null;
  } catch { segmenter = null; }
  return segmenter;
}
/** ตัดคำภาษาไทย (Intl.Segmenter) — ถ้าไม่มี ใช้ช่องว่างเป็นตัวแบ่ง */
export function words(text: string): string[] {
  const s = joinThai(text);
  const seg = getSegmenter();
  const raw = seg ? [...seg.segment(s)].filter((x) => x.isWordLike !== false).map((x) => x.segment) : s.split(/\s+/);
  return raw.map((w) => w.trim()).filter((w) => w.length > 0 && !/^[\d\s.,/()\-–:;"'“”]+$/.test(w));
}
/** คำเนื้อหา (ตัดคำเชื่อม/คำกริยาทั่วไป) */
export const contentTerms = (text: string) => words(text).filter((w) => w.length >= 3 && !STOP.has(w));

export interface TextEvidence { score: number; matched: string[]; phrases: string[]; field: string | null; snippet: string | null }
/**
 * คะแนนหลักฐานเชิงเนื้อหา = 0.7 × สัดส่วนคำเนื้อหาของตัวชี้วัดที่พบในข้อความโรงเรียน + 0.3 × สัดส่วนคู่คำติดกันที่พบ
 * (คู่คำติดกัน = วลี เช่น “ทวีปยุโรป”, “เครื่องมือทางภูมิศาสตร์” — ป้องกันการจับคู่จากคำเดี่ยวทั่วไป)
 */
/** น้ำหนักคำแบบ IDF จากชุดตัวชี้วัดอ้างอิง: คำที่พบในตัวชี้วัดแทบทุกข้อ (เช่น ชื่อทวีปของชั้นนั้น) มีน้ำหนักต่ำ */
export function termWeights(statements: string[]): (t: string) => number {
  const df = new Map<string, number>();
  for (const st of statements) for (const t of new Set(contentTerms(st))) df.set(t, (df.get(t) ?? 0) + 1);
  const n = statements.length;
  if (n < 3) return () => 1; // ชุดเล็กเกินไป คำนวณความถี่ไม่ได้ — น้ำหนักเท่ากัน
  return (t) => Math.max(0.15, Math.log(n / (df.get(t) ?? 1)));
}

export function textEvidence(indicatorText: string, parts: TextPart[], weight: (t: string) => number = () => 1): TextEvidence {
  const terms = [...new Set(contentTerms(indicatorText))];
  if (!terms.length || !parts.length) return { score: 0, matched: [], phrases: [], field: null, snippet: null };
  const seq = words(indicatorText);
  const pairsRaw = seq.slice(1).map((w, i) => [seq[i]!, w] as const).filter(([a, b]) => !STOP.has(a) && !STOP.has(b) && a.length >= 2 && b.length >= 2);
  const bigramW = new Map<string, number>();
  for (const [a, b] of pairsRaw) bigramW.set(a + b, (weight(a) + weight(b)) / 2);
  const bigrams = [...bigramW.keys()];
  const all = joinThai(parts.map((p) => p.text).join(" ")).replace(/\s+/g, "");
  const matched = terms.filter((t) => all.includes(t));
  const phrases = bigrams.filter((b) => b.length >= 4 && all.includes(b));
  const wsum = (xs: string[]) => xs.reduce((a, t) => a + weight(t), 0);
  const bsum = (xs: string[]) => xs.reduce((a, t) => a + (bigramW.get(t) ?? 0), 0);
  const score = 0.7 * (wsum(matched) / wsum(terms)) + 0.3 * (bigrams.length ? bsum(phrases) / bsum(bigrams) : 0);
  // หลักฐาน: ส่วนข้อความ (ช่อง) และประโยคที่มีคำตรงมากที่สุด
  let best: { field: string; snippet: string; hit: number } | null = null;
  for (const p of parts) {
    const clauses = joinThai(p.text).split(/(?<=[\s])/).reduce<string[]>((acc, c) => {
      const last = acc.at(-1);
      if (last !== undefined && last.length < 90) acc[acc.length - 1] = last + c; else acc.push(c);
      return acc;
    }, []);
    clauses.forEach((c, i) => {
      const win = [clauses[i - 1] ?? "", c, clauses[i + 1] ?? ""].join("");
      const compact = win.replace(/\s+/g, "");
      const hit = matched.filter((t) => compact.includes(t)).length + 2 * phrases.filter((b) => compact.includes(b)).length;
      if (hit > 0 && (!best || hit > best.hit)) best = { field: p.label, snippet: win.trim().slice(0, 260), hit };
    });
  }
  const b = best as { field: string; snippet: string } | null;
  return { score: Math.round(score * 1000) / 1000, matched, phrases, field: b?.field ?? null, snippet: b?.snippet ?? null };
}

export const THRESHOLD = { strong: 0.5, weak: 0.25, suggest: 0.4, suggestMinTerms: 3 } as const;

// ------------------------------------------------------------------ compare
export interface CompareInput { subjects: SchoolSubject[]; indicators: RefIndicator[]; decisions: Decision[] }
export interface CompareOutput {
  pairs: Pair[];
  indicatorRows: IndicatorRow[];
  unknownCodes: UnknownCode[];
  schoolHasText: boolean;
  counts: Record<MatchResult, number>;
}

/** แยกผลความครอบคลุมออกจากการยืนยัน: ระบบเสนอ “ครอบคลุม” ได้ แต่แสดงผลสุดท้ายเป็นครอบคลุมเมื่อยืนยันแล้วเท่านั้น */
export function finalResult(proposed: MatchResult, verification: "verified" | "rejected" | "unverified"): MatchResult {
  if (verification === "verified") return "covered";
  if (verification === "rejected") return "not_found";
  return proposed === "covered" ? "needs_review" : proposed;
}

const fieldsOf = (u: SchoolUnit) => u.parts.filter((p) => p.text.trim().length > 0);

export function compareMapping({ subjects, indicators, decisions }: CompareInput): CompareOutput {
  const byKey = new Map(indicators.map((i) => [i.key, i]));
  const dec = new Map(decisions.map((d) => [`${d.subjectId}|${d.indicatorKey}`, d]));
  const pairs: Pair[] = [];
  const unknownCodes: UnknownCode[] = [];
  let schoolHasText = false;

  for (const s of subjects) {
    const pool = indicators.filter((i) => !s.areaCode || i.areaCode === s.areaCode);
    const weight = termWeights(pool.filter((i) => gradeMatches(s.grade, i.grade) !== false).map((i) => i.statement));
    for (const u of s.units) {
      const parts = fieldsOf(u);
      if (parts.length) schoolHasText = true;
      for (const c of u.declared) if (!byKey.has(c)) unknownCodes.push({ subjectId: s.id, unitId: u.id, code: c });
      for (const ind of pool) {
        const declared = u.declared.includes(ind.key);
        const g = gradeMatches(s.grade, ind.grade);
        const ev = parts.length ? textEvidence(ind.statement, parts, weight) : null;
        const reasons: string[] = [];
        let result: MatchResult | null = null;
        let origin: Pair["origin"] = "declared";
        if (declared) {
          reasons.push(`1) โรงเรียนระบุรหัส ${ind.code} ไว้ใน${u.kind === "unit" ? `หน่วย “${u.title}”` : "คำอธิบายรายวิชา/ผลการเรียนรู้"}`);
          if (g === false) { result = "needs_review"; reasons.push(`3) ระดับชั้นไม่ตรง: ตัวชี้วัดเป็น ${ind.grade} แต่รายวิชาอยู่ ${s.grade ?? "ไม่ระบุ"}`); }
          else if (!ev) { result = "insufficient"; reasons.push("2) ไม่มีข้อความเนื้อหาฝั่งโรงเรียนให้ตรวจเทียบ"); }
          else if (ev.score >= THRESHOLD.strong) { result = "covered"; reasons.push(`2,4) ข้อความสอดคล้อง ${Math.round(ev.score * 100)}% (คำ/วลีที่ตรง: ${[...ev.phrases, ...ev.matched].slice(0, 6).join(", ")})`); }
          else if (ev.score >= THRESHOLD.weak) { result = "partial"; reasons.push(`2,4) เนื้อหาสอดคล้องบางส่วน ${Math.round(ev.score * 100)}% — บางองค์ประกอบของตัวชี้วัดยังไม่พบในข้อความ`); }
          else { result = "needs_review"; reasons.push("2,4) รหัสตรงแต่ข้อความไม่สอดคล้อง — อาจอ้างคนละฉบับหลักสูตรหรือพิมพ์รหัสผิด ต้องตรวจกับต้นฉบับ"); }
        } else if (ev && g !== false && ev.score >= THRESHOLD.suggest && ev.matched.length >= THRESHOLD.suggestMinTerms && ev.phrases.length >= 1) {
          result = "needs_review";
          origin = "suggested";
          reasons.push(`ระบบเสนอจากเนื้อหา (ยังไม่มีการระบุรหัส): ข้อความสอดคล้อง ${Math.round(ev.score * 100)}% — ต้องให้ฝ่ายวิชาการยืนยัน`);
          reasons.push(`คำ/วลีที่ตรง: ${[...ev.phrases, ...ev.matched].slice(0, 8).join(", ")}`);
        }
        const d = dec.get(`${s.id}|${ind.key}`) ?? null;
        if (!result && !(d && d.status === "verified")) continue;
        const proposed: MatchResult = result ?? "covered";
        if (d && d.status === "verified") reasons.unshift(`ฝ่ายวิชาการยืนยันแล้ว${d.note ? `: ${d.note}` : ""}`);
        if (g === true) reasons.push(`3) ระดับชั้นตรงกัน (${s.grade} ↔ ${ind.grade})`);
        if (u.kind === "description" && !s.hasUnits) reasons.push("หมายเหตุ: รายวิชานี้ยังไม่มีหน่วยการเรียนรู้ — ตรวจจากคำอธิบายรายวิชาเท่านั้น");
        if (d && d.status === "rejected") reasons.unshift(`ฝ่ายวิชาการปฏิเสธข้อเสนอนี้${d.note ? `: ${d.note}` : ""}`);
        const verification = d?.status === "verified" ? "verified" : d?.status === "rejected" ? "rejected" : "unverified";
        const final = finalResult(proposed, verification);
        if (proposed === "covered" && verification === "unverified") reasons.push("ผลเบื้องต้น: หลักฐานเพียงพอ แต่ยังไม่ได้รับการยืนยัน — แสดงเป็น “ต้องตรวจเพิ่มเติม” จนกว่าฝ่ายวิชาการยืนยัน");
        pairs.push({ subjectId: s.id, unitId: u.id, indicatorKey: ind.key, result: final, proposed, verification,
          level: origin === "declared" ? 1 : ev && ev.score >= THRESHOLD.strong ? 2 : 3,
          origin: verification === "verified" && origin !== "declared" ? "confirmed" : origin, score: ev?.score ?? 0,
          matched: ev ? [...ev.phrases, ...ev.matched.filter((t) => !ev.phrases.some((ph) => ph.includes(t)))] : [], reasons, schoolField: ev?.field ?? null, schoolSnippet: ev?.snippet ?? null, decision: d });
      }
    }
  }
  // การยืนยันที่ไม่มีคู่จากการคำนวณ (เช่น ยืนยันด้วยมือ) ก็ต้องแสดง
  for (const d of decisions) {
    if (d.status !== "verified" || pairs.some((p) => p.subjectId === d.subjectId && p.indicatorKey === d.indicatorKey)) continue;
    const s = subjects.find((x) => x.id === d.subjectId);
    if (!s || !byKey.has(d.indicatorKey)) continue;
    pairs.push({ subjectId: s.id, unitId: s.units[0]?.id ?? `desc:${s.id}`, indicatorKey: d.indicatorKey, result: "covered", proposed: "covered", level: 0,
      verification: "verified", origin: "confirmed", score: 0, matched: [],
      reasons: [`ฝ่ายวิชาการยืนยันแล้ว${d.note ? `: ${d.note}` : ""}`], schoolField: null, schoolSnippet: null, decision: d });
  }

  const indicatorRows: IndicatorRow[] = indicators.map((ind) => {
    const ps = pairs.filter((p) => p.indicatorKey === ind.key).sort((a, b) => RANK[b.result] - RANK[a.result] || b.score - a.score);
    const best = ps[0] ?? null;
    const relevant = subjects.some((s) => (!s.areaCode || s.areaCode === ind.areaCode) && gradeMatches(s.grade, ind.grade) !== false);
    const result: MatchResult = best ? best.result : !relevant || !schoolHasText ? "insufficient" : "not_found";
    const note = best ? "" : !relevant ? "ไม่มีรายวิชาในขอบเขตที่เลือกที่อยู่ระดับชั้น/กลุ่มสาระนี้" : !schoolHasText ? "รายวิชาในขอบเขตยังไม่มีคำอธิบายหรือหน่วยการเรียนรู้" : "ไม่พบหน่วย/คำอธิบายที่ระบุรหัสหรือมีเนื้อหาสอดคล้อง";
    return { indicator: ind, result, best, pairs: ps, note };
  });
  const counts = { covered: 0, partial: 0, not_found: 0, needs_review: 0, insufficient: 0 } as Record<MatchResult, number>;
  for (const r of indicatorRows) counts[r.result]++;
  return { pairs, indicatorRows, unknownCodes, schoolHasText, counts };
}
