import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { AccessCheckError, ACCESS_TIMEOUT_MS, fetchMyAccess, type MyAccess } from "./api";
import type { SignOutReason } from "./errors";
import { can, sortRoles, type AppRole, type Capability } from "./roles";

type AuthStatus = "loading" | "signed_out" | "signed_in";

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  /** ข้อมูลสิทธิ์จากฐานข้อมูล (null ระหว่างโหลด) */
  access: MyAccess | null;
  accessLoading: boolean;
  accessError: unknown;
  /** Supabase Auth ไม่ตอบภายในเวลาที่กำหนด (ค้างที่ขั้นเริ่มต้น session) */
  authInitTimedOut: boolean;
  retryAccess: () => void;
  roles: AppRole[];
  can: (capability: Capability) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (reason?: SignOutReason) => Promise<void>;
  /** เหตุผลการออกจากระบบครั้งล่าสุด (แสดงบนหน้า Login) */
  lastSignOutReason: SignOutReason | null;
  clearSignOutReason: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACCESS_REFRESH_MS = 5 * 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(supabase ? "loading" : "signed_out");
  const [lastSignOutReason, setLastSignOutReason] = useState<SignOutReason | null>(null);
  /** true เมื่อผู้ใช้/ระบบสั่ง signOut เอง เพื่อแยกจากกรณี session หมดอายุ */
  const intentionalSignOut = useRef(false);
  const [authInitTimedOut, setAuthInitTimedOut] = useState(false);

  // ขั้นเริ่มต้น session (อ่าน storage + refresh token) ต้องจบภายในเวลาที่กำหนด มิฉะนั้นแสดงข้อผิดพลาดแทน loading
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setAuthInitTimedOut(true), ACCESS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!supabase) return;
    // onAuthStateChange ส่ง INITIAL_SESSION จาก storage มาก่อนเสมอ
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setStatus(next ? "signed_in" : "signed_out");
      if (event === "SIGNED_OUT") {
        queryClient.removeQueries({ queryKey: ["auth"] });
        if (!intentionalSignOut.current) setLastSignOutReason((r) => r ?? "expired");
        intentionalSignOut.current = false;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        // ดึงสิทธิ์ใหม่ทุกครั้งที่ token เปลี่ยน เพื่อสะท้อนการเปลี่ยนบทบาทหรือการระงับบัญชี
        void queryClient.invalidateQueries({ queryKey: ["auth", "access"] });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;
  const accessQuery = useQuery({
    queryKey: ["auth", "access", userId],
    queryFn: fetchMyAccess,
    enabled: status === "signed_in" && userId !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: ACCESS_REFRESH_MS,
    // ไม่ลองซ้ำเมื่อสาเหตุแก้ไม่ได้ด้วยการลองใหม่ (ไม่มีฟังก์ชัน / ไม่มีสิทธิ์ / ไม่มีโปรไฟล์)
    retry: (count, error) => count < 1 && (!(error instanceof AccessCheckError) || ["network", "unknown"].includes(error.kind)),
  });
  const access = accessQuery.data ?? null;

  const signOut = useCallback(
    async (reason: SignOutReason = "signed_out") => {
      if (!supabase) return;
      intentionalSignOut.current = true;
      setLastSignOutReason(reason);
      // scope "local": ออกจากอุปกรณ์นี้ (ไม่กระทบอุปกรณ์อื่นของผู้ใช้)
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        // แม้เซิร์ฟเวอร์ตอบผิดพลาด ก็ล้าง session ในเครื่องแล้ว
        console.warn("signOut:", error.message);
      }
      queryClient.clear();
    },
    [queryClient],
  );

  // บัญชีถูกระงับ / ไม่ผูกโรงเรียน → บังคับออกจากระบบทันที
  useEffect(() => {
    if (!access) return;
    if (access.account_status === "suspended") void signOut("suspended");
    else if (access.account_status !== "active") void signOut("no_school");
  }, [access, signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured");
    setLastSignOutReason(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const roles = access?.account_status === "active" ? sortRoles(access.roles) : [];
    return {
      status,
      session,
      access,
      accessLoading: accessQuery.isPending && status === "signed_in",
      accessError: accessQuery.error,
      authInitTimedOut: authInitTimedOut && status === "loading",
      retryAccess: () => void accessQuery.refetch(),
      roles,
      can: (capability) => can(roles, capability),
      signIn,
      signOut,
      lastSignOutReason,
      clearSignOutReason: () => setLastSignOutReason(null),
    };
  }, [status, session, access, accessQuery, authInitTimedOut, signIn, signOut, lastSignOutReason]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
