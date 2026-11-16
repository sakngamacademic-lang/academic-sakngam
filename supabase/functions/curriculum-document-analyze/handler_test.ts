// deno test — งานวิเคราะห์เบื้องหลัง: ไม่อนุมัติข้อมูล · AI เฉพาะเมื่อไม่มั่นใจ + เปิดใช้ + ได้รับอนุญาต · ผิดพลาด = failed
import { assert, assertEquals } from "jsr:@std/assert@1";
import ExcelJS from "npm:exceljs@4.4.0";
import { runAnalysis } from "./handler.ts";
import { aiConfig, parseAiClassification } from "../_shared/ai-classify.ts";

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("S1");
  rows.forEach((r, i) => (ws.getRow(i + 1).values = r as ExcelJS.CellValue[]));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function harness(bytes: Uint8Array, opts: { aiEnabled?: boolean; aiResult?: unknown } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let aiCalls = 0;
  return {
    calls,
    aiCalls: () => aiCalls,
    deps: {
      getBytes: () => Promise.resolve(bytes),
      rpc: <T>(fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return Promise.resolve(1 as T); },
      ai: () => { aiCalls++; return Promise.resolve(opts.aiResult as never); },
      aiCfg: () => (opts.aiEnabled ? { enabled: true, reason: null } : { enabled: false, reason: "ยังไม่ได้ตั้งค่า AI API key ฝั่งเซิร์ฟเวอร์" }) as ReturnType<typeof aiConfig>,
    },
  };
}
const target = (allow_ai: boolean) => ({ analysis_id: "a1", object_key: "k", file_ext: "xlsx", page_count: null, allow_ai, register_code: "SRC-01" });

Deno.test("ไม่มั่นใจ + ไม่มี key → rule-based ต่อ และระบุว่า AI ยังไม่เปิดใช้ (ไม่สร้าง key ปลอม)", async () => {
  const h = harness(await xlsx([["บันทึกทั่วไป"]]));
  await runAnalysis(target(true), h.deps as never);
  const store = h.calls.find((c) => c.fn === "document_analysis_store")!;
  const r = store.args.p_result as Record<string, unknown>;
  assertEquals([r.doc_class, r.ai_status], ["unknown", "not_configured"]);
  assertEquals(h.aiCalls(), 0);
  assertEquals(h.calls.map((c) => c.fn), ["document_analysis_set_status", "document_analysis_store"]);
});

Deno.test("ไม่ได้รับอนุญาตจากผู้ดูแล → ไม่เรียก AI แม้เปิดใช้", async () => {
  const h = harness(await xlsx([["บันทึกทั่วไป"]]), { aiEnabled: true });
  await runAnalysis(target(false), h.deps as never);
  assertEquals(h.aiCalls(), 0);
  assertEquals((h.calls[1]!.args.p_result as Record<string, unknown>).ai_status, "not_requested");
});

Deno.test("อนุญาต + เปิดใช้ → AI เสนอประเภทพร้อมหลักฐาน", async () => {
  const h = harness(await xlsx([["บันทึกทั่วไป"]]), { aiEnabled: true, aiResult: { doc_class: "announcement_time", confidence: 0.8, reason_th: "มีคำว่าประกาศ", evidence_locators: ["sheet:S1!A1"] } });
  await runAnalysis(target(true), h.deps as never);
  const r = h.calls[1]!.args.p_result as Record<string, unknown>;
  assertEquals([r.doc_class, r.ai_status], ["announcement_time", "used"]);
  assert(String(r.engine).includes("claude-opus-5-5"));
});

Deno.test("มั่นใจแล้ว → ไม่เรียก AI", async () => {
  const h = harness(await xlsx([["หลักสูตรสถานศึกษา โครงสร้างหลักสูตรชั้นปี"], [], ["รหัสวิชา", "ชื่อรายวิชา", "หน่วยกิต", "ชั่วโมง"], ["ท21101", "ภาษาไทย", 1.5, 60]]), { aiEnabled: true });
  await runAnalysis(target(true), h.deps as never);
  assertEquals(h.aiCalls(), 0);
  const r = h.calls[1]!.args.p_result as { doc_class: string; ai_status: string; items: { item_type: string; locator: string }[] };
  assertEquals([r.doc_class, r.ai_status], ["school_curriculum", "not_needed"]);
  assertEquals(r.items.find((i) => i.item_type === "subject")?.locator, "sheet:S1!A4:D4");
});

Deno.test("ไฟล์เสีย → งานเป็น failed พร้อมเหตุผล (ไม่บันทึกผลบางส่วน)", async () => {
  const h = harness(new Uint8Array([1, 2, 3]));
  await runAnalysis(target(false), h.deps as never);
  assertEquals(h.calls.at(-1)!.args.p_status, "failed");
  assert(!h.calls.some((c) => c.fn === "document_analysis_store"));
});

Deno.test("ผล AI ตรวจซ้ำ: พิกัดที่ไม่ได้ส่งไปถูกตัดทิ้ง · ไม่มีหลักฐาน = unknown · JSON เสีย = null", () => {
  const allowed = new Set(["pdf:1"]);
  assertEquals(parseAiClassification('{"doc_class":"core_curriculum","confidence":0.9,"reason_th":"x","evidence_locators":["pdf:9"]}', allowed)?.doc_class, "unknown");
  assertEquals(parseAiClassification('{"doc_class":"core_curriculum","confidence":1.5,"reason_th":"x","evidence_locators":["pdf:1"]}', allowed)?.confidence, 1);
  assertEquals(parseAiClassification("not json", allowed), null);
  assertEquals(parseAiClassification('{"doc_class":"hack","confidence":1,"reason_th":"","evidence_locators":[]}', allowed), null);
});

Deno.test("aiConfig: ต้องมีทั้ง key และสวิตช์เปิดใช้", () => {
  assertEquals(aiConfig(() => undefined).enabled, false);
  assertEquals(aiConfig((k) => (k === "ANTHROPIC_API_KEY" ? "x" : undefined)).enabled, false);
  assertEquals(aiConfig((k) => ({ ANTHROPIC_API_KEY: "x", AI_DOCUMENT_ANALYSIS: "enabled" } as Record<string, string>)[k]).enabled, true);
});
