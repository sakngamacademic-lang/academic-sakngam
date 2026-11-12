import { Bell, BookOpenCheck, FileText, FolderLock, LayoutDashboard, UserRound, Users } from "lucide-react";
import type { PortalConfig } from "@/features/navigation/types";
import { TEACHER_ROLES } from "@/features/auth/roles";

export const teacherPortal: PortalConfig = {
  id: "teacher",
  basePath: "/teacher",
  name: "ระบบครู",
  shortName: "ครู",
  roles: TEACHER_ROLES,
  sections: [
    {
      items: [
        { path: "", label: "แดชบอร์ดของฉัน", icon: LayoutDashboard },
        { path: "tasks", label: "งานที่ได้รับมอบหมาย", icon: FileText, plannedPhase: "Phase 1.9" },
        { path: "documents", label: "คลังเอกสารของฉัน", icon: FolderLock },
        { path: "notifications", label: "การแจ้งเตือน", icon: Bell, plannedPhase: "Phase 1.11" },
      ],
    },
    {
      title: "การสอน",
      items: [
        { path: "courses", label: "รายวิชาที่สอน", icon: BookOpenCheck, plannedPhase: "Phase 2" },
        { path: "homeroom", label: "ห้องที่ปรึกษา", icon: Users, plannedPhase: "Phase 2" },
      ],
    },
    { title: "บัญชี", items: [{ path: "profile", label: "โปรไฟล์", icon: UserRound }] },
  ],
};
