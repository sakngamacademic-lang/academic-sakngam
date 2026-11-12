import { Info } from "lucide-react";
import { env, isSupabaseConfigured } from "@/lib/env";

/** แจ้งสถานะการพัฒนาให้ชัดเจน: ยังไม่มีระบบเข้าสู่ระบบ และยังไม่เชื่อมฐานข้อมูล */
export function EnvironmentBanner() {
  return (
    <div className="border-b bg-accent/60 px-4 py-2 text-xs text-accent-foreground sm:px-6">
      <p className="mx-auto flex max-w-7xl items-center gap-2">
        <Info className="size-3.5 shrink-0" />
        <span>
          เวอร์ชันพัฒนา ({env.VITE_APP_ENV}) · ยังไม่เปิดระบบเข้าสู่ระบบ ·{" "}
          {isSupabaseConfigured ? "ตั้งค่า Supabase แล้ว (ยังไม่ใช้งาน)" : "ยังไม่เชื่อมฐานข้อมูล"}
        </span>
      </p>
    </div>
  );
}
