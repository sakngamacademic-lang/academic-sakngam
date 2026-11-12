import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireAuth } from "@/features/auth/guards";
import { defaultPortalPath } from "@/features/auth/roles";
import { ForbiddenPage } from "./ForbiddenPage";

/** "/" → portal ตามบทบาท (ยังไม่ login → /login ผ่าน RequireAuth) */
function Redirector() {
  const { roles } = useAuth();
  const target = defaultPortalPath(roles);
  return target ? <Navigate to={target} replace /> : <ForbiddenPage />;
}

export function HomeRedirect() {
  return (
    <RequireAuth>
      <Redirector />
    </RequireAuth>
  );
}
