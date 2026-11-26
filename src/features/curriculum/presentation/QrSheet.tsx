import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, Loader2, Printer, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { usePublicVisit } from "@/features/welcome/visit-api";

/**
 * QR Code ของทุกเล่มที่ "อนุมัติเผยแพร่" — สแกนแล้วเปิด PDF ทันที (ผ่าน /b/<id> บน URL ถาวร)
 * รายการมาจาก public_visit_data() ชุดเดียวกับหน้าเยี่ยมชม: ถอนการเผยแพร่แล้วจะหายจากที่นี่และ QR เดิมเปิดไม่ได้
 */
/** slug: ชื่อไฟล์ภาษาอังกฤษ (บางเบราว์เซอร์ตัดชื่อไฟล์ภาษาไทยทิ้ง) — ชื่อภาษาไทยอยู่บนภาพแล้ว */
interface Entry { id: string; title: string; sub: string; slug: string }
const STAGE = { lower: "มัธยมศึกษาตอนต้น (ม.1–ม.3)", upper: "มัธยมศึกษาตอนปลาย (ม.4–ม.6)" } as const;
const linkOf = (id: string) => `${env.VITE_PUBLIC_SITE_URL.replace(/\/$/, "")}/b/${id}`;

function useEntries(): { entries: Entry[]; loading: boolean } {
  const q = usePublicVisit();
  const entries = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    const inBooks = new Set(d.books.map((b) => b.document_id));
    const school = d.documents.filter((x) => !inBooks.has(x.id)).map((x) => ({ id: x.id, title: x.title, sub: "เล่มหลักสูตรสถานศึกษา", slug: "school" }));
    const order = new Map(d.areas.map((a, i) => [a.id, i]));
    const books = [...d.books]
      .sort((a, b) => (order.get(a.learning_area_id) ?? 99) - (order.get(b.learning_area_id) ?? 99) || (a.stage === "lower" ? -1 : 1))
      .map((b) => {
        const area = d.areas.find((a) => a.id === b.learning_area_id);
        const code = /^[A-Za-z0-9]+$/.test(area?.code ?? "") ? area!.code : "area";
        return { id: b.document_id, title: `หลักสูตรกลุ่มสาระ${area?.name ?? ""}`, sub: STAGE[b.stage], slug: `${code}-${b.stage}` };
      });
    return [...school, ...books].map((e, i) => ({ ...e, slug: `${String(i + 1).padStart(2, "0")}-${e.slug}` }));
  }, [q.data]);
  return { entries, loading: q.isPending };
}

/** ภาพ PNG: QR + ชื่อหลักสูตร 2 บรรทัด (ใช้ทั้งแสดง ดาวน์โหลด และพิมพ์) */
async function card(e: Entry): Promise<string> {
  const qr = await QRCode.toDataURL(linkOf(e.id), { errorCorrectionLevel: "M", margin: 1, width: 600, color: { dark: "#142b4e", light: "#ffffff" } });
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("qr")); img.src = qr; });
  const W = 700, H = 860;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  g.drawImage(img, 50, 40, 600, 600);
  g.fillStyle = "#142b4e"; g.textAlign = "center";
  const font = '"IBM Plex Sans Thai","Noto Sans Thai","Sarabun",sans-serif';
  const fit = (text: string, size: number, weight: string) => { let s = size; do { g.font = `${weight} ${s}px ${font}`; s -= 2; } while (g.measureText(text).width > W - 60 && s > 18); };
  fit(e.title, 40, "700"); g.fillText(e.title, W / 2, 712);
  g.fillStyle = "#475569"; fit(e.sub, 30, "500"); g.fillText(e.sub, W / 2, 762);
  g.fillStyle = "#94a3b8"; g.font = `400 20px ${font}`; g.fillText("สแกนเพื่อเปิดเล่มหลักสูตร · โรงเรียนสักงามวิทยา", W / 2, 820);
  return c.toDataURL("image/png");
}

export function QrSheet() {
  const { entries, loading } = useEntries();
  const [imgs, setImgs] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if ("fonts" in document) await document.fonts.ready;
      const out: Record<string, string> = {};
      for (const e of entries) out[e.id] = await card(e);
      if (!cancelled) setImgs(out);
    })();
    return () => { cancelled = true; };
  }, [entries]);

  const fileName = (e: Entry) => `QR-${e.slug}.png`;
  const download = async (e: Entry) => {
    const url = URL.createObjectURL(await (await fetch(imgs[e.id]!)).blob());
    const a = document.createElement("a");
    a.href = url; a.download = fileName(e); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const printAll = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const items = entries.map((e) => `<figure><img src="${imgs[e.id]}" alt=""></figure>`).join("");
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>QR Code เล่มหลักสูตร</title><style>
      @page { size: A4; margin: 10mm } body { margin: 0; font-family: sans-serif }
      main { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm } figure { margin: 0; break-inside: avoid; border: 1px dashed #cbd5e1; padding: 4mm; text-align: center }
      img { width: 100%; max-width: 80mm }</style></head><body><main>${items}</main><script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-card" aria-labelledby="qr-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="qr-title" className="flex items-center gap-2 font-semibold"><QrCode className="size-5" aria-hidden="true" /> QR Code เล่มหลักสูตร ({entries.length})</h2>
        {entries.length > 0 && <Button size="sm" variant="outline" className="ml-auto" disabled={Object.keys(imgs).length < entries.length} onClick={printAll}><Printer /> พิมพ์ทั้งหมด</Button>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">สแกนแล้วเปิดไฟล์ PDF ทันที ไม่ต้องเข้าเว็บและไม่ต้อง Login · ลิงก์ชี้ {env.VITE_PUBLIC_SITE_URL} · ถอนการเผยแพร่แล้ว QR จะเปิดไม่ได้</p>
      {loading ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> กำลังโหลด…</p>
        : !entries.length ? <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีเล่มที่อนุมัติเผยแพร่ — กด “เผยแพร่” ในหน้านำเสนอเล่มหลักสูตรก่อน</p> : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl border p-3 text-center">
              {imgs[e.id] ? <img src={imgs[e.id]} alt={`QR Code ${e.title} ${e.sub}`} className="mx-auto w-full max-w-56" /> : <Loader2 className="mx-auto my-16 size-6 animate-spin text-muted-foreground" />}
              <a href={linkOf(e.id)} target="_blank" rel="noopener" className="mt-1 block truncate text-xs text-primary hover:underline">{linkOf(e.id).replace(/^https?:\/\//, "")}</a>
              <Button size="sm" variant="ghost" className="mt-1" disabled={!imgs[e.id]} onClick={() => void download(e)}><Download /> ดาวน์โหลด PNG</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
