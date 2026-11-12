import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSupabase } from "@/lib/supabase";
import { authErrorMessage } from "../errors";
import { AuthLayout, Field, FormAlert, inputClass } from "./AuthLayout";

const schema = z.object({ email: z.string().trim().min(1, "กรุณากรอกอีเมล").pipe(z.email("รูปแบบอีเมลไม่ถูกต้อง")) });

/**
 * ขอลิงก์รีเซ็ตรหัสผ่าน — ใช้ได้เมื่อ Supabase ตั้งค่า SMTP แล้ว (local ใช้ Mailpit)
 * แสดงข้อความเดียวกันเสมอ ไม่ว่าจะมีอีเมลในระบบหรือไม่ (กันการสืบหาบัญชี)
 */
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error && error.code !== "user_not_found") setError(authErrorMessage(error));
    else setSent(true);
  });

  return (
    <AuthLayout title="ลืมรหัสผ่าน" subtitle="รับลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล">
      {sent ? (
        <FormAlert tone="success">หากอีเมลนี้มีอยู่ในระบบ คุณจะได้รับลิงก์สำหรับตั้งรหัสผ่านใหม่ภายในไม่กี่นาที</FormAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <FormAlert tone="error">{error}</FormAlert>}
          <Field id="email" label="อีเมลที่ใช้เข้าสู่ระบบ" error={formState.errors.email?.message}>
            <input id="email" type="email" autoComplete="email" className={inputClass} {...register("email")} />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Mail />} ส่งลิงก์
          </Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm">
        <Link to="/login" className="text-primary hover:underline">กลับไปหน้าเข้าสู่ระบบ</Link>
      </p>
    </AuthLayout>
  );
}
