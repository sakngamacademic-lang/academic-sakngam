import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { BrandMark } from "./WelcomePage";
import { VisitRail } from "./VisitRail";
import { LocalCurriculum } from "./local/LocalCurriculum";
import { PlanLinks } from "./plans/PlanLinks";
import { usePublicVisit } from "./visit-api";
import { isMissing } from "@/features/curriculum/categories/api";
import "./welcome.css";

/**
 * หน้าเยี่ยมชมข้อมูล (สาธารณะ · ไม่ต้องเข้าสู่ระบบ · อ่านอย่างเดียว)
 * แสดงเฉพาะข้อมูลที่ผู้ดูแลหลักสูตร "อนุมัติให้เผยแพร่" (public_releases) — แยกจากสถานะยืนยันความถูกต้อง
 * ไม่มีข้อมูลสมมติ ไม่มีปุ่มแก้ไข · โหมดนำเสนอขยายตัวอักษรสำหรับจอโปรเจกเตอร์
 */
export function VisitPage() {
  const q = usePublicVisit();
  const [present, setPresent] = useState(false);
  useEffect(() => { document.title = "เยี่ยมชมข้อมูลหลักสูตร · Sak Ngam Academic"; }, []);
  useEffect(() => {
    const off = () => !document.fullscreenElement && setPresent(false);
    document.addEventListener("fullscreenchange", off);
    return () => document.removeEventListener("fullscreenchange", off);
  }, []);
  const toggle = async () => {
    if (present) { setPresent(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; }
    setPresent(true);
    await document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className={`welcome visit${present ? " is-present" : ""}`}>
      <a className="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Sak Ngam Academic หน้าแรก">
          <BrandMark />
          <span className="brand__text">
            <span className="brand__name">Sak Ngam Academic</span>
            <span className="brand__sub">เยี่ยมชมข้อมูล</span>
          </span>
        </Link>
        <div className="topbar__end">
          <button type="button" className="btn btn--ghost btn--sm" aria-pressed={present} onClick={toggle}>
            {present ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}<span className="visit__hideSm">{present ? "ออกจากโหมดนำเสนอ" : "โหมดนำเสนอ"}</span>
          </button>
          <Link className="btn btn--ghost btn--sm" to="/"><ArrowLeft aria-hidden="true" /><span className="visit__hideSm">หน้าแรก</span></Link>
        </div>
      </header>

      <main id="main">
        <section className="section" aria-labelledby="visit-title">
          <p className="label">เยี่ยมชมข้อมูล · ไม่ต้องเข้าสู่ระบบ</p>
          <h1 className="section__title visit__title" id="visit-title">หลักสูตรสถานศึกษา <em>โรงเรียนสักงามวิทยา</em></h1>
          <p className="visit__lede">แสดงเฉพาะข้อมูลที่ฝ่ายวิชาการอนุมัติให้เผยแพร่ · อ่านอย่างเดียว</p>
        </section>

        {q.isPending ? <p className="section visit__muted"><Loader2 className="visit__lock visit__spin" aria-hidden="true" /> กำลังโหลดข้อมูล…</p>
          : q.isError || !q.data ? (
            <div className="section"><p className="visit__muted visit__empty">
              {q.isError && isMissing(q.error)
                ? "หน้าเยี่ยมชมยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้ — รอผู้ดูแลระบบติดตั้งระบบอนุมัติเผยแพร่ (migration 20261208000100)"
                : "ยังโหลดข้อมูลที่เผยแพร่ไม่ได้ — ลองใหม่ภายหลัง"}
            </p></div>
          )
          : (
            <>
              <div className="section visit__rail"><VisitRail data={q.data} /></div>
            </>
          )}
        {/* หลักสูตรท้องถิ่น: ข้อมูลจากไฟล์ JSON (ไม่ขึ้นกับฐานข้อมูล) */}
        <div className="section" id="local"><LocalCurriculum /></div>
        {/* จากหลักสูตรสู่แผนการสอน: ข้อมูลจาก plan-links.json · ลิงก์แผน = เอกสารที่อนุมัติเผยแพร่แล้วเท่านั้น */}
        <div className="section" id="plans"><PlanLinks visit={q.data} /></div>
      </main>

      <footer className="footnote">
        ข้อมูลจากฐานข้อมูลหลักสูตรของโรงเรียน เฉพาะรายการที่อนุมัติให้เผยแพร่ · ไม่แสดงข้อมูลส่วนบุคคลหรือข้อมูลภายใน
      </footer>
    </div>
  );
}

export default VisitPage;
