import { createBrowserRouter } from "react-router-dom";
import { officeRoutes } from "@/portals/office/routes";
import { teacherRoutes } from "@/portals/teacher/routes";
import { PortalSelectPage } from "./pages/PortalSelectPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  { path: "/", element: <PortalSelectPage /> },
  officeRoutes,
  teacherRoutes,
  { path: "*", element: <NotFoundPage /> },
]);
