import { NavLink } from "react-router-dom";
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
  return (
    <nav aria-label={`เมนู${portal.name}`} className="flex flex-col gap-4">
      {sections.map((section, i) => (
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
                    title={collapsed ? item.label : undefined}
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
      ))}
    </nav>
  );
}
