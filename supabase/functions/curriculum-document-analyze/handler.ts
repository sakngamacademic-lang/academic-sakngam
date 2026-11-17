/**
 * วิเคราะห์เอกสารหลักสูตรอัตโนมัติ (อ่าน/จำแนก/สกัด) — ไม่อนุมัติข้อมูลใด ๆ
 *
 * ทำงานเป็นรอบ (chunk) เพื่อไม่เกิน CPU limit ของ Supabase Edge Functions:
 *  - รอบ extract: เปิด PDF แล้วอ่าน “ทีละหน้า” ต่อจากหน้าที่บันทึกไว้ จนครบจำนวนหน้า/งบเวลา → บันทึกข้อความรายหน้า + ความคืบหน้า
 *  - รอบ analyze: อ่านข้อความทุกหน้าจากฐานข้อมูล → rule-based (+AI ถ้าเปิดใช้และได้รับอนุญาต) → บันทึกผล
 *  - แต่ละรอบส่งต่อรอบถัดไป 1 ครั้ง (service_role) · ฐานข้อมูลตรวจลำดับรอบ (p_expected_chunk) และเพดานรอบ → ไม่วนไม่สิ้นสุด ไม่ทำซ้อน
 *  - ล้มเหลว → failed พร้อมเหตุผล · ค้าง (ไม่มี heartbeat 10 นาที) → failed เมื่อเปิดหน้าเว็บ · ผู้ดูแลกด “ทำต่อ” งานเดิมได้ (ไม่สร้างงานใหม่)
 *
 * คำขอ:
 *  { probe: true }                                 → สถานะ AI
 *  { sourceDocumentId, allowAi }   (ผู้ดูแลหลักสูตร) → สร้างงานใหม่
 *  { analysisId, resume: true }    (ผู้ดูแลหลักสูตร) → ทำต่องานเดิมที่ล้มเหลว/ค้าง
 *  { analysisId, chunk }           (service_role)    → รอบถัดไป (เรียกโดยฟังก์ชันนี้เอง)
 */
import { handle, HttpError, isUuid, readJson } from "../_shared/http.ts";
import { requireServiceCall, requireUser, serviceRpc, userRpc } from "../_shared/supabase.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";
import { openPdf, pdfPageRange, xlsxCells } from "../_shared/curriculum-parse.ts";
import { analyzePdfPages, analyzeXlsxCells, type AnalysisResult } from "../_shared/curriculum-analyze.ts";
import { aiClassify, aiConfig, AI_MODEL } from "../_shared/ai-classify.ts";

const AI_THRESHOLD = 0.6;
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_XLSX_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 3000;
export const MAX_CHUNKS = 400;
/** รุ่นของฟังก์ชัน — หน้าเว็บใช้ตรวจว่า Staging deploy รุ่นแบ่งรอบแล้วหรือยัง (รุ่นแรกอ่านทั้งไฟล์ครั้งเดียว ไม่มีค่านี้) */
export const WORKER_VERSION = "chunked-thai-layout-2026-11-17";
const envNum = (k: string, d: number) => {
  const v = Number(Deno.env.get(k));
  return Number.isFinite(v) && v > 0 ? v : d;
};

export interface Claim {
  analysis_id: string;
  object_key: string;
  file_ext: string;
  page_count: number | null;
  pages_done: number;
  chunk_no: number;
  phase: "extract" | "analyze";
  allow_ai: boolean;
}

type PdfDoc = Parameters<typeof pdfPageRange>[0];

export interface Deps {
  claim(id: string, expectedChunk: number): Promise<Claim | null>;
  savePages(id: string, firstPage: number, texts: string[], pageCount: number): Promise<number>;
  pageTexts(id: string): Promise<string[]>;
  store(id: string, result: Record<string, unknown>): Promise<unknown>;
  fail(id: string, message: string): Promise<unknown>;
  getBytes(key: string): Promise<Uint8Array>;
  openPdf(bytes: Uint8Array): Promise<{ numPages: number; pdf: PdfDoc }>;
  xlsxCells: typeof xlsxCells;
  ai: typeof aiClassify;
  aiCfg: typeof aiConfig;
  /** ส่งต่อรอบถัดไป (คำขอใหม่ = งบ CPU ใหม่) */
  scheduleNext(id: string, chunk: number): Promise<void>;
  chunk: { maxPages: number; budgetMs: number; now?: () => number; cpuBudgetMs?: number; cpuNow?: () => number | null };
}

function liveDeps(): Deps {
  return {
    claim: async (id, expectedChunk) =>
      (await serviceRpc<Claim[]>("document_analysis_claim", { p_analysis_id: id, p_expected_chunk: expectedChunk, p_max_chunks: MAX_CHUNKS }))[0] ?? null,
    savePages: (id, firstPage, texts, pageCount) =>
      serviceRpc<number>("document_analysis_save_pages", { p_analysis_id: id, p_first_page: firstPage, p_texts: texts, p_page_count: pageCount }),
    pageTexts: (id) => serviceRpc<string[]>("document_analysis_page_texts", { p_analysis_id: id }),
    store: (id, result) => serviceRpc("document_analysis_store", { p_analysis_id: id, p_result: result }),
    fail: (id, message) => serviceRpc("document_analysis_set_status", { p_analysis_id: id, p_status: "failed", p_error: message }),
    getBytes: (k) => createStorageProvider().getBytes(k),
    openPdf: (b) => openPdf(b) as Promise<{ numPages: number; pdf: PdfDoc }>,
    xlsxCells,
    ai: aiClassify,
    aiCfg: aiConfig,
    scheduleNext: async (id, chunk) => {
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/curriculum-document-analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: id, chunk }),
      });
      await res.body?.cancel();
      if (!res.ok) throw new Error(`ส่งต่อรอบถัดไปไม่สำเร็จ (HTTP ${res.status}) — กด “ทำต่อ” เพื่อประมวลผลต่อจากหน้าที่ค้าง`);
    },
    // วัดจริง (PDF ไทยฝังฟอนต์ 300 หน้า 1.98 MB): import ~310 ms + เปิด PDF ~100 ms + ~12 ms/หน้า CPU → รอบละ ≤ 20 หน้า / ≤ 600 ms CPU เผื่อเครื่องช้ากว่า 2 เท่า
    chunk: { maxPages: envNum("ANALYZE_CHUNK_MAX_PAGES", 20), budgetMs: envNum("ANALYZE_CHUNK_BUDGET_MS", 700), cpuBudgetMs: envNum("ANALYZE_CHUNK_CPU_MS", 600) },
  };
}

async function classifyWithAi(t: Claim, result: AnalysisResult, parts: { locator: string; text: string }[], deps: Deps) {
  let ai_status = "not_needed";
  let ai_note: string | null = null;
  if (result.doc_class === "unknown" || result.class_confidence < AI_THRESHOLD) {
    const cfg = deps.aiCfg();
    if (!t.allow_ai) {
      ai_status = "not_requested";
      ai_note = "จำแนกไม่มั่นใจ — ผู้ดูแลไม่ได้อนุญาตให้ใช้ AI ในคำขอนี้";
    } else if (!cfg.enabled) {
      ai_status = "not_configured";
      ai_note = cfg.reason;
    } else {
      try {
        const r = await deps.ai(parts);
        if (r) {
          ai_status = "used";
          ai_note = `AI (${AI_MODEL}) เสนอ: ${r.doc_class} (${r.confidence}) — ${r.reason_th}`;
          if (r.doc_class !== "unknown" && r.confidence >= AI_THRESHOLD) {
            result.doc_class = r.doc_class;
            result.class_confidence = r.confidence;
            result.class_evidence.push(...r.evidence_locators.map((l) => ({ class: r.doc_class, phrase: `AI: ${r.reason_th}`.slice(0, 120), locator: l })));
          }
        } else {
          ai_status = "failed";
          ai_note = "AI ไม่ให้ผลที่ตรวจสอบได้ — ใช้ผล rule-based";
        }
      } catch (e) {
        ai_status = "failed";
        ai_note = `เรียก AI ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"}`;
      }
    }
  }
  return { ai_status, ai_note };
}

/** ประมวลผล 1 รอบ — คืนผลเพื่อทดสอบ: skipped (รอบซ้ำ/งานจบแล้ว) · continued · done · failed */
export async function processChunk(analysisId: string, expectedChunk: number, deps: Deps = liveDeps()): Promise<"skipped" | "continued" | "done" | "failed"> {
  let t: Claim | null;
  try {
    t = await deps.claim(analysisId, expectedChunk);
  } catch (e) {
    // จองรอบไม่ได้ (เช่น ฐานข้อมูลยังไม่มี document_analysis_claim) → แจ้ง failed พร้อมเหตุผล แทนการค้าง running เงียบ ๆ
    const raw = e instanceof Error ? e.message : String(e);
    const msg = /document_analysis_claim|PGRST202|404|42883/.test(raw)
      ? "ฐานข้อมูลยังไม่ได้ติดตั้ง migration 20261201000200 (document_analysis_claim) — ติดตั้งแล้วกด “ทำต่อ”"
      : `จองรอบประมวลผลไม่สำเร็จ: ${raw.slice(0, 200)}`;
    await deps.fail(analysisId, msg).catch(() => {});
    return "failed";
  }
  if (!t) return "skipped";
  try {
    if (t.file_ext === "xlsx") {
      const bytes = await deps.getBytes(t.object_key);
      if (bytes.byteLength > MAX_XLSX_BYTES) throw new Error("ไฟล์ Excel ใหญ่เกิน 15 MB — แบ่งไฟล์ตามชีตแล้ววิเคราะห์ทีละไฟล์");
      const cells = await deps.xlsxCells(bytes);
      const result = analyzeXlsxCells(cells);
      const sheets = [...new Set(cells.map((c) => c.sheet))];
      const parts = sheets.map((s) => ({ locator: `sheet:${s}!A1`, text: cells.filter((c) => c.sheet === s).map((c) => c.text).join("\n") }));
      const ai = await classifyWithAi(t, result, parts, deps);
      await deps.store(t.analysis_id, { ...result, engine: ai.ai_status === "used" ? `rule-based@2 + exceljs@4.4.0 + ${AI_MODEL}` : "rule-based@2 + exceljs@4.4.0", ...ai });
      return "done";
    }
    if (t.file_ext !== "pdf") throw new Error("รองรับเฉพาะ PDF และ Excel (.xlsx)");

    if (t.phase === "extract") {
      const bytes = await deps.getBytes(t.object_key);
      if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("ไฟล์ใหญ่เกิน 100 MB");
      const { numPages, pdf } = await deps.openPdf(bytes);
      if (numPages > MAX_PAGES) throw new Error(`PDF มี ${numPages} หน้า เกิน ${MAX_PAGES} หน้า — กรุณาแบ่งไฟล์`);
      const from = t.pages_done + 1;
      if (from <= numPages) {
        const texts = await pdfPageRange(pdf, from, deps.chunk);
        await deps.savePages(t.analysis_id, from, texts, numPages);
      } else {
        await deps.savePages(t.analysis_id, from, [], numPages); // ครบแล้ว → เข้ารอบ analyze
      }
      await deps.scheduleNext(t.analysis_id, t.chunk_no);
      return "continued";
    }

    // analyze: ใช้ข้อความครบทุกหน้า (ไม่ตัด ไม่ข้าม)
    const pages = await deps.pageTexts(t.analysis_id);
    if (!t.page_count || pages.length !== t.page_count) {
      throw new Error(`ข้อความรายหน้าไม่ครบ (มี ${pages.length}/${t.page_count ?? "?"} หน้า) — กด “ทำต่อ”`);
    }
    const result = analyzePdfPages(pages);
    const parts = pages.map((p, i) => ({ locator: `pdf:${i + 1}`, text: p }));
    const ai = await classifyWithAi(t, result, parts, deps);
    await deps.store(t.analysis_id, { ...result, engine: ai.ai_status === "used" ? `rule-based@2 + unpdf@0.12.1 + ${AI_MODEL}` : "rule-based@2 + unpdf@0.12.1", ...ai });
    return "done";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "วิเคราะห์ไม่สำเร็จ";
    await deps.fail(t.analysis_id, `${msg} (อ่านแล้ว ${t.pages_done}${t.page_count ? `/${t.page_count}` : ""} หน้า)`).catch(() => {});
    return "failed";
  }
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const background = async (job: Promise<unknown>) => {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(job);
  else await job; // local / test
};

export const handler = handle(async (req) => {
  const body = await readJson<{ sourceDocumentId?: string; allowAi?: boolean; probe?: boolean; analysisId?: string; resume?: boolean; chunk?: number }>(req);

  // รอบถัดไป — service_role เท่านั้น
  if (typeof body.chunk === "number") {
    requireServiceCall(req);
    if (!isUuid(body.analysisId) || !Number.isInteger(body.chunk) || body.chunk < 0) throw new HttpError(400, "คำขอไม่ถูกต้อง");
    await background(processChunk(body.analysisId, body.chunk));
    return { analysisId: body.analysisId, status: "accepted" };
  }

  const caller = await requireUser(req);
  if (body.probe) {
    const cfg = aiConfig();
    return { version: WORKER_VERSION, ai: { enabled: cfg.enabled, reason: cfg.reason, model: cfg.enabled ? AI_MODEL : null } };
  }
  if (body.resume) {
    if (!isUuid(body.analysisId)) throw new HttpError(400, "รหัสงานไม่ถูกต้อง");
    const [r] = await userRpc<{ analysis_id: string; chunk_count: number }[]>(caller, "document_analysis_retry", { p_analysis_id: body.analysisId });
    if (!r) throw new HttpError(404, "ไม่พบงานวิเคราะห์");
    await background(processChunk(r.analysis_id, r.chunk_count));
    return { analysisId: r.analysis_id, status: "queued" };
  }
  if (!isUuid(body.sourceDocumentId)) throw new HttpError(400, "รหัสเอกสารไม่ถูกต้อง");
  const [t] = await userRpc<{ analysis_id: string }[]>(caller, "document_analysis_request", { p_source_document_id: body.sourceDocumentId, p_allow_ai: body.allowAi === true });
  if (!t) throw new HttpError(404, "ไม่พบเอกสาร");
  await background(processChunk(t.analysis_id, 0));
  return { analysisId: t.analysis_id, status: "queued" };
});
