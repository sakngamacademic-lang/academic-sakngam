/**
 * คอมโพเนนต์ Dashboard (Dark Premium — DESIGN-SYSTEM.md §4 "Dashboard components")
 * หลักการ: ไม่มี animation นอกจาก hover/focus · พื้นทึบ อ่านง่าย · ใช้ร่วมกันทั้ง Office และ Teacher
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Database, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------- Section */
export function DashSection({
  id,
  title,
  meta,
  actions,
  highlight,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  highlight?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "min-w-0 rounded-2xl border bg-card p-4 sm:p-5",
        highlight && "border-warning/40 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--amber)_9%,transparent),transparent_70%)]",
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={`${id}-title`} className="text-base font-semibold">
          {title}
        </h2>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        {actions}
      </header>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------------- KPI */
type KpiTone = "default" | "accent" | "alert" | "ok";

const kpiTone: Record<KpiTone, string> = {
  default: "",
  accent: "border-primary/40 bg-[color-mix(in_oklab,var(--violet)_10%,var(--bg-1))]",
  alert: "border-destructive/40 bg-[color-mix(in_oklab,var(--rose)_9%,var(--bg-1))]",
  ok: "border-success/30",
};
const kpiValueTone: Record<KpiTone, string> = {
  default: "text-foreground",
  accent: "text-primary",
  alert: "text-destructive",
  ok: "text-success",
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
  onClick,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: KpiTone;
  icon?: LucideIcon;
  onClick?: () => void;
  loading?: boolean;
}) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums sm:text-3xl", kpiValueTone[tone])}>
        {loading ? <span className="inline-block h-8 w-16 rounded-md bg-muted align-middle" aria-label="กำลังโหลด" /> : value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = cn("min-w-0 rounded-2xl border bg-card p-4 text-left sm:p-5", kpiTone[tone]);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "cursor-pointer transition-colors hover:border-input focus-visible:outline-2 focus-visible:outline-ring")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ----------------------------------------------------------- Quick actions */
export interface QuickAction {
  label: string;
  to: string;
  icon: LucideIcon;
  primary?: boolean;
  /** หน้าปลายทางยังอยู่ระหว่างพัฒนา — แสดงป้ายให้ชัด */
  soon?: string;
}

export function QuickActions({ items, label = "ทางลัด" }: { items: QuickAction[]; label?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label={label} className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {items.map((a) => (
        <Link
          key={a.to}
          to={a.to}
          className={cn(
            "flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
            a.primary
              ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-card text-foreground hover:border-input hover:bg-accent",
          )}
        >
          <a.icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{a.label}</span>
          {a.soon && (
            <span
              className={cn("shrink-0 rounded-full px-1.5 text-[10px] font-normal", a.primary ? "bg-black/15" : "bg-muted text-muted-foreground")}
              title={`หน้านี้จะเปิดใช้งานใน ${a.soon}`}
            >
              เร็ว ๆ นี้
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/* ------------------------------------------------- Real / Demo separation */
export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success" title="ข้อมูลจริงจากฐานข้อมูล">
      <Database className="size-3" aria-hidden="true" /> ข้อมูลจริง
    </span>
  );
}

/**
 * พื้นที่ข้อมูลจำลอง — ล้อมด้วยกรอบเส้นประและหัวข้อ "ตัวอย่างหน้าจอ (Demo)"
 * เพื่อไม่ให้ปะปนกับข้อมูลจริง ปุ่มที่ยังไม่มีระบบรองรับต้องปิดไว้พร้อมบอกเหตุผล
 */
export function DemoZone({ id, title, phase, children }: { id: string; title: string; phase: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-demo-zone=""
      className="mt-8 rounded-3xl border border-dashed border-warning/45 p-3 sm:p-4"
    >
      <header className="mb-4 flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-warning">
          <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
          ตัวอย่างหน้าจอ (Demo) · {title}
        </h2>
        <p className="text-xs text-muted-foreground">ข้อมูลจำลอง ยังไม่เชื่อมฐานข้อมูล · ระบบจริงเปิดใช้ใน {phase}</p>
      </header>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------------- Tag */
export type TagTone = "todo" | "wait" | "fix" | "ok" | "late";

const tagTone: Record<TagTone, string> = {
  todo: "bg-primary/15 text-primary",
  wait: "bg-info/15 text-info",
  fix: "bg-warning/15 text-warning",
  ok: "bg-success/15 text-success",
  late: "bg-destructive/15 text-destructive",
};

export function Tag({ tone, children, className }: { tone: TagTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tagTone[tone], className)}>
      {children}
    </span>
  );
}

/** ปุ่มของฟีเจอร์ที่ยังไม่มีระบบรองรับ — ปิดไว้และบอกว่าจะเปิดเมื่อใด (ไม่ทำทีเหมือนใช้งานได้) */
export function PendingButton({ children, phase, size = "sm" }: { children: ReactNode; phase: string; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      disabled
      title={`เปิดใช้งานใน ${phase}`}
      aria-description={`ยังไม่เปิดใช้งาน จะเปิดใน ${phase}`}
      className={cn(
        "inline-flex shrink-0 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-dashed text-muted-foreground",
        size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm",
      )}
    >
      {children}
    </button>
  );
}
