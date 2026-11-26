import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Info, Loader2, Search, X } from "lucide-react";
import { ALL_TOPICS, countBy, LEVEL_LABEL, loadLocalData, sourceText, topicsOf, type LocalData, type LocalRecord } from "./data";

/**
 * นิทรรศการหลักสูตรท้องถิ่น (หน้าเยี่ยมชม) — 3 ส่วน: สถิติ · ผังเชื่อมโยง · รายละเอียดเทียบ 3 คอลัมน์
 * ตัวเลขทั้งหมดคำนวณจาก JSON ขณะแสดงผล · ไม่มีเปอร์เซ็นต์การบูรณาการ · หมวดหัวข้อท้องถิ่น = การสังเคราะห์ (ระบุบนหน้าจอ)
 */
type Filter = { area: string; level: string; topic: string; q: string };
const EMPTY: Filter = { area: "", level: "", topic: "", q: "" };
const TONES = ["var(--lc-1)", "var(--lc-2)", "var(--lc-3)", "var(--lc-4)"];

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

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

function CountUp({ value }: { value: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
    let raf = 0; const t0 = performance.now(); const dur = 1100;
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / dur); setN(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value]);
  return <span ref={ref} className="num">{n.toLocaleString("th-TH")}</span>;
}

export function LocalCurriculum() {
  const [data, setData] = useState<LocalData | null>(null);
  const [err, setErr] = useState(false);
  const [f, setF] = useState<Filter>(EMPTY);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => { loadLocalData().then(setData, () => setErr(true)); }, []);
  const pick = (p: Partial<Filter>) => { setF({ ...EMPTY, ...p }); requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  if (err) return <p className="visit__muted visit__empty">โหลดข้อมูลหลักสูตรท้องถิ่นไม่สำเร็จ</p>;
  if (!data) return <p className="visit__muted"><Loader2 className="visit__lock visit__spin" aria-hidden="true" /> กำลังโหลดข้อมูลหลักสูตรท้องถิ่น…</p>;
  return (
    <div className="lc">
      <Reveal><Dashboard data={data} onPick={pick} /></Reveal>
      <Reveal><IntegrationMap data={data} onPick={pick} /></Reveal>
      <div ref={detailRef} className="lc-anchor"><Reveal><Details data={data} f={f} setF={setF} /></Reveal></div>
      <p className="lc-source"><Info className="visit__lock" aria-hidden="true" /><span>แหล่งข้อมูล: {data.meta.source_document} · {data.meta.extraction}</span></p>
    </div>
  );
}

// ------------------------------------------------------------------ ส่วนที่ 1 · สถิติ
function Dashboard({ data, onPick }: { data: LocalData; onPick: (p: Partial<Filter>) => void }) {
  const rows = useMemo(() => countBy(data.records, data.areas, data.levels).sort((a, b) => b.total - a.total), [data]);
  const areasWithData = rows.filter((r) => r.total > 0).length;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const perLevel = data.levels.map((lv) => data.records.filter((r) => r.level === lv).length);
  return (
    <section className="lc-block" aria-labelledby="lc-dash">
      <p className="label">Local Curriculum</p>
      <h2 id="lc-dash" className="section__title">หลักสูตรท้องถิ่น <em>ในทุกกลุ่มสาระ</em></h2>
      <p className="visit__lede">สาระท้องถิ่นจังหวัดกำแพงเพชรที่เชื่อมกับตัวชี้วัดและสาระการเรียนรู้แกนกลาง นับ 1 รายการต่อ 1 แถวในเอกสาร</p>
      <div className="lc-stats">
        <button type="button" className="lc-stat" onClick={() => onPick({})}><strong><CountUp value={areasWithData} /></strong><span>กลุ่มสาระการเรียนรู้</span></button>
        <button type="button" className="lc-stat lc-stat--main" onClick={() => onPick({})}><strong><CountUp value={data.records.length} /></strong><span>รายการเชื่อมโยง</span></button>
        {data.levels.map((lv, i) => (
          <button key={lv} type="button" className="lc-stat" onClick={() => onPick({ level: lv })}><strong><CountUp value={perLevel[i] ?? 0} /></strong><span>{LEVEL_LABEL[lv]}</span></button>
        ))}
      </div>
      <div className="lc-legend" aria-hidden="true">{data.levels.map((lv, i) => <span key={lv}><i style={{ background: TONES[i] }} />{LEVEL_LABEL[lv]}</span>)}</div>
      <ul className="lc-bars" aria-label="จำนวนรายการเชื่อมโยงแยกกลุ่มสาระและระดับชั้น">
        {rows.map((r) => (
          <li key={r.area}>
            <button type="button" className="lc-bar" onClick={() => onPick({ area: r.area })} aria-label={`${r.area} ${r.total} รายการ`}>
              <span className="lc-bar__name">{r.area}</span>
              <span className="lc-bar__track">
                {r.byLevel.map((n, i) => n > 0 && (
                  <span key={i} role="presentation" className="lc-bar__seg" style={{ width: `${(n / max) * 100}%`, background: TONES[i] }}
                    title={`${LEVEL_LABEL[data.levels[i]!]} ${n} รายการ`} onClick={(e) => { e.stopPropagation(); onPick({ area: r.area, level: data.levels[i]! }); }} />
                ))}
              </span>
              <span className="lc-bar__n num">{r.total.toLocaleString("th-TH")}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="visit__sub">กดแท่งเพื่อดูรายการของกลุ่มสาระ · กดช่วงสีเพื่อดูเฉพาะระดับชั้นนั้น</p>
    </section>
  );
}

// ------------------------------------------------------------------ ส่วนที่ 2 · ผังเชื่อมโยง
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

// ------------------------------------------------------------------ ส่วนที่ 3 · รายละเอียดเทียบ 3 คอลัมน์
function Details({ data, f, setF }: { data: LocalData; f: Filter; setF: (f: Filter) => void }) {
  const rows = useMemo(() => {
    const q = f.q.trim();
    return data.records.filter((r) => (!f.area || r.area === f.area) && (!f.level || r.level === f.level) && (!f.topic || topicsOf(r).includes(f.topic))
      && (!q || `${r.indicator} ${r.core} ${r.local} ${r.area}`.includes(q)));
  }, [data, f]);
  const [limit, setLimit] = useState(40);
  useEffect(() => setLimit(40), [f]);
  const topic = ALL_TOPICS.find((t) => t.key === f.topic);
  const active = f.area || f.level || f.topic || f.q;
  return (
    <section className="lc-block" aria-labelledby="lc-detail">
      <p className="label">Details</p>
      <h2 id="lc-detail" className="section__title">รายละเอียด <em>ตัวชี้วัด × สาระแกนกลาง × สาระท้องถิ่น</em></h2>
      <div className="lc-filters">
        <select aria-label="กลุ่มสาระ" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">ทุกกลุ่มสาระ</option>{data.areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select aria-label="ระดับชั้น" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="">ทุกระดับชั้น</option>{data.levels.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select>
        <label className="lc-search"><Search className="visit__lock" aria-hidden="true" /><input type="search" placeholder="ค้นหา เช่น ทุ่งมหาราช, อาชีพ, ท 1.1" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="ค้นหา" /></label>
      </div>
      <p className="lc-result">
        พบ <b className="num">{rows.length.toLocaleString("th-TH")}</b> รายการ
        {topic && <span className="lc-chip">หัวข้อ (สังเคราะห์): {topic.label}</span>}
        {active && <button type="button" className="lc-clear" onClick={() => setF(EMPTY)}><X className="visit__lock" aria-hidden="true" /> ล้างตัวกรอง</button>}
      </p>
      <div className="lc-table" role="table" aria-label="รายละเอียดการเชื่อมโยง">
        <div className="lc-tr lc-th" role="row"><span role="columnheader">รหัสตัวชี้วัด</span><span role="columnheader">สาระการเรียนรู้แกนกลาง</span><span role="columnheader">สาระการเรียนรู้ท้องถิ่น</span></div>
        {rows.slice(0, limit).map((r) => <Row key={r.id} r={r} data={data} />)}
      </div>
      {!rows.length && <p className="visit__muted visit__empty">ไม่พบรายการตามตัวกรอง</p>}
      {rows.length > limit && <button type="button" className="btn btn--ghost lc-more" onClick={() => setLimit((n) => n + 40)}>แสดงเพิ่ม ({(rows.length - limit).toLocaleString("th-TH")} รายการ)</button>}
      <p className="visit__sub">หมายเหตุ: เอกสารต้นฉบับระบุ “รหัสตัวชี้วัด” ไม่มีรหัสรายวิชา จึงไม่แสดงรหัสรายวิชา</p>
    </section>
  );
}
function Row({ r, data }: { r: LocalRecord; data: LocalData }) {
  return (
    <div className="lc-tr" role="row">
      <span role="cell" className="lc-code"><b>{r.indicator}</b><small>{r.area} · {r.grade_label}</small></span>
      <span role="cell" data-label="สาระการเรียนรู้แกนกลาง">{r.core}</span>
      <span role="cell" data-label="สาระการเรียนรู้ท้องถิ่น" className="lc-local">{r.local}<small className="lc-ref">ที่มา: {sourceText(data, r)}</small></span>
    </div>
  );
}
