import type { RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { buildPortalRoutes } from "@/features/navigation/build-routes";
import { TeacherDashboardPage } from "@/features/dashboard/teacher/TeacherDashboardPage";
import { teacherPortal } from "./navigation";

export const teacherRoutes: RouteObject = {
  path: teacherPortal.basePath,
  element: <AppShell portal={teacherPortal} />,
  children: buildPortalRoutes(teacherPortal, {
    "": <TeacherDashboardPage />,
  }),
};
