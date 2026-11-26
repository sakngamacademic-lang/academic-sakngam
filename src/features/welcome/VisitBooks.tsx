import { BookOpen } from "lucide-react";
import { PdfButton } from "./VisitCurriculum";
import type { PublicVisitData } from "./visit-api";

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
  return (
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
  );
}
