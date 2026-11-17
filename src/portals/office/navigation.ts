import {
  BarChart3,
  BookOpen,
  BookText,
  FileDown,
  NotebookPen,
  ShieldCheck,
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
  // เมนูหลัก 4 กลุ่ม (หลักสูตรโรงเรียน / จัดทำรายวิชา / แผนการสอน / รายงานและส่งออก)
  // งานเชิงเทคนิคและงานประจำย้ายไป “เครื่องมือฝ่ายวิชาการ” (tools) — route และสิทธิ์เดิมครบ
  sections: [
    { items: [{ path: "", label: "หน้าหลัก", icon: LayoutDashboard, hint: "สรุปงานวันนี้" }] },
    {
      title: "หลักสูตรโรงเรียน",
      items: [
        { path: "curriculum", label: "ภาพรวมหลักสูตร", icon: BookOpen, hint: "หลักสูตรที่โรงเรียนใช้อยู่" },
        { path: "curriculum/structure", label: "รายวิชาในแต่ละชั้น", icon: ListChecks, hint: "วิชาที่เรียนในแต่ละชั้นและภาคเรียน" },
        { path: "curriculum/registry", label: "รายชื่อรายวิชาทั้งหมด", icon: BookOpen, hint: "ค้นหารายวิชา รหัส หน่วยกิต" },
        { path: "curriculum/indicators", label: "มาตรฐานและตัวชี้วัด", icon: Target, hint: "สิ่งที่นักเรียนต้องรู้และทำได้" },
      ],
    },
    {
      title: "จัดทำรายวิชา",
      items: [{ path: "curriculum/syllabi", label: "คำอธิบายรายวิชา", icon: BookText, hint: "เลือกวิชา → เลือกตัวชี้วัด → เขียน → บันทึก" }],
    },
    {
      title: "แผนการสอน",
      items: [{ path: "curriculum/lesson-plans", label: "แผนการสอน", icon: NotebookPen, hint: "ดึงรายวิชาและตัวชี้วัดให้อัตโนมัติ" }],
    },
    {
      title: "รายงานและส่งออก",
      items: [
        { path: "curriculum/reports", label: "รายงานและดาวน์โหลด", icon: FileDown, hint: "ส่งออก PDF / Excel" },
        { path: "curriculum/readiness", label: "ความคืบหน้าภาพรวม", icon: BarChart3, hint: "งานที่ทำแล้วและงานที่ยังค้าง" },
        { path: "reports", label: "รายงาน ปพ. & ผลสัมฤทธิ์", icon: BarChart3, plannedPhase: "Phase 3", roles: ACADEMIC_AND_EXEC },
      ],
    },
    {
      title: "ตรวจหลักสูตรและข้อมูล",
      tools: true,
      items: [
        { path: "curriculum/versions", label: "ประกาศใช้หลักสูตร (ฉบับทางการ)", icon: ShieldCheck, hint: "ส่งตรวจ อนุมัติ และเปิดใช้หลักสูตร" },
        { path: "curriculum/imports", label: "นำเข้าเอกสารหลักสูตร", icon: FileSpreadsheet, hint: "อัปโหลด PDF/Excel ต้นฉบับ" },
        { path: "curriculum/workbench", label: "ตรวจข้อมูลหลักสูตร", icon: ClipboardCheck, hint: "ตรวจความครบถ้วนของข้อมูลที่นำเข้า" },
        { path: "curriculum/conflicts", label: "ข้อมูลที่ไม่ตรงกัน (CF)", icon: ShieldAlert, hint: "ข้อขัดแย้งที่รอฝ่ายวิชาการตัดสิน" },
      ],
    },
    {
      title: "งานเอกสารครู",
      tools: true,
      items: [
        { path: "tasks", label: "รายการงาน / มอบหมาย", icon: FileText, roles: ACADEMIC_AND_EXEC },
        { path: "documents", label: "เอกสารของครู", icon: FolderLock, roles: ACADEMIC },
        { path: "reviews", label: "ตรวจรับเอกสาร", icon: ClipboardCheck, roles: ACADEMIC },
      ],
    },
    {
      title: "ทะเบียนและผลการเรียน",
      tools: true,
      items: [
        { path: "teachers", label: "ครูและบุคลากร", icon: UserRound, roles: REGISTRY_VIEW },
        { path: "students", label: "นักเรียน", icon: Users, roles: ACADEMIC_AND_EXEC },
        { path: "assessment", label: "ทะเบียนผลการเรียน", icon: GraduationCap, roles: ACADEMIC_AND_EXEC },
        { path: "tracking", label: "ติดตาม 0 / ร / มส", icon: ShieldAlert, plannedPhase: "Phase 2", roles: ACADEMIC_AND_EXEC },
      ],
    },
    {
      title: "ข้อมูลพื้นฐานและตั้งค่า",
      tools: true,
      items: [
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
