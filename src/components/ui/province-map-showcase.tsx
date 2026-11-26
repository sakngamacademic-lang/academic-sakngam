"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Province map showcase — ดัดแปลงจาก testimonial-globe (21st.dev): แทนลูกโลก WebGL ด้วยแผนที่จังหวัดแบบ SVG
 * คงรูปแบบเดิม: หมุด ↔ การ์ด, เส้นนำสายตา, เล่นอัตโนมัติ (หยุดเมื่อชี้/โฟกัส/กดหมุด), ปุ่มก่อนหน้า/ถัดไป, ปัดบนจอสัมผัส
 * หมุดวางเป็นวงรอบแผนที่ (เป็นแผนผัง ไม่ใช่พิกัดจริง) · เส้นจากอำเภอศูนย์กลาง (hub) ไปยังหมุด · อำเภอที่เกี่ยวข้องถูกระบายสี
 */
export interface MapDistrict { code: string; name: string; d: string; cx: number; cy: number }
export interface ProvinceMap { width: number; height: number; districts: MapDistrict[] }
type Tone = 1 | 2 | 3 | 4 | 5;
export interface MapPinItem {
  id: string;
  /** ข้อความสั้นบนหมุด (1–2 ตัวอักษร) */
  pin: string;
  /** ชื่อสำหรับโปรแกรมอ่านหน้าจอ */
  title: string;
  tone?: Tone;
  /** รหัสอำเภอที่ระบายสีเมื่อรายการนี้เด่น · "*" = ทั้งจังหวัด */
  districts?: string[];
}
export interface ProvinceMapShowcaseProps extends Omit<React.ComponentProps<"section">, "children"> {
  map: ProvinceMap;
  items: MapPinItem[];
  /** อำเภอศูนย์กลาง (เช่น ที่ตั้งโรงเรียน) */
  hub: string;
  hubLabel?: string;
  header?: React.ReactNode;
  renderCard: (index: number, roomy: boolean) => React.ReactNode;
  autoplay?: boolean;
  interval?: number;
  size?: number;
  labels?: { previous: string; next: string; pin: string };
}

const HOLD_MS = 6000;
const SWAP_MS = 240;
const SWIPE_MIN = 40;
const WIDE_MIN = 640;
const MAX_CONTENT = 1200;
const VB = 1000;
const MAP_SCALE = 0.6;
const RING = { 1: "bg-chart-1", 2: "bg-chart-2", 3: "bg-chart-3", 4: "bg-chart-4", 5: "bg-chart-5" } as const;
const STROKE = { 1: "var(--color-chart-1)", 2: "var(--color-chart-2)", 3: "var(--color-chart-3)", 4: "var(--color-chart-4)", 5: "var(--color-chart-5)" } as const;
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function ProvinceMapShowcase({ map, items, hub, hubLabel, header, renderCard, autoplay = true, interval = 5000, size = 460, labels, className, ...rest }: ProvinceMapShowcaseProps) {
  const text = { previous: "รายการก่อนหน้า", next: "รายการถัดไป", pin: "แสดง", ...labels };
  const count = items.length;
  const rootRef = React.useRef<HTMLElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const regionRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const pinRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const swipe = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const [width, setWidth] = React.useState(0);
  const [active, setActive] = React.useState(0);
  const [pinned, setPinned] = React.useState(false);
  const [keyboard, setKeyboard] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [reduced, setReduced] = React.useState(false);
  const [leader, setLeader] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const pad = width >= 1024 ? 40 : width >= 620 ? 24 : 12;
  const inner = Math.max(0, Math.min(width, MAX_CONTENT) - pad * 2);
  const wide = inner >= WIDE_MIN;
  const diameter = Math.max(0, Math.round(width === 0 ? 300 : wide ? Math.min(size, inner * 0.46) : Math.min(size, 360, inner)));
  const pinSize = diameter >= 400 ? 46 : diameter >= 320 ? 40 : 34;
  const gap = width >= 1024 ? 64 : 32;
  const roomy = wide && inner - diameter - gap >= 440;
  // เล่นต่อแม้ชี้เมาส์ค้าง — หยุดชั่วคราวเฉพาะเมื่อกดหมุด/ปุ่ม (HOLD_MS) หรือใช้แป้นพิมพ์
  const running = autoplay && !reduced && count > 1 && !pinned && !keyboard && visible;
  const current = Math.min(active, Math.max(0, count - 1));
  const item = items[current];

  // แผนที่อยู่กลางกรอบ · หมุดเรียงเป็นวงรอบ
  const mapW = VB * MAP_SCALE, mapH = (map.height / map.width) * mapW;
  const ox = (VB - mapW) / 2, oy = (VB - mapH) / 2;
  const toBox = (x: number, y: number) => ({ x: ox + (x / map.width) * mapW, y: oy + (y / map.height) * mapH });
  const hubD = map.districts.find((d) => d.code === hub);
  const hubPt = hubD ? toBox(hubD.cx, hubD.cy) : { x: VB / 2, y: VB / 2 };
  const ring = React.useMemo(() => items.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, count);
    return { x: VB / 2 + Math.cos(a) * 448, y: VB / 2 + Math.sin(a) * 448 };
  }), [items, count]);
  const lit = new Set(item?.districts ?? []);
  const all = lit.has("*");
  const tone = (i: number): Tone => items[i]?.tone ?? (((i % 5) + 1) as Tone);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => setWidth(root.clientWidth));
    ro.observe(root);
    setWidth(root.clientWidth);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReduced(motion.matches);
    let onScreen = true;
    const sync = () => setVisible(onScreen && !document.hidden);
    const io = new IntersectionObserver((e) => { onScreen = e[e.length - 1]?.isIntersecting ?? true; sync(); });
    onMotion();
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", sync);
    io.observe(root);
    return () => { motion.removeEventListener("change", onMotion); document.removeEventListener("visibilitychange", sync); io.disconnect(); };
  }, []);

  // เล่นอัตโนมัติ
  React.useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % count), interval);
    return () => window.clearTimeout(id);
  }, [running, current, interval, count]);

  // หมุดที่กดค้างไว้ชั่วครู่ แล้วปล่อยให้เล่นต่อ (Esc ปล่อยทันที)
  React.useEffect(() => {
    if (!pinned) return;
    const id = window.setTimeout(() => setPinned(false), HOLD_MS);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(false);
    document.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(id); document.removeEventListener("keydown", onKey); };
  }, [pinned, current]);

  // เส้นนำสายตาจากหมุดเด่นไปยังการ์ด (เฉพาะจอกว้าง)
  const measure = React.useCallback(() => {
    const stage = stageRef.current, region = regionRef.current, pin = pinRefs.current[current];
    if (!wide || !stage || !region || !pin) { setLeader(null); return; }
    const s = stage.getBoundingClientRect(), r = region.getBoundingClientRect(), p = pin.getBoundingClientRect();
    const x0 = p.left + p.width / 2 - s.left, y0 = p.top + p.height / 2 - s.top;
    const x1 = r.left - s.left, y1 = r.top - s.top + Math.min(48, r.height / 2);
    const dist = Math.hypot(x1 - x0, y1 - y0) || 1, off = p.width / 2 + 8;
    setLeader({ x0: x0 + ((x1 - x0) / dist) * off, y0: y0 + ((y1 - y0) / dist) * off, x1, y1 });
  }, [current, wide]);
  React.useLayoutEffect(() => {
    measure();
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [measure, diameter]);

  // สลับการ์ด
  React.useLayoutEffect(() => {
    if (reduced) return;
    cardRef.current?.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: SWAP_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  }, [current, reduced]);

  const go = (i: number) => setActive(((i % count) + count) % count);
  const press = (i: number) => {
    if (pinned && i === current) { setPinned(false); return; }
    go(i); setPinned(true);
  };
  const onPinKey = (i: number, e: React.KeyboardEvent) => {
    let n: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % count;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + count) % count;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = count - 1;
    else return;
    e.preventDefault();
    go(n);
    pinRefs.current[n]?.focus({ preventScroll: true });
  };
  const btn = "grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <section
      {...rest}
      ref={rootRef}
      data-slot="province-map-showcase"
      data-layout={wide ? "wide" : "stacked"}
      data-active={current}
      data-autoplay={running ? "running" : "held"}
      className={cx("relative isolate w-full text-foreground", className)}
      onFocus={(e) => { if ((e.target as HTMLElement).matches(":focus-visible")) setKeyboard(true); }}
      onBlur={(e) => { const n = e.relatedTarget as Node | null; if (!n || !e.currentTarget.contains(n)) setKeyboard(false); }}
    >
      <style>{"@keyframes pms-progress { from { width: 0 } to { width: 100% } }"}</style>
      <div
        ref={stageRef}
        className={cx("relative mx-auto w-full", wide ? "grid items-center gap-y-6" : "flex flex-col items-center gap-5")}
        style={{ maxWidth: MAX_CONTENT, paddingInline: pad, ...(wide ? { gridTemplateColumns: `${diameter}px minmax(0, 36rem)`, columnGap: gap, justifyContent: "center" } : {}) }}
      >
        {header && <header className={cx("flex min-w-0 flex-col", wide ? "col-start-2 row-start-1 items-start self-end text-left" : "w-full items-start text-left")}>{header}</header>}

        {/* แผนที่ + หมุด */}
        <div data-map-box className={cx("relative shrink-0 select-none", wide && "col-start-1 row-span-2 row-start-1 self-center")} style={{ width: diameter, height: diameter }}>
          <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            <defs>
              <g id="pms-shape">{map.districts.map((d) => <path key={d.code} d={d.d} />)}</g>
              <filter id="pms-shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="14" /></filter>
            </defs>
            <g transform={`translate(${ox} ${oy}) scale(${mapW / map.width})`}>
              {/* เงา + ความหนา (แบบแผนที่นูน) */}
              <use href="#pms-shape" transform="translate(0 58)" fill="#0f1b30" opacity="0.22" filter="url(#pms-shadow)" />
              {[30, 24, 18, 12, 6].map((y) => <use key={y} href="#pms-shape" transform={`translate(0 ${y})`} fill="#aab3c5" stroke="#aab3c5" strokeWidth="2" />)}
              {map.districts.map((d) => {
                const on = all || lit.has(d.code);
                return <path key={d.code} d={d.d} className="transition-[fill] duration-500 motion-reduce:transition-none" fill={on ? (all ? "#f6ecd2" : "#f3d38b") : "#ffffff"} stroke={d.code === hub ? "#142b4e" : "#c9d1e0"} strokeWidth={d.code === hub ? 5 : 2.5} strokeLinejoin="round" />;
              })}
              {/* ขอบอำเภอศูนย์กลางวาดทับอีกชั้นให้ไม่ถูกเพื่อนบ้านบัง */}
              {hubD && <path d={hubD.d} fill="none" stroke="#142b4e" strokeWidth="5" strokeLinejoin="round" />}
              {map.districts.filter((d) => d.code === hub || (!all && lit.has(d.code))).map((d) => (
                <text key={d.code} x={d.cx} y={d.cy + (d.code === hub ? 62 : 54)} textAnchor="middle" fontSize="40" fontWeight="600" fill="#142b4e" stroke="#fff" strokeWidth="9" paintOrder="stroke">{d.code === hub ? hubLabel ?? d.name : d.name}</text>
              ))}
            </g>
            {/* เส้นจากศูนย์กลางไปยังหมุด */}
            {ring.map((p, i) => (
              <line key={items[i]!.id} x1={hubPt.x} y1={hubPt.y} x2={p.x} y2={p.y} stroke={i === current ? STROKE[tone(i)] : "#142b4e"} strokeOpacity={i === current ? 0.9 : 0.14} strokeWidth={i === current ? 4 : 2} strokeDasharray={i === current ? "10 9" : undefined} strokeLinecap="round" className="transition-[stroke-opacity] duration-300">
                {i === current && !reduced && <animate attributeName="stroke-dashoffset" from="38" to="0" dur="1.2s" repeatCount="indefinite" />}
              </line>
            ))}
            <circle cx={hubPt.x} cy={hubPt.y} r="26" fill="#142b4e" opacity="0.16">{!reduced && <animate attributeName="r" values="18;34;18" dur="2.6s" repeatCount="indefinite" />}</circle>
            <circle cx={hubPt.x} cy={hubPt.y} r="13" fill="#142b4e" stroke="#f3d38b" strokeWidth="5" />
          </svg>

          {items.map((it, i) => {
            const p = ring[i]!, on = i === current;
            return (
              <button
                key={it.id}
                ref={(el) => { pinRefs.current[i] = el; }}
                type="button"
                data-pin={i}
                aria-label={`${text.pin} ${it.title}`}
                aria-current={on ? "true" : undefined}
                aria-pressed={on && pinned}
                tabIndex={on ? 0 : -1}
                className="group/pin absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none"
                style={{ left: `${p.x / 10}%`, top: `${p.y / 10}%`, width: pinSize, height: pinSize, zIndex: on ? 3 : 1 }}
                onClick={() => press(i)}
                onPointerEnter={(e) => { if (e.pointerType !== "touch") { go(i); setPinned(true); } }}
                onKeyDown={(e) => onPinKey(i, e)}
                onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) go(i); }}
              >
                {on && <span aria-hidden="true" className={cx("pointer-events-none absolute inset-0 rounded-full opacity-40 animate-ping [animation-duration:2.4s] motion-reduce:hidden", RING[tone(i)])} />}
                <span className={cx("relative grid size-full place-items-center rounded-full font-semibold text-white shadow-md ring-2 ring-white transition-[scale,box-shadow] duration-200 ease-out motion-reduce:transition-none group-focus-visible/pin:outline-2 group-focus-visible/pin:outline-offset-4 group-focus-visible/pin:outline-foreground", RING[tone(i)], on ? "scale-[1.28] shadow-lg" : "opacity-85 group-hover/pin:opacity-100")} style={{ fontSize: pinSize * 0.42 }}>{it.pin}</span>
              </button>
            );
          })}
        </div>

        {/* การ์ด */}
        <div className={cx("relative w-full min-w-0", wide ? "col-start-2 row-start-2 self-start" : "max-w-xl")}>
          <div
            ref={regionRef}
            data-card-region
            aria-live={running ? "off" : "polite"}
            aria-atomic="true"
            className="grid touch-pan-y"
            onPointerDown={(e) => { if (e.pointerType !== "mouse") swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; }}
            onPointerUp={(e) => {
              const s = swipe.current;
              if (!s || s.id !== e.pointerId) return;
              swipe.current = null;
              const dx = e.clientX - s.x, dy = e.clientY - s.y;
              if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) { go(current + (dx < 0 ? 1 : -1)); setPinned(true); }
            }}
            onPointerCancel={() => { swipe.current = null; }}
          >
            {/* การ์ดล่องหนทุกใบกำหนดความสูงของพื้นที่ ทำให้สลับแล้วหน้าไม่กระโดด */}
            {items.map((it, i) => <div key={`sizer-${it.id}`} aria-hidden="true" inert className="invisible col-start-1 row-start-1 min-w-0">{renderCard(i, roomy)}</div>)}
            <div ref={cardRef} key={item?.id} data-card className="col-start-1 row-start-1 min-w-0">{renderCard(current, roomy)}</div>
          </div>
          {count > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {items.map((it, i) => i === current
                  ? <span key={it.id} className="relative h-1.5 w-8 overflow-hidden rounded-full bg-border">{<span key={`${current}-${running}`} className={cx("absolute inset-y-0 left-0 rounded-full", RING[tone(i)])} style={running ? { animation: `pms-progress ${interval}ms linear forwards` } : { width: "100%" }} />}</span>
                  : <span key={it.id} className="h-1.5 w-1.5 rounded-full bg-border" />)}
              </div>
              <div className="flex items-center gap-0.5">
                <button type="button" aria-label={text.previous} className={btn} onClick={() => { go(current - 1); setPinned(true); }}><ChevronLeft className="size-4" aria-hidden="true" /></button>
                <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">{current + 1} / {count}</span>
                <button type="button" aria-label={text.next} className={btn} onClick={() => { go(current + 1); setPinned(true); }}><ChevronRight className="size-4" aria-hidden="true" /></button>
              </div>
            </div>
          )}
        </div>

        {wide && leader && (
          <svg aria-hidden="true" data-leader className="pointer-events-none absolute left-0 top-0 z-[2] size-px overflow-visible">
            <line x1={leader.x0} y1={leader.y0} x2={leader.x1} y2={leader.y1} stroke={STROKE[tone(current)]} strokeOpacity="0.55" strokeWidth="1.5" />
            <circle cx={leader.x1} cy={leader.y1} r="4" fill="#fff" stroke={STROKE[tone(current)]} strokeWidth="1.5" />
          </svg>
        )}
      </div>
    </section>
  );
}

export default ProvinceMapShowcase;
