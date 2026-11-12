import { Info } from "lucide-react";
import { env } from "@/lib/env";

/** แจ้งว่าเป็นสภาพแวดล้อมพัฒนา (ไม่แสดงบน production) */
export function EnvironmentBanner() {
  return (
    <div className="border-b bg-accent/60 px-4 py-2 text-xs text-accent-foreground sm:px-6">
      <p className="mx-auto flex max-w-7xl items-center gap-2">
        <Info className="size-3.5 shrink-0" />
        <span>เวอร์ชันพัฒนา ({env.VITE_APP_ENV}) · เชื่อมต่อ Supabase {env.VITE_APP_ENV === "local" ? "local" : "staging"}</span>
      </p>
    </div>
  );
}
