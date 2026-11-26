import { Info } from "lucide-react";
import { env, isMainSite } from "@/lib/env";

/** แจ้งว่าเป็นสภาพแวดล้อมพัฒนา (ไม่แสดงบน production) */
export function EnvironmentBanner() {
  if (!isMainSite()) {
    return (
      <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs text-amber-900 sm:px-6">
        <p className="mx-auto flex max-w-7xl items-center gap-2">
          <Info className="size-3.5 shrink-0" />
          <span>ลิงก์ทดสอบ (Preview) — ใช้ทดสอบระบบเท่านั้น ห้ามใช้แก้ไขข้อมูลจริงของโรงเรียน · เว็บหลัก: <a className="font-semibold underline" href={env.VITE_PUBLIC_SITE_URL}>{env.VITE_PUBLIC_SITE_URL.replace(/^https?:\/\//, "")}</a></span>
        </p>
      </div>
    );
  }
  if (env.VITE_APP_ENV === "production") return null;
  return (
    <div className="border-b bg-accent/60 px-4 py-2 text-xs text-accent-foreground sm:px-6">
      <p className="mx-auto flex max-w-7xl items-center gap-2">
        <Info className="size-3.5 shrink-0" />
        <span>เวอร์ชันพัฒนา ({env.VITE_APP_ENV}) · เชื่อมต่อ Supabase {env.VITE_APP_ENV === "local" ? "local" : "staging"}</span>
      </p>
    </div>
  );
}
