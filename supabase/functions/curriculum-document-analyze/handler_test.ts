// deno test — งานวิเคราะห์แบบแบ่งรอบ: PDF หลายหน้า · งบเวลา/CPU · ทำต่อจากหน้าที่ค้าง · ไม่ทำซ้อน · AI gating · ล้มเหลวพร้อมเหตุผล
import { assert, assertEquals } from "jsr:@std/assert@1";
import ExcelJS from "npm:exceljs@4.4.0";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { processChunk, type Claim, type Deps } from "./handler.ts";
import { aiConfig, parseAiClassification } from "../_shared/ai-classify.ts";
import { openPdf, xlsxCells } from "../_shared/curriculum-parse.ts";

async function pdf(n: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = doc.addPage([300, 300]);
    if (i % 10 !== 0) p.drawText(`PAGE ${i}`, { x: 20, y: 200, size: 12, font }); // ทุกหน้าที่ 10 ว่าง (ภาพสแกน)
  }
  return await doc.save();
}
async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("S1");
  rows.forEach((r, i) => (ws.getRow(i + 1).values = r as ExcelJS.CellValue[]));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** ฐานข้อมูลจำลองตามกติกาของ RPC จริง (ลำดับรอบ · หน้าต่อเนื่อง · เพดานรอบ) */
function fakeDb(file: Uint8Array, ext: "pdf" | "xlsx", opts: { allowAi?: boolean; aiEnabled?: boolean; aiResult?: unknown; failScheduleAt?: number; chunk?: Partial<Deps["chunk"]> } = {}) {
  const job = { status: "queued", chunk_count: 0, pages_done: 0, page_count: null as number | null, phase: "extract" as "extract" | "analyze", error: null as string | null };
  const pages = new Map<number, string>();
  const queue: number[] = [];
  const stored: Record<string, unknown>[] = [];
  let aiCalls = 0;
  let schedules = 0;
  const deps: Deps = {
    claim: (_id, expected) => {
      if (!["queued", "running"].includes(job.status) || expected !== job.chunk_count) return Promise.resolve(null);
      if (job.chunk_count >= 400) { job.status = "failed"; job.error = "เกินรอบ"; return Promise.resolve(null); }
      job.status = "running";
      job.chunk_count++;
      const c: Claim = { analysis_id: "a1", object_key: "k", file_ext: ext, page_count: job.page_count, pages_done: job.pages_done, chunk_no: job.chunk_count, phase: job.phase, allow_ai: opts.allowAi ?? false };
      return Promise.resolve(c);
    },
    savePages: (_id, first, texts, pageCount) => {
      if (first !== job.pages_done + 1) throw new Error("หน้าไม่ต่อเนื่อง");
      texts.forEach((t, i) => pages.set(first + i, t));
      job.pages_done += texts.length;
      job.page_count = pageCount;
      job.phase = job.pages_done >= pageCount ? "analyze" : "extract";
      return Promise.resolve(job.pages_done);
    },
    pageTexts: () => Promise.resolve([...pages.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t)),
    store: (_id, r) => { stored.push(r); job.status = "done"; return Promise.resolve(1); },
    fail: (_id, m) => { job.status = "failed"; job.error = m; return Promise.resolve(1); },
    getBytes: () => Promise.resolve(file.slice()), // ของจริงดาวน์โหลดใหม่ทุกรอบ (pdf.js ยึด buffer หลังเปิด)
    openPdf: (b) => openPdf(b) as ReturnType<Deps["openPdf"]>,
    xlsxCells,
    ai: () => { aiCalls++; return Promise.resolve(opts.aiResult as never); },
    aiCfg: () => (opts.aiEnabled ? { enabled: true, reason: null } : { enabled: false, reason: "ยังไม่ได้ตั้งค่า AI API key ฝั่งเซิร์ฟเวอร์" }) as ReturnType<typeof aiConfig>,
    scheduleNext: (_id, chunk) => {
      schedules++;
      if (opts.failScheduleAt === schedules) return Promise.reject(new Error("ส่งต่อรอบถัดไปไม่สำเร็จ (HTTP 503)"));
      queue.push(chunk);
      return Promise.resolve();
    },
    chunk: { maxPages: 7, budgetMs: 10_000, ...opts.chunk },
  };
  /** จำลองการส่งต่อรอบ (เพดาน 1000 กันลูปในเทสต์) */
  const drain = async (first: number) => {
    const results: string[] = [await processChunk("a1", first, deps)];
    for (let guard = 0; queue.length && guard < 1000; guard++) results.push(await processChunk("a1", queue.shift()!, deps));
    return results;
  };
  return { job, pages, stored, deps, drain, aiCalls: () => aiCalls, resume: () => { job.status = "queued"; job.error = null; } };
}

Deno.test("PDF 30 หน้า: แบ่งรอบละ 7 หน้า ครบทุกหน้าตามลำดับ วิเคราะห์ครั้งเดียว", async () => {
  const db = fakeDb(await pdf(30), "pdf");
  const results = await db.drain(0);
  assertEquals(results, ["continued", "continued", "continued", "continued", "continued", "done"]); // 5 รอบอ่าน + 1 รอบวิเคราะห์
  assertEquals([...db.pages.keys()], Array.from({ length: 30 }, (_, i) => i + 1));
  assert(db.pages.get(29)!.includes("PAGE 29"));
  assertEquals(db.stored.length, 1);
  assertEquals(db.stored[0]!.page_count, 30);
  const unreadable = (db.stored[0]!.items as { item_type: string; locator: string }[]).filter((i) => i.item_type === "unreadable").map((i) => i.locator);
  assertEquals(unreadable, ["pdf:10", "pdf:20", "pdf:30"], "หน้าว่างแจ้งเป็นข้อมูลไม่พอ ไม่ข้ามเงียบ");
});

Deno.test("งบเวลา/CPU: หน้าช้า → รอบละน้อยหน้าลง แต่ไม่ข้ามหน้า และอ่านอย่างน้อย 1 หน้าต่อรอบ", async () => {
  let clock = 0;
  const db = fakeDb(await pdf(9), "pdf", { chunk: { maxPages: 50, budgetMs: 700, now: () => (clock += 400) } });
  const results = await db.drain(0);
  assertEquals(results.filter((r) => r === "continued").length, 5); // ~2 หน้า/รอบ
  assertEquals(results.at(-1), "done");
  assertEquals([...db.pages.keys()], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

Deno.test("ส่งต่อรอบล้มเหลว → failed พร้อมเหตุผลและหน้าที่ค้าง · ทำต่อจากหน้าที่ค้างได้โดยไม่อ่านซ้ำ/ไม่ข้าม", async () => {
  const db = fakeDb(await pdf(20), "pdf", { failScheduleAt: 2 });
  const first = await db.drain(0);
  assertEquals(first.at(-1), "failed");
  assertEquals(db.job.status, "failed");
  assert(db.job.error!.includes("ส่งต่อรอบถัดไปไม่สำเร็จ") && db.job.error!.includes("อ่านแล้ว 7/20"), db.job.error!);
  assertEquals(db.job.pages_done, 14);
  db.resume();
  const again = await db.drain(db.job.chunk_count);
  assertEquals(again.at(-1), "done");
  assertEquals([...db.pages.keys()], Array.from({ length: 20 }, (_, i) => i + 1));
  assertEquals(db.stored.length, 1);
});

Deno.test("รอบซ้ำ/เก่าไม่ทำงานซ้อน (ลำดับรอบไม่ตรง → skipped)", async () => {
  const db = fakeDb(await pdf(3), "pdf");
  assertEquals(await processChunk("a1", 5, db.deps), "skipped");
  assertEquals(db.job.chunk_count, 0);
});

Deno.test("รอบวิเคราะห์: ข้อความรายหน้าไม่ครบ → failed (ไม่วิเคราะห์จากข้อมูลไม่ครบ)", async () => {
  const db = fakeDb(await pdf(3), "pdf");
  db.job.phase = "analyze";
  db.job.page_count = 3;
  db.pages.set(1, "x");
  assertEquals(await processChunk("a1", 0, db.deps), "failed");
  assert(db.job.error!.includes("ไม่ครบ"));
  assertEquals(db.stored.length, 0);
});

Deno.test("ไฟล์เสีย → failed พร้อมเหตุผล ไม่บันทึกผลบางส่วน", async () => {
  const db = fakeDb(new Uint8Array([1, 2, 3]), "pdf");
  assertEquals(await processChunk("a1", 0, db.deps), "failed");
  assert(db.job.error);
  assertEquals(db.stored.length, 0);
});

Deno.test("Excel ไม่มั่นใจ + ไม่มี key → rule-based และระบุว่า AI ยังไม่เปิดใช้ (ไม่สร้าง key ปลอม)", async () => {
  const db = fakeDb(await xlsx([["บันทึกทั่วไป"]]), "xlsx", { allowAi: true });
  assertEquals(await processChunk("a1", 0, db.deps), "done");
  assertEquals([db.stored[0]!.doc_class, db.stored[0]!.ai_status], ["unknown", "not_configured"]);
  assertEquals(db.aiCalls(), 0);
});

Deno.test("ไม่ได้รับอนุญาต → ไม่เรียก AI · อนุญาต+เปิดใช้ → AI เสนอประเภทพร้อมหลักฐาน", async () => {
  const no = fakeDb(await xlsx([["บันทึกทั่วไป"]]), "xlsx", { aiEnabled: true });
  await processChunk("a1", 0, no.deps);
  assertEquals([no.aiCalls(), no.stored[0]!.ai_status], [0, "not_requested"]);
  const yes = fakeDb(await xlsx([["บันทึกทั่วไป"]]), "xlsx", { aiEnabled: true, allowAi: true,
    aiResult: { doc_class: "announcement_time", confidence: 0.8, reason_th: "มีคำว่าประกาศ", evidence_locators: ["sheet:S1!A1"] } });
  await processChunk("a1", 0, yes.deps);
  assertEquals([yes.stored[0]!.doc_class, yes.stored[0]!.ai_status], ["announcement_time", "used"]);
});

Deno.test("ผล AI ตรวจซ้ำ: พิกัดที่ไม่ได้ส่งไปถูกตัดทิ้ง · JSON เสีย = null · aiConfig ต้องมี key + สวิตช์", () => {
  const allowed = new Set(["pdf:1"]);
  assertEquals(parseAiClassification('{"doc_class":"core_curriculum","confidence":0.9,"reason_th":"x","evidence_locators":["pdf:9"]}', allowed)?.doc_class, "unknown");
  assertEquals(parseAiClassification("not json", allowed), null);
  assertEquals(aiConfig(() => undefined).enabled, false);
  assertEquals(aiConfig((k) => ({ ANTHROPIC_API_KEY: "x", AI_DOCUMENT_ANALYSIS: "enabled" } as Record<string, string>)[k]).enabled, true);
});
