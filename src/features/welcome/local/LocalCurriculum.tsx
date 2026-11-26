import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Info, Loader2, X } from "lucide-react";
import { BentoCard, CountUp, RadarChart, Segmented, Treemap } from "@/components/ui/analytics-bento";
import { ALL_TOPICS, countBy, LEVEL_LABEL, loadLocalData, sourceText, topicsOf, type LocalData } from "./data";

/**
 * นิทรรศการหลักสูตรท้องถิ่น (หน้าเยี่ยมชม) — 2 ส่วน: สถิติ · ผังเชื่อมโยง · กดแล้วรายละเอียดเด้งขึ้นในหน้าต่าง (ไม่เลื่อนหน้า)
 * ตัวเลขทั้งหมดคำนวณจาก JSON ขณะแสดงผล · ร้อยละ = สัดส่วนต่อจำนวนรายการทั้งหมดในเอกสาร (ไม่ใช่ร้อยละการบูรณาการ)
 * ไม่แสดงแถวที่เอกสารฉบับตรวจทานระบุ “ไม่พบในหลักสูตร 69” (กรองใน data.ts) · หมวดหัวข้อท้องถิ่น = การสังเคราะห์ (ระบุบนหน้าจอ)
 */
type Filter = { area: string; level: string; topic: string };
const EMPTY: Filter = { area: "", level: "", topic: "" };
const TONES = ["var(--lc-1)", "var(--lc-2)", "var(--lc-3)", "var(--lc-4)"];
/** ร้อยละทศนิยม 1 ตำแหน่ง */
const pct = (n: number, d: number) => `${(d ? (n / d) * 100 : 0).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** แสดงทีละส่วนเมื่อเลื่อนถึง (ปิดเองเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว) */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`lc-reveal${on ? " is-on" : ""} ${className}`}>{children}</div>;
}

export function LocalCurriculum() {
  const [data, setData] = useState<LocalData | null>(null);
  const [err, setErr] = useState(false);
  // หน้าต่างรายละเอียดที่เด้งขึ้นเมื่อกดกล่อง/แกน/เส้นเชื่อม (ไม่เลื่อนหน้า)
  const [pop, setPop] = useState<Filter | null>(null);
  useEffect(() => { loadLocalData().then(setData, () => setErr(true)); }, []);
  const pick = (p: Partial<Filter>) => setPop({ ...EMPTY, ...p });
  if (err) return <p className="visit__muted visit__empty">โหลดข้อมูลหลักสูตรท้องถิ่นไม่สำเร็จ</p>;
  if (!data) return <p className="visit__muted"><Loader2 className="visit__lock visit__spin" aria-hidden="true" /> กำลังโหลดข้อมูลหลักสูตรท้องถิ่น…</p>;
  return (
    <div className="lc">
      <Reveal><Dashboard data={data} onPick={pick} /></Reveal>
      <Reveal><IntegrationMap data={data} onPick={pick} /></Reveal>
      {pop && <PeekModal onClose={() => setPop(null)}><Peek data={data} f={pop} setLevel={(level) => setPop({ ...pop, level })} onClose={() => setPop(null)} modal /></PeekModal>}
      <p className="lc-source"><Info className="visit__lock" aria-hidden="true" /><span>แหล่งข้อมูล: {data.meta.source_document} · {data.meta.extraction}</span></p>
    </div>
  );
}

// ------------------------------------------------------------------ ส่วนที่ 1 · สถิติแบบ Bento
/** สีประจำกลุ่มสาระ (เรียงตามลำดับใน JSON) — โทนเดียวกับสายคล้องป้าย */
const AREA_TONES: { color: string; ink?: "dark" | "light" }[] = [
  { color: "#1f3f77" }, { color: "#b98a2f", ink: "dark" }, { color: "#1f6f68" }, { color: "#7b2f3e" },
  { color: "#55627a" }, { color: "#d9b56a", ink: "dark" }, { color: "#3f8f86" }, { color: "#2f5aa8" },
];
function Dashboard({ data, onPick }: { data: LocalData; onPick: (p: Partial<Filter>) => void }) {
  const rows = useMemo(() => countBy(data.records, data.areas, data.levels), [data]);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.total - a.total), [rows]);
  const areasWithData = rows.filter((r) => r.total > 0).length;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const perLevel = data.levels.map((lv) => data.records.filter((r) => r.level === lv).length);
  const maxLevel = Math.max(1, ...perLevel);
  const total = data.records.length;
  // แผงรายละเอียดในกรอบเปรียบเทียบ — เปิดเมื่อกดแท่ง (ทั้งกลุ่มสาระ) หรือช่วงสี (เฉพาะระดับชั้น)
  const [peek, setPeek] = useState<{ area: string; level: string } | null>(null);
  // ตัวเลือกระดับของทรีแมป/เรดาร์: 0 = ทุกระดับ
  const [lv, setLv] = useState(0);
  const level = lv === 0 ? "" : data.levels[lv - 1]!;
  const valueOf = (r: (typeof rows)[number]) => (lv === 0 ? r.total : r.byLevel[lv - 1] ?? 0);
  const tone = (area: string) => AREA_TONES[data.areas.indexOf(area) % AREA_TONES.length]!;
  const ranked = [...rows].sort((a, b) => valueOf(b) - valueOf(a));
  const top = ranked[0], low = ranked.filter((r) => valueOf(r) > 0).at(-1);
  const seg = ["ทุกระดับ", ...data.levels.map((l) => LEVEL_LABEL[l] ?? l)];
  return (
    <section className="lc-block" aria-labelledby="lc-dash">
      <p className="label">Local Curriculum</p>
      <h2 id="lc-dash" className="section__title">หลักสูตรท้องถิ่น <em>ในทุกกลุ่มสาระ</em></h2>
      <p className="visit__lede">สาระท้องถิ่นจังหวัดกำแพงเพชรที่เชื่อมกับตัวชี้วัดและสาระการเรียนรู้แกนกลาง นับ 1 รายการต่อ 1 แถวในเอกสาร</p>
      <div className="grid grid-cols-12 gap-4">
        {/* A · ภาพรวม */}
        <BentoCard className="col-span-12 flex flex-col gap-5 self-start sm:flex-row lg:col-span-5" aria-label="รายการเชื่อมโยงทั้งหมด">
          <button type="button" className="shrink-0 text-left" onClick={() => onPick({})}>
            <span className="block text-[13px] text-muted-foreground">รายการเชื่อมโยงทั้งหมด</span>
            <span className="mt-2 block text-[52px] font-semibold leading-none tracking-tight sm:text-[60px]"><CountUp value={data.records.length} /></span>
            <span className="mt-1 block text-[13px] font-semibold text-foreground">ตัวชี้วัดที่พบในหลักสูตร 69 · {pct(total, data.meta.source_rows ?? total)} ของ {(data.meta.source_rows ?? total).toLocaleString("th-TH")} แถวในเอกสาร</span>
            <span className="mt-2 block text-[13px] text-muted-foreground"><b className="text-foreground"><CountUp value={areasWithData} /></b> กลุ่มสาระ · <b className="text-foreground"><CountUp value={data.tables.length} /></b> ตารางในเอกสาร</span>
          </button>
          <div className="flex min-h-[150px] flex-1 items-end gap-2 rounded-[18px] border border-border bg-muted/40 p-3" role="group" aria-label="จำนวนรายการแยกระดับชั้น">
            {data.levels.map((l, i) => (
              <button key={l} type="button" onClick={() => onPick({ level: l })} aria-label={`${LEVEL_LABEL[l]} ${perLevel[i]} รายการ`} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-sm font-semibold"><CountUp value={perLevel[i] ?? 0} /></span>
                <span className="text-[11px] text-muted-foreground">{pct(perLevel[i] ?? 0, total)}</span>
                <span className="lc-vbar w-full rounded-[10px] transition-[filter] group-hover:brightness-110" style={{ height: `${((perLevel[i] ?? 0) / maxLevel) * 70}%`, background: TONES[i] }} />
                <span className="text-xs text-muted-foreground">{LEVEL_LABEL[l]}</span>
              </button>
            ))}
          </div>
        </BentoCard>

        {/* B · แท่งเทียบกลุ่มสาระ × ระดับชั้น */}
        <BentoCard className="col-span-12 lg:col-span-7" aria-label="เปรียบเทียบกลุ่มสาระ">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-[17px] font-semibold">เปรียบเทียบแต่ละกลุ่มสาระ</h3>
            <div className="lc-legend" aria-hidden="true">{data.levels.map((l, i) => <span key={l}><i style={{ background: TONES[i] }} />{LEVEL_LABEL[l]}</span>)}</div>
          </div>
          <ul className="lc-bars mt-3" aria-label="จำนวนรายการเชื่อมโยงแยกกลุ่มสาระและระดับชั้น">
            {sorted.map((r) => (
              <li key={r.area}>
                <button type="button" className={`lc-bar${peek?.area === r.area ? " is-on" : ""}`} onClick={() => setPeek({ area: r.area, level: "" })} aria-expanded={peek?.area === r.area} aria-controls="lc-peek" aria-label={`${r.area} ${r.total} รายการ ${pct(r.total, total)} — ดูตัวชี้วัด`}>
                  <span className="lc-bar__name">{r.area}</span>
                  <span className="lc-bar__track">
                    {r.byLevel.map((n, i) => n > 0 && (
                      <span key={i} role="presentation" className={`lc-bar__seg${peek?.area === r.area && peek.level === data.levels[i] ? " is-on" : ""}`} style={{ width: `${(n / max) * 100}%`, background: TONES[i] }}
                        title={`${LEVEL_LABEL[data.levels[i]!]} ${n} รายการ (${pct(n, total)})`} onClick={(e) => { e.stopPropagation(); setPeek({ area: r.area, level: data.levels[i]! }); }} />
                    ))}
                  </span>
                  <span className="lc-bar__n num">{r.total.toLocaleString("th-TH")}<small>{pct(r.total, total)}</small></span>
                </button>
              </li>
            ))}
          </ul>
          {peek ? <Peek data={data} f={{ ...EMPTY, ...peek }} setLevel={(level) => setPeek({ ...peek, level })} onClose={() => setPeek(null)} />
            : <p className="visit__sub">ร้อยละ = สัดส่วนต่อรายการทั้งหมด {total.toLocaleString("th-TH")} รายการ · กดแท่งเพื่อดูตัวชี้วัดของกลุ่มสาระ · กดช่วงสีเพื่อดูเฉพาะระดับชั้นนั้น</p>}
        </BentoCard>

        {/* C · ทรีแมป */}
        <BentoCard className="col-span-12 lg:col-span-7" aria-label="สัดส่วนตามกลุ่มสาระ">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-[17px] font-semibold">พื้นที่ตามจำนวนรายการของแต่ละกลุ่มสาระ</h3>
            <Segmented label="ระดับชั้น" items={seg} value={lv} onChange={setLv} />
          </div>
          <Treemap label={`จำนวนรายการแยกกลุ่มสาระ ${seg[lv]}`} unit="รายการ" onPick={(area) => onPick({ area, level })}
            items={rows.map((r) => ({ id: r.area, name: r.area, value: valueOf(r), ...tone(r.area) }))} />
          <p className="visit__sub mt-3">ขนาดกล่อง = จำนวนรายการ (แถวในเอกสาร) · กดกล่องเพื่อดูรายละเอียด</p>
        </BentoCard>

        {/* D · เรดาร์ */}
        <BentoCard className="col-span-12 lg:col-span-5" aria-label="เรดาร์กลุ่มสาระ">
          <h3 className="m-0 text-[17px] font-semibold">การกระจายใน 8 กลุ่มสาระ <span className="font-normal text-muted-foreground">· {seg[lv]}</span></h3>
          <RadarChart label={`จำนวนรายการของแต่ละกลุ่มสาระ ${seg[lv]}`} unit="รายการ" axis={data.areas} values={rows.map(valueOf)} color="#1f3f77" onPick={(i) => onPick({ area: data.areas[i]!, level })} />
          <div className="mt-1 grid grid-cols-2 gap-3">
            {[["มากที่สุด", top], ["น้อยที่สุด", low]].map(([label, r]) => r && typeof r !== "string" && (
              <button key={label as string} type="button" className="text-left" onClick={() => onPick({ area: r.area, level })}>
                <span className="block text-[13px] text-muted-foreground">{label as string}</span>
                <span className="mt-1 block text-[28px] font-semibold leading-none"><CountUp value={valueOf(r)} /></span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{r.area}</span>
              </button>
            ))}
          </div>
        </BentoCard>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ ส่วนที่ 2 · ผังเชื่อมโยง
/** แผงรายละเอียด: ตัวชี้วัด · สาระแกนกลาง (ใช้เป็นคำอธิบายโดยย่อ) · การเชื่อมโยงท้องถิ่น ตามกลุ่มสาระ/ระดับ/หัวข้อที่เลือก */
function Peek({ data, f, setLevel, onClose, modal = false }: { data: LocalData; f: Filter; setLevel: (l: string) => void; onClose: () => void; modal?: boolean }) {
  const topic = ALL_TOPICS.find((t) => t.key === f.topic);
  const base = data.records.filter((r) => (!f.area || r.area === f.area) && (!f.topic || topicsOf(r).includes(f.topic)));
  const rs = f.level ? base.filter((r) => r.level === f.level) : base;
  const total = data.records.length;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: 0 }); }, [f.area, f.level, f.topic]);
  const title = f.area || "ทุกกลุ่มสาระ";
  return (
    <div id={modal ? undefined : "lc-peek"} className={`lc-peek${modal ? " lc-peek--modal" : ""}`} role={modal ? undefined : "region"} aria-label={`ตัวชี้วัด ${title} ${f.level ? LEVEL_LABEL[f.level] : "ทุกระดับ"}`}>
      <div className="lc-peek__head">
        <div>
          <b id={modal ? "lc-pop-title" : undefined}>{title}</b> <span className="text-muted-foreground">· {f.level ? LEVEL_LABEL[f.level] : "ทุกระดับชั้น"}</span>
          {topic && <span className="lc-chip lc-peek__topic">หัวข้อ (สังเคราะห์): {topic.label}</span>}
          <p className="lc-peek__stat"><b className="num">{rs.length.toLocaleString("th-TH")}</b> รายการ = <b>{pct(rs.length, total)}</b> ของหลักสูตรท้องถิ่นทั้งหมด
            {f.area && f.level && !topic && <> · {pct(rs.length, base.length)} ของกลุ่มสาระนี้</>}</p>
        </div>
        <button type="button" className="lc-peek__x" onClick={onClose} aria-label="ปิดรายละเอียด" data-autofocus><X className="visit__lock" aria-hidden="true" /></button>
      </div>
      <div className="lc-peek__lv" role="group" aria-label="เลือกระดับชั้น">
        {["", ...data.levels].map((l, i) => {
          const n = l ? base.filter((r) => r.level === l).length : base.length;
          return <button key={l || "all"} type="button" disabled={!n} aria-pressed={f.level === l} onClick={() => setLevel(l)}>
            {i > 0 && <i style={{ background: TONES[i - 1] }} />}{l ? LEVEL_LABEL[l] : "ทุกระดับ"} <span className="num">{n}</span></button>;
        })}
      </div>
      <div ref={ref} className="lc-peek__list">
        {rs.map((r) => (
          <article key={r.id} className="lc-peek__item">
            <p className="lc-peek__code"><b>{r.indicator}</b><small>{f.area ? "" : `${r.area} · `}{LEVEL_LABEL[r.level] ?? r.level}</small></p>
            <p className="lc-peek__core"><span>สาระแกนกลาง (คำอธิบายโดยย่อ)</span>{r.core}</p>
            <p className="lc-peek__local"><span>การเชื่อมโยงหลักสูตรท้องถิ่น</span>{r.local}</p>
            <small className="lc-ref">ที่มา: {sourceText(data, r)}</small>
          </article>
        ))}
        {!rs.length && <p className="visit__muted">ไม่มีรายการ</p>}
      </div>
      <p className="lc-peek__foot"><small>เอกสารต้นฉบับระบุรหัสตัวชี้วัด ไม่มีรหัสรายวิชาและคำอธิบายรายวิชา จึงแสดงสาระการเรียนรู้แกนกลางแทนคำอธิบาย</small></p>
    </div>
  );
}

/** หน้าต่างเด้งกลางจอ — ปิดด้วย Esc / กดพื้นหลัง / ปุ่มปิด · ล็อกการเลื่อนหน้าระหว่างเปิด */
function PeekModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="lc-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="lc-modal__box" role="dialog" aria-modal="true" aria-labelledby="lc-pop-title">{children}</div>
    </div>
  );
}

function IntegrationMap({ data, onPick }: { data: LocalData; onPick: (p: Partial<Filter>) => void }) {
  const tagged = useMemo(() => data.records.map((r) => ({ r, t: topicsOf(r) })), [data]);
  const topicCount = useMemo(() => ALL_TOPICS.map((t) => ({ ...t, n: tagged.filter((x) => x.t.includes(t.key)).length })).filter((t) => t.n > 0), [tagged]);
  const [topic, setTopic] = useState(() => [...topicCount].filter((t) => t.key !== "other").sort((a, b) => b.n - a.n)[0]?.key ?? "other");
  const [hover, setHover] = useState<string | null>(null);
  const links = useMemo(() => data.areas.map((area) => ({ area, n: tagged.filter((x) => x.r.area === area && x.t.includes(topic)).length })), [data, tagged, topic]);
  const cur = ALL_TOPICS.find((t) => t.key === topic)!;
  const W = 640, H = 460, cx = W / 2, cy = H / 2, R = 182;
  return (
    <section className="lc-block" aria-labelledby="lc-map">
      <p className="label">Integration Map</p>
      <h2 id="lc-map" className="section__title">ผังเชื่อมโยง <em>หัวข้อท้องถิ่น × กลุ่มสาระ</em></h2>
      <p className="lc-note"><Info className="visit__lock" aria-hidden="true" /><span>หมวดหัวข้อท้องถิ่นเป็น<b>การสังเคราะห์ข้อมูล</b>จากคำสำคัญในช่อง “สาระการเรียนรู้ท้องถิ่น” ของเอกสาร ไม่ใช่หมวดที่เอกสารกำหนด · 1 รายการอยู่ได้มากกว่า 1 หัวข้อ · ตัวเลขบนเส้นคือจำนวนรายการ ไม่ใช่ร้อยละการบูรณาการ</span></p>
      <div className="lc-topics" role="tablist" aria-label="หัวข้อท้องถิ่น">
        {topicCount.map((t) => <button key={t.key} type="button" role="tab" aria-selected={t.key === topic} onClick={() => setTopic(t.key)}>{t.label} <span className="num">{t.n}</span></button>)}
      </div>
      <div className="lc-map">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`ผังเชื่อมโยงหัวข้อ ${cur.label} กับกลุ่มสาระ`}>
          {links.map((l, i) => {
            const a = (-90 + (360 / links.length) * i) * (Math.PI / 180);
            const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a) * 0.86;
            const on = l.n > 0, hot = hover === l.area;
            const mx = (cx + x) / 2, my = (cy + y) / 2;
            return (
              <g key={`${topic}-${l.area}`} className={`lc-link${on ? "" : " is-off"}${hot ? " is-hot" : ""}`} onMouseEnter={() => setHover(l.area)} onMouseLeave={() => setHover(null)}
                onClick={() => on && onPick({ topic, area: l.area })} role={on ? "button" : undefined} tabIndex={on ? 0 : -1} aria-label={on ? `${l.area} ${l.n} รายการ — ดูหลักฐาน` : `${l.area} ไม่มีรายการในหัวข้อนี้`}
                onKeyDown={(e) => { if (on && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick({ topic, area: l.area }); } }}>
                <line x1={cx} y1={cy} x2={x} y2={y} className="lc-line" style={{ animationDelay: `${i * 70}ms` }} />
                <line x1={cx} y1={cy} x2={x} y2={y} className="lc-hit" />
                {on && <g transform={`translate(${mx} ${my})`}><circle r="15" className="lc-count" /><text dy="5" textAnchor="middle" className="lc-count-t">{l.n}</text></g>}
                <g transform={`translate(${x} ${y})`}>
                  <rect x={-74} y={-20} width={148} height={40} rx={20} className="lc-node" />
                  <text dy="5" textAnchor="middle" className="lc-node-t">{l.area.length > 16 ? `${l.area.slice(0, 15)}…` : l.area}</text>
                </g>
              </g>
            );
          })}
          <g transform={`translate(${cx} ${cy})`} className="lc-center">
            <circle r="74" />
            <image href="/school-logo.png" x={-17} y={-60} width={34} height={42} />
            <foreignObject x={-66} y={-14} width={132} height={70}><p className="lc-center-t">{cur.label}</p></foreignObject>
          </g>
        </svg>
      </div>
      <p className="visit__sub">กดเส้นหรือกลุ่มสาระเพื่อดูหลักฐานการเชื่อมโยงจากเอกสาร</p>
    </section>
  );
}
