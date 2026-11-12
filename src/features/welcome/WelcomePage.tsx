import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, FileUp, LayoutGrid, Pause, Play, ShieldCheck, Activity } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { defaultPortalPath } from "@/features/auth/roles";
import { BarsChart, DonutChart, GaugeChart, LineChart, RingsChart } from "@/components/charts/charts";
import { FEATURES, SCENES, type Scene, type SceneChart } from "./scenes";
import { useArcBand, useParallax, useReducedMotion, useReveal, useSceneCarousel, useSwipe } from "./motion";
import "./welcome.css";

/**
 * ปลายทางของปุ่ม "เข้าสู่ระบบงานวิชาการ" — ใช้ Auth Flow เดิม (Phase 1.3) ทั้งหมด
 * - ยังไม่ login → /login
 * - login แล้วและโหลดสิทธิ์เสร็จ → defaultPortalPath(roles) (ไม่มีบทบาท → /no-access)
 * - ระหว่างโหลด → /login ซึ่งจะพาไปตามบทบาทเองเมื่อพร้อม
 * ผู้ใช้ไม่ได้เลือกบทบาทเอง และ Route Guard ของปลายทางยังทำงานตามเดิม
 */
function useCtaTarget(): { to: string; signedIn: boolean } {
  const { status, access, roles } = useAuth();
  if (status === "signed_in" && access && access.account_status === "active") {
    return { to: defaultPortalPath(roles) ?? "/no-access", signedIn: true };
  }
  return { to: "/login", signedIn: false };
}

function AuthCta({ className, children = "เข้าสู่ระบบงานวิชาการ" }: { className: string; children?: ReactNode }) {
  const { to, signedIn } = useCtaTarget();
  return (
    <Link
      className={className}
      to={to}
      data-auth-cta=""
      aria-description={signedIn ? "คุณเข้าสู่ระบบอยู่แล้ว ระบบจะพาไปยังพื้นที่ทำงานของคุณ" : undefined}
    >
      {children}
    </Link>
  );
}

function Chart({ chart, mini }: { chart: SceneChart; mini?: boolean }) {
  switch (chart.kind) {
    case "rings":
      return <RingsChart values={chart.values} center={chart.center} label={chart.label} mini={mini} />;
    case "donut":
      return <DonutChart values={chart.values} center={chart.center} total={chart.total} colors={chart.colors} label={chart.label} mini={mini} />;
    case "bars":
      return <BarsChart values={chart.values} labels={chart.labels} label={chart.label} mini={mini} />;
    case "gauge":
      return <GaugeChart values={chart.values} center={chart.center} label={chart.label} mini={mini} />;
  }
}

function Panel({ scene }: { scene: Scene }) {
  const gid = useId().replace(/:/g, "");
  const p = scene.panel;
  return (
    <aside className="panel" aria-label={p.aria}>
      <h2 className="panel__title">{p.title}</h2>
      <p className="panel__meta">{p.meta}</p>
      {p.kind === "rows" && (
        <div className="rows">
          {p.rows.map((r) => (
            <div className="row" key={r.name}>
              <span className="row__name">{r.name}</span>
              <span className={`tag tag--${r.tone}`}>{r.tag}</span>
              {r.sub && <span className="row__sub">{r.sub}</span>}
            </div>
          ))}
        </div>
      )}
      {p.kind === "steps" && (
        <ol className="steps">
          {p.steps.map((s) => (
            <li key={s.title} className={s.state === "done" ? "is-done" : s.state === "now" ? "is-now" : undefined}>
              <b>{s.title}</b>
              {s.text}
            </li>
          ))}
        </ol>
      )}
      {p.kind === "line" && (
        <div className="chart">
          <LineChart values={p.values} labels={p.labels} label={p.label} gradientId={`lg${gid}`} />
        </div>
      )}
    </aside>
  );
}

const FEATURE_ICON = { office: LayoutGrid, teacher: FileUp, exec: Activity, secure: ShieldCheck } as const;

function BrandMark() {
  return (
    <span className="brand__mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M3 9l9-5 9 5-9 5-9-5z" />
        <path d="M7 11.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5" />
      </svg>
    </span>
  );
}

export function WelcomePage() {
  const reduced = useReducedMotion();
  const n = SCENES.length;
  const { index, leaving, entering, dir, go, step } = useSceneCarousel(n, reduced);
  const [autoplay, setAutoplay] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const arcRef = useRef<SVGPathElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const swipe = useSwipe(step);
  const scene = SCENES[index]!;

  useArcBand(arcRef, index, reduced);
  useParallax(heroRef, reduced);
  useReveal(rootRef, reduced);

  useEffect(() => {
    document.title = "Sak Ngam Academic · ระบบบริหารงานวิชาการ โรงเรียนสักงามวิทยา";
  }, []);

  // ปิด autoplay ถาวรเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว
  useEffect(() => {
    if (reduced) setAutoplay(false);
  }, [reduced]);

  // เลื่อนแถบ thumbnail ให้เห็นฉากปัจจุบัน (แนวนอนเท่านั้น ไม่กระทบหน้าเว็บ)
  useEffect(() => {
    const win = winRef.current;
    const th = thumbRefs.current[index];
    if (win && th) {
      const left = th.offsetLeft - (win.clientWidth - th.offsetWidth) / 2;
      win.scrollTo({ left: Math.max(left, 0), behavior: reduced ? "auto" : "smooth" });
    }
  }, [index, reduced]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('[role="tablist"], input, textarea, select')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const map: Record<string, () => void> = {
      ArrowRight: () => step(1),
      ArrowLeft: () => step(-1),
      Home: () => go(0, -1),
      End: () => go(n - 1, 1),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const gotoFromNav = (i: number) => {
    go(i);
    heroRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="welcome" ref={rootRef} style={{ "--accent": scene.accent } as CSSProperties}>
      <a className="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>

      <header className="topbar">
        <Link className="brand" to="/" aria-label="Sak Ngam Academic หน้าแรก">
          <BrandMark />
          <span className="brand__text">
            <span className="brand__name">Sak Ngam Academic</span>
            <span className="brand__sub">โรงเรียนสักงามวิทยา</span>
          </span>
        </Link>
        <nav className="topnav" aria-label="ความสามารถของระบบ">
          {SCENES.map((s, i) => (
            <button key={s.navLabel} type="button" aria-current={i === index ? "true" : "false"} onClick={() => gotoFromNav(i)}>
              {s.navLabel}
            </button>
          ))}
        </nav>
        <div className="topbar__end">
          <AuthCta className="btn btn--primary btn--sm">
            <span>เข้าสู่ระบบงานวิชาการ</span>
            <ArrowRight aria-hidden="true" />
          </AuthCta>
        </div>
      </header>

      <main id="main">
        <section
          ref={heroRef}
          className={`hero${autoplay ? " is-autoplay" : ""}`}
          style={{ "--dir": dir } as CSSProperties}
          tabIndex={0}
          aria-roledescription="carousel"
          aria-label={`แนะนำความสามารถของระบบ ${n} ฉาก — ใช้ปุ่มลูกศรซ้ายขวาเพื่อเปลี่ยนฉาก`}
          onKeyDown={onKeyDown}
          onAnimationEnd={(e) => {
            if (e.animationName === "seg-fill" && autoplay) step(1);
          }}
        >
          <div className="hero__bg" aria-hidden="true">
            <div className="bg-layer bg-grid" />
            <div className="bg-layer bg-orb bg-orb--a" />
            <div className="bg-layer bg-orb bg-orb--b" />
            <div className="bg-layer bg-arc">
              <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
                <path ref={arcRef} />
              </svg>
            </div>
            <div className="bg-noise" />
          </div>

          <nav className="pager" aria-label="เลือกฉาก">
            {SCENES.map((s, i) => (
              <button key={s.name} type="button" className="pager__dot" aria-label={`ฉากที่ ${i + 1} ${s.name}`} aria-current={i === index ? "true" : "false"} onClick={() => go(i)}>
                <i />
              </button>
            ))}
            <span className="pager__count num" aria-hidden="true">
              <b>{String(index + 1).padStart(2, "0")}</b> / {String(n).padStart(2, "0")}
            </span>
          </nav>

          <div className="stage" {...swipe}>
            {SCENES.map((s, i) => {
              const active = i === index;
              const cls = ["scene", active && "is-active", leaving === i && "is-leaving", entering === i && "is-entering"].filter(Boolean).join(" ");
              const TitleTag = i === 0 ? "h1" : "h2";
              return (
                <article
                  key={s.name}
                  className={cls}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} จาก ${n}`}
                  aria-hidden={active ? "false" : "true"}
                  inert={!active}
                >
                  <div className="scene__visual">
                    <div className="orbit">
                      <div className="orbit__float">
                        <div className={`disc${s.square ? " disc--square" : ""}`}>
                          <div className="chart">
                            <Chart chart={s.chart} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <header className="scene__head">
                    <p className="eyebrow">
                      <b>{String(i + 1).padStart(2, "0")}</b> {s.eyebrow}
                    </p>
                    <TitleTag className="title">
                      <span className="t1" style={{ "--chars": s.title[0].chars } as CSSProperties}>{s.title[0].text}</span>
                      <span className="t2" style={{ "--chars": s.title[1].chars } as CSSProperties}>{s.title[1].text}</span>
                    </TitleTag>
                    <p className="lede">{s.lede}</p>
                  </header>
                  <dl className="kpis">
                    {s.kpis.map((k, ki) => (
                      <div className="kpi" key={k.label} style={{ "--i": ki } as CSSProperties}>
                        <dt>{k.label}</dt>
                        <dd>
                          {k.value}
                          {k.unit && <small>{k.unit}</small>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="scene__actions">
                    <AuthCta className="btn btn--primary btn--lg">
                      <span>เข้าสู่ระบบงานวิชาการ</span>
                    </AuthCta>
                    {s.secondaryCta && (
                      <a className="btn btn--ghost" href="#features">ดูความสามารถ</a>
                    )}
                  </div>
                  <Panel scene={s} />
                </article>
              );
            })}
          </div>

          <div className="strip">
            <button type="button" className="strip__arrow strip__arrow--prev" aria-label="ฉากก่อนหน้า" onClick={() => step(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <div className="strip__win" ref={winRef}>
              <ol className="strip__track">
                {SCENES.map((s, i) => (
                  <li key={s.name}>
                    <button
                      type="button"
                      className="thumb"
                      ref={(el) => {
                        thumbRefs.current[i] = el;
                      }}
                      aria-current={i === index ? "true" : "false"}
                      onClick={() => go(i)}
                    >
                      <span className="thumb__chart" style={{ "--c": s.accent } as CSSProperties}>
                        <span className="chart">
                          <Chart chart={s.mini} mini />
                        </span>
                      </span>
                      <span>
                        <span className="thumb__no num">{String(i + 1).padStart(2, "0")}</span>
                        <span className="thumb__name">{s.thumbName}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <button type="button" className="strip__arrow strip__arrow--next" aria-label="ฉากถัดไป" onClick={() => step(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
            <div className="progress">
              <div className="progress__segs" aria-hidden="true">
                {SCENES.map((s, i) => (
                  <span
                    key={i === index ? `${s.name}-current-${index}` : s.name}
                    className={`progress__seg${i < index ? " is-done" : ""}${i === index ? " is-current" : ""}`}
                  >
                    <i />
                  </span>
                ))}
              </div>
              {!reduced && (
                <button type="button" className="progress__toggle" aria-pressed={autoplay} onClick={() => setAutoplay((a) => !a)}>
                  <Play className="ico-play" fill="currentColor" aria-hidden="true" />
                  <Pause className="ico-pause" fill="currentColor" aria-hidden="true" />
                  <span>{autoplay ? "หยุดเล่นอัตโนมัติ" : "เล่นอัตโนมัติ"}</span>
                </button>
              )}
            </div>
          </div>
          <p className="sr-only" aria-live="polite" data-status="">
            {`ฉากที่ ${index + 1} จาก ${n}: ${scene.name}`}
          </p>
        </section>

        {/* ความสามารถแยกตามผู้ใช้ — สรุปเนื้อหาทุกฉาก อ่านได้โดยไม่ต้องเปลี่ยน slide */}
        <section className="section reveal-group" id="features" aria-labelledby="features-title">
          <div className="section__head reveal">
            <div>
              <p className="label">Features</p>
              <h2 className="section__title" id="features-title">
                <em>ระบบเดียว</em> สำหรับทุกคนในงานวิชาการ
              </h2>
            </div>
          </div>
          <div className="cards">
            {FEATURES.map((f) => {
              const Icon = FEATURE_ICON[f.icon];
              return (
                <div className="card reveal" key={f.title} style={{ "--c": f.color } as CSSProperties}>
                  <span className="card__icon" aria-hidden="true">
                    <Icon strokeWidth={1.8} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              );
            })}
          </div>
          <div className="cta-band reveal">
            <div>
              <h3>พร้อมเริ่มงานแล้วหรือยัง</h3>
              <p>ระบบจะพาไปยังพื้นที่ทำงานตามบทบาทที่ได้รับจากผู้ดูแลระบบ</p>
            </div>
            <AuthCta className="btn btn--primary btn--lg">
              <span>เข้าสู่ระบบงานวิชาการ</span>
            </AuthCta>
          </div>
        </section>
      </main>

      <footer className="footnote">
        แผนภูมิและตัวเลขในหน้านี้เป็นภาพตัวอย่างแสดงความสามารถของระบบ ไม่ใช่ข้อมูลจริงของโรงเรียน — หน้านี้ไม่ดึงข้อมูลใด ๆ จากฐานข้อมูล
      </footer>
    </div>
  );
}

export default WelcomePage;
