import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, Wrench } from "lucide-react";
import type { NavSection, PortalConfig } from "@/features/navigation/types";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  portal: PortalConfig;
  sections: NavSection[];
  onNavigate?: () => void;
  /** ย่อ sidebar (Desktop): แสดงเฉพาะไอคอน ชื่อเมนูอยู่ใน title/aria-label */
  collapsed?: boolean;
}

export function SidebarNav({ portal, sections, onNavigate, collapsed }: SidebarNavProps) {
  const { pathname } = useLocation();
  const main = sections.filter((s) => !s.tools);
  const tools = sections.filter((s) => s.tools);
  const toolsActive = tools.some((s) => s.items.some((i) => i.path && pathname.startsWith(`${portal.basePath}/${i.path}`)));
  const render = (list: NavSection[]) => list.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && !collapsed && (
            <p className="mb-1.5 px-3 text-xs font-medium tracking-wide text-sidebar-muted">{section.title}</p>
          )}
          {section.title && collapsed && <hr className="mx-3 mb-2 border-white/10" />}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const to = item.path ? `${portal.basePath}/${item.path}` : portal.basePath;
              return (
                <li key={item.path}>
                  <NavLink
                    to={to}
                    end={item.path === ""}
                    onClick={onNavigate}
                    title={collapsed ? item.label : item.hint}
                    aria-label={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-10 items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-sidebar-active font-semibold text-sidebar-active-foreground shadow-sm"
                          : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-white",
                      )
                    }
                  >
                    <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.plannedPhase && (
                      <span className="text-[10px] text-sidebar-muted" title={`จะพัฒนาใน ${item.plannedPhase}`}>
                        เร็ว ๆ นี้
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
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
