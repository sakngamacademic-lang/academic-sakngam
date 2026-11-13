import { z } from "zod";

/**
 * ตรวจค่า environment ฝั่ง client ด้วย Zod
 * - ทุกค่าเป็น optional ใน Phase 1.1 เพราะยังไม่เชื่อมฐานข้อมูล
 * - ห้ามใส่ secret ใด ๆ ที่นี่: ตัวแปร VITE_* จะถูกฝังใน bundle ที่ผู้ใช้ดาวน์โหลดได้
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.url().optional().or(z.literal("")),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  VITE_APP_ENV: z.enum(["local", "staging"]).default("local"),
  /** ที่อยู่ Edge Functions (ไม่ใช่ secret) — ค่าเริ่มต้น `${VITE_SUPABASE_URL}/functions/v1` */
  VITE_FUNCTIONS_URL: z.url().optional().or(z.literal("")),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error("ค่า environment ไม่ถูกต้อง:", z.treeifyError(parsed.error));
}

export const env = parsed.success ? parsed.data : envSchema.parse({});

export const isSupabaseConfigured = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);

/**
 * ป้ายบอกว่าแอปเชื่อมกับ Supabase project ใด (ใช้ตรวจ Vercel Preview ว่าเชื่อมถูกตัว)
 * — แสดงเฉพาะ project ref / host ซึ่งเป็นข้อมูลสาธารณะใน URL อยู่แล้ว ไม่ใช่ key
 */
export function supabaseProjectLabel(url = env.VITE_SUPABASE_URL): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).host;
    return /^[a-z0-9]{20}\.supabase\.co$/.test(host) ? host.split(".")[0]! : host;
  } catch {
    return null;
  }
}
