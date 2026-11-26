import { useMemo } from "react";
import { AlertTriangle, ArrowRight, BookMarked, FileText, Landmark, MapPin, School } from "lucide-react";
import type { PublicVisitData } from "../visit-api";
import raw from "./plan-links.json";

/**
 * จากหลักสูตรสู่แผนการสอน (หน้าเยี่ยมชม)
 * ข้อมูลการเชื่อมโยง: plan-links.json (ถ้อยคำตามรายงานการตรวจของฝ่ายวิชาการ ไม่แต่งเพิ่ม · ไม่มีชื่อบุคคล)
 * ลิงก์แผน: จับคู่อัตโนมัติกับเอกสาร PDF ที่ “อนุมัติเผยแพร่” ซึ่งชื่อขึ้นต้นด้วย “แผน” และมีรหัสวิชา → /b/<id>
 */
type Status = "match" | "plan" | "inplan" | "partial" | "linkable" | "none";
interface Layer { status: Status; text: string }
export interface PlanLink {
  id: string; code: string; grade: string; area: string; subject: string | null; plan_no: number | null;
  topic: string | null; unit: string | null; ref: string; core: Layer; school: Layer; local: Layer; has_file: boolean;
}
const data = raw as { meta: { title: string; school: string; reference: string; source: string; caution: string[] }; plans: PlanLink[] };

/** เอกสารที่เป็นแผนการสอน (ไม่แสดงเป็นป้ายเล่มหลักสูตรบนสายคล้อง) */
export const isPlanDoc = (title: string) => /^\s*แผน(ที่|การ)/.test(title);
const norm = (s: string) => s.replace(/\s+/g, "");

const STATUS: Record<Status, { label: string; tone: string }> = {
  match: { label: "ตรง", tone: "ok" },
  plan: { label: "ตามแผน", tone: "info" },
  inplan: { label: "อยู่ในแผน", tone: "ok" },
  partial: { label: "บางส่วน", tone: "warn" },
  linkable: { label: "เชื่อมได้", tone: "link" },
  none: { label: "ไม่มีแถว", tone: "mute" },
};
const LAYERS = [
  { key: "core", label: "หลักสูตรแกนกลาง", icon: Landmark },
  { key: "school", label: "หลักสูตรสถานศึกษา", icon: School },
  { key: "local", label: "หลักสูตรท้องถิ่น", icon: MapPin },
] as const;

export function PlanLinks({ visit }: { visit?: PublicVisitData }) {
  const plans = data.plans;
  // จับคู่แผนกับเอกสารที่เผยแพร่แล้ว (ชื่อเอกสารต้องมีรหัสวิชา)
  const links = useMemo(() => {
    const docs = (visit?.documents ?? []).filter((d) => isPlanDoc(d.title));
    return new Map(plans.map((p) => [p.id, docs.find((d) => norm(d.title).includes(norm(p.code)))?.id ?? null]));
  }, [visit, plans]);
  const count = (k: "core" | "school" | "local", s: Status[]) => plans.filter((p) => s.includes(p[k].status)).length;
  const linked = plans.filter((p) => links.get(p.id)).length;
  const steps = [
    { icon: Landmark, label: "แกนกลาง", n: `${count("core", ["match", "plan"])}/${plans.length}`, note: "แผนระบุตัวชี้วัด/ผลการเรียนรู้" },
    { icon: School, label: "สถานศึกษา", n: `${count("school", ["match"])}/${plans.length}`, note: `ตรงกับ${data.meta.reference}` },
    { icon: MapPin, label: "ท้องถิ่น", n: `${count("local", ["inplan"])}/${plans.length}`, note: `อยู่ในแผน · บางส่วน ${count("local", ["partial"])} · เชื่อมได้ ${count("local", ["linkable"])} · ไม่มีแถว ${count("local", ["none"])}` },
    { icon: FileText, label: "แผนการสอน", n: `${linked}/${plans.length}`, note: "เปิดอ่านไฟล์แผนได้" },
  ];
  return (
    <section className="lc-block pl" aria-labelledby="pl-title">
      <p className="label">From Curriculum to Classroom</p>
      <h2 id="pl-title" className="section__title">จากหลักสูตร <em>สู่แผนการสอน</em></h2>
      <p className="visit__lede">การเชื่อมโยงหลักสูตรแกนกลาง หลักสูตรสถานศึกษา และหลักสูตรท้องถิ่น มาใช้ในแผนการจัดการเรียนรู้ · {data.meta.school} · อ้างอิง{data.meta.reference}</p>

      <ol className="pl-flow" aria-label="ภาพรวมการเชื่อมโยง">
        {steps.map((s, i) => (
          <li key={s.label} className="pl-flow__step">
            <span className="pl-flow__icon"><s.icon aria-hidden="true" /></span>
            <span className="pl-flow__label">{s.label}</span>
            <span className="pl-flow__n num">{s.n}</span>
            <span className="pl-flow__note">{s.note}</span>
            {i < steps.length - 1 && <ArrowRight className="pl-flow__arrow" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <ul className="pl-grid">
        {plans.map((p) => {
          const href = links.get(p.id);
          return (
            <li key={p.id} className="pl-card">
              <div className="pl-card__head">
                <span className="pl-code">{p.code}</span>
                <span className="pl-meta">{p.grade} · {p.area}</span>
              </div>
              <h3 className="pl-card__title">{p.topic ?? p.subject ?? p.code}</h3>
              <p className="pl-card__sub">{[p.subject && p.topic ? p.subject : null, p.plan_no ? `แผนที่ ${p.plan_no}` : null, p.unit].filter(Boolean).join(" · ") || " "}</p>
              <ul className="pl-layers">
                {LAYERS.map((l) => {
                  const v = p[l.key]; const st = STATUS[v.status];
                  return (
                    <li key={l.key} className={`pl-layer is-${st.tone}`}>
                      <span className="pl-layer__icon"><l.icon aria-hidden="true" /></span>
                      <span className="pl-layer__body"><span className="pl-layer__name">{l.label}<b className="pl-pill">{st.label}</b></span><span className="pl-layer__text">{v.text}</span></span>
                    </li>
                  );
                })}
              </ul>
              <div className="pl-card__foot">
                <span className="pl-ref"><BookMarked aria-hidden="true" /> {p.ref}</span>
                {href ? <a className="pl-open" href={`/b/${href}`} target="_blank" rel="noopener"><FileText aria-hidden="true" /> เปิดแผนการสอน</a>
                  : <span className="pl-wait">{p.has_file ? "รออนุมัติเผยแพร่ไฟล์แผน" : "ยังไม่มีไฟล์แผน"}</span>}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="pl-caution" role="note">
        <AlertTriangle aria-hidden="true" />
        <div><b>ประเด็นที่ยังดำเนินการ</b><ul>{data.meta.caution.map((c) => <li key={c}>{c}</li>)}</ul></div>
      </div>
      <p className="visit__sub">ที่มา: {data.meta.source} · “เชื่อมได้” คือแถวในตารางสาระท้องถิ่นที่นำมาเชื่อมได้ แต่ยังไม่อยู่ในกิจกรรมของแผน</p>
    </section>
  );
}
