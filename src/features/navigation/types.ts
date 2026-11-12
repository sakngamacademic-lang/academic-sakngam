import type { LucideIcon } from "lucide-react";

export interface NavItem {
  /** path ภายใน portal (relative เช่น "tasks") ว่าง = หน้าแรกของ portal */
  path: string;
  label: string;
  icon: LucideIcon;
  /** ถ้าระบุ = ยังไม่พัฒนา ระบบจะสร้างหน้า "อยู่ระหว่างการพัฒนา" ให้อัตโนมัติ */
  plannedPhase?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface PortalConfig {
  id: "office" | "teacher";
  basePath: string;
  name: string;
  shortName: string;
  sections: NavSection[];
}
