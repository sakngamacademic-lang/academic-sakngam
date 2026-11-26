import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { OFFICE_ROLES } from "@/features/auth/roles";
import { allVersions, useCurricula } from "@/features/curriculum/api";
import { formatLocator } from "@/features/curriculum/components";
import { useCategoryData } from "@/features/curriculum/categories/api";
import { CATEGORIES, classify, STAGE_LABEL, type Candidate, type Category } from "@/features/curriculum/categories/classify";

/**
 * หลักสูตรที่จัดประเภทแล้ว (อ่านอย่างเดียว) สำหรับคณะกรรมการประเมิน
 * - อ่านผ่าน RLS เดิม: ต้องเข้าสู่ระบบด้วยบทบาทที่อ่านหลักสูตรได้ (เช่น executive = ผู้บริหาร/คณะกรรมการ)
 * - แสดงเฉพาะรายการที่ผู้ดูแลหลักสูตรยืนยันแล้ว (status = confirmed) — ไม่แสดงข้อเสนอที่รอตรวจ
 * - ไม่มีปุ่มแก้ไขใด ๆ; การเขียนทั้งหมดถูกบังคับผ่าน RPC ที่ตรวจ is_curriculum_admin() อยู่แล้ว
 */
export function VisitCurriculum() {
  const { status, roles } = useAuth();
  const canRead = status === "signed_in" && roles.some((r) => OFFICE_ROLES.includes(r));
  if (!canRead) {
    return (
      <>
      <CurriculumMap items={null} />
      <div className="cta-band visit__gate">
        <div>
          <h3><Lock aria-hidden="true" className="visit__lock" /> ข้อมูลหลักสูตรสำหรับคณะกรรมการ</h3>
          <p>{status === "signed_in" ? "บัญชีนี้ยังไม่มีสิทธิ์อ่านข้อมูลหลักสูตร — ติดต่อผู้ดูแลระบบ" : "เข้าสู่ระบบด้วยบัญชีที่ได้รับ เพื่อดูหลักสูตรที่จัดประเภทแล้ว (อ่านอย่างเดียว แก้ไขไม่ได้)"}</p>
        </div>
        {status !== "signed_in" && <Link className="btn btn--primary btn--lg" to="/login" state={{ from: "/visit" }}><span>เข้าสู่ระบบเพื่อดูข้อมูล</span></Link>}
      </div>
      </>
    );
  }
  return <CurriculumData />;
}

function CurriculumData() {
  const curricula = useCurricula();
  const versions = allVersions(curricula.data).filter((v) => v.status !== "retired");
  const v = versions.find((x) => x.status === "active") ?? versions[0];
  const cat = useCategoryData(v?.id ?? null);
  const confirmed = useMemo(() => (cat.data ? classify(cat.data).filter((c) => c.status === "confirmed") : []), [cat.data]);
  const [tab, setTab] = useState<Category>("general");

  if (curricula.isPending || (v && cat.isPending)) return <p className="visit__muted"><Loader2 className="visit__lock visit__spin" aria-hidden="true" /> กำลังโหลดข้อมูลหลักสูตร…</p>;
  if (curricula.isError || cat.isError) return <p className="visit__muted">โหลดข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง</p>;
  if (!v) return <p className="visit__muted">ยังไม่มีหลักสูตรในระบบ</p>;

  const inTab = confirmed.filter((c) => c.category === tab);
  return (
    <div>
      <CurriculumMap items={confirmed} />
      <p className="visit__muted">{v.curriculum_name} {v.version_label}{v.effective_year_be ? ` · พ.ศ. ${v.effective_year_be}` : ""} · แสดงเฉพาะรายการที่ผู้ดูแลหลักสูตรยืนยันแล้ว {confirmed.length.toLocaleString("th-TH")} รายการ</p>
      <div className="visit__tabs" role="tablist" aria-label="ประเภทหลักสูตร">
        {CATEGORIES.map((c) => {
          const n = confirmed.filter((x) => x.category === c.key).length;
          return (
            <button key={c.key} type="button" role="tab" aria-selected={tab === c.key} onClick={() => setTab(c.key)}>
              {c.label} <span className="num">{n.toLocaleString("th-TH")}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        {!inTab.length ? <p className="visit__muted visit__empty">ยังไม่มีรายการที่ยืนยันแล้วในประเภทนี้</p> :
          (["lower", "upper", null] as const).map((s) => {
            const xs = inTab.filter((x) => x.stage === s);
            if (!xs.length) return null;
            return (
              <section key={s ?? "x"} className="visit__stage" aria-label={s ? STAGE_LABEL[s] : "ไม่ระบุระดับ"}>
                <h3>{s === "lower" ? "มัธยมศึกษาตอนต้น (ม.1–ม.3)" : s === "upper" ? "มัธยมศึกษาตอนปลาย (ม.4–ม.6)" : "ไม่ระบุระดับชั้น"} <span className="num">· {xs.length.toLocaleString("th-TH")} รายการ</span></h3>
                <ul className="visit__list">
                  {xs.map((x) => (
                    <li key={`${x.targetType}-${x.targetId}`}>
                      <p className="visit__item">{x.label}</p>
                      {x.sub && <p className="visit__sub">{x.sub}</p>}
                      <p className="visit__sub">ที่มา: {formatLocator(x.locator ?? x.stored?.source_locator)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
      </div>
    </div>
  );
}

/** ลำดับคอลัมน์ของผังเชื่อมโยงหลักสูตร (ซ้าย → ขวา) */
const MAP_COLS: { key: Category | "core"; title: string; note: string }[] = [
  { key: "core", title: "หลักสูตรแกนกลาง", note: "มาตรฐานและตัวชี้วัด 8 กลุ่มสาระ" },
  { key: "general", title: "หลักสูตรโรงเรียน", note: "รายวิชาและแผนการเรียนทั่วไป" },
  { key: "local", title: "หลักสูตรท้องถิ่น", note: "รายวิชาบูรณาการท้องถิ่นและภูมิปัญญา" },
  { key: "vocational", title: "สมรรถนะอาชีพ", note: "เส้นทางสมรรถนะอาชีพในรายวิชา" },
];
const BAND_CATS: Category[] = ["local", "vocational"];

/**
 * ผังเชื่อมโยงหลักสูตร (อ่านอย่างเดียว)
 * items = null → แสดงเฉพาะโครงผัง (ผู้ที่ยังไม่เข้าสู่ระบบ) ไม่มีข้อมูลจริง
 * items = รายการที่ยืนยันแล้ว → นับจำนวนต่อคอลัมน์ และแสดงกล่องรายวิชาท้องถิ่น/สมรรถนะอาชีพ แยก ม.ต้น / ม.ปลาย
 */
function CurriculumMap({ items }: { items: Candidate[] | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const count = (k: Category | "core") => (items && k !== "core" ? items.filter((x) => x.category === k).length : null);
  return (
    <figure className="vmap" aria-label="ผังเชื่อมโยงหลักสูตร">
      <ol className="vmap__cols">
        {MAP_COLS.map((c, i) => {
          const n = count(c.key);
          return (
            <li key={c.key} className="vmap__col" style={{ "--i": i } as CSSProperties}>
              <span className="vmap__step num">{i + 1}</span>
              <p className="vmap__title">{c.title}</p>
              <p className="vmap__note">{c.note}</p>
              {n !== null && <p className="vmap__n num">{n.toLocaleString("th-TH")} <small>รายการที่ยืนยัน</small></p>}
            </li>
          );
        })}
      </ol>
      {items && (
        <div className="vmap__bands">
          {BAND_CATS.flatMap((cat) => (["lower", "upper", null] as const).map((s) => {
            const xs = items.filter((x) => x.category === cat && x.stage === s && x.targetType === "subject");
            if (!xs.length) return null;
            const label = `${cat === "local" ? "ท้องถิ่น" : "สมรรถนะอาชีพ"} · ${s ? STAGE_LABEL[s] : "ไม่ระบุระดับ"}`;
            return (
              <div key={`${cat}-${s}`} className={`vmap__band vmap__band--${cat}`}>
                <p className="vmap__bandTitle">{label} <span className="num">({xs.length.toLocaleString("th-TH")})</span></p>
                <ul className="vmap__boxes">
                  {xs.map((x) => {
                    const id = `${cat}-${x.targetId}`;
                    const on = open === id;
                    return (
                      <li key={id}>
                        <button type="button" className="vmap__box" aria-expanded={on} onClick={() => setOpen(on ? null : id)}>
                          <span className="vmap__boxName">{x.label}</span>
                          {on && (
                            <span className="vmap__boxMore">
                              {x.sub && <span>{x.sub}</span>}
                              {x.stored?.reason && <span>{x.stored.reason}</span>}
                              <span>ที่มา: {formatLocator(x.locator ?? x.stored?.source_locator)}</span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }))}
          {!items.some((x) => BAND_CATS.includes(x.category) && x.targetType === "subject") && <p className="visit__muted">ยังไม่มีรายวิชาท้องถิ่นหรือสมรรถนะอาชีพที่ยืนยันแล้ว</p>}
        </div>
      )}
      <figcaption className="visit__sub">หลักสูตรแกนกลาง → หลักสูตรโรงเรียน → หลักสูตรท้องถิ่น → สมรรถนะอาชีพ{items ? " · กดกล่องรายวิชาเพื่อดูรายละเอียดและหน้าอ้างอิง" : ""}</figcaption>
    </figure>
  );
}
