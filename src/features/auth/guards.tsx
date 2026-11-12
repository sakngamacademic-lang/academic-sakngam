import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ForbiddenPage } from "@/app/pages/ForbiddenPage";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthProvider";
import { hasAnyRole, type AppRole } from "./roles";

/**
 * Route guards — ควบคุมการแสดงผลฝั่ง UI เท่านั้น
 * ⚠️ ไม่ใช่การรักษาความปลอดภัย: ทุกการอ่าน/เขียนข้อมูลถูกตรวจซ้ำด้วย RLS ในฐานข้อมูล
 */

export function FullPageSpinner({ label = "กำลังตรวจสอบสิทธิ์…" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** ต้องเข้าสู่ระบบ และบัญชีต้องใช้งานได้ */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, access, accessLoading, accessError, signOut } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageSpinner />;
  if (status === "signed_out") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (accessLoading) return <FullPageSpinner label="กำลังโหลดข้อมูลผู้ใช้…" />;
  if (accessError || !access) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-semibold">ไม่สามารถโหลดข้อมูลสิทธิ์ผู้ใช้ได้</h1>
        <p className="text-sm text-muted-foreground">กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาให้ติดต่อผู้ดูแลระบบ</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>ลองใหม่</Button>
          <Button onClick={() => void signOut()}>ออกจากระบบ</Button>
        </div>
      </div>
    );
  }
  // บัญชีถูกระงับ: AuthProvider กำลังสั่ง signOut — ไม่แสดงเนื้อหาใด ๆ ระหว่างนี้
  if (access.account_status !== "active") return <FullPageSpinner label="กำลังออกจากระบบ…" />;
  return <>{children}</>;
}

/** ต้องมีอย่างน้อยหนึ่งบทบาทที่กำหนด มิฉะนั้นแสดง 403 */
export function RequireRoles({ roles, children }: { roles: readonly AppRole[]; children: ReactNode }) {
  const auth = useAuth();
  if (!hasAnyRole(auth.roles, roles)) return <ForbiddenPage />;
  return <>{children}</>;
}
