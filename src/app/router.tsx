import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { officeRoutes } from "@/portals/office/routes";
import { teacherRoutes } from "@/portals/teacher/routes";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ForgotPasswordPage } from "@/features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/pages/ResetPasswordPage";
import { FullPageSpinner, RequireAuth } from "@/features/auth/guards";
import { ForbiddenPage } from "./pages/ForbiddenPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// หน้า Welcome (public) แยก chunk: CSS/JS ของ animation โหลดเฉพาะหน้านี้ ไม่ทำให้ Dashboard หนักขึ้น
const WelcomePage = lazy(() => import("@/features/welcome/WelcomePage"));

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Suspense fallback={<FullPageSpinner label="กำลังโหลด…" />}>
        <WelcomePage />
      </Suspense>
    ),
  },
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/no-access", element: <RequireAuth><ForbiddenPage /></RequireAuth> },
  officeRoutes,
  teacherRoutes,
  { path: "*", element: <NotFoundPage /> },
]);
