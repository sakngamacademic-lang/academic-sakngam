import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { ArrowLeftRight, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalConfig } from "@/features/navigation/types";
import { visibleSections } from "@/features/navigation/build-routes";
import { useAuth } from "@/features/auth/AuthProvider";
import { hasAnyRole, OFFICE_ROLES, ROLE_LABELS, TEACHER_ROLES } from "@/features/auth/roles";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { EnvironmentBanner } from "./environment-banner";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { UserPanel } from "./user-panel";

interface AppShellProps {
  portal: PortalConfig;
}

/**
 * โครง Layout ร่วมของทั้งสอง portal
 * - Desktop (lg+): sidebar คงที่ด้านซ้าย
 * - Mobile/Tablet: แถบบน + เมนูแบบเลื่อน (Sheet)
 * - เมนูกรองตามบทบาทจากฐานข้อมูล (การอนุญาตจริงอยู่ที่ RLS)
 */
const readPref = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writePref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ไม่จำเป็น */ } };

export function AppShell({ portal }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readPref("sidebar") === "collapsed");
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    writePref("theme", dark ? "dark" : "light");
  }, [dark]);
  const { roles, access, signOut } = useAuth();
  const sections = visibleSections(portal, roles);

  const other =
    portal.id === "office"
      ? hasAnyRole(roles, TEACHER_ROLES) && { to: "/teacher", label: "ไประบบครู" }
      : hasAnyRole(roles, OFFICE_ROLES) && { to: "/office", label: "ไปฝ่ายวิชาการ" };
  const primaryRole = roles.find((r) => portal.roles.includes(r)) ?? roles[0];

  const sidebarBody = (onNavigate?: () => void, compact = false) => (
    <div className="flex h-full flex-col text-sidebar-foreground" style={{ backgroundImage: "var(--sidebar-gradient)", backgroundColor: "var(--sidebar)" }}>
      <div className={cn("border-b border-white/10 py-5", compact ? "px-3" : "px-5")}>
        <Brand subtitle={portal.name} compact={compact} />
      </div>
      <div className={cn("flex-1 overflow-y-auto py-5", compact ? "px-2" : "px-3")}>
        <SidebarNav portal={portal} sections={sections} onNavigate={onNavigate} collapsed={compact} />
      </div>
      <div className="space-y-2 border-t border-white/10 p-3">
        {other && (
          <Link
            to={other.to}
            onClick={onNavigate}
            title={compact ? other.label : undefined}
            className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-white", compact && "justify-center")}
          >
            <ArrowLeftRight className="size-4" />
            {!compact && other.label}
          </Link>
        )}
        {!compact && <UserPanel onNavigate={onNavigate} />}
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-dvh transition-[padding]", collapsed ? "lg:pl-20" : "lg:pl-72")}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        ข้ามไปยังเนื้อหา
      </a>

      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden shadow-lg lg:block", collapsed ? "w-20" : "w-72")}>{sidebarBody(undefined, collapsed)}</aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="border-0 p-0">
          <SheetTitle className="sr-only">เมนู{portal.name}</SheetTitle>
          <SheetDescription className="sr-only">เลือกหน้าที่ต้องการ</SheetDescription>
          {sidebarBody(() => setOpen(false))}
        </SheetContent>
      </Sheet>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/95 px-4 shadow-card backdrop-blur sm:px-6">
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู">
          <Menu className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" className="-ml-2 hidden lg:inline-flex" onClick={() => { setCollapsed(!collapsed); writePref("sidebar", collapsed ? "expanded" : "collapsed"); }}
          aria-label={collapsed ? "ขยายเมนูด้านข้าง" : "ย่อเมนูด้านข้าง"} aria-pressed={collapsed}>
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        </Button>
        <p className="truncate font-medium lg:hidden">{portal.name}</p>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} aria-label={dark ? "ใช้ธีมสว่าง" : "ใช้ธีมมืด"} title={dark ? "ธีมสว่าง" : "ธีมมืด"}>
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
          <NotificationBell />
          <div className="hidden min-w-0 text-right leading-tight sm:block">
            <p className="truncate text-sm font-medium">{access?.display_name || access?.email}</p>
            {primaryRole && <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[primaryRole]}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => void signOut()} aria-label="ออกจากระบบ">
            <LogOut /> <span className="hidden sm:inline">ออกจากระบบ</span>
          </Button>
        </div>
      </header>

      <EnvironmentBanner />

      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
