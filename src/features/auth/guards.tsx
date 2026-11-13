import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ForbiddenPage } from "@/app/pages/ForbiddenPage";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthProvider";
import { AccessCheckError, type AccessFailureKind } from "./api";
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

const ACCESS_MESSAGES: Record<AccessFailureKind | "auth_timeout", { title: string; hint: string }> = {
  auth_timeout: { title: "เชื่อมต่อระบบยืนยันตัวตนไม่สำเร็จ", hint: "Supabase Auth ไม่ตอบภายในเวลาที่กำหนด — ตรวจการเชื่อมต่ออินเทอร์เน็ต หรือการตั้งค่า Supabase ของเวอร์ชันนี้" },
  timeout: { title: "ตรวจสอบสิทธิ์ไม่สำเร็จ (หมดเวลา)", hint: "ฐานข้อมูลไม่ตอบภายในเวลาที่กำหนด กรุณาลองใหม่" },
  network: { title: "เชื่อมต่อฐานข้อมูลไม่ได้", hint: "ตรวจสอบอินเทอร์เน็ต หรือ URL ของ Supabase ที่เวอร์ชันนี้ใช้" },
  missing_function: { title: "ระบบฐานข้อมูลยังติดตั้งไม่ครบ", hint: "ไม่พบฟังก์ชันตรวจสิทธิ์ (get_my_access) — Migration ของฐานข้อมูลนี้อาจยังไม่ได้ติดตั้ง กรุณาแจ้งผู้ดูแลระบบ" },
  permission: { title: "ไม่มีสิทธิ์เรียกข้อมูลสิทธิ์ผู้ใช้", hint: "เซสชันอาจหมดอายุ หรือสิทธิ์ของฐานข้อมูลไม่ถูกต้อง กรุณาออกจากระบบแล้วเข้าใหม่ หากยังพบปัญหาให้แจ้งผู้ดูแลระบบ" },
  no_profile: { title: "ไม่พบข้อมูลโปรไฟล์ของบัญชีนี้", hint: "บัญชีอาจถูกสร้างก่อนติดตั้งระบบ หรือยังไม่ได้ผูกกับโรงเรียน กรุณาแจ้งผู้ดูแลระบบ" },
  invalid_response: { title: "ข้อมูลสิทธิ์ผู้ใช้ไม่อยู่ในรูปแบบที่รองรับ", hint: "เวอร์ชันของแอปและฐานข้อมูลอาจไม่ตรงกัน กรุณาแจ้งผู้ดูแลระบบ" },
  unknown: { title: "ไม่สามารถโหลดข้อมูลสิทธิ์ผู้ใช้ได้", hint: "กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาให้ติดต่อผู้ดูแลระบบ" },
};

/** หน้าข้อผิดพลาดของขั้นตรวจสอบสิทธิ์ — แทน loading ไม่สิ้นสุด · แสดงคำขอและรหัสที่ล้มเหลว (ไม่มีข้อมูลลับ) */
export function AccessErrorScreen({ error, authTimeout = false }: { error?: unknown; authTimeout?: boolean }) {
  const { signOut, retryAccess } = useAuth();
  const kind = authTimeout ? "auth_timeout" : error instanceof AccessCheckError ? error.kind : "unknown";
  const msg = ACCESS_MESSAGES[kind];
  const technical = authTimeout ? "Supabase Auth: session initialization timeout" : error instanceof AccessCheckError ? error.message : error instanceof Error ? error.message : null;
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">{msg.title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{msg.hint}</p>
      {technical && <p className="max-w-md font-mono text-xs break-all text-muted-foreground" data-testid="access-error-detail">{technical}</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => (authTimeout ? window.location.reload() : retryAccess())}>ลองใหม่</Button>
        <Button onClick={() => void signOut()}>ออกจากระบบ</Button>
      </div>
    </div>
  );
}

/** ต้องเข้าสู่ระบบ และบัญชีต้องใช้งานได้ */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, access, accessLoading, accessError, authInitTimedOut } = useAuth();
  const location = useLocation();

  if (authInitTimedOut) return <AccessErrorScreen authTimeout />;
  if (status === "loading") return <FullPageSpinner />;
  if (status === "signed_out") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (accessLoading) return <FullPageSpinner label="กำลังโหลดข้อมูลผู้ใช้…" />;
  if (accessError || !access) return <AccessErrorScreen error={accessError} />;
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
