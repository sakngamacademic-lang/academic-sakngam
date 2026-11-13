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
  learning_area_ids: z.array(z.uuid()).default([]),
});

export type MyAccess = z.infer<typeof myAccessSchema>;

/** เวลาสูงสุดที่รอ get_my_access() — เกินนี้แสดงข้อผิดพลาดแทน loading ไม่สิ้นสุด */
export const ACCESS_TIMEOUT_MS = 15_000;

export type AccessFailureKind = "timeout" | "network" | "missing_function" | "permission" | "no_profile" | "invalid_response" | "unknown";

/** ข้อผิดพลาดของขั้นตรวจสอบสิทธิ์ — ระบุคำขอ (request) และรหัสที่เกิดจริง เพื่อใช้วิเคราะห์ปัญหา (ไม่มีข้อมูลลับ) */
export class AccessCheckError extends Error {
  constructor(
    readonly kind: AccessFailureKind,
    readonly request: string,
    readonly detail: { status?: number; code?: string } = {},
  ) {
    super(`${request}: ${kind}${detail.status ? ` HTTP ${detail.status}` : ""}${detail.code ? ` ${detail.code}` : ""}`);
    this.name = "AccessCheckError";
  }
}

const REQUEST = "POST /rest/v1/rpc/get_my_access";

export function classifyAccessFailure(e: { code?: string; message?: string; status?: number; name?: string } | null | undefined, status?: number): AccessFailureKind {
  const code = e?.code ?? "";
  const msg = `${e?.name ?? ""} ${e?.message ?? ""}`;
  if (/AbortError|TimeoutError|aborted|timed? ?out/i.test(msg) || code === "20") return "timeout";
  if (code === "PGRST202" || code === "42883" || status === 404) return "missing_function";
  if (code === "42501" || code === "PGRST301" || code === "PGRST302" || status === 401 || status === 403) return "permission";
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg) || status === 0) return "network";
  return "unknown";
}

export async function fetchMyAccess(): Promise<MyAccess> {
  let res;
  try {
    res = await requireSupabase().rpc("get_my_access").abortSignal(AbortSignal.timeout(ACCESS_TIMEOUT_MS));
  } catch (e) {
    throw new AccessCheckError(classifyAccessFailure(e as Error), REQUEST);
  }
  const { data, error, status } = res;
  if (error) throw new AccessCheckError(classifyAccessFailure(error, status), REQUEST, { status, code: error.code });
  // ฟังก์ชันคืน null เมื่อไม่มีแถวใน profiles ของผู้ใช้นี้ (บัญชีสร้างก่อนติดตั้ง trigger/migration)
  if (data === null) throw new AccessCheckError("no_profile", REQUEST, { status });
  const parsed = myAccessSchema.safeParse(data);
  if (!parsed.success) throw new AccessCheckError("invalid_response", REQUEST, { status });
  return parsed.data;
}
