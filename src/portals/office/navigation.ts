import {
  Archive,
  BarChart3,
  BookOpen,
  BookText,
  GitCompareArrows,
  NotebookPen,
  ShieldCheck,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  FolderOpen,
  LayoutList,
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
  // เมนูหลักสูตรทั้งหมดอยู่ใต้ “หลักสูตรสถานศึกษา” (Accordion)
  // งานเชิงเทคนิคและงานประจำย้ายไป “เครื่องมือฝ่ายวิชาการ” (tools) — route และสิทธิ์เดิมครบ
  sections: [
    {
      items: [
        { path: "", label: "หน้าหลัก", icon: LayoutDashboard, hint: "สรุปงานวันนี้" },
      ],
    },
    {
      // เมนูหลักสูตรทั้งหมดรวมในกลุ่มเดียว (Accordion) — จัดกลุ่มใน UI ด้วย group เท่านั้น route และสิทธิ์เดิมคงไว้ทุกรายการ
      title: "หลักสูตรสถานศึกษา",
      accordion: { icon: FolderOpen },
      items: [
        { path: "curriculum", label: "โครงสร้างหลักสูตร 2569", icon: LayoutList, group: "โครงสร้างหลักสูตร 2569", hint: "เลือกชั้น → แผนการเรียน → ภาคเรียน → ดูรายวิชา" },
        { path: "curriculum/overview", label: "ภาพรวมและเครื่องมือ", icon: LayoutDashboard, group: "โครงสร้างหลักสูตร 2569", hint: "วิเคราะห์ จัดหมวด เกณฑ์ประเมิน นำเสนอ" },
        { path: "curriculum/versions", label: "ประกาศใช้หลักสูตร (ฉบับทางการ)", icon: ShieldCheck, group: "โครงสร้างหลักสูตร 2569", hint: "ส่งตรวจ อนุมัติ และเปิดใช้หลักสูตร" },
        { path: "curriculum/structure-review", label: "ตรวจทานโครงสร้าง (ตัวอย่าง)", icon: ClipboardCheck, group: "ตรวจทานหลักสูตร", hint: "หัวหน้ากลุ่มสาระตรวจรายวิชาของกลุ่มตนเอง", roles: ACADEMIC },
        { path: "curriculum/internal-review", label: "ตรวจสอบภายใน", icon: ClipboardCheck, group: "ตรวจทานหลักสูตร", hint: "ข้อสังเกต ข้อขัดแย้ง การยืนยันเอกสาร" },
        { path: "curriculum/conflicts", label: "ข้อมูลที่ไม่ตรงกัน (CF)", icon: ShieldAlert, group: "ตรวจทานหลักสูตร", hint: "ข้อขัดแย้งที่รอฝ่ายวิชาการตัดสิน" },
        { path: "curriculum/workbench", label: "ตรวจข้อมูลหลักสูตร", icon: ClipboardCheck, group: "ตรวจทานหลักสูตร", hint: "ตรวจความครบถ้วนของข้อมูลที่นำเข้า" },
        { path: "curriculum/workbook-compare", label: "เทียบไฟล์โครงสร้างกับระบบ", icon: GitCompareArrows, group: "ตรวจทานหลักสูตร", hint: "อ่านไฟล์ Excel ที่โรงเรียนยืนยัน แล้วเทียบกับทะเบียน (ไม่แก้ข้อมูล)" },
        { path: "curriculum/imports", label: "นำเข้าเอกสารหลักสูตร", icon: FileSpreadsheet, group: "ตรวจทานหลักสูตร", hint: "อัปโหลด PDF/Excel ต้นฉบับ" },
        { path: "curriculum/source-archive", label: "เอกสารที่เก็บเข้าคลัง", icon: Archive, group: "ตรวจทานหลักสูตร", hint: "เอกสารต้นทางที่เลิกใช้งาน และประวัติการลบ" },
        { path: "curriculum/registry", label: "รายชื่อรายวิชาทั้งหมด", icon: BookOpen, group: "รายวิชาและคำอธิบาย", hint: "ค้นหารายวิชา รหัส หน่วยกิต" },
        { path: "curriculum/structure", label: "รายวิชาในแต่ละชั้น", icon: ListChecks, group: "รายวิชาและคำอธิบาย", hint: "วิชาที่เรียนในแต่ละชั้นและภาคเรียน" },
        { path: "curriculum/syllabi", label: "คำอธิบายรายวิชา", icon: BookText, group: "รายวิชาและคำอธิบาย", hint: "เลือกวิชา → เลือกตัวชี้วัด → เขียน → บันทึก" },
        { path: "curriculum/indicators", label: "มาตรฐานและตัวชี้วัด", icon: Target, group: "มาตรฐานและตัวชี้วัด", hint: "สิ่งที่นักเรียนต้องรู้และทำได้" },
        { path: "curriculum/mapping", label: "เปรียบเทียบหลักสูตร (Mapping)", icon: GitCompareArrows, group: "มาตรฐานและตัวชี้วัด", hint: "เทียบหลักสูตรโรงเรียนกับหลักสูตรแกนกลาง" },
        { path: "curriculum/coverage", label: "ความครอบคลุมมาตรฐาน", icon: ListChecks, group: "มาตรฐานและตัวชี้วัด", hint: "มาตรฐานใดครอบคลุมแล้ว/ต้องตรวจ" },
        { path: "curriculum/lesson-plans", label: "แผนการสอน", icon: NotebookPen, group: "แผนการสอน", hint: "ดึงรายวิชาและตัวชี้วัดให้อัตโนมัติ" },
        { path: "curriculum/reports", label: "รายงานและดาวน์โหลด", icon: BarChart3, group: "รายงานและความก้าวหน้า", hint: "ส่งออก PDF / Excel" },
        { path: "curriculum/readiness", label: "ความคืบหน้าภาพรวม", icon: BarChart3, group: "รายงานและความก้าวหน้า", hint: "งานที่ทำแล้วและงานที่ยังค้าง" },
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
        { path: "reports", label: "รายงาน ปพ. & ผลสัมฤทธิ์", icon: BarChart3, plannedPhase: "Phase 3", roles: ACADEMIC_AND_EXEC },
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
