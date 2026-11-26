import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { defaultPortalPath } from "@/features/auth/roles";
import "./welcome.css";

/**
 * หน้าแรก (public) — เรียบที่สุด: ชื่อระบบ + 2 ปุ่ม (เข้าสู่ระบบงานวิชาการ / เยี่ยมชมข้อมูล)
 * ปลายทางปุ่มเข้าสู่ระบบใช้ Auth Flow เดิม:
 * - ยังไม่ login → /login
 * - login แล้วและโหลดสิทธิ์เสร็จ → defaultPortalPath(roles) (ไม่มีบทบาท → /no-access)
 * ผู้ใช้ไม่ได้เลือกบทบาทเอง และ Route Guard ของปลายทางยังทำงานตามเดิม · หน้านี้ไม่ดึงข้อมูลจากฐานข้อมูล
 */
function useCtaTarget(): { to: string; signedIn: boolean } {
  const { status, access, roles } = useAuth();
  if (status === "signed_in" && access && access.account_status === "active") {
    return { to: defaultPortalPath(roles) ?? "/no-access", signedIn: true };
  }
  return { to: "/login", signedIn: false };
}

function AuthCta({ className, children }: { className: string; children: ReactNode }) {
  const { to, signedIn } = useCtaTarget();
  return (
    <Link className={className} to={to} data-auth-cta="" aria-description={signedIn ? "คุณเข้าสู่ระบบอยู่แล้ว ระบบจะพาไปยังพื้นที่ทำงานของคุณ" : undefined}>
      {children}
    </Link>
  );
}

export function BrandMark() {
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
  useEffect(() => {
    document.title = "Sak Ngam Academic · ระบบบริหารงานวิชาการ โรงเรียนสักงามวิทยา";
  }, []);

  return (
    <div className="welcome">
      <a className="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Sak Ngam Academic หน้าแรก">
          <BrandMark />
          <span className="brand__text">
            <span className="brand__name">Sak Ngam Academic</span>
            <span className="brand__sub">โรงเรียนสักงามวิทยา</span>
          </span>
        </Link>
      </header>

      <main id="main" className="home">
        <div className="hero__bg" aria-hidden="true">
          <div className="bg-layer bg-grid" />
          <div className="bg-layer bg-orb bg-orb--a" />
          <div className="bg-layer bg-orb bg-orb--b" />
        </div>
        <div className="home__inner">
          <h1 className="home__title">
            <span className="home__t1">ระบบบริหาร</span>
            <span className="home__t2">งานวิชาการ</span>
          </h1>
          <p className="home__sub">โรงเรียนสักงามวิทยา</p>
          <div className="home__actions">
            <AuthCta className="btn btn--primary btn--lg">
              <span>เข้าสู่ระบบงานวิชาการ</span>
              <ArrowRight aria-hidden="true" />
            </AuthCta>
            <Link className="btn btn--ghost btn--lg" to="/visit" data-visit-cta="">เยี่ยมชมข้อมูล</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default WelcomePage;
