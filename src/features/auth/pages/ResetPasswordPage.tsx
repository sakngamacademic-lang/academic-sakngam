import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSupabase } from "@/lib/supabase";
import { useAuth } from "../AuthProvider";
import { FullPageSpinner } from "../guards";
import { authErrorMessage } from "../errors";
import { AuthLayout, Field, FormAlert, inputClass } from "./AuthLayout";

const schema = z
  .object({
    password: z.string().min(10, "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร").max(72, "รหัสผ่านยาวเกินไป"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "รหัสผ่านไม่ตรงกัน" });

/** ตั้งรหัสผ่านใหม่ — เข้าถึงผ่านลิงก์จากอีเมล (supabase-js แลก code เป็น session ให้อัตโนมัติ) */
export function ResetPasswordPage() {
  const { status, signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  if (status === "loading") return <FullPageSpinner label="กำลังตรวจสอบลิงก์…" />;

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    const { error } = await requireSupabase().auth.updateUser({ password });
    if (error) return setError(authErrorMessage(error));
    await signOut("signed_out");
    navigate("/login", { replace: true });
  });

  return (
    <AuthLayout title="ตั้งรหัสผ่านใหม่">
      {status !== "signed_in" ? (
        <>
          <FormAlert tone="error">ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่</FormAlert>
          <p className="text-center text-sm">
            <Link to="/forgot-password" className="text-primary hover:underline">ขอลิงก์ใหม่</Link>
          </p>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <FormAlert tone="error">{error}</FormAlert>}
          <Field id="password" label="รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร)" error={formState.errors.password?.message}>
            <input id="password" type="password" autoComplete="new-password" className={inputClass} {...register("password")} />
          </Field>
          <Field id="confirm" label="ยืนยันรหัสผ่านใหม่" error={formState.errors.confirm?.message}>
            <input id="confirm" type="password" autoComplete="new-password" className={inputClass} {...register("confirm")} />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />} บันทึกรหัสผ่านใหม่
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
