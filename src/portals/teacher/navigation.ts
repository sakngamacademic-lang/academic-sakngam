import { Bell, BookOpenCheck, BookText, NotebookPen, FileText, FolderLock, LayoutDashboard, UserRound, Users } from "lucide-react";
import type { PortalConfig } from "@/features/navigation/types";
import { TEACHER_ROLES } from "@/features/auth/roles";

/** เมนูครู: เห็นเฉพาะงานของตนเอง — จัดทำรายวิชา / แผนการสอน / รายงานและส่งออก (route เดิมทั้งหมด) */
export const teacherPortal: PortalConfig = {
  id: "teacher",
  basePath: "/teacher",
  name: "ระบบครู",
  shortName: "ครู",
  roles: TEACHER_ROLES,
  sections: [
    {
      items: [
        { path: "", label: "หน้าหลักของฉัน", icon: LayoutDashboard, hint: "งานที่ต้องทำและรายวิชาที่สอน" },
        { path: "assignments", label: "งานที่ได้รับมอบหมาย", icon: FileText, hint: "เอกสารที่ฝ่ายวิชาการขอให้ส่ง" },
      ],
    },
    {
      title: "จัดทำรายวิชา",
      items: [{ path: "courses-plan", label: "คำอธิบายรายวิชา", icon: BookText, hint: "เลือกวิชา → เลือกตัวชี้วัด → เขียน → บันทึก" }],
    },
    {
      title: "แผนการสอน",
      items: [{ path: "lesson-plans", label: "แผนการสอนของฉัน", icon: NotebookPen, hint: "ระบบดึงรายวิชาและตัวชี้วัดให้อัตโนมัติ" }],
    },
    {
      title: "รายงานและส่งออก",
      items: [
        { path: "documents", label: "คลังเอกสารของฉัน", icon: FolderLock, hint: "ไฟล์ที่อัปโหลดไว้" },
        { path: "courses", label: "คะแนนและผลการเรียน", icon: BookOpenCheck },
      ],
    },
    {
      title: "อื่น ๆ",
      tools: true,
      items: [
        { path: "notifications", label: "การแจ้งเตือน", icon: Bell, plannedPhase: "Phase 1.11" },
        { path: "homeroom", label: "ห้องที่ปรึกษา", icon: Users, plannedPhase: "Phase 2" },
        { path: "profile", label: "โปรไฟล์", icon: UserRound },
      ],
    },
  ],
};
