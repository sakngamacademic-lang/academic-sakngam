import type { RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { buildPortalRoutes } from "@/features/navigation/build-routes";
import { RequireAuth, RequireRoles } from "@/features/auth/guards";
import { TeacherDashboardPage } from "@/features/dashboard/teacher/TeacherDashboardPage";
import { teacherPortal } from "./navigation";

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
  }),
};
