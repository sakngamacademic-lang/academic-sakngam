import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@/features/auth/roles";

export interface NavItem {
  /** path ภายใน portal (relative เช่น "tasks") ว่าง = หน้าแรกของ portal */
  path: string;
  label: string;
  icon: LucideIcon;
  /** ถ้าระบุ = ยังไม่พัฒนา ระบบจะสร้างหน้า "อยู่ระหว่างการพัฒนา" ให้อัตโนมัติ */
  plannedPhase?: string;
  /** บทบาทที่เห็นเมนูและเข้า route ได้ (ไม่ระบุ = ทุกบทบาทของ portal) */
  roles?: readonly AppRole[];
  /** คำอธิบายสั้น ๆ ภาษาง่าย (แสดงเป็น tooltip) */
  hint?: string;
  /** จัดกลุ่มเฉพาะใน UI: รายการที่ group เดียวกันแสดงเป็นเมนูย่อยเดียว (รายการแรกที่มองเห็นเป็นลิงก์หลัก ที่เหลือเป็นลิงก์ย่อยเมื่ออยู่ในกลุ่มนั้น) · route/สิทธิ์ของแต่ละรายการคงเดิม */
  group?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
  /** true = อยู่ในกล่องพับ “เครื่องมือฝ่ายวิชาการ” (งานเชิงเทคนิค/งานประจำ ไม่ใช่เมนูหลัก) */
  tools?: boolean;
  /** แสดงเป็นเมนูหลักแบบพับ/ขยาย (Accordion) พร้อมไอคอน */
  accordion?: { icon: LucideIcon };
}

export interface PortalConfig {
  id: "office" | "teacher";
  basePath: string;
  name: string;
  shortName: string;
  /** บทบาทที่เข้า portal นี้ได้ */
  roles: readonly AppRole[];
  sections: NavSection[];
}
