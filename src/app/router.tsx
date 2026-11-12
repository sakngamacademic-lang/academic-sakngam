import { createBrowserRouter } from "react-router-dom";
import { officeRoutes } from "@/portals/office/routes";
import { teacherRoutes } from "@/portals/teacher/routes";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ForgotPasswordPage } from "@/features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/pages/ResetPasswordPage";
import { RequireAuth } from "@/features/auth/guards";
import { HomeRedirect } from "./pages/HomeRedirect";
import { ForbiddenPage } from "./pages/ForbiddenPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  { path: "/", element: <HomeRedirect /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/no-access", element: <RequireAuth><ForbiddenPage /></RequireAuth> },
  officeRoutes,
  teacherRoutes,
  { path: "*", element: <NotFoundPage /> },
]);
