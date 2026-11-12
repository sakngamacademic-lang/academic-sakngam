import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { ArrowLeftRight, LogOut, Menu } from "lucide-react";
import type { PortalConfig } from "@/features/navigation/types";
import { visibleSections } from "@/features/navigation/build-routes";
import { useAuth } from "@/features/auth/AuthProvider";
import { hasAnyRole, OFFICE_ROLES, ROLE_LABELS, TEACHER_ROLES } from "@/features/auth/roles";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { EnvironmentBanner } from "./environment-banner";
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
export function AppShell({ portal }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const { roles, access, signOut } = useAuth();
  const sections = visibleSections(portal, roles);

  const other =
    portal.id === "office"
      ? hasAnyRole(roles, TEACHER_ROLES) && { to: "/teacher", label: "ไประบบครู" }
      : hasAnyRole(roles, OFFICE_ROLES) && { to: "/office", label: "ไปฝ่ายวิชาการ" };
  const primaryRole = roles.find((r) => portal.roles.includes(r)) ?? roles[0];

  const sidebarBody = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-white/10 px-5 py-5">
        <Brand subtitle={portal.name} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <SidebarNav portal={portal} sections={sections} onNavigate={onNavigate} />
      </div>
      <div className="space-y-2 border-t border-white/10 p-3">
        {other && (
          <Link
            to={other.to}
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-white"
          >
            <ArrowLeftRight className="size-4" />
            {other.label}
          </Link>
        )}
        <UserPanel onNavigate={onNavigate} />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-72">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        ข้ามไปยังเนื้อหา
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-72 lg:block">{sidebarBody()}</aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="border-0">
          <SheetTitle className="sr-only">เมนู{portal.name}</SheetTitle>
          <SheetDescription className="sr-only">เลือกหน้าที่ต้องการ</SheetDescription>
          {sidebarBody(() => setOpen(false))}
        </SheetContent>
      </Sheet>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur sm:px-6">
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู">
          <Menu className="size-5" />
        </Button>
        <p className="truncate font-medium lg:hidden">{portal.name}</p>
        <div className="ml-auto flex min-w-0 items-center gap-3">
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
