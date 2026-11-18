import { useEffect, useId, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, Wrench } from "lucide-react";
import type { NavItem, NavSection, PortalConfig } from "@/features/navigation/types";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  portal: PortalConfig;
  sections: NavSection[];
  onNavigate?: () => void;
  /** ย่อ sidebar (Desktop): แสดงเฉพาะไอคอน ชื่อเมนูอยู่ใน title/aria-label */
  collapsed?: boolean;
}

/** จัดรายการเป็นเมนูย่อยตาม group (UI เท่านั้น) — รายการแรกที่มองเห็นเป็นลิงก์หลัก ที่เหลือเป็นลิงก์ย่อย */
export interface NavEntry { label: string; primary: NavItem; subs: NavItem[] }
export function groupNavItems(items: NavItem[]): NavEntry[] {
  const out: NavEntry[] = [];
  const byGroup = new Map<string, NavEntry>();
  for (const it of items) {
    if (!it.group) { out.push({ label: it.label, primary: it, subs: [] }); continue; }
    const e = byGroup.get(it.group);
    if (e) e.subs.push(it);
    else { const n = { label: it.group, primary: it, subs: [] }; byGroup.set(it.group, n); out.push(n); }
  }
  return out;
}

export function SidebarNav({ portal, sections, onNavigate, collapsed }: SidebarNavProps) {
  const { pathname } = useLocation();
  const main = sections.filter((s) => !s.tools);
  const tools = sections.filter((s) => s.tools);
  const allPaths = sections.flatMap((s) => s.items.map((i) => i.path));
  const isEnd = (path: string) => path === "" || allPaths.some((p) => p !== path && p.startsWith(`${path}/`));
  const toUrl = (path: string) => (path ? `${portal.basePath}/${path}` : portal.basePath);
  const active = (path: string) => { const u = toUrl(path); return pathname === u || (!isEnd(path) && pathname.startsWith(`${u}/`)); };
  const toolsActive = tools.some((s) => s.items.some((i) => i.path && active(i.path)));

  const link = (item: NavItem, label: string, sub = false, forceActive = false) => (
    <NavLink
      to={toUrl(item.path)}
      end={isEnd(item.path)}
      onClick={onNavigate}
      title={collapsed ? label : item.hint}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) => {
        const on = isActive || forceActive;
        return sub
          ? cn("flex min-h-8 items-center rounded-lg py-1 pl-3 pr-2 text-[13px] transition-colors", on ? "bg-white/10 font-semibold text-[color:var(--gold)]" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white")
          : cn("flex min-h-10 items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors", collapsed && "justify-center px-0",
            on ? "bg-sidebar-active font-semibold text-sidebar-active-foreground shadow-sm" : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-white");
      }}
    >
      {!sub && <item.icon className="size-[18px] shrink-0" aria-hidden="true" />}
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && item.plannedPhase && <span className="text-[10px] text-sidebar-muted" title={`จะพัฒนาใน ${item.plannedPhase}`}>เร็ว ๆ นี้</span>}
    </NavLink>
  );

  const entries = (items: NavItem[]) => (
    <ul className="flex flex-col gap-1">
      {groupNavItems(items).map((e) => {
        const inGroup = [e.primary, ...e.subs].some((i) => active(i.path));
        return (
          <li key={e.primary.path}>
            {link(e.primary, e.label, false, inGroup)}
            {!collapsed && inGroup && e.subs.length > 0 && (
              <ul aria-label={`เมนูย่อย ${e.label}`} className="mt-1 ml-5 flex flex-col gap-0.5 border-l border-[color:var(--gold)]/40 pl-2">
                <li>{link(e.primary, e.primary.label, true)}</li>
                {e.subs.map((s) => <li key={s.path}>{link(s, s.label, true)}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );

  const render = (list: NavSection[]) => list.map((section, i) =>
    section.accordion ? <AccordionSection key={section.title ?? i} section={section} collapsed={collapsed} anyActive={section.items.some((it) => active(it.path))}>{entries(section.items)}</AccordionSection> : (
      <div key={section.title ?? i}>
        {section.title && !collapsed && <p className="mb-1.5 px-3 text-xs font-medium tracking-wide text-sidebar-muted">{section.title}</p>}
        {section.title && collapsed && <hr className="mx-3 mb-2 border-white/10" />}
        {entries(section.items)}
      </div>
    ));

  return (
    <nav aria-label={`เมนู${portal.name}`} className="flex flex-col gap-4">
      {render(main)}
      {tools.length > 0 && (collapsed ? render(tools) : (
        <details className="group rounded-xl border border-white/10 p-1" open={toolsActive || undefined}>
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent">
            <Wrench className="size-4" aria-hidden="true" />
            <span className="flex-1">{portal.id === "office" ? "เครื่องมือฝ่ายวิชาการ" : "เมนูอื่น ๆ"}</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-2 flex flex-col gap-3">{render(tools)}</div>
        </details>
      ))}
    </nav>
  );
}

/** เมนูหลักแบบพับ/ขยาย — ขยายอัตโนมัติเมื่ออยู่ในหน้าใต้กลุ่มนี้ */
function AccordionSection({ section, collapsed, anyActive, children }: { section: NavSection; collapsed?: boolean; anyActive: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(anyActive);
  useEffect(() => { if (anyActive) setOpen(true); }, [anyActive]);
  const id = useId();
  const Icon = section.accordion!.icon;
  if (collapsed) return <div><hr className="mx-3 mb-2 border-white/10" />{children}</div>;
  return (
    <div className={cn("rounded-2xl p-1 transition-colors", (open || anyActive) && "bg-white/[0.06]")}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold transition-colors hover:bg-sidebar-accent",
          anyActive ? "text-[color:var(--gold)]" : "text-sidebar-foreground")}>
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="flex-1">{section.title}</span>
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id={id} className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden" inert={!open || undefined}>
          <div className="pt-1 pl-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
