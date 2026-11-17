import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** ไอคอนหัวหน้า (ไม่บังคับ) */
  icon?: LucideIcon;
}

/** หัวหน้าเพจ — การ์ดสว่างพร้อมแถบสีกรมท่า/ทองบาง ๆ ใช้ร่วมทุกหน้า */
export function PageHeader({ title, description, actions, icon: Icon }: PageHeaderProps) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border bg-card px-4 py-4 shadow-card sm:px-6 sm:py-5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklab,var(--gold)_16%,transparent),transparent_60%)]" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--gold-soft)] text-[var(--navy-800)]">
              <Icon className="size-6" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
