import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";

/**
 * Supabase client (anon key เท่านั้น — สิทธิ์จริงบังคับด้วย RLS ที่ฐานข้อมูล)
 * Phase 1.1: ยังไม่มีการเรียกใช้งาน และคืนค่า null หากยังไม่ได้ตั้งค่า
 * Phase 1.2: เชื่อมกับ Supabase local (`supabase start`) / staging
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  client ??= createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
