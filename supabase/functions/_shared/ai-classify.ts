/**
 * AI ช่วยจำแนกประเภทเอกสาร — ใช้เฉพาะเมื่อ rule-based ไม่มั่นใจ และเปิดใช้ครบ 3 เงื่อนไข:
 *   1) Edge Function Secret ANTHROPIC_API_KEY (ฝั่งเซิร์ฟเวอร์เท่านั้น)
 *   2) Secret AI_DOCUMENT_ANALYSIS=enabled (ผู้ดูแลระบบเปิดใช้)
 *   3) ผู้ดูแลหลักสูตรติ๊ก “อนุญาตส่งข้อความบางส่วนให้ AI” ในคำขอนั้น
 * ส่งเฉพาะ “ข้อความ” บางหน้า (ไม่ส่งไฟล์) · AI เสนอประเภทได้เท่านั้น ไม่สร้าง/อนุมัติข้อมูลหลักสูตร
 */
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import type { DocClass } from "./curriculum-analyze.ts";

export const AI_MODEL = "claude-opus-5-5";
const CLASSES: DocClass[] = ["core_curriculum", "school_curriculum", "learning_area_curriculum", "standards_indicators", "announcement_time", "unknown"];

export function aiConfig(env: (k: string) => string | undefined = (k) => Deno.env.get(k)) {
  if (!env("ANTHROPIC_API_KEY")) return { enabled: false, reason: "ยังไม่ได้ตั้งค่า AI API key ฝั่งเซิร์ฟเวอร์" } as const;
  if (env("AI_DOCUMENT_ANALYSIS") !== "enabled") return { enabled: false, reason: "ผู้ดูแลระบบยังไม่เปิดใช้ AI วิเคราะห์เอกสาร (AI_DOCUMENT_ANALYSIS)" } as const;
  return { enabled: true, reason: null } as const;
}

/** ตัดข้อความบางหน้า (หน้าแรก ๆ + หน้าที่มีหลักฐาน) ไม่เกิน ~24,000 ตัวอักษร */
export function excerptsForAi(parts: { locator: string; text: string }[], max = 24000) {
  const out: { locator: string; text: string }[] = [];
  let used = 0;
  for (const p of parts) {
    const t = p.text.trim().slice(0, 3000);
    if (!t) continue;
    if (used + t.length > max) break;
    out.push({ locator: p.locator, text: t });
    used += t.length;
  }
  return out;
}

export interface AiClassification {
  doc_class: DocClass;
  confidence: number;
  reason_th: string;
  evidence_locators: string[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["doc_class", "confidence", "reason_th", "evidence_locators"],
  properties: {
    doc_class: { type: "string", enum: CLASSES },
    confidence: { type: "number" },
    reason_th: { type: "string" },
    evidence_locators: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `คุณช่วยฝ่ายวิชาการโรงเรียนจำแนกประเภทเอกสารหลักสูตรไทยจากข้อความบางหน้า
ประเภท: core_curriculum = หลักสูตรแกนกลางการศึกษาขั้นพื้นฐานของกระทรวง; school_curriculum = หลักสูตรสถานศึกษาของโรงเรียน;
learning_area_curriculum = หลักสูตรกลุ่มสาระการเรียนรู้; standards_indicators = เอกสารมาตรฐานการเรียนรู้และตัวชี้วัด;
announcement_time = ประกาศ/คำสั่งและการบริหารเวลาเรียน; unknown = ข้อมูลไม่พอที่จะตัดสิน
ตอบจากข้อความที่ให้เท่านั้น ห้ามเดา ถ้าหลักฐานไม่ชัดให้ตอบ unknown และ confidence ต่ำ
evidence_locators ต้องเป็นพิกัดที่ให้มาเท่านั้น (เช่น pdf:3) เหตุผลเขียนภาษาไทยสั้น ๆ`;

/** เรียก Claude API — คืน null ถ้าปฏิเสธ/ผิดรูปแบบ (ผู้เรียกบันทึกเป็น ai_status=failed) */
export async function aiClassify(parts: { locator: string; text: string }[], client = new Anthropic()): Promise<AiClassification | null> {
  const ex = excerptsForAi(parts);
  if (!ex.length) return null;
  const allowed = new Set(ex.map((e) => e.locator));
  const content = ex.map((e) => `[${e.locator}]\n${e.text}`).join("\n\n");
  const res = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `ข้อความจากเอกสาร (บางหน้า):\n\n${content}` }],
  } as Parameters<typeof client.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage;
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
  return parseAiClassification(text, allowed);
}

/** ตรวจผล AI ซ้ำฝั่งเรา: ประเภทต้องอยู่ในรายการ · พิกัดต้องเป็นพิกัดที่ส่งไป */
export function parseAiClassification(text: string | undefined, allowed: Set<string>): AiClassification | null {
  if (!text) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!CLASSES.includes(o.doc_class as DocClass)) return null;
  const confidence = Math.max(0, Math.min(1, Number(o.confidence) || 0));
  const locs = Array.isArray(o.evidence_locators) ? (o.evidence_locators as unknown[]).map(String).filter((l) => allowed.has(l)) : [];
  // ไม่มีพิกัดหลักฐาน = ไม่นับว่าจำแนกได้
  if (o.doc_class !== "unknown" && !locs.length) return { doc_class: "unknown", confidence: 0, reason_th: "AI ไม่ระบุหลักฐานที่ตรวจสอบได้", evidence_locators: [] };
  return { doc_class: o.doc_class as DocClass, confidence, reason_th: String(o.reason_th ?? "").slice(0, 500), evidence_locators: locs };
}
