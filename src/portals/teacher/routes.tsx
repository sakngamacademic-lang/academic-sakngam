import type { RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { buildPortalRoutes } from "@/features/navigation/build-routes";
import { RequireAuth, RequireRoles } from "@/features/auth/guards";
import { TeacherDashboardPage } from "@/features/dashboard/teacher/TeacherDashboardPage";
import { TeacherProfilePage } from "@/features/teachers/pages/TeacherProfilePage";
import { MyDocumentsPage } from "@/features/documents/pages/MyDocumentsPage";
import { AssessmentPage } from "@/features/assessment/pages/AssessmentPage";
import { MyAssignmentsPage } from "@/features/tasks/pages/MyAssignmentsPage";
import { SyllabusPage } from "@/features/syllabus/SyllabusPage";
import { LessonPlanPage } from "@/features/lesson-plans/LessonPlanPage";
import { teacherPortal } from "./navigation";
import { curriculumViewerPage } from "@/features/curriculum/routes";

export const teacherRoutes: RouteObject = {
  path: teacherPortal.basePath,
  element: (
    <RequireAuth>
      <RequireRoles roles={teacherPortal.roles}>
        <AppShell portal={teacherPortal} />
      </RequireRoles>
    </RequireAuth>
  ),
  children: buildPortalRoutes(teacherPortal, {
    "": <TeacherDashboardPage />,
    profile: <TeacherProfilePage />,
    documents: <MyDocumentsPage />,
    assignments: <MyAssignmentsPage />,
    courses: <AssessmentPage />,
    "courses-plan": <SyllabusPage />,
    "lesson-plans": <LessonPlanPage />,
    curriculum: curriculumViewerPage,
  }),
};
