import type { RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { buildPortalRoutes } from "@/features/navigation/build-routes";
import { RequireAuth, RequireRoles } from "@/features/auth/guards";
import { OfficeDashboardPage } from "@/features/dashboard/office/OfficeDashboardPage";
import { AcademicYearsPage } from "@/features/master-data/pages/AcademicYearsPage";
import { TermsPage } from "@/features/master-data/pages/TermsPage";
import { GradeLevelsPage } from "@/features/master-data/pages/GradeLevelsPage";
import { ClassroomsPage } from "@/features/master-data/pages/ClassroomsPage";
import { LearningAreasPage } from "@/features/master-data/pages/LearningAreasPage";
import { TeachersPage } from "@/features/teachers/pages/TeachersPage";
import { officePortal } from "./navigation";

export const officeRoutes: RouteObject = {
  path: officePortal.basePath,
  element: (
    <RequireAuth>
      <RequireRoles roles={officePortal.roles}>
        <AppShell portal={officePortal} />
      </RequireRoles>
    </RequireAuth>
  ),
  children: buildPortalRoutes(officePortal, {
    "": <OfficeDashboardPage />,
    "academic-years": <AcademicYearsPage />,
    terms: <TermsPage />,
    "grade-levels": <GradeLevelsPage />,
    classrooms: <ClassroomsPage />,
    "learning-areas": <LearningAreasPage />,
    teachers: <TeachersPage />,
  }),
};
