import { NavLink } from "react-router-dom";
import type { NavSection, PortalConfig } from "@/features/navigation/types";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  portal: PortalConfig;
  sections: NavSection[];
  onNavigate?: () => void;
}

export function SidebarNav({ portal, sections, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label={`เมนู${portal.name}`} className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && (
            <p className="mb-1.5 px-3 text-xs font-medium tracking-wide text-sidebar-muted">{section.title}</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const to = item.path ? `${portal.basePath}/${item.path}` : portal.basePath;
              return (
                <li key={item.path}>
                  <NavLink
                    to={to}
                    end={item.path === ""}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-accent font-medium text-white"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-white",
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.plannedPhase && (
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
