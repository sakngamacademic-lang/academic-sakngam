import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { env, isSupabaseConfigured, supabaseProjectLabel } from "@/lib/env";
import { useAuth } from "../AuthProvider";
import { FullPageSpinner } from "../guards";
import { authErrorMessage, SIGN_OUT_MESSAGES } from "../errors";
import { defaultPortalPath } from "../roles";
import { AuthLayout, Field, FormAlert, inputClass } from "./AuthLayout";

const schema = z.object({
  email: z.string().trim().min(1, "กรุณากรอกอีเมล").pipe(z.email("รูปแบบอีเมลไม่ถูกต้อง")),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { status, roles, access, accessLoading, signIn, lastSignOutReason } = useAuth();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  // เข้าสู่ระบบอยู่แล้ว → ไปหน้าที่ตั้งใจ หรือ portal ตามบทบาท
  if (status === "signed_in") {
    if (accessLoading || !access) return <FullPageSpinner />;
    if (access.account_status === "active") {
      const from = (location.state as { from?: string } | null)?.from;
      const target = from && from !== "/login" ? from : defaultPortalPath(roles);
      if (target) return <Navigate to={target} replace />;
      return <Navigate to="/no-access" replace />;
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
    } catch (err) {
      setFormError(authErrorMessage(err));
    }
  });

  const notice = lastSignOutReason ? SIGN_OUT_MESSAGES[lastSignOutReason] : null;

  return (
    <AuthLayout title="เข้าสู่ระบบ" subtitle="สำหรับบุคลากรโรงเรียน">
      {!isSupabaseConfigured && (
        <FormAlert tone="error">ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase (ดู README หัวข้อ Environment Variables)</FormAlert>
      )}
      {notice && !formError && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      {formError && <FormAlert tone="error">{formError}</FormAlert>}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field id="email" label="อีเมล" error={errors.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            className={inputClass}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
        </Field>
        <Field id="password" label="รหัสผ่าน" error={errors.password?.message}>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className={`${inputClass} pr-11`}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !isSupabaseConfigured || status === "signed_in"}>
          {isSubmitting || status === "signed_in" ? <Loader2 className="animate-spin" /> : <LogIn />}
          เข้าสู่ระบบ
        </Button>
      </form>

      <div className="mt-5 flex flex-col items-center gap-1 text-center text-sm">
        <Link to="/forgot-password" className="text-primary hover:underline">
          ลืมรหัสผ่าน?
        </Link>
        <p className="text-xs text-muted-foreground">ระบบไม่เปิดให้สมัครสมาชิกเอง บัญชีสร้างโดยผู้ดูแลระบบ</p>
        {supabaseProjectLabel() && (
          <p className="text-xs text-muted-foreground" data-testid="supabase-project">
            สภาพแวดล้อม {env.VITE_APP_ENV} · Supabase <code>{supabaseProjectLabel()}</code>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
