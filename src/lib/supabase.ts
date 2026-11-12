import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";

/**
 * Supabase client ฝั่ง browser — ใช้ anon/publishable key เท่านั้น
 * สิทธิ์จริงบังคับด้วย RLS ที่ฐานข้อมูล ห้ามใช้ service_role key ใน frontend
 *
 * - persistSession: เก็บ access/refresh token ใน localStorage (ไม่เก็บรหัสผ่าน)
 * - autoRefreshToken: ต่ออายุ token อัตโนมัติก่อนหมดอายุ
 * - flowType "pkce": ลิงก์รีเซ็ตรหัสผ่านใช้ code แลก session (ปลอดภัยกว่า implicit)
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
  return supabase;
}
