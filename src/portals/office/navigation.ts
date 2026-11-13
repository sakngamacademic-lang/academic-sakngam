import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  FolderLock,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  School,
  Settings,
  Shapes,
  ShieldAlert,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import type { PortalConfig } from "@/features/navigation/types";
import { OFFICE_ROLES, type AppRole } from "@/features/auth/roles";

// กลุ่มบทบาทตาม Permission Matrix (docs/architecture/PHASE-0.md หัวข้อ 5)
const ACADEMIC: readonly AppRole[] = ["academic_head", "academic_staff", "learning_area_head"];
const ACADEMIC_AND_EXEC: readonly AppRole[] = [...ACADEMIC, "executive"];
const REGISTRY_VIEW: readonly AppRole[] = ["system_admin", ...ACADEMIC_AND_EXEC];

export const officePortal: PortalConfig = {
  id: "office",
  basePath: "/office",
  name: "ฝ่ายวิชาการ",
  shortName: "วิชาการ",
  roles: OFFICE_ROLES,
  sections: [
    { items: [{ path: "", label: "แดชบอร์ด", icon: LayoutDashboard }] },
    {
      title: "ภาระงานเอกสาร",
      items: [
        { path: "tasks", label: "รายการงาน / มอบหมาย", icon: FileText, roles: ACADEMIC_AND_EXEC },
        { path: "documents", label: "เอกสารของครู", icon: FolderLock, roles: ACADEMIC },
        { path: "reviews", label: "ตรวจรับเอกสาร", icon: ClipboardCheck, plannedPhase: "Phase 1.10", roles: ACADEMIC },
      ],
    },
    {
      title: "ทะเบียน",
      items: [
        { path: "teachers", label: "ครูและบุคลากร", icon: UserRound, roles: REGISTRY_VIEW },
        { path: "students", label: "นักเรียน", icon: Users, plannedPhase: "Phase 1.12", roles: ACADEMIC_AND_EXEC },
      ],
    },
    {
      title: "ข้อมูลพื้นฐาน",
      items: [
        { path: "academic-years", label: "ปีการศึกษา", icon: CalendarDays },
        { path: "terms", label: "ภาคเรียน", icon: CalendarRange },
        { path: "grade-levels", label: "ระดับชั้น", icon: Layers },
        { path: "classrooms", label: "ห้องเรียน", icon: School },
        { path: "learning-areas", label: "กลุ่มสาระการเรียนรู้", icon: Shapes },
      ],
    },
    {
      title: "หลักสูตร",
      items: [
        { path: "curriculum", label: "หลักสูตรสถานศึกษา", icon: BookOpen },
        { path: "curriculum/structure", label: "โครงสร้างรายวิชา", icon: ListChecks },
        { path: "curriculum/indicators", label: "มาตรฐาน & ตัวชี้วัด", icon: Target },
        { path: "curriculum/imports", label: "นำเข้า & ตรวจสอบ", icon: FileSpreadsheet },
      ],
    },
    {
      title: "วัดและประเมินผล",
      items: [
        { path: "assessment", label: "ทะเบียนผลการเรียน", icon: GraduationCap, plannedPhase: "Phase 2", roles: ACADEMIC_AND_EXEC },
        { path: "tracking", label: "ติดตาม 0 / ร / มส", icon: ShieldAlert, plannedPhase: "Phase 2", roles: ACADEMIC_AND_EXEC },
      ],
    },
    {
      title: "ข้อมูลและรายงาน",
      items: [
        { path: "imports", label: "นำเข้า Excel", icon: FileSpreadsheet, plannedPhase: "Phase 1.12", roles: ["academic_head", "academic_staff"] },
        { path: "reports", label: "รายงาน ปพ. & ผลสัมฤทธิ์", icon: BarChart3, plannedPhase: "Phase 3", roles: ACADEMIC_AND_EXEC },
        { path: "settings", label: "ตั้งค่าระบบ", icon: Settings, plannedPhase: "Phase 1.4", roles: ["system_admin", "academic_head"] },
      ],
    },
  ],
};
