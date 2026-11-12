/**
 * Motion ของหน้า Welcome เท่านั้น (แยกจากเนื้อหาและ business logic)
 * อ้างอิงเวลา/ลำดับ: docs/design/ANIMATION-SPEC.md
 * - ไม่มีการดักการเลื่อนหน้า (no scroll-jacking) — เปลี่ยนฉากด้วยปุ่ม คีย์บอร์ด หรือปัดแนวนอนเท่านั้น
 * - prefers-reduced-motion: เปลี่ยนฉากทันที ไม่มี parallax/reveal และปิด autoplay
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/* ------------------------------------------------------------------ Carousel */
const LEAVE_MS = 620;
const ENTER_MS = 2200;

export interface CarouselState {
  index: number;
  leaving: number | null;
  entering: number | null;
  dir: 1 | -1;
}

export function useSceneCarousel(count: number, reduced: boolean) {
  const [state, setState] = useState<CarouselState>({ index: 0, leaving: null, entering: null, dir: 1 });
  const timers = useRef<number[]>([]);
  const indexRef = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const go = useCallback(
    (target: number, direction?: 1 | -1) => {
      const from = indexRef.current;
      const to = ((target % count) + count) % count;
      if (to === from) return;
      let dir = direction;
      if (dir == null) {
        const fwd = (((to - from) % count) + count) % count;
        dir = fwd <= count - fwd ? 1 : -1;
      }
      timers.current.forEach(clearTimeout);
      timers.current = [];
      indexRef.current = to;
      if (reduced) {
        setState({ index: to, leaving: null, entering: null, dir });
        return;
      }
      setState({ index: to, leaving: from, entering: to, dir });
      timers.current.push(
        window.setTimeout(() => setState((s) => ({ ...s, leaving: null })), LEAVE_MS),
        window.setTimeout(() => setState((s) => ({ ...s, entering: null })), ENTER_MS),
      );
    },
    [count, reduced],
  );

  const step = useCallback((d: 1 | -1) => go(indexRef.current + d, d), [go]);

  return { ...state, go, step };
}

/** ปัดนิ้ว/ลากเมาส์แนวนอน (แนวตั้งปล่อยให้เลื่อนหน้าได้ตามปกติ) */
export function useSwipe(onSwipe: (d: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("a, button, [role=tablist]")) return;
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) onSwipe(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

/* ------------------------------------------------------------------ Arc band */
// แถบโค้งหลังฉาก: ยืดตามแนววงโคจรตอนเปลี่ยนฉาก แล้วหดกลับไปยังตำแหน่งของฉากใหม่
const ARC = {
  cx: 420,
  cy: -430,
  r: 760,
  w: 150,
  rest: [[52, 100], [46, 124], [60, 128], [40, 102], [56, 118]] as const,
  sweep: [36, 148] as const,
};

export function arcPath(a0: number, a1: number): string {
  const outer: string[] = [];
  const inner: string[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
    const h = (ARC.w / 2) * Math.pow(Math.sin(Math.PI * t), 0.45);
    const c = Math.cos(a);
    const s = Math.sin(a);
    outer.push(`${(ARC.cx + c * (ARC.r + h)).toFixed(1)} ${(ARC.cy + s * (ARC.r + h)).toFixed(1)}`);
    inner.push(`${(ARC.cx + c * (ARC.r - h)).toFixed(1)} ${(ARC.cy + s * (ARC.r - h)).toFixed(1)}`);
  }
  return `M${outer.join("L")}L${inner.reverse().join("L")}Z`;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function useArcBand(pathRef: RefObject<SVGPathElement | null>, index: number, reduced: boolean) {
  const state = useRef({ a0: ARC.rest[0][0] as number, a1: ARC.rest[0][1] as number });
  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const rest = ARC.rest[index % ARC.rest.length]!;
    const draw = () => el.setAttribute("d", arcPath(state.current.a0, state.current.a1));
    if (reduced) {
      state.current = { a0: rest[0], a1: rest[1] };
      draw();
      return;
    }
    const from = { ...state.current };
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const ms = now - t0;
      if (ms < 600) {
        const t = easeInOut(ms / 600);
        state.current.a0 = from.a0 + (ARC.sweep[0] - from.a0) * t;
        state.current.a1 = from.a1 + (ARC.sweep[1] - from.a1) * t;
      } else {
        const t = easeOut(Math.min((ms - 600) / 850, 1));
        state.current.a0 = ARC.sweep[0] + (rest[0] - ARC.sweep[0]) * t;
        state.current.a1 = ARC.sweep[1] + (rest[1] - ARC.sweep[1]) * t;
      }
      draw();
      if (ms < 1450) raf = requestAnimationFrame(tick);
    };
    // ฉากแรกตอนโหลด: วาดที่ตำแหน่งพักทันที
    if (from.a0 === rest[0] && from.a1 === rest[1]) draw();
    else raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pathRef, index, reduced]);
}

/* ------------------------------------------------------------------ Parallax */
export function useParallax(ref: RefObject<HTMLElement | null>, reduced: boolean) {
  useEffect(() => {
    const hero = ref.current;
    if (!hero || reduced) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      raf = 0;
      hero.style.setProperty("--px", px.toFixed(3));
      hero.style.setProperty("--py", py.toFixed(3));
      hero.style.setProperty("--sy", String(Math.min(window.scrollY, hero.offsetHeight)));
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top) / r.height - 0.5;
      queue();
    };
    const onLeave = () => {
      px = py = 0;
      queue();
    };
    // เฉพาะอุปกรณ์ที่มีเมาส์ (ไม่ทำบนจอสัมผัส เพื่อประหยัดแบตเตอรี่)
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (fine) {
      hero.addEventListener("pointermove", onMove);
      hero.addEventListener("pointerleave", onLeave);
    }
    window.addEventListener("scroll", queue, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", queue);
      hero.style.removeProperty("--px");
      hero.style.removeProperty("--py");
      hero.style.removeProperty("--sy");
    };
  }, [ref, reduced]);
}

/* ------------------------------------------------------------- Scroll reveal */
export function useReveal(ref: RefObject<HTMLElement | null>, reduced: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    items.forEach((el, i) => el.style.setProperty("--i", String(i)));
    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-visible");
            io.unobserve(en.target);
          }
        }),
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ref, reduced]);
}
