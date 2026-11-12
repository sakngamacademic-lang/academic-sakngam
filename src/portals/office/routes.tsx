import type { RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { buildPortalRoutes } from "@/features/navigation/build-routes";
import { OfficeDashboardPage } from "@/features/dashboard/office/OfficeDashboardPage";
import { officePortal } from "./navigation";

export const officeRoutes: RouteObject = {
  path: officePortal.basePath,
  element: <AppShell portal={officePortal} />,
  children: buildPortalRoutes(officePortal, {
    "": <OfficeDashboardPage />,
  }),
};
