import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, ClipboardCheck, FileUp, GitCompareArrows, GraduationCap, LayoutGrid, Lock, ShieldCheck, Target, Users } from "lucide-react";
import { APP_ROLES, ROLE_LABELS, OFFICE_ROLES, type AppRole } from "@/features/auth/roles";
import { VisitCurriculum } from "./VisitCurriculum";
import "./welcome.css";

/**
 * หน้าเยี่ยมชมข้อมูล (public, ไม่ต้องเข้าสู่ระบบ)
 * ⚠️ ไม่ดึงข้อมูลจากฐานข้อมูลเลย — แสดงเฉพาะข้อมูลแนะนำระบบที่เป็นค่าคงที่ในโค้ด
 * ข้อมูลหลักสูตร/ครู/นักเรียนจริงยังต้องเข้าสู่ระบบ และสิทธิ์บังคับด้วย RLS ตามเดิม
 */

const ROLE_DESC: Record<AppRole, string> = {
  system_admin: "จัดการบัญชีผู้ใช้และกำหนดบทบาท (ไม่มีการสมัครเอง)",
  academic_head: "ผู้ดูแลทะเบียนหลักสูตร ตัดสินข้อขัดแย้ง อนุมัติชุดนำเข้า",
  academic_staff: "นำเข้าเอกสาร จัดการงานเอกสารครู ทะเบียนและผลการเรียน",
  learning_area_head: "ตรวจทานและแก้ไขรายวิชาในกลุ่มสาระที่ได้รับมอบหมาย",
  executive: "ดูภาพรวมหลักสูตรและความคืบหน้าแบบอ่านอย่างเดียว",
  teacher: "ดูงานที่ได้รับมอบหมาย ส่งเอกสาร และเขียนแผนการสอน",
};

/** ชื่อกลุ่มสาระการเรียนรู้ 8 กลุ่มตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551 */
const LEARNING_AREAS = [
  "ภาษาไทย", "คณิตศาสตร์", "วิทยาศาสตร์และเทคโนโลยี", "สังคมศึกษา ศาสนา และวัฒนธรรม",
  "สุขศึกษาและพลศึกษา", "ศิลปะ", "การงานอาชีพ", "ภาษาต่างประเทศ",
];

const MODULES = [
  { icon: BookOpen, title: "หลักสูตรสถานศึกษา", text: "ทะเบียนหลักสูตรรายปี โครงสร้างเวลาเรียนแยก ม.ต้น / ม.ปลาย รายวิชาตามแผนการเรียน", color: "var(--violet)" },
  { icon: Target, title: "มาตรฐานและตัวชี้วัด", text: "เชื่อมรายวิชากับมาตรฐานหลักสูตรแกนกลาง พร้อมอ้างอิงหน้าเอกสารต้นฉบับ", color: "var(--cyan)" },
  { icon: GitCompareArrows, title: "เปรียบเทียบหลักสูตร", text: "ดูรายวิชาที่เพิ่ม ลด หรือเปลี่ยนแปลงระหว่างปีหลักสูตร", color: "var(--mint)" },
  { icon: FileUp, title: "งานเอกสารครู", text: "มอบหมายงาน ส่งเอกสาร และตรวจรับพร้อมข้อเสนอแนะ", color: "var(--amber)" },
  { icon: ClipboardCheck, title: "ทะเบียนและผลการเรียน", text: "ข้อมูลครู นักเรียน และทะเบียนผลการเรียน", color: "var(--rose)" },
  { icon: LayoutGrid, title: "รายงานและส่งออก", text: "ส่งออกรายงานเป็น Excel / Word / PDF", color: "var(--indigo)" },
];

const STEPS = [
  "นำเข้าเอกสารหลักสูตรต้นฉบับ (PDF / Excel)",
  "ตรวจทานรายวิชาและข้อมูลที่ไม่ตรงกัน โดยหัวหน้ากลุ่มสาระ",
  "ผู้ดูแลหลักสูตรตัดสินและยืนยันข้อมูล — AI ไม่ตัดสินแทน",
  "ส่งตรวจ อนุมัติ และประกาศใช้ฉบับหลักสูตร พร้อมบันทึกประวัติ",
];

export function VisitPage() {
  return (
    <div className="welcome visit">
      <a className="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Sak Ngam Academic หน้าแรก">
          <span className="brand__mark" aria-hidden="true"><GraduationCap /></span>
          <span className="brand__text">
            <span className="brand__name">Sak Ngam Academic</span>
            <span className="brand__sub">เยี่ยมชมข้อมูล</span>
          </span>
        </Link>
        <div className="topbar__end">
          <Link className="btn btn--ghost btn--sm" to="/"><ArrowLeft aria-hidden="true" /> หน้าแรก</Link>
          <Link className="btn btn--primary btn--sm" to="/login" state={{ from: "/visit" }}><span>เข้าสู่ระบบงานวิชาการ</span><ArrowRight aria-hidden="true" /></Link>
        </div>
      </header>

      <main id="main">
        <section className="section" aria-labelledby="visit-title">
          <p className="label">เยี่ยมชมข้อมูล · ไม่ต้องเข้าสู่ระบบ</p>
          <h1 className="section__title visit__title" id="visit-title">ระบบบริหารงานวิชาการ <em>โรงเรียนสักงามวิทยา</em></h1>
          <p className="visit__lede">หน้านี้แนะนำว่าระบบมีอะไรบ้าง ใครใช้งานส่วนใด และงานหลักสูตรผ่านขั้นตอนอย่างไร คณะกรรมการที่เข้าสู่ระบบด้วยบัญชีที่ได้รับจะเห็นหลักสูตรที่จัดประเภทแล้วแบบอ่านอย่างเดียว ไม่สามารถแก้ไขข้อมูลได้</p>
          <dl className="visit__stats">
            <div><dt>Portal</dt><dd>2 <small>ส่วน</small></dd></div>
            <div><dt>บทบาทผู้ใช้</dt><dd>{APP_ROLES.length} <small>บทบาท</small></dd></div>
            <div><dt>กลุ่มสาระ</dt><dd>{LEARNING_AREAS.length} <small>กลุ่ม</small></dd></div>
            <div><dt>ระดับชั้น</dt><dd>ม.1–6 <small>ต้น / ปลาย</small></dd></div>
          </dl>
        </section>

        <section className="section" id="curriculum" aria-labelledby="visit-curriculum">
          <div className="section__head"><div><p className="label">Curriculum</p><h2 className="section__title" id="visit-curriculum">หลักสูตรสถานศึกษาแยกตามประเภท</h2></div></div>
          <VisitCurriculum />
        </section>

        <section className="section" aria-labelledby="visit-modules">
          <div className="section__head"><div><p className="label">Modules</p><h2 className="section__title" id="visit-modules">ส่วนงานในระบบ</h2></div></div>
          <div className="cards">
            {MODULES.map(({ icon: Icon, title, text, color }) => (
              <div className="card" key={title} style={{ "--c": color } as CSSProperties}>
                <span className="card__icon" aria-hidden="true"><Icon strokeWidth={1.8} /></span>
                <h3>{title}</h3><p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="visit-areas">
          <div className="section__head"><div><p className="label">Learning Areas</p><h2 className="section__title" id="visit-areas">กลุ่มสาระการเรียนรู้ 8 กลุ่ม</h2></div></div>
          <ul className="visit__areas">
            {LEARNING_AREAS.map((a, i) => (
              <li key={a} className="card"><span className="num visit__no">{String(i + 1).padStart(2, "0")}</span><h3>{a}</h3><p>ม.ต้น · ม.ปลาย</p></li>
            ))}
          </ul>
        </section>

        <section className="section" aria-labelledby="visit-roles">
          <div className="section__head"><div><p className="label">Roles</p><h2 className="section__title" id="visit-roles">บทบาทผู้ใช้และสิทธิ์</h2></div></div>
          <div className="cards">
            {APP_ROLES.map((r) => (
              <div className="card" key={r} style={{ "--c": OFFICE_ROLES.includes(r) ? "var(--violet)" : "var(--cyan)" } as CSSProperties}>
                <span className="card__icon" aria-hidden="true"><Users strokeWidth={1.8} /></span>
                <h3>{ROLE_LABELS[r]}</h3><p>{ROLE_DESC[r]}</p>
                <span className="card__phase">{OFFICE_ROLES.includes(r) ? "ส่วนงานฝ่ายวิชาการ" : "ส่วนงานครู"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="visit-flow">
          <div className="section__head"><div><p className="label">Workflow</p><h2 className="section__title" id="visit-flow">ขั้นตอนงานหลักสูตร</h2></div></div>
          <ol className="visit__steps">
            {STEPS.map((s, i) => <li key={s} className="card"><span className="num visit__no">{i + 1}</span><p>{s}</p></li>)}
          </ol>
          <div className="cta-band">
            <div>
              <h3><Lock aria-hidden="true" className="visit__lock" /> ต้องการดูข้อมูลจริง?</h3>
              <p>เข้าสู่ระบบด้วยบัญชีที่ผู้ดูแลระบบสร้างให้ — สิทธิ์ทุกตารางบังคับที่ฐานข้อมูล (RLS)</p>
            </div>
            <Link className="btn btn--primary btn--lg" to="/login" state={{ from: "/visit" }}><span>เข้าสู่ระบบงานวิชาการ</span></Link>
          </div>
        </section>
      </main>

      <footer className="footnote">
        <ShieldCheck aria-hidden="true" className="visit__lock" /> หน้านี้อ่านอย่างเดียว · ข้อมูลหลักสูตรแสดงเฉพาะผู้ที่เข้าสู่ระบบและมีสิทธิ์ตาม RLS · แสดงเฉพาะรายการที่ผู้ดูแลหลักสูตรยืนยันแล้ว · ไม่แสดงข้อมูลส่วนบุคคล
      </footer>
    </div>
  );
}

export default VisitPage;
