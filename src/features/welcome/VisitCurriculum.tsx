import { useState, type CSSProperties } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatLocator } from "@/features/curriculum/components";
import { CATEGORIES, STAGE_LABEL, type Category, type Stage } from "@/features/curriculum/categories/classify";
import { gradeOf, itemStage, openPublicPdf, pdfPage, type PublicItem, type PublicVisitData } from "./visit-api";

/**
 * หลักสูตรแยกตามประเภท (สาธารณะ · อ่านอย่างเดียว)
 * ข้อมูลมาจาก public_visit_data(): เฉพาะฉบับที่อนุมัติเผยแพร่ + รายการที่ผู้ดูแลหลักสูตรยืนยันแล้ว · ไม่มีปุ่มแก้ไข
 * ไม่คำนวณ/แสดงเปอร์เซ็นต์การบูรณาการ (ไม่มีข้อมูลนี้ในฐานข้อมูล)
 */
const STAGES: Stage[] = ["lower", "upper", null];
const STAGE_TITLE = (s: Stage) => (s === "lower" ? "มัธยมศึกษาตอนต้น (ม.1–ม.3)" : s === "upper" ? "มัธยมศึกษาตอนปลาย (ม.4–ม.6)" : "ไม่ระบุระดับชั้น");

export function VisitCurriculum({ data }: { data: PublicVisitData }) {
  const [tab, setTab] = useState<Category>("general");
  const items = data.items;
  if (!data.version) return <p className="visit__muted visit__empty">ยังไม่มีหลักสูตรที่อนุมัติให้เผยแพร่</p>;
  const v = data.version;
  const inTab = items.filter((c) => c.category === tab);
  return (
    <div>
      <p className="visit__muted">{v.curriculum_name} {v.label}{v.year_be ? ` · พ.ศ. ${v.year_be}` : ""} · รายการที่ยืนยันแล้ว {items.length.toLocaleString("th-TH")} รายการ</p>
      <CurriculumMap items={items} />
      <div className="visit__tabs" role="tablist" aria-label="ประเภทหลักสูตร">
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={tab === c.key} onClick={() => setTab(c.key)}>
            {c.label} <span className="num">{items.filter((x) => x.category === c.key).length.toLocaleString("th-TH")}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {!inTab.length ? <p className="visit__muted visit__empty">ยังไม่มีรายการที่ยืนยันแล้วในประเภทนี้</p> :
          STAGES.map((s) => {
            const xs = inTab.filter((x) => itemStage(x) === s);
            return xs.length ? (
              <section key={s ?? "x"} className="visit__stage" aria-label={STAGE_TITLE(s)}>
                <h3>{STAGE_TITLE(s)} <span className="num">· {xs.length.toLocaleString("th-TH")} รายการ</span></h3>
                <ul className="visit__list">{xs.map((x) => <li key={`${x.target_type}-${x.target_id}`}><ItemBody x={x} /></li>)}</ul>
              </section>
            ) : null;
          })}
      </div>
    </div>
  );
}

function itemSub(x: PublicItem) {
  const g = gradeOf(x);
  if (x.target_type === "subject") return [x.subject_type === "basic" ? "พื้นฐาน" : "เพิ่มเติม", g, x.credits != null ? `${x.credits} หน่วยกิต` : null, x.hours != null ? `${x.hours} ชม.` : null].filter(Boolean).join(" · ");
  if (x.target_type === "activity") return [x.activity_type, g, x.hours != null ? `${x.hours} ชม.` : null].filter(Boolean).join(" · ");
  return x.program_stage === "lower_secondary" ? "แผนการเรียน ม.ต้น" : x.program_stage === "upper_secondary" ? "แผนการเรียน ม.ปลาย" : "แผนการเรียน";
}

function ItemBody({ x }: { x: PublicItem }) {
  return (
    <>
      <p className="visit__item">{x.code ? `${x.code} ` : ""}{x.name}</p>
      <p className="visit__sub">{itemSub(x)}</p>
      <p className="visit__sub">ที่มา: {formatLocator(x.locator)} {x.document_id && <PdfButton docId={x.document_id} page={pdfPage(x.locator)} />}</p>
    </>
  );
}

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

/** ลำดับคอลัมน์ของผังเชื่อมโยงหลักสูตร (ซ้าย → ขวา) */
const MAP_COLS: { key: Category | "core"; title: string; note: string }[] = [
  { key: "core", title: "หลักสูตรแกนกลาง", note: "มาตรฐานและตัวชี้วัด" },
  { key: "general", title: "หลักสูตรโรงเรียน", note: "รายวิชาและแผนการเรียนทั่วไป" },
  { key: "local", title: "หลักสูตรท้องถิ่น", note: "รายวิชาบูรณาการท้องถิ่นและภูมิปัญญา" },
  { key: "vocational", title: "สมรรถนะอาชีพ", note: "เส้นทางสมรรถนะอาชีพในรายวิชา" },
];
const BAND_CATS: Category[] = ["local", "vocational"];

/** ผังเชื่อมโยงหลักสูตร: จำนวนรายการที่ยืนยันต่อคอลัมน์ + กล่องรายวิชาท้องถิ่น/สมรรถนะอาชีพ แยก ม.ต้น / ม.ปลาย */
function CurriculumMap({ items }: { items: PublicItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const bandItems = items.filter((x) => BAND_CATS.includes(x.category) && x.target_type === "subject");
  return (
    <figure className="vmap" aria-label="ผังเชื่อมโยงหลักสูตร">
      <ol className="vmap__cols">
        {MAP_COLS.map((c, i) => (
          <li key={c.key} className="vmap__col" style={{ "--i": i } as CSSProperties}>
            <span className="vmap__step num">{i + 1}</span>
            <p className="vmap__title">{c.title}</p>
            <p className="vmap__note">{c.note}</p>
            {c.key !== "core" && <p className="vmap__n num">{items.filter((x) => x.category === c.key).length.toLocaleString("th-TH")} <small>รายการที่ยืนยัน</small></p>}
          </li>
        ))}
      </ol>
      <div className="vmap__bands">
        {BAND_CATS.flatMap((cat) => STAGES.map((s) => {
          const xs = bandItems.filter((x) => x.category === cat && itemStage(x) === s);
          if (!xs.length) return null;
          return (
            <div key={`${cat}-${s}`} className={`vmap__band vmap__band--${cat}`}>
              <p className="vmap__bandTitle">{cat === "local" ? "ท้องถิ่น" : "สมรรถนะอาชีพ"} · {s ? STAGE_LABEL[s] : "ไม่ระบุระดับ"} <span className="num">({xs.length.toLocaleString("th-TH")})</span></p>
              <ul className="vmap__boxes">
                {xs.map((x) => {
                  const id = `${cat}-${x.target_id}`;
                  const on = open === id;
                  return (
                    <li key={id} className={on ? "is-open" : undefined}>
                      <button type="button" className="vmap__box" aria-expanded={on} onClick={() => setOpen(on ? null : id)}>
                        <span className="vmap__boxName">{x.code ? `${x.code} ` : ""}{x.name}</span>
                      </button>
                      {on && <div className="vmap__boxMore"><ItemBody x={x} /></div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }))}
        {!bandItems.length && <p className="visit__muted">ยังไม่มีรายวิชาท้องถิ่นหรือสมรรถนะอาชีพที่ยืนยันแล้ว</p>}
      </div>
      <figcaption className="visit__sub">หลักสูตรแกนกลาง → หลักสูตรโรงเรียน → หลักสูตรท้องถิ่น → สมรรถนะอาชีพ · กดกล่องรายวิชาเพื่อดูรายละเอียดและหน้าอ้างอิง</figcaption>
    </figure>
  );
}
