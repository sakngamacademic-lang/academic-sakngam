import type { RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { buildPortalRoutes } from "@/features/navigation/build-routes";
import { RequireAuth, RequireRoles } from "@/features/auth/guards";
import type { AppRole } from "@/features/auth/roles";
import { OfficeDashboardPage } from "@/features/dashboard/office/OfficeDashboardPage";
import { AcademicYearsPage } from "@/features/master-data/pages/AcademicYearsPage";
import { TermsPage } from "@/features/master-data/pages/TermsPage";
import { GradeLevelsPage } from "@/features/master-data/pages/GradeLevelsPage";
import { ClassroomsPage } from "@/features/master-data/pages/ClassroomsPage";
import { LearningAreasPage } from "@/features/master-data/pages/LearningAreasPage";
import { TeachersPage } from "@/features/teachers/pages/TeachersPage";
import { TeacherDocumentsPage } from "@/features/documents/pages/TeacherDocumentsPage";
import { TasksPage } from "@/features/tasks/pages/TasksPage";
import { TaskCreatePage } from "@/features/tasks/pages/TaskCreatePage";
import { TaskDetailPage } from "@/features/tasks/pages/TaskDetailPage";
import { officePortal } from "./navigation";

const TASK_MANAGERS: readonly AppRole[] = ["academic_head", "academic_staff", "learning_area_head"];
const TASK_VIEWERS: readonly AppRole[] = [...TASK_MANAGERS, "executive"];

export const officeRoutes: RouteObject = {
  path: officePortal.basePath,
  element: (
    <RequireAuth>
      <RequireRoles roles={officePortal.roles}>
        <AppShell portal={officePortal} />
      </RequireRoles>
    </RequireAuth>
  ),
  children: [
    // หน้าย่อยของภาระงาน (ไม่อยู่ในเมนู) — guard ตามบทบาทเดียวกับ Permission Matrix
    { path: "tasks/create", element: <RequireRoles roles={TASK_MANAGERS}><TaskCreatePage /></RequireRoles> },
    { path: "tasks/:taskId", element: <RequireRoles roles={TASK_VIEWERS}><TaskDetailPage /></RequireRoles> },
    ...buildPortalRoutes(officePortal, {
    "": <OfficeDashboardPage />,
    "academic-years": <AcademicYearsPage />,
    terms: <TermsPage />,
    "grade-levels": <GradeLevelsPage />,
    classrooms: <ClassroomsPage />,
    "learning-areas": <LearningAreasPage />,
    teachers: <TeachersPage />,
    documents: <TeacherDocumentsPage />,
    tasks: <TasksPage />,
  }),
  ],
};
