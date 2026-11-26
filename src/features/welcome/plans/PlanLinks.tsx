import { useMemo, type ReactNode } from "react";
import { BookMarked, FileText, Landmark, MapPin, School } from "lucide-react";
import { ProvinceMapShowcase, type MapPinItem, type ProvinceMap } from "@/components/ui/province-map-showcase";
import type { PublicVisitData } from "../visit-api";
import raw from "./plan-links.json";
import mapRaw from "./kamphaeng-phet-map.json";

/**
 * จากหลักสูตรสู่แผนการสอน (หน้าเยี่ยมชม) — นำเสนอบนแผนที่จังหวัดกำแพงเพชร
 * ข้อมูลการเชื่อมโยง: plan-links.json (ถ้อยคำตามรายงานการตรวจและแผนฉบับปรับปรุง · ไม่มีชื่อบุคคล)
 * แผนที่: ขอบเขตอำเภอจาก OpenGISData-Thailand (CC BY 4.0) · หมุดเป็นแผนผัง ไม่ใช่พิกัดจริง
 * ลิงก์แผน: จับคู่อัตโนมัติกับเอกสาร PDF ที่ “อนุมัติเผยแพร่” ซึ่งชื่อขึ้นต้นด้วย “แผน” และมีรหัสวิชา → /b/<id>
 */
type Status = "match" | "plan" | "inplan" | "link";
type Zone = "school" | "mueang" | "province" | null;
interface Layer { status: Status; text: string }
export interface PlanLink {
  id: string; code: string; grade: string; area: string; subject: string | null; plan_no: number | null;
  topic: string | null; unit: string | null; ref: string; core: Layer; school: Layer; local: Layer; has_file: boolean;
  zone: Zone; highlight: string[];
}
const data = raw as { meta: { title: string; school: string; reference: string; source: string }; plans: PlanLink[] };
const map = mapRaw as ProvinceMap & { source: string };

/** เอกสารที่เป็นแผนการสอน (ไม่แสดงเป็นป้ายเล่มหลักสูตรบนสายคล้อง) */
export const isPlanDoc = (title: string) => /^\s*แผน(ที่|การ)/.test(title);
const norm = (s: string) => s.replace(/\s+/g, "");

const HUB = "6203"; // อ.คลองลาน — ที่ตั้งโรงเรียน
const ZONE: Record<Exclude<Zone, null>, { districts: string[]; label: string }> = {
  school: { districts: [HUB], label: "ชุมชนของนักเรียน (โรงเรียนตั้งอยู่ อ.คลองลาน)" },
  mueang: { districts: ["6201"], label: "อ.เมืองกำแพงเพชร" },
  province: { districts: ["*"], label: "ทั้งจังหวัดกำแพงเพชร" },
};
const STATUS: Record<Status, { label: string; tone: string }> = {
  match: { label: "ตรง", tone: "ok" },
  plan: { label: "ตามแผน", tone: "ok" },
  inplan: { label: "อยู่ในแผน", tone: "ok" },
  link: { label: "เชื่อมโยงท้องถิ่น", tone: "ok" },
};
const LAYERS = [
  { key: "core", label: "หลักสูตรแกนกลาง", icon: Landmark },
  { key: "school", label: "หลักสูตรสถานศึกษา", icon: School },
  { key: "local", label: "หลักสูตรท้องถิ่น", icon: MapPin },
] as const;

/** ไฮไลต์วลีสำคัญในข้อความ */
function marked(text: string, phrases: string[]): ReactNode {
  const hit = phrases.find((p) => p && text.includes(p));
  if (!hit) return text;
  const i = text.indexOf(hit);
  return <>{text.slice(0, i)}<mark className="pl-mark">{hit}</mark>{marked(text.slice(i + hit.length), phrases.filter((p) => p !== hit))}</>;
}

export function PlanLinks({ visit }: { visit?: PublicVisitData }) {
  const plans = data.plans;
  // จับคู่แผนกับเอกสารที่เผยแพร่แล้ว (ชื่อเอกสารต้องมีรหัสวิชา)
  const links = useMemo(() => {
    const docs = (visit?.documents ?? []).filter((d) => isPlanDoc(d.title));
    return new Map(plans.map((p) => [p.id, docs.find((d) => norm(d.title).includes(norm(p.code)))?.id ?? null]));
  }, [visit, plans]);
  const count = (k: "core" | "school" | "local", s: Status[]) => plans.filter((p) => s.includes(p[k].status)).length;
  const linked = plans.filter((p) => links.get(p.id)).length;
  const items = useMemo<MapPinItem[]>(() => plans.map((p, i) => ({
    id: p.id, pin: `${p.code[0]}${p.grade.replace(/\D/g, "")}`, title: `${p.code} ${p.grade} ${p.topic ?? p.subject ?? ""}`,
    tone: ((i % 5) + 1) as MapPinItem["tone"], districts: p.zone ? ZONE[p.zone].districts : [],
  })), [plans]);
  const stats = [
    { n: plans.length, label: "แผนการสอน" },
    { n: `${count("core", ["match", "plan"])}/${plans.length}`, label: "ตรงแกนกลาง" },
    { n: `${count("school", ["match"])}/${plans.length}`, label: "ตรงเล่มสถานศึกษา" },
    { n: `${count("local", ["inplan", "link"])}/${plans.length}`, label: "เชื่อมโยงท้องถิ่น" },
  ];

  const card = (i: number, roomy: boolean) => {
    const p = plans[i]!;
    const href = links.get(p.id);
    return (
      <article className={`pl-card ${roomy ? "is-roomy" : ""}`}>
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
              <li key={l.key} className={`pl-layer is-${st.tone}${l.key === "local" ? " is-key" : ""}`}>
                <span className="pl-layer__icon"><l.icon aria-hidden="true" /></span>
                <span className="pl-layer__body">
                  <span className="pl-layer__name">{l.label}<b className="pl-pill">{st.label}</b></span>
                  <span className="pl-layer__text">{l.key === "local" ? marked(v.text, p.highlight) : v.text}</span>
                  {l.key === "local" && p.zone && <span className="pl-zone"><MapPin aria-hidden="true" /> พื้นที่เชื่อมโยง: {ZONE[p.zone].label}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="pl-card__foot">
          <span className="pl-ref"><BookMarked aria-hidden="true" /> {p.ref}</span>
          {href ? <a className="pl-open" href={`/b/${href}`} target="_blank" rel="noopener"><FileText aria-hidden="true" /> เปิดแผนการสอน</a>
            : null}
        </div>
      </article>
    );
  };

  return (
    <section className="lc-block pl" aria-labelledby="pl-title">
      <ProvinceMapShowcase
        map={map}
        items={items}
        hub={HUB}
        hubLabel="อ.คลองลาน"
        renderCard={card}
        autoplay
        interval={6000}
        labels={{ previous: "แผนก่อนหน้า", next: "แผนถัดไป", pin: "แสดงการเชื่อมโยงของแผน" }}
        header={<>
          <p className="label">From Curriculum to Classroom</p>
          <h2 id="pl-title" className="section__title">จากหลักสูตร <em>สู่แผนการสอน</em></h2>
          <p className="visit__lede pl-lede">หลักสูตรแกนกลาง หลักสูตรสถานศึกษา และ<mark className="pl-mark">หลักสูตรท้องถิ่นจังหวัดกำแพงเพชร</mark> เชื่อมลงสู่แผนการจัดการเรียนรู้ของ{data.meta.school}</p>
          <dl className="pl-stats">
            {stats.map((s) => <div key={s.label}><dd className="num">{s.n}</dd><dt>{s.label}</dt></div>)}
            {linked > 0 && <div><dd className="num">{linked}/{plans.length}</dd><dt>เปิดอ่านแผนได้</dt></div>}
          </dl>
        </>}
      />

      <p className="visit__sub">ที่มา: {data.meta.source} · อ้างอิง{data.meta.reference} · หมุดรอบแผนที่แทนแผนการสอน · {map.source}</p>
    </section>
  );
}
