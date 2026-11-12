import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";

/** โครงหน้าสำหรับหน้า Login / ลืมรหัสผ่าน (โทนเดียวกับ sidebar) */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-sidebar-foreground">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <GraduationCap className="size-7" />
          </div>
          <p className="text-sm text-sidebar-muted">ระบบบริหารงานวิชาการ · โรงเรียนสักงามวิทยา</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-sidebar-muted">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl shadow-black/60 sm:p-8">{children}</div>
      </main>
    </div>
  );
}

const toneClass = {
  info: "border-info/40 bg-info/10 text-foreground",
  warning: "border-warning/60 bg-warning/15 text-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  success: "border-success/40 bg-success/10 text-foreground",
} as const;

export function FormAlert({ tone, children }: { tone: keyof typeof toneClass; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-lg border px-3 py-2.5 text-sm ${toneClass[tone]}`}>
      {children}
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "h-11 w-full rounded-md border bg-background px-3 text-base outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive sm:text-sm";
