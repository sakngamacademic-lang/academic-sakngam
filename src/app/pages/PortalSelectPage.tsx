import { Link } from "react-router-dom";
import { ArrowLeft, Building2, GraduationCap, Presentation } from "lucide-react";

const portals = [
  {
    to: "/office",
    title: "ฝ่ายวิชาการ",
    description: "ทะเบียน หลักสูตร วัดผล มอบหมายและตรวจรับเอกสาร",
    icon: Building2,
  },
  {
    to: "/teacher",
    title: "ระบบครู",
    description: "ภาระงานของฉัน ดาวน์โหลดแม่แบบ ส่งเอกสาร ติดตามสถานะ",
    icon: Presentation,
  },
];

/**
 * หน้าเลือกระบบ (ชั่วคราวสำหรับการพัฒนา)
 * Phase 1.3 จะเปลี่ยนเป็นหน้าเข้าสู่ระบบ และนำทางตามบทบาทผู้ใช้อัตโนมัติ
 */
export function PortalSelectPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-sidebar text-sidebar-foreground">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-gold text-sidebar">
            <GraduationCap className="size-8" />
          </div>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">ระบบบริหารงานวิชาการ</h1>
          <p className="mt-1 text-sidebar-muted">โรงเรียนสักงามวิทยา</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {portals.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="group rounded-xl border border-white/10 bg-sidebar-accent/40 p-6 transition-colors hover:border-gold/60 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
            >
              <p.icon className="size-7 text-gold" />
              <h2 className="mt-4 text-lg font-semibold text-white">{p.title}</h2>
              <p className="mt-1 text-sm text-sidebar-muted">{p.description}</p>
              <p className="mt-4 flex items-center gap-1 text-sm font-medium text-gold">
                เข้าสู่หน้า{p.title} <ArrowLeft className="size-4 rotate-180 transition-transform group-hover:translate-x-1" />
              </p>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-sidebar-muted">
          เวอร์ชันพัฒนา — ยังไม่เปิดระบบเข้าสู่ระบบ (จะเปิดใน Phase 1.3)
        </p>
      </main>
    </div>
  );
}
