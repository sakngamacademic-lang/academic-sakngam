/**
 * วิเคราะห์เอกสารหลักสูตรอัตโนมัติ (อ่าน/จำแนก/สกัด) — ไม่อนุมัติข้อมูลใด ๆ
 * 1) ฐานข้อมูลตรวจสิทธิ์ผู้ดูแลหลักสูตรและสร้างงาน (document_analysis_request)
 * 2) ตอบกลับทันที (202) แล้ววิเคราะห์เบื้องหลังด้วย EdgeRuntime.waitUntil — หน้าเว็บไม่ค้าง ติดตามสถานะจากตาราง document_analyses
 * 3) อ่านไฟล์จาก R2 (private) ด้วยสิทธิ์ฝั่งเซิร์ฟเวอร์ → rule-based → (ถ้าไม่มั่นใจ + เปิดใช้ + ได้รับอนุญาต) AI จำแนกจากข้อความบางหน้า
 * 4) บันทึกผลด้วย service_role (document_analysis_store) — ผู้ดูแลตรวจ/ยืนยันในหน้าเว็บ
 * ส่ง { probe: true } เพื่อตรวจว่าเปิดใช้ AI แล้วหรือไม่ (ไม่เปิดเผยค่า secret)
 */
import { handle, HttpError, isUuid, readJson } from "../_shared/http.ts";
import { requireUser, serviceRpc, userRpc } from "../_shared/supabase.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";
import { pdfPages, xlsxCells } from "../_shared/curriculum-parse.ts";
import { analyzePdfPages, analyzeXlsxCells, type AnalysisResult } from "../_shared/curriculum-analyze.ts";
import { aiClassify, aiConfig, AI_MODEL } from "../_shared/ai-classify.ts";

interface Target {
  analysis_id: string;
  object_key: string;
  file_ext: string;
  page_count: number | null;
  allow_ai: boolean;
  register_code: string;
}

const AI_THRESHOLD = 0.6;
const MAX_BYTES = 100 * 1024 * 1024;

export async function runAnalysis(t: Target, deps = {
  getBytes: (k: string) => createStorageProvider().getBytes(k),
  rpc: serviceRpc,
  ai: aiClassify,
  aiCfg: aiConfig,
}) {
  try {
    await deps.rpc("document_analysis_set_status", { p_analysis_id: t.analysis_id, p_status: "running" });
    const bytes = await deps.getBytes(t.object_key);
    if (bytes.byteLength > MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 100 MB");
    let result: AnalysisResult;
    let parts: { locator: string; text: string }[];
    if (t.file_ext === "pdf") {
      const pages = await pdfPages(bytes);
      if (pages.length > 1500) throw new Error("PDF เกิน 1,500 หน้า — กรุณาแบ่งไฟล์");
      result = analyzePdfPages(pages);
      parts = pages.map((p, i) => ({ locator: `pdf:${i + 1}`, text: p }));
      if (t.page_count && t.page_count !== pages.length) {
        result.meta.page_count_mismatch = `ทะเบียนระบุ ${t.page_count} หน้า แต่ไฟล์มี ${pages.length} หน้า`;
      }
    } else {
      const cells = await xlsxCells(bytes);
      result = analyzeXlsxCells(cells);
      const sheets = [...new Set(cells.map((c) => c.sheet))];
      parts = sheets.map((s) => ({ locator: `sheet:${s}!A1`, text: cells.filter((c) => c.sheet === s).map((c) => c.text).join("\n") }));
    }

    // AI เฉพาะเมื่อ rule-based ไม่มั่นใจ
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
    const engine = t.file_ext === "pdf" ? "rule-based@1 + unpdf@0.12.1" : "rule-based@1 + exceljs@4.4.0";
    await deps.rpc("document_analysis_store", {
      p_analysis_id: t.analysis_id,
      p_result: { ...result, engine: ai_status === "used" ? `${engine} + ${AI_MODEL}` : engine, ai_status, ai_note },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "วิเคราะห์ไม่สำเร็จ";
    await deps.rpc("document_analysis_set_status", { p_analysis_id: t.analysis_id, p_status: "failed", p_error: msg }).catch(() => {});
  }
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

export const handler = handle(async (req) => {
  const caller = await requireUser(req);
  const body = await readJson<{ sourceDocumentId?: string; allowAi?: boolean; probe?: boolean }>(req);
  if (body.probe) {
    const cfg = aiConfig();
    return { ai: { enabled: cfg.enabled, reason: cfg.reason, model: cfg.enabled ? AI_MODEL : null } };
  }
  if (!isUuid(body.sourceDocumentId)) throw new HttpError(400, "รหัสเอกสารไม่ถูกต้อง");
  const [t] = await userRpc<Target[]>(caller, "document_analysis_request", { p_source_document_id: body.sourceDocumentId, p_allow_ai: body.allowAi === true });
  if (!t) throw new HttpError(404, "ไม่พบเอกสาร");
  const job = runAnalysis(t);
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(job);
  else await job; // local / test
  return { analysisId: t.analysis_id, status: "queued" };
});
