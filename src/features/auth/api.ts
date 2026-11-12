import { z } from "zod";
import { requireSupabase } from "@/lib/supabase";
import { APP_ROLES } from "./roles";

/** ผลลัพธ์จาก RPC public.get_my_access() — ตรวจรูปแบบด้วย Zod ก่อนใช้งาน */
const myAccessSchema = z.object({
  user_id: z.uuid(),
  email: z.string().nullable(),
  display_name: z.string(),
  is_active: z.boolean(),
  account_status: z.enum(["active", "suspended", "no_school", "school_inactive"]),
  school: z.object({ id: z.uuid(), code: z.string(), name_th: z.string() }).nullable(),
  // บทบาทที่ไม่รู้จัก (เช่นเพิ่มใน DB ภายหลัง) จะถูกตัดทิ้ง ไม่ทำให้แอปพัง
  roles: z.array(z.string()).transform((rs) => rs.filter((r): r is (typeof APP_ROLES)[number] =>
    (APP_ROLES as readonly string[]).includes(r))),
});

export type MyAccess = z.infer<typeof myAccessSchema>;

export async function fetchMyAccess(): Promise<MyAccess | null> {
  const { data, error } = await requireSupabase().rpc("get_my_access");
  if (error) throw error;
  if (data === null) return null;
  return myAccessSchema.parse(data);
}
