import type { RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { buildPortalRoutes } from "@/features/navigation/build-routes";
import { RequireAuth, RequireRoles } from "@/features/auth/guards";
import { OfficeDashboardPage } from "@/features/dashboard/office/OfficeDashboardPage";
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
  }),
};
