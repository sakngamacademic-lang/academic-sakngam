/** โหลดไฟล์จากเบราว์เซอร์ + pdf.js (โหลดเฉพาะเมื่ออ่าน PDF) */
import { kindOf, parseDocx, parsePdfPages, parseXlsx, sha256Hex, type PdfPage } from "./parsers";
import type { ParsedSource } from "./model";

/** โหลด pdf.js เฉพาะเมื่อใช้งาน */
export async function parsePdf(buf: ArrayBuffer, fileName: string): Promise<ParsedSource> {
  const sha = await sha256Hex(buf);
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    pages.push({ page: n, items: tc.items.filter((i): i is typeof i & { str: string; transform: number[]; width: number } => "str" in i).map((i) => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]!, w: i.width })) });
  }
  return parsePdfPages(pages, fileName, sha);
}
export async function parseFile(file: File): Promise<ParsedSource> {
  const k = kindOf(file.name);
  const buf = await file.arrayBuffer();
  if (k === "xlsx") return parseXlsx(buf, file.name);
  if (k === "docx") return parseDocx(buf, file.name);
  if (k === "pdf") return parsePdf(buf, file.name);
  throw new Error(`ไม่รองรับไฟล์ ${file.name} (รองรับ .xlsx .docx .pdf)`);
}
