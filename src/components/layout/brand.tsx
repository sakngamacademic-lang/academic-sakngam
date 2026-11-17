import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * แบรนด์ระบบ — ยังไม่มีไฟล์ตราโรงเรียนใน repository จึงใช้ไอคอนทั่วไป (ไม่สร้างตราโรงเรียนขึ้นเอง)
 * เมื่อมีไฟล์ตราจริง ให้วางไว้ที่ public/ แล้วเปลี่ยนเฉพาะส่วนไอคอนนี้
 */
export function Brand({ subtitle, compact }: { subtitle: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold text-[var(--navy-900)] shadow-sm">
        <GraduationCap className="size-6" aria-hidden="true" />
      </div>
      <div className={cn("min-w-0 leading-tight", compact && "sr-only")}>
        <p className="truncate text-base font-semibold text-white">Sak Ngam Academic</p>
        <p className="truncate text-xs text-sidebar-foreground/90">ระบบบริหารงานวิชาการ</p>
        <p className="truncate text-xs text-sidebar-muted">โรงเรียนสักงามวิทยา · {subtitle}</p>
      </div>
    </div>
  );
}
