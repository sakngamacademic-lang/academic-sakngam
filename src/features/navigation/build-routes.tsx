import type { ReactElement } from "react";
import type { RouteObject } from "react-router-dom";
import { ComingSoon } from "@/components/shared";
import { RequireRoles } from "@/features/auth/guards";
import { hasAnyRole, type AppRole } from "@/features/auth/roles";
import type { NavSection, PortalConfig } from "./types";

/**
 * สร้าง child routes ของ portal จากเมนู
 * - เมนูที่มีหน้าจริง: ส่ง element ผ่าน `pages`
 * - เมนูที่มี plannedPhase: แสดงหน้า "อยู่ระหว่างการพัฒนา" อัตโนมัติ
 * - เมนูที่ระบุ roles: ห่อด้วย RequireRoles (เข้าผ่าน URL ตรงก็ได้ 403)
 */
export function buildPortalRoutes(portal: PortalConfig, pages: Record<string, ReactElement>): RouteObject[] {
  return portal.sections.flatMap((section) =>
    section.items.map((item): RouteObject => {
      const page = pages[item.path] ?? <ComingSoon title={item.label} phase={item.plannedPhase} />;
      const element = item.roles ? <RequireRoles roles={item.roles}>{page}</RequireRoles> : page;
      return item.path === "" ? { index: true, element } : { path: item.path, element };
    }),
  );
}

/** เมนูที่ผู้ใช้มีสิทธิ์เห็น (ตัด section ที่ว่างออก) */
export function visibleSections(portal: PortalConfig, roles: readonly AppRole[]): NavSection[] {
  return portal.sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || hasAnyRole(roles, i.roles)) }))
    .filter((s) => s.items.length > 0);
}
