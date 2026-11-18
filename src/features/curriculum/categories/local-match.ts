/**
 * วิเคราะห์สาระท้องถิ่น ↔ รายวิชา (ไม่ใช้ AI · ไม่มี dependency นอกโมดูลเดียวกัน · ทดสอบ scripts/local-match.test.ts)
 *  1) อ่านตารางสาระท้องถิ่น (CSV) เก็บรหัสและข้อความตามต้นฉบับครบ — ไม่แก้/ไม่เดารหัส
 *  2) ตรวจรหัสกับฐานตัวชี้วัดฉบับที่ระบบมี: พบ / ไม่พบในฉบับปรับปรุง (อาจเป็นรหัสเดิม) / ตรวจไม่ได้ / รูปแบบไม่ชัดเจน
 *  3) จับคู่กับรายวิชา: กลุ่มสาระ (อักษรรหัสวิชา) + ระดับชั้น + เนื้อหา (สาระแกนกลาง/ท้องถิ่น ↔ ชื่อ คำอธิบาย ผลการเรียนรู้)
 *     คำว่า “ท้องถิ่น/กำแพงเพชร” อย่างเดียวไม่ใช่หลักฐาน
 */
import { normCode, schoolGrade, termWeights, textEvidence, thaiDigits, type TextPart } from "../../mapping/match";

export interface LocalItem {
  key: string; // ตาราง-แถว
  table: string;
  row: string;
  codeRaw: string; // ตามต้นฉบับทุกตัวอักษร
  coreText: string;
  localText: string;
  status: string;
  source: string;
  parsed: { area: string; standard: string; grade: string; norm: string } | null;
}
export type CodeCheck = "found" | "not_in_revised" | "no_reference" | "unclear";
export const CODE_CHECK_LABEL: Record<CodeCheck, string> = {
  found: "พบในฐานตัวชี้วัดฉบับที่ใช้ตรวจ",
  not_in_revised: "ไม่พบในฉบับปรับปรุง — อาจเป็นรหัสฉบับเดิม",
  no_reference: "ตรวจไม่ได้ — ระบบยังไม่มีฐานตัวชี้วัดของกลุ่มสาระนี้",
  unclear: "รูปแบบรหัสไม่ชัดเจน — ตรวจกับต้นฉบับ",
};

// ------------------------------------------------------------------ CSV
/** แยก CSV (รองรับเครื่องหมายคำพูด ขึ้นบรรทัดในช่อง และ BOM) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const CODE = /^(?:มฐ\.?\s*)?([ก-ฮ])\s*\.?\s*(\d+)\s*\.\s*(\d+)\s*([มป])\s*\.?\s*(\d)(?:\s*[-–]\s*(\d))?\s*\/\s*(\d+)$/;
export function parseCode(raw: string): LocalItem["parsed"] {
  const m = CODE.exec(thaiDigits(raw).replace(/\s+/g, " ").trim());
  if (!m) return null;
  const grade = `${m[4]}.${m[5]}${m[6] ? `-${m[6]}` : ""}`;
  return { area: m[1]!, standard: `${m[1]} ${m[2]}.${m[3]}`, grade, norm: normCode(`${m[1]}${m[2]}.${m[3]}${grade}/${m[7]}`) };
}

const COLS = { table: "ตารางที่", row: "แถวที่", code: "รหัสตัวชี้วัดตามต้นฉบับ", core: "สาระการเรียนรู้แกนกลางตามต้นฉบับ", local: "สาระการเรียนรู้ท้องถิ่นตามต้นฉบับ", status: "สถานะ", source: "แหล่งอ้างอิง" };
export function readLocalCsv(text: string): { items: LocalItem[]; errors: string[] } {
  const rows = parseCsv(text);
  const head = rows[0]?.map((h) => h.trim()) ?? [];
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, h]) => [k, head.indexOf(h)])) as Record<keyof typeof COLS, number>;
  const missing = Object.entries(COLS).filter(([k]) => idx[k as keyof typeof COLS] < 0).map(([, h]) => h);
  if (missing.length) return { items: [], errors: [`ไม่พบคอลัมน์: ${missing.join(", ")}`] };
  const items = rows.slice(1).map((r): LocalItem => {
    const g = (k: keyof typeof COLS) => (r[idx[k]] ?? "").trim();
    return { key: `${g("table")}-${g("row")}`, table: g("table"), row: g("row"), codeRaw: r[idx.code] ?? "", coreText: g("core"), localText: g("local"), status: g("status"), source: g("source"), parsed: parseCode(r[idx.code] ?? "") };
  });
  return { items, errors: [] };
}

// ------------------------------------------------------------------ ตรวจรหัส
/** ref: รหัสตัวชี้วัดในฐาน (normCode) + กลุ่มสาระ/มาตรฐานที่ฐานนั้นครอบคลุม */
export function checkCode(it: LocalItem, ref: { codes: Set<string>; standards: Set<string> }): CodeCheck {
  if (!it.parsed) return "unclear";
  if (ref.codes.has(it.parsed.norm)) return "found";
  // ฐานครอบคลุมมาตรฐานนี้ แต่ไม่พบรหัส → ไม่พบในฉบับปรับปรุง (ไม่สรุปว่าผิด)
  if (ref.standards.has(normCode(it.parsed.standard))) return "not_in_revised";
  return "no_reference";
}

// ------------------------------------------------------------------ จับคู่รายวิชา
export interface SubjectIn { id: string; code: string; name: string; grade: string | null; description: string | null; outcomes: string[]; locator: string | null; sourceDocId: string | null }
export type Confidence = "high" | "medium";
export interface LocalLink { itemKey: string; subjectId: string; score: number; confidence: Confidence; matched: string[]; localMatched: string[]; snippet: string | null; field: string | null; localMention: boolean }
export interface LocalAnalysis { links: LocalLink[]; unmatched: string[]; ambiguous: string[]; noSubject: string[] }

/** อักษรกลุ่มสาระในรหัสตัวชี้วัด → อักษรนำหน้ารหัสวิชาที่เป็นไปได้ (ภาษาต่างประเทศใช้อักษรตามภาษา) */
const AREA_PREFIX: Record<string, string[]> = { ต: ["อ", "จ", "ญ", "ฝ", "ย", "ร", "ก", "ข", "ซ", "บ"] };
const prefixes = (a: string) => AREA_PREFIX[a] ?? [a];
const inGrade = (subjectGrade: string | null, codeGrade: string) => {
  const g = schoolGrade(subjectGrade);
  const a = /^([มป])\.(\d)$/.exec(g ?? ""), b = /^([มป])\.(\d)(?:-(\d))?$/.exec(codeGrade);
  return !!a && !!b && a[1] === b[1] && Number(a[2]) >= Number(b[2]) && Number(a[2]) <= Number(b[3] ?? b[2]);
};
const LOCAL_WORD = /ท้องถิ่น|กำแพงเพชร|ภูมิปัญญา|ชุมชน|สักงาม/;
export const LOCAL_THRESHOLD = { high: 0.45, medium: 0.25, gap: 0.05 } as const;

export function analyzeLocal(items: LocalItem[], subjects: SubjectIn[]): LocalAnalysis {
  const links: LocalLink[] = [];
  const unmatched: string[] = [], ambiguous: string[] = [], noSubject: string[] = [];
  const weight = termWeights(items.map((i) => i.coreText));
  for (const it of items) {
    if (!it.parsed) { unmatched.push(it.key); continue; }
    const pool = subjects.filter((s) => prefixes(it.parsed!.area).includes(s.code.trim()[0] ?? "") && inGrade(s.grade, it.parsed!.grade));
    if (!pool.length) { noSubject.push(it.key); continue; }
    const scored = pool.map((s) => {
      const parts: TextPart[] = [{ field: "name", label: "ชื่อวิชา", text: s.name }];
      if (s.description) parts.push({ field: "description", label: "คำอธิบายรายวิชา", text: s.description });
      s.outcomes.forEach((o, n) => parts.push({ field: `outcome${n}`, label: "ผลการเรียนรู้", text: o }));
      // คะแนน = สาระแกนกลางที่ตัวชี้วัดนี้กำกับเท่านั้น · สาระท้องถิ่นแสดงเป็นหลักฐานเสริม (ไม่ให้คำท้องถิ่นดันคะแนน)
      const ev = textEvidence(it.coreText, parts, weight);
      const lv = textEvidence(it.localText.replace(/จังหวัดกำแพงเพชร|ในท้องถิ่น|ท้องถิ่น/g, " "), parts);
      return { s, ev, lv, local: LOCAL_WORD.test(`${s.name} ${s.description ?? ""} ${s.outcomes.join(" ")}`) };
    }).filter((x) => x.ev.score >= LOCAL_THRESHOLD.medium && x.ev.matched.length >= 1).sort((a, b) => b.ev.score - a.ev.score);
    if (!scored.length) { unmatched.push(it.key); continue; }
    const top = scored[0]!;
    const close = scored.filter((x) => top.ev.score - x.ev.score <= LOCAL_THRESHOLD.gap);
    if (close.length > 2) ambiguous.push(it.key);
    for (const x of scored.slice(0, 3)) {
      const confidence: Confidence = x === top && x.ev.score >= LOCAL_THRESHOLD.high && x.ev.phrases.length > 0 && close.length <= 2 ? "high" : "medium";
      links.push({ itemKey: it.key, subjectId: x.s.id, score: x.ev.score, confidence, matched: [...x.ev.phrases, ...x.ev.matched.filter((t) => !x.ev.phrases.some((p) => p.includes(t)))],
        localMatched: x.lv.matched, snippet: x.ev.snippet, field: x.ev.field, localMention: x.local });
    }
  }
  return { links, unmatched, ambiguous, noSubject };
}
