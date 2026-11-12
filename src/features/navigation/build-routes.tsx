import type { ReactElement } from "react";
import type { RouteObject } from "react-router-dom";
import { ComingSoon } from "@/components/shared";
import type { PortalConfig } from "./types";

/**
 * สร้าง child routes ของ portal จากเมนู
 * - เมนูที่มีหน้าจริง: ส่ง element ผ่าน `pages`
 * - เมนูที่มี plannedPhase: แสดงหน้า "อยู่ระหว่างการพัฒนา" อัตโนมัติ
 * เมื่อพัฒนาโมดูลใหม่ เพียงเพิ่ม element ใน `pages` และลบ plannedPhase ในเมนู
 */
export function buildPortalRoutes(portal: PortalConfig, pages: Record<string, ReactElement>): RouteObject[] {
  return portal.sections.flatMap((section) =>
    section.items.map((item): RouteObject => {
      const element = pages[item.path] ?? <ComingSoon title={item.label} phase={item.plannedPhase} />;
      return item.path === "" ? { index: true, element } : { path: item.path, element };
    }),
  );
}
