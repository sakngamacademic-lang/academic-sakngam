"use client";

import * as React from "react";

/*
 * Analytics Bento — ชิ้นส่วนการ์ดสถิติแบบ Bento (ปรับจาก Analytics Bento ของ 21st.dev / vasnev.art)
 * ต้นแบบผูกกับข้อมูลยอดขาย (สกุลเงิน, Desktop/Mobile รายชั่วโมง) จึงแยกเป็นชิ้นส่วนกลางที่ใช้กับข้อมูลใดก็ได้:
 * BentoCard · CountUp · Segmented · Treemap (squarify) · RadarChart — SVG/HTML ล้วน ไม่มีไลบรารีกราฟ
 * เรดาร์วาดเป็นเส้นตรงผ่านค่าจริงทุกจุด (ไม่ปรับโค้งให้ดูสวย เพื่อไม่บิดข้อมูล)
 */

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const fmt = (n: number) => Math.round(n).toLocaleString("th-TH");

function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

function useSize() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** ตัวเลขนับขึ้น (เริ่มเมื่อเลื่อนมาเห็น · เปลี่ยนค่าแล้วนับต่อจากค่าเดิม) */
export function CountUp({ value, duration = 1100 }: { value: number; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const from = React.useRef(0);
  const reduce = useReducedMotion();
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !seen) return;
    if (reduce) { el.textContent = fmt(value); from.current = value; return; }
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const f = (now: number) => {
      const t = Math.min(1, (now - t0) / duration), v = a + (value - a) * ease(t);
      el.textContent = fmt(v); from.current = v;
      if (t < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce, seen]);
  return <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>0</span>;
}

export function BentoCard({ className = "", children, ...rest }: React.JSX.IntrinsicElements["section"]) {
  return (
    <section className={`relative min-w-0 overflow-hidden rounded-[28px] border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6 ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function Segmented({ items, value, onChange, label }: { items: string[]; value: number; onChange: (i: number) => void; label: string }) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = React.useState({ x: 0, w: 0 });
  React.useLayoutEffect(() => {
    const b = refs.current[value];
    if (b) setThumb({ x: b.offsetLeft, w: b.offsetWidth });
  }, [value, items]);
  return (
    <div role="tablist" aria-label={label} className="relative inline-grid h-9 max-w-full auto-cols-fr grid-flow-col overflow-x-auto rounded-[12px] bg-muted p-[2px] [scrollbar-width:none]">
      <div className="absolute bottom-[2px] top-[2px] rounded-[10px] bg-background shadow-sm ring-1 ring-border transition-[transform,width] duration-300 [transition-timing-function:cubic-bezier(.2,.9,.25,1)] motion-reduce:transition-none"
        style={{ width: thumb.w, transform: `translateX(${thumb.x - 2}px)`, left: 2 }} />
      {items.map((it, i) => (
        <button key={it} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" aria-selected={i === value} onClick={() => onChange(i)}
          className={`relative z-10 whitespace-nowrap rounded-[10px] px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${i === value ? "text-foreground" : "text-muted-foreground"}`}>
          {it}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Treemap ---------------- */
export interface TreemapItem { id: string; name: string; value: number; color: string; ink?: "dark" | "light" }
type Rect = TreemapItem & { x: number; y: number; w: number; h: number };

function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number): Rect[] {
  const total = items.reduce((a, b) => a + b.value, 0) || 1, scale = (w * h) / total, out: Rect[] = [];
  let rest = items.map((i) => ({ ...i, a: i.value * scale }));
  const worst = (row: typeof rest, len: number) => {
    const s = row.reduce((a, b) => a + b.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  while (rest.length) {
    const len = Math.min(w, h);
    const row = [rest[0]!];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]!], len) <= worst(row, len)) row.push(rest[i++]!);
    rest = rest.slice(i);
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) { const cw = s / h; let cy = y; for (const r of row) { const rh = r.a / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh; } x += cw; w -= cw; }
    else { const rh = s / w; let cx = x; for (const r of row) { const rw = r.a / rh; out.push({ ...r, x: cx, y, w: rw, h: rh }); cx += rw; } y += rh; h -= rh; }
  }
  return out;
}

/** พื้นที่ของกล่อง = ค่าของรายการ · กดกล่องได้ */
export function Treemap({ items, label, unit = "", onPick, className = "" }: { items: TreemapItem[]; label: string; unit?: string; onPick?: (id: string) => void; className?: string }) {
  const [ref, { w: W, h: H }] = useSize();
  const [placed, setPlaced] = React.useState(false);
  React.useEffect(() => { if (W) { const r = requestAnimationFrame(() => requestAnimationFrame(() => setPlaced(true))); return () => cancelAnimationFrame(r); } }, [W]);
  const G = 6;
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const rects = W ? squarify(sorted, 0, 0, W + G, H + G) : [];
  return (
    <div ref={ref} className={`relative h-[300px] sm:h-[340px] ${className}`} role="group" aria-label={label}>
      {rects.map((r) => {
        const w = r.w - G, h = r.h - G;
        const tiny = h < 46 || w < 56;
        const ink = r.ink === "dark" ? "text-neutral-950" : "text-white";
        return (
          <button key={r.id} type="button" onClick={() => onPick?.(r.id)} aria-label={`${r.name} ${fmt(r.value)} ${unit}`} title={`${r.name} · ${fmt(r.value)} ${unit}`}
            className={`absolute flex flex-col justify-between overflow-hidden rounded-[14px] p-3 text-left outline-none transition-[left,top,width,height,filter] duration-700 [transition-timing-function:cubic-bezier(.2,.9,.25,1)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${ink}`}
            style={{ left: placed ? r.x : W / 2, top: placed ? r.y : H / 2, width: placed ? w : 0, height: placed ? h : 0, background: r.color }}>
            {!tiny && <span className="line-clamp-2 text-[12px] font-semibold leading-tight">{r.name}</span>}
            <span className="font-semibold leading-none" style={{ fontSize: tiny ? 14 : Math.max(18, Math.min(34, w / 4.2)), fontVariantNumeric: "tabular-nums" }}>
              <CountUp value={r.value} duration={900} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Radar ---------------- */
/** เรดาร์หลายแกน: รูปหลายเหลี่ยมผ่านค่าจริงของแต่ละแกน (สเกลเริ่มจาก 0 ถึงค่าสูงสุด) · กดชื่อแกนได้ */
export function RadarChart({ axis, values, color, label, unit = "", onPick }: { axis: string[]; values: number[]; color: string; label: string; unit?: string; onPick?: (i: number) => void }) {
  const [ref, { w }] = useSize();
  const reduce = useReducedMotion();
  const poly = React.useRef<SVGPolygonElement | null>(null);
  const cur = React.useRef<number[] | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const N = values.length, S = Math.min(w, 420), R = S / 2 - 56, C = S / 2;
  const max = Math.max(1, ...values);
  const ang = (i: number) => -Math.PI / 2 + (i / N) * Math.PI * 2;
  const pt = (v: number, i: number): [number, number] => { const r = R * 0.16 + (v / max) * R * 0.84; return [C + Math.cos(ang(i)) * r, C + Math.sin(ang(i)) * r]; };
  React.useEffect(() => {
    if (!S) return;
    const from = cur.current && cur.current.length === N ? cur.current : values.map(() => 0), t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = reduce ? 1 : ease(Math.min(1, (now - t0) / 900));
      cur.current = from.map((v, i) => v + ((values[i] ?? 0) - v) * t);
      poly.current?.setAttribute("points", cur.current.map((v, i) => pt(v, i).map((x) => x.toFixed(1)).join(",")).join(" "));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, S, reduce]);
  const short = (s: string) => (s.length > 11 ? `${s.slice(0, 10)}…` : s);
  return (
    <div ref={ref} className="mx-auto w-full max-w-[420px]" style={{ height: S || 300 }}>
      {S > 0 && (
        <svg width={S} height={S} className="mx-auto block" role="img" aria-label={label}>
          {[0.33, 0.66, 1].map((k) => <circle key={k} cx={C} cy={C} r={R * 0.16 + R * 0.84 * k} fill="none" className="stroke-border" strokeWidth={1} />)}
          {axis.map((m, i) => {
            const lx = C + Math.cos(ang(i)) * (R + 26), ly = C + Math.sin(ang(i)) * (R + 20);
            const on = hover === i;
            return (
              <g key={m} className={onPick ? "cursor-pointer" : undefined} onClick={() => onPick?.(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} aria-label={`${m} ${fmt(values[i] ?? 0)} ${unit}`}
                onKeyDown={(e) => { if (onPick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(i); } }}>
                <line x1={C} y1={C} x2={C + Math.cos(ang(i)) * R} y2={C + Math.sin(ang(i)) * R} className="stroke-border" strokeWidth={1} />
                <text x={lx} y={ly - 6} textAnchor="middle" fontSize={11} className={on ? "fill-foreground" : "fill-muted-foreground"} fontWeight={on ? 600 : 400}>{short(m)}</text>
                <text x={lx} y={ly + 9} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(values[i] ?? 0)}</text>
              </g>
            );
          })}
          <polygon ref={poly} fill={color} fillOpacity={0.14} strokeWidth={2.5} strokeLinejoin="round" style={{ stroke: color }} />
          {values.map((v, i) => { const [x, y] = pt(v, i); return <circle key={i} cx={x} cy={y} r={hover === i ? 5 : 3.5} style={{ fill: color }} className="stroke-card" strokeWidth={2} />; })}
        </svg>
      )}
    </div>
  );
}
