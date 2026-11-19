import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Info, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Dataset } from "./store";

export const V2 = "/office/curriculum-v2";
export const useCanManage = () => useAuth().can("curriculum.manage");
export const userTag = (email?: string | null) => email ?? "ผู้ใช้";

/** แจ้งสถานะระยะ Preview อย่างตรงไปตรงมา */
export function PreviewNotice() {
  return (
    <p role="note" className="mb-4 flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>หลักสูตรสถานศึกษา V2 (Preview) — ข้อมูลที่นำเข้าเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ยังไม่บันทึกลงฐานข้อมูล และผู้ใช้อื่นยังไม่เห็น · ข้อมูลหลักสูตรเดิมไม่ถูกนำมาแสดงในหน้านี้</span>
    </p>
  );
}
export function EmptyV2({ title, text, action = true }: { title: string; text: string; action?: boolean }) {
  const can = useCanManage();
  return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{text}</p>
      {action && can && <Button asChild className="mt-4"><Link to={`${V2}/import`}><Upload /> นำเข้าหลักสูตร</Link></Button>}
      {action && !can && <p className="mt-3 text-xs text-muted-foreground">การนำเข้าทำได้เฉพาะผู้ดูแลหลักสูตร</p>}
    </div>
  );
}
export function Pills<T extends string | number>({ items, value, onChange, label, render, className }: { items: T[]; value: T | null; onChange: (v: T) => void; label: string; render?: (v: T) => ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {items.map((v) => (
        <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={cn("min-h-10 rounded-full border px-4 text-sm shadow-card transition-colors", value === v ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card hover:border-primary/50")}>
          {render ? render(v) : String(v)}
        </button>
      ))}
    </div>
  );
}
export const yearName = (d: Dataset) => (d.label && d.label !== String(d.year) ? `${d.year} · ${d.label}` : String(d.year));
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "ok" }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3", tone === "warn" && "border-warning/40 bg-warning/10", tone === "ok" && "border-success/30 bg-success/10")}>
      <p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
