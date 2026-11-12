/* =============================================================================
   Sak Ngam Academic — Mockup interactions (vanilla JS, ไม่มี dependency)
   - Charts      : สร้าง SVG จาก data-chart / data-values (ข้อมูลจำลอง)
   - Carousel    : ลูกศร, thumbnail, vertical indicator, คีย์บอร์ด, ปัดนิ้ว, autoplay
   - Parallax    : ตามเมาส์ + ตามการเลื่อน (ปิดเมื่อ prefers-reduced-motion)
   - Reveal      : IntersectionObserver
   - Tabs        : แท็บใน Floating panel
   ไม่มีการเรียก API หรือฐานข้อมูลใด ๆ
   ============================================================================= */
(() => {
  "use strict";

  const doc = document;
  doc.documentElement.classList.add("js");
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motionQuery.matches;
  const $$ = (sel, root = doc) => Array.from(root.querySelectorAll(sel));
  const fmt = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });

  /* ------------------------------------------------------------------ Charts */
  const PALETTE = ["var(--accent)", "var(--cyan)", "var(--mint)", "var(--indigo)", "var(--amber)", "var(--rose)", "var(--violet)", "var(--text-3)"];
  const list = (el, key) => (el.dataset[key] || "").split("|").map((s) => s.trim()).filter(Boolean);
  const nums = (el) => (el.dataset.values || "").split(",").map(Number);
  const colors = (el, n) => {
    const own = list(el, "colors");
    return Array.from({ length: n }, (_, i) => own[i] || PALETTE[i % PALETTE.length]);
  };
  const svg = (vb, label, body) =>
    `<svg viewBox="${vb}" role="img" aria-label="${label}" focusable="false">${body}</svg>`;

  const Charts = {
    /** วงแหวนซ้อน: ค่าร้อยละหลายตัว */
    rings(el, mini) {
      const v = nums(el), c = colors(el, v.length);
      const sw = mini ? 22 : 15, gap = mini ? 30 : 26;
      let out = "";
      v.forEach((val, i) => {
        const r = 140 - i * gap;
        out += `<circle class="trk" cx="160" cy="160" r="${r}" stroke-width="${sw}"/>` +
          `<circle class="seg" cx="160" cy="160" r="${r}" stroke-width="${sw}" stroke="${c[i]}" pathLength="100" ` +
          `stroke-dasharray="${val} 100" transform="rotate(-90 160 160)"/>`;
      });
      if (!mini) {
        out += `<text x="160" y="158" text-anchor="middle" font-size="46" font-weight="700">${fmt.format(v[0])}%</text>` +
          `<text class="muted" x="160" y="186" text-anchor="middle" font-size="15">${el.dataset.center || ""}</text>`;
      }
      return svg("0 0 320 320", el.dataset.label || "", out);
    },

    /** โดนัท: สัดส่วนของทั้งหมด */
    donut(el, mini) {
      const v = nums(el), c = colors(el, v.length);
      const total = v.reduce((a, b) => a + b, 0) || 1;
      const sw = mini ? 46 : 34, gap = v.length > 1 ? 1.2 : 0;
      let acc = 0, out = `<circle class="trk" cx="160" cy="160" r="118" stroke-width="${sw}"/>`;
      v.forEach((val, i) => {
        const pct = (val / total) * 100;
        out += `<circle class="seg seg--butt" cx="160" cy="160" r="118" stroke-width="${sw}" stroke="${c[i]}" pathLength="100" ` +
          `stroke-dasharray="${Math.max(pct - gap, 0.5)} 100" stroke-dashoffset="${-acc}" transform="rotate(-90 160 160)"/>`;
        acc += pct;
      });
      if (!mini) {
        out += `<text x="160" y="162" text-anchor="middle" font-size="50" font-weight="700">${el.dataset.total || fmt.format(total)}</text>` +
          `<text class="muted" x="160" y="190" text-anchor="middle" font-size="15">${el.dataset.center || ""}</text>`;
      }
      return svg("0 0 320 320", el.dataset.label || "", out);
    },

    /** แท่ง: การกระจาย/เปรียบเทียบ */
    bars(el, mini) {
      const v = nums(el), c = colors(el, v.length), labels = list(el, "labels");
      const max = Math.max(...v, 1), W = 320, H = mini ? 320 : 250, base = mini ? 270 : 196, top = mini ? 50 : 30;
      const slot = (W - 40) / v.length, bw = Math.min(slot * 0.62, 44);
      const single = !el.dataset.colors;
      let out = mini ? "" : `<line class="grid" x1="20" x2="300" y1="${base}" y2="${base}"/>`;
      v.forEach((val, i) => {
        const h = ((base - top) * val) / max, x = 20 + slot * i + (slot - bw) / 2;
        out += `<rect class="bar" style="--i:${i}" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(bw / 2, 10)}" ` +
          `fill="${single ? "var(--accent)" : c[i]}" opacity="${single ? (0.45 + 0.55 * (val / max)).toFixed(2) : 1}"/>`;
        if (!mini) {
          out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(base - h - 8).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="600">${fmt.format(val)}</text>` +
            `<text class="muted" x="${(x + bw / 2).toFixed(1)}" y="${base + 22}" text-anchor="middle" font-size="13">${labels[i] || ""}</text>`;
        }
      });
      return svg(`0 0 ${W} ${H}`, el.dataset.label || "", out);
    },

    /** เส้น: แนวโน้มตามเวลา */
    line(el, mini) {
      const v = nums(el), labels = list(el, "labels");
      const W = 320, H = mini ? 320 : 170, top = mini ? 90 : 22, base = mini ? 230 : 128;
      const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
      const pts = v.map((val, i) => [20 + (280 * i) / Math.max(v.length - 1, 1), base - ((base - top) * (val - min)) / span]);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
      const id = "lg" + Math.random().toString(36).slice(2, 8);
      let out = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".38"/>` +
        `<stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>` +
        `<path d="${d}L300 ${base}L20 ${base}Z" fill="url(#${id})"/>` +
        `<path class="seg" d="${d}" stroke="var(--accent)" stroke-width="${mini ? 14 : 3}" pathLength="100" stroke-dasharray="100 100" stroke-linejoin="round"/>`;
      if (!mini) {
        pts.forEach((p, i) => {
          out += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="var(--bg-1)" stroke="var(--accent)" stroke-width="2"/>` +
            `<text x="${p[0].toFixed(1)}" y="${(p[1] - 11).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600">${fmt.format(v[i])}</text>` +
            `<text class="muted" x="${p[0].toFixed(1)}" y="${base + 24}" text-anchor="middle" font-size="12">${labels[i] || ""}</text>`;
        });
      }
      return svg(`0 0 ${W} ${H}`, el.dataset.label || "", out);
    },

    /** เกจครึ่งวง: ค่าร้อยละเดียว */
    gauge(el, mini) {
      const val = nums(el)[0] || 0, sw = mini ? 34 : 22;
      const arc = "M40 190A120 120 0 0 1 280 190";
      let out = `<path class="trk" d="${arc}" stroke-width="${sw}" stroke-linecap="round"/>` +
        `<path class="seg" d="${arc}" stroke="var(--accent)" stroke-width="${sw}" pathLength="100" stroke-dasharray="${val} 100"/>`;
      if (!mini) {
        out += `<text x="160" y="176" text-anchor="middle" font-size="54" font-weight="700">${fmt.format(val)}%</text>` +
          `<text class="muted" x="160" y="206" text-anchor="middle" font-size="15">${el.dataset.center || ""}</text>`;
      }
      return svg(mini ? "0 30 320 200" : "0 40 320 190", el.dataset.label || "", out);
    },
  };

  function renderCharts(root = doc) {
    $$(".chart[data-chart]", root).forEach((el) => {
      const draw = Charts[el.dataset.chart];
      if (draw) el.innerHTML = draw(el, el.hasAttribute("data-mini"));
    });
  }

  /* ---------------------------------------------------------------- Count-up */
  function countUp(root) {
    $$("[data-count]", root).forEach((el) => {
      const target = Number(el.dataset.count), unit = el.dataset.unit ? `<small>${el.dataset.unit}</small>` : "";
      const digits = (el.dataset.count.split(".")[1] || "").length;
      const show = (n) => (el.innerHTML = n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + unit);
      if (reduced()) return show(target);
      const t0 = performance.now(), dur = 900, delay = 750;
      show(0);
      const tick = (now) => {
        const t = Math.min(Math.max((now - t0 - delay) / dur, 0), 1);
        show(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1 && el.isConnected) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ---------------------------------------------------------------- Arc band */
  // แถบโค้งหลังฉาก: ยืดตามแนววงโคจรตอนเปลี่ยนฉาก แล้วหดกลับไปยังตำแหน่งของฉากใหม่
  const ARC = { cx: 420, cy: -430, r: 760, w: 150, rest: [[52, 100], [46, 124], [60, 128], [40, 102], [56, 118]], sweep: [36, 148] };
  function arcPath(a0, a1) {
    const outer = [], inner = [], steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
      const h = (ARC.w / 2) * Math.pow(Math.sin(Math.PI * t), 0.45), c = Math.cos(a), s = Math.sin(a);
      outer.push((ARC.cx + c * (ARC.r + h)).toFixed(1) + " " + (ARC.cy + s * (ARC.r + h)).toFixed(1));
      inner.push((ARC.cx + c * (ARC.r - h)).toFixed(1) + " " + (ARC.cy + s * (ARC.r - h)).toFixed(1));
    }
    return "M" + outer.join("L") + "L" + inner.reverse().join("L") + "Z";
  }
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* ---------------------------------------------------------------- Carousel */
  function initCarousel(hero) {
    const scenes = $$(".scene", hero);
    const n = scenes.length;
    if (!n) return;
    const dots = $$(".pager__dot", hero);
    const thumbs = $$(".thumb", hero);
    const segs = $$(".progress__seg", hero);
    const win = hero.querySelector(".strip__win");
    const status = hero.querySelector("[data-status]");
    const countNow = hero.querySelector("[data-count-now]");
    const toggle = hero.querySelector(".progress__toggle");
    const arcEl = hero.querySelector(".bg-arc path");
    const navLinks = $$("[data-goto]");
    let index = 0, timers = [], arcState = { a0: ARC.rest[0][0], a1: ARC.rest[0][1] }, arcRaf = 0;

    // ดัชนีสำหรับ stagger
    scenes.forEach((s) => {
      $$(".kpi", s).forEach((el, i) => el.style.setProperty("--i", i));
      $$(".panel__body", s).forEach((b) => Array.from(b.children).forEach((el, i) => el.style.setProperty("--i", i)));
    });

    const drawArc = () => arcEl && arcEl.setAttribute("d", arcPath(arcState.a0, arcState.a1));
    function tweenArc(to) {
      cancelAnimationFrame(arcRaf);
      const rest = ARC.rest[to % ARC.rest.length];
      if (reduced() || !arcEl) {
        arcState = { a0: rest[0], a1: rest[1] };
        return drawArc();
      }
      const from = { ...arcState }, t0 = performance.now();
      const step = (now) => {
        const ms = now - t0;
        if (ms < 600) {
          const t = easeInOut(ms / 600);
          arcState.a0 = from.a0 + (ARC.sweep[0] - from.a0) * t;
          arcState.a1 = from.a1 + (ARC.sweep[1] - from.a1) * t;
        } else {
          const t = easeOut(Math.min((ms - 600) / 850, 1));
          arcState.a0 = ARC.sweep[0] + (rest[0] - ARC.sweep[0]) * t;
          arcState.a1 = ARC.sweep[1] + (rest[1] - ARC.sweep[1]) * t;
        }
        drawArc();
        if (ms < 1450) arcRaf = requestAnimationFrame(step);
      };
      arcRaf = requestAnimationFrame(step);
    }

    function sync() {
      const scene = scenes[index];
      doc.body.style.setProperty("--accent", scene.dataset.accent || "#8b7cf6");
      scenes.forEach((s, i) => {
        s.toggleAttribute("inert", i !== index);
        s.setAttribute("aria-hidden", i !== index ? "true" : "false");
      });
      dots.forEach((d, i) => d.setAttribute("aria-current", i === index ? "true" : "false"));
      thumbs.forEach((t, i) => t.setAttribute("aria-current", i === index ? "true" : "false"));
      navLinks.forEach((a) => a.setAttribute("aria-current", Number(a.dataset.goto) === index ? "true" : "false"));
      segs.forEach((s, i) => {
        s.classList.toggle("is-done", i < index);
        s.classList.remove("is-current");
      });
      // รีสตาร์ต animation ของแถบความคืบหน้า
      if (segs[index]) {
        void segs[index].offsetWidth;
        segs[index].classList.add("is-current");
      }
      if (countNow) countNow.textContent = String(index + 1).padStart(2, "0");
      if (status) status.textContent = `ฉากที่ ${index + 1} จาก ${n}: ${scene.dataset.name || ""}`;
      // เลื่อนแถบ thumbnail ให้เห็นฉากปัจจุบัน (เลื่อนเฉพาะแนวนอน ไม่กระทบหน้าเว็บ)
      const th = thumbs[index];
      if (win && th) {
        const left = th.offsetLeft - (win.clientWidth - th.offsetWidth) / 2;
        win.scrollTo({ left: Math.max(left, 0), behavior: reduced() ? "auto" : "smooth" });
      }
    }

    function go(to, dir) {
      to = ((to % n) + n) % n;
      if (to === index) return;
      if (dir == null) {
        const fwd = (((to - index) % n) + n) % n;
        dir = fwd <= n - fwd ? 1 : -1;
      }
      timers.forEach(clearTimeout);
      timers = [];
      scenes.forEach((s) => s.classList.remove("is-leaving", "is-entering"));
      const from = scenes[index], next = scenes[to];
      hero.style.setProperty("--dir", dir);
      from.classList.remove("is-active");
      next.classList.add("is-active");
      if (!reduced()) {
        from.classList.add("is-leaving");
        next.classList.add("is-entering");
        timers.push(setTimeout(() => from.classList.remove("is-leaving"), 620));
        timers.push(setTimeout(() => next.classList.remove("is-entering"), 2200));
      }
      index = to;
      sync();
      tweenArc(to);
      countUp(next);
    }
    const step = (d) => go(index + d, d);

    // ปุ่มลูกศร / thumbnail / indicator / เมนูบน
    hero.querySelector(".strip__arrow--prev")?.addEventListener("click", () => step(-1));
    hero.querySelector(".strip__arrow--next")?.addEventListener("click", () => step(1));
    dots.forEach((d, i) => d.addEventListener("click", () => go(i)));
    thumbs.forEach((t, i) => t.addEventListener("click", () => go(i)));
    navLinks.forEach((a) =>
      a.addEventListener("click", () => {
        go(Number(a.dataset.goto));
        hero.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      }),
    );

    // คีย์บอร์ด: ← → เปลี่ยนฉาก, Home/End ไปฉากแรก/สุดท้าย (ไม่ดักเมื่ออยู่ในแท็บหรือช่องกรอก)
    hero.addEventListener("keydown", (e) => {
      if (e.target.closest('[role="tablist"], input, textarea, select')) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const map = { ArrowRight: () => step(1), ArrowLeft: () => step(-1), Home: () => go(0, -1), End: () => go(n - 1, 1) };
      if (map[e.key]) {
        e.preventDefault();
        map[e.key]();
      }
    });

    // ปัดนิ้ว/ลากเมาส์แนวนอนบน stage (แนวตั้งปล่อยให้เลื่อนหน้าได้ตามปกติ)
    const stage = hero.querySelector(".stage");
    let swipe = null;
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest("a, button, [role=tablist]")) return;
      swipe = { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener("pointerup", (e) => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    });
    stage.addEventListener("pointercancel", () => (swipe = null));

    // Autoplay: ปิดเป็นค่าเริ่มต้น, ผู้ใช้เปิดเอง, หยุดเมื่อ hover/focus, ปิดถาวรเมื่อ reduced motion
    if (toggle) {
      const setAuto = (on) => {
        hero.classList.toggle("is-autoplay", on);
        toggle.setAttribute("aria-pressed", String(on));
        toggle.querySelector("span").textContent = on ? "หยุดเล่นอัตโนมัติ" : "เล่นอัตโนมัติ";
      };
      toggle.addEventListener("click", () => setAuto(!hero.classList.contains("is-autoplay")));
      hero.addEventListener("animationend", (e) => {
        if (e.animationName === "seg-fill" && hero.classList.contains("is-autoplay")) step(1);
      });
      const applyMotionPref = () => {
        toggle.hidden = reduced();
        if (reduced()) setAuto(false);
      };
      motionQuery.addEventListener("change", applyMotionPref);
      applyMotionPref();
    }

    // เริ่มต้น
    scenes[0].classList.add("is-active");
    drawArc();
    sync();
    countUp(scenes[0]);
    hero.__carousel = { go, step, get index() { return index; } };
  }

  /* ---------------------------------------------------------------- Parallax */
  function initParallax(hero) {
    let raf = 0, px = 0, py = 0;
    const apply = () => {
      raf = 0;
      hero.style.setProperty("--px", px.toFixed(3));
      hero.style.setProperty("--py", py.toFixed(3));
      hero.style.setProperty("--sy", String(Math.min(window.scrollY, hero.offsetHeight)));
    };
    const queue = () => {
      if (!raf && !reduced()) raf = requestAnimationFrame(apply);
    };
    // เฉพาะอุปกรณ์ที่มีเมาส์ (ไม่ทำบนจอสัมผัส เพื่อประหยัดแบตเตอรี่)
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      hero.addEventListener("pointermove", (e) => {
        const r = hero.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width - 0.5;
        py = (e.clientY - r.top) / r.height - 0.5;
        queue();
      });
      hero.addEventListener("pointerleave", () => {
        px = py = 0;
        queue();
      });
    }
    window.addEventListener("scroll", queue, { passive: true });
  }

  /* ------------------------------------------------------------ Scroll reveal */
  function initReveal() {
    const items = $$(".reveal");
    $$(".reveal-group").forEach((g) => $$(".reveal", g).forEach((el, i) => el.style.setProperty("--i", i)));
    if (!("IntersectionObserver" in window) || reduced()) return items.forEach((el) => el.classList.add("is-visible"));
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
  }

  /* -------------------------------------------------------------------- Tabs */
  function initTabs() {
    $$('[role="tablist"]').forEach((tl) => {
      const tabs = $$('[role="tab"]', tl);
      const select = (tab, focus) => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute("aria-selected", String(on));
          t.tabIndex = on ? 0 : -1;
          const body = doc.getElementById(t.getAttribute("aria-controls"));
          if (body) body.hidden = !on;
        });
        if (focus) tab.focus();
      };
      tabs.forEach((t, i) => {
        t.addEventListener("click", () => select(t));
        t.addEventListener("keydown", (e) => {
          const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          select(tabs[(i + d + tabs.length) % tabs.length], true);
        });
      });
    });
  }

  /* -------------------------------------------------------------------- Boot */
  renderCharts();
  initTabs();
  $$("[data-carousel]").forEach((hero) => {
    initCarousel(hero);
    initParallax(hero);
  });
  initReveal();
})();
