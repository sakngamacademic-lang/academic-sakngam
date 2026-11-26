import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { parsePlanHeader, type PlanMeta } from "./plans";

async function openPdf(blob: Blob) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  return pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
}
type TItem = { str: string; transform: number[]; width: number };
async function pageText(doc: Awaited<ReturnType<typeof openPdf>>, n: number) {
  return ((await (await doc.getPage(n)).getTextContent()).items as TItem[]).filter((i) => i.str?.trim());
}
/** อ่านหัวแผนการจัดการเรียนรู้จากหน้าแรก (เรียงบรรทัดตามตำแหน่ง) */
export async function readPlanMeta(blob: Blob): Promise<PlanMeta> {
  const doc = await openPdf(blob);
  try {
    const items = (await pageText(doc, 1)).map((i) => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]!, w: i.width })).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: (typeof items)[] = [];
    for (const it of items) { const l = lines.find((x) => Math.abs(x[0]!.y - it.y) < 4); if (l) l.push(it); else lines.push([it]); }
    return parsePlanHeader(lines.map((l) => l.sort((a, b) => a.x - b.x).reduce((s, it, k) => s + (k && it.x - (l[k - 1]!.x + l[k - 1]!.w) > 1.5 ? " " : "") + it.str, "")));
  } finally { void doc.destroy(); }
}
export interface CodeHit { part: number; page: number; kind: string }
const KINDS = ["คำอธิบายรายวิชา", "โครงสร้างรายวิชา", "หน่วยการเรียนรู้", "โครงสร้างหลักสูตร"];
/** หาทุกหน้าในเล่มที่มีรหัสวิชา (ไม่สนช่องว่าง เช่น "ค 21101" = "ค21101") พร้อมชนิดหน้าจากหัวหน้า */
export async function findCodePages(blobs: Blob[], code: string): Promise<CodeHit[]> {
  const hits: CodeHit[] = [];
  for (let part = 0; part < blobs.length; part++) {
    const doc = await openPdf(blobs[part]!);
    try {
      for (let page = 1; page <= doc.numPages; page++) {
        const t = (await pageText(doc, page)).map((i) => i.str).join("").replace(/\s+/g, "");
        if (!t.includes(code)) continue;
        const head = t.slice(0, 80);
        hits.push({ part, page, kind: KINDS.find((k) => head.includes(k)) ?? KINDS.find((k) => t.includes(k)) ?? "กล่าวถึงรายวิชา" });
      }
    } finally { void doc.destroy(); }
  }
  return hits;
}

/** แสดง PDF ด้วย pdf.js (ทุกอุปกรณ์ รวมมือถือ) — เรนเดอร์ทีละหน้าเมื่อเลื่อนมาถึง */
type Doc = { numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }>; destroy: () => Promise<void> };
export function PdfPages({ blob, onPages, goTo }: { blob: Blob; onPages?: (n: number) => void; goTo?: { page: number; at: number } }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true; let d: Doc | null = null;
    (async () => {
      try {
        d = (await openPdf(blob)) as unknown as Doc;
        const v = (await d.getPage(1)).getViewport({ scale: 1 });
        if (alive) { setRatio(v.height / v.width); setDoc(d); onPages?.(d.numPages); }
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { alive = false; void d?.destroy(); };
  }, [blob]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (goTo) wrap.current?.querySelector(`[data-page="${goTo.page}"]`)?.scrollIntoView({ block: "start" }); }, [goTo, doc]);
  if (err) return <p className="p-6 text-white">เปิดไฟล์ไม่ได้: {err}</p>;
  if (!doc) return <p className="flex items-center gap-2 p-6 text-white"><Loader2 className="size-5 animate-spin" /> กำลังเปิดเล่ม…</p>;
  return (
    <div ref={wrap} className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-2 sm:p-4">
      {Array.from({ length: doc.numPages }, (_, i) => <Page key={i} doc={doc} n={i + 1} ratio={ratio} />)}
    </div>
  );
}
function Page({ doc, n, ratio }: { doc: Doc; n: number; ratio: number }) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return;
    let started = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e?.isIntersecting || started) return; started = true;
      const page = await doc.getPage(n);
      const w = el.clientWidth, base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (w / base.width) * Math.min(window.devicePixelRatio || 1, 2) });
      const c = cv.current!; c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise; setDone(true);
    }, { rootMargin: "800px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [doc, n]);
  return (
    <div ref={box} data-page={n} className="relative w-full bg-white shadow-lg" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={cv} aria-label={`หน้า ${n}`} className="h-full w-full" />
      {!done && <span className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">หน้า {n}</span>}
    </div>
  );
}
