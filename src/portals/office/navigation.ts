import {
  Globe,
  BarChart3,
  Presentation,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  FolderOpen,
  FileSpreadsheet,
  FileText,
  FolderLock,
  GraduationCap,
  Layers,
  LayoutDashboard,
  School,
  Settings,
  Shapes,
  ShieldAlert,
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
  // เมนูหลักแยก 3 ระบบชัดเจน: ระบบหลักสูตร · งานเอกสารวิชาการและติดตาม · ระบบวัดและประเมินผลติดตาม
  // เมนูหลักสูตรเดิม (Legacy) และ Curriculum V2 (นำเข้า/โครงสร้าง/เปรียบเทียบ/รายงาน) ถูกนำออกจากเมนู —
  // route ยังอยู่ (เปิดจากลิงก์ภายในได้) และไม่แตะข้อมูลในฐานข้อมูล เพื่อไม่กระทบการเผยแพร่หลักสูตร
  sections: [
    {
      items: [
        { path: "", label: "หน้าหลัก", icon: LayoutDashboard, hint: "สรุปงานวันนี้" },
      ],
    },
    {
      title: "ระบบหลักสูตร",
      accordion: { icon: FolderOpen },
      items: [
        { path: "curriculum-v2/present", label: "นำเสนอเล่มหลักสูตร", icon: Presentation, hint: "เล่มแยก ม.ต้น / ม.ปลาย · กดเผยแพร่ขึ้นหน้าเยี่ยมชม", roles: ACADEMIC_AND_EXEC },
        { path: "curriculum/publish", label: "อนุมัติเผยแพร่ (หน้าเยี่ยมชม)", icon: Globe, hint: "เลือกข้อมูลและเล่ม PDF ที่บุคคลภายนอกเห็นได้", roles: ["academic_head"] },
      ],
    },
    {
      title: "งานเอกสารวิชาการและติดตาม",
      accordion: { icon: FileText },
      items: [
        { path: "tasks", label: "รายการงาน / มอบหมาย", icon: FileText, roles: ACADEMIC_AND_EXEC },
        { path: "documents", label: "เอกสารของครู", icon: FolderLock, roles: ACADEMIC },
        { path: "reviews", label: "ตรวจรับเอกสาร", icon: ClipboardCheck, roles: ACADEMIC },
      ],
    },
    {
      title: "ระบบวัดและประเมินผลติดตาม",
      accordion: { icon: GraduationCap },
      items: [
        { path: "assessment", label: "ทะเบียนผลการเรียน", icon: GraduationCap, roles: ACADEMIC_AND_EXEC },
        { path: "tracking", label: "ติดตาม 0 / ร / มส", icon: ShieldAlert, plannedPhase: "Phase 2", roles: ACADEMIC_AND_EXEC },
        { path: "reports", label: "รายงาน ปพ. & ผลสัมฤทธิ์", icon: BarChart3, plannedPhase: "Phase 3", roles: ACADEMIC_AND_EXEC },
        { path: "students", label: "นักเรียน", icon: Users, roles: ACADEMIC_AND_EXEC },
      ],
    },
    {
      title: "ข้อมูลพื้นฐานและตั้งค่า",
      tools: true,
      items: [
        { path: "teachers", label: "ครูและบุคลากร", icon: UserRound, roles: REGISTRY_VIEW },
        { path: "academic-years", label: "ปีการศึกษา", icon: CalendarDays },
        { path: "terms", label: "ภาคเรียน", icon: CalendarRange },
        { path: "grade-levels", label: "ระดับชั้น", icon: Layers },
        { path: "classrooms", label: "ห้องเรียน", icon: School },
        { path: "learning-areas", label: "กลุ่มสาระการเรียนรู้", icon: Shapes },
        { path: "imports", label: "นำเข้า Excel", icon: FileSpreadsheet, plannedPhase: "Phase 1.12", roles: ["academic_head", "academic_staff"] },
        { path: "settings", label: "ตั้งค่าระบบ", icon: Settings, plannedPhase: "Phase 1.4", roles: ["system_admin", "academic_head"] },
      ],
    },
  ],
};
