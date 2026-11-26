import { useState } from "react";
import { BookOpen, FileText, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { openPublicPdf, type PublicVisitData } from "./visit-api";

/**
 * เล่มหลักสูตรกลุ่มสาระ (สาธารณะ · อ่านอย่างเดียว)
 * กลุ่มสาระมาจากตาราง learning_areas ของโรงเรียน · เล่มแต่ละระดับ = PDF ที่ผู้ดูแลหลักสูตร "อนุมัติเผยแพร่" พร้อมเลือกกลุ่มสาระและระดับเอง
 * ม.ต้น และ ม.ปลาย เป็นคนละช่อง ไม่ทับกัน (ฐานข้อมูลบังคับ 1 เล่มต่อกลุ่มสาระต่อระดับ)
 */
const LEVELS = [
  { key: "lower", label: "ม.ต้น", sub: "ม.1–ม.3" },
  { key: "upper", label: "ม.ปลาย", sub: "ม.4–ม.6" },
] as const;

export function VisitBooks({ data }: { data: PublicVisitData }) {
  if (!data.areas.length) return <p className="visit__muted visit__empty">ยังไม่มีข้อมูลกลุ่มสาระที่เผยแพร่</p>;
  const date = (s: string) => new Date(s).toLocaleDateString("th-TH", { dateStyle: "medium" });
  // เล่มที่เผยแพร่แต่ไม่ได้ผูกกลุ่มสาระ (เช่น เล่มหลักสูตรสถานศึกษา)
  const inBooks = new Set(data.books.map((b) => b.document_id));
  const school = data.documents.filter((d) => !inBooks.has(d.id));
  return (
    <>
    {school.length > 0 && (
      <ul className="vbooks vbooks--school">
        {school.map((d) => (
          <li key={d.id} className="vbooks__area">
            <p className="vbooks__name"><BookOpen className="visit__lock" aria-hidden="true" /> {d.title}</p>
            <p className="visit__sub">{d.page_count ? `${d.page_count.toLocaleString("th-TH")} หน้า` : "เอกสาร PDF"}</p>
            <div className="vbooks__open"><PdfButton docId={d.id} label="เปิดอ่าน" big /></div>
          </li>
        ))}
      </ul>
    )}
    <ul className="vbooks">
      {data.areas.map((a) => (
        <li key={a.id} className="vbooks__area">
          <p className="vbooks__name"><BookOpen className="visit__lock" aria-hidden="true" /> {a.name}</p>
          <div className="vbooks__levels">
            {LEVELS.map((l) => {
              const b = data.books.find((x) => x.learning_area_id === a.id && x.stage === l.key);
              return (
                <div key={l.key} className={`vbooks__slot${b ? " is-ready" : ""}`}>
                  <p className="vbooks__level">{l.label} <small>{l.sub}</small></p>
                  {b ? (
                    <>
                      <p className="vbooks__title" title={b.title}>{b.title}</p>
                      <p className="visit__sub">{b.page_count ? `${b.page_count.toLocaleString("th-TH")} หน้า · ` : ""}ปรับปรุง {date(b.updated_at)}</p>
                      <PdfButton docId={b.document_id} label="เปิดอ่าน" big />
                    </>
                  ) : <p className="visit__sub">ยังไม่เผยแพร่</p>}
                </div>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
    </>
  );
}

/** เปิด PDF ที่อนุมัติเผยแพร่ (presigned URL อายุสั้นจาก Edge Function public-document-url) */
export function PdfButton({ docId, page, label, big }: { docId: string; page?: number | null; label?: string; big?: boolean }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await openPublicPdf(docId, page); } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดเอกสารไม่สำเร็จ"); } finally { setBusy(false); }
  };
  return (
    <button type="button" className={big ? "btn btn--primary btn--sm" : "visit__pdf"} onClick={go} disabled={busy}>
      {busy ? <Loader2 className="visit__lock visit__spin" aria-hidden="true" /> : <FileText className="visit__lock" aria-hidden="true" />}
      {label ?? (page ? `เปิด PDF หน้า ${page}` : "เปิด PDF")}
    </button>
  );
}
