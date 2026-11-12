import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  School,
  Settings,
  ShieldAlert,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import type { PortalConfig } from "@/features/navigation/types";

export const officePortal: PortalConfig = {
  id: "office",
  basePath: "/office",
  name: "ฝ่ายวิชาการ",
  shortName: "วิชาการ",
  sections: [
    { items: [{ path: "", label: "แดชบอร์ด", icon: LayoutDashboard }] },
    {
      title: "ภาระงานเอกสาร",
      items: [
        { path: "tasks", label: "รายการงาน / มอบหมาย", icon: FileText, plannedPhase: "Phase 1.8" },
        { path: "reviews", label: "ตรวจรับเอกสาร", icon: ClipboardCheck, plannedPhase: "Phase 1.10" },
      ],
    },
    {
      title: "ทะเบียน",
      items: [
        { path: "teachers", label: "ครู", icon: UserRound, plannedPhase: "Phase 1.5" },
        { path: "students", label: "นักเรียน", icon: Users, plannedPhase: "Phase 1.12" },
        { path: "classrooms", label: "ห้องเรียน & ครูที่ปรึกษา", icon: School, plannedPhase: "Phase 1.12" },
      ],
    },
    {
      title: "หลักสูตร",
      items: [
        { path: "curriculum", label: "หลักสูตรสถานศึกษา", icon: BookOpen, plannedPhase: "Phase 2" },
        { path: "standards", label: "มาตรฐาน & ตัวชี้วัด", icon: Target, plannedPhase: "Phase 2" },
        { path: "subjects", label: "รายวิชา & โครงสร้าง", icon: ListChecks, plannedPhase: "Phase 2" },
      ],
    },
    {
      title: "วัดและประเมินผล",
      items: [
        { path: "assessment", label: "ทะเบียนผลการเรียน", icon: GraduationCap, plannedPhase: "Phase 2" },
        { path: "tracking", label: "ติดตาม 0 / ร / มส", icon: ShieldAlert, plannedPhase: "Phase 2" },
      ],
    },
    {
      title: "ข้อมูลและรายงาน",
      items: [
        { path: "imports", label: "นำเข้า Excel", icon: FileSpreadsheet, plannedPhase: "Phase 1.12" },
        { path: "reports", label: "รายงาน ปพ. & ผลสัมฤทธิ์", icon: BarChart3, plannedPhase: "Phase 3" },
        { path: "settings", label: "ตั้งค่าระบบ", icon: Settings, plannedPhase: "Phase 1.4" },
      ],
    },
  ],
};
