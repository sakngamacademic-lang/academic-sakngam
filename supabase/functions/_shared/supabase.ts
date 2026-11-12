/**
 * เรียก Supabase Auth / PostgREST ด้วย fetch (ไม่มี dependency)
 * - userRpc: ใช้ JWT ของผู้ใช้ → ฐานข้อมูลตรวจสิทธิ์ด้วย auth.uid() และ RLS
 * - serviceRpc: ใช้ service_role (มีเฉพาะใน Edge Function) สำหรับขั้นตอนที่ผู้ใช้ห้ามเรียกเอง
 */
import { HttpError } from "./http.ts";

const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const ANON = () => Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface Caller {
  id: string;
  jwt: string;
}

/** ตรวจ JWT กับ Supabase Auth ทุกคำขอ (ไม่เชื่อ payload ที่ไม่ได้ตรวจลายเซ็น) */
export async function requireUser(req: Request): Promise<Caller> {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  const res = await fetch(`${URL_()}/auth/v1/user`, { headers: { apikey: ANON(), Authorization: `Bearer ${jwt}` } });
  if (!res.ok) throw new HttpError(401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  const user = await res.json();
  if (!user?.id) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  return { id: user.id, jwt };
}

async function rpc<T>(fn: string, args: Record<string, unknown>, key: string, bearer: string): Promise<T> {
  const res = await fetch(`${URL_()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = body?.code as string | undefined;
    const msg = (body?.message as string | undefined) ?? "คำขอไม่สำเร็จ";
    if (code === "42501") throw new HttpError(403, msg.startsWith("permission denied") ? "คุณไม่มีสิทธิ์ดำเนินการนี้" : msg);
    if (code === "P0001") throw new HttpError(400, msg);
    if (code === "22P02" || code === "23514") throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
    throw new Error(`rpc ${fn} failed: ${res.status} ${msg}`);
  }
  return body as T;
}

export const userRpc = <T>(caller: Caller, fn: string, args: Record<string, unknown>) => rpc<T>(fn, args, ANON(), caller.jwt);
export const serviceRpc = <T>(fn: string, args: Record<string, unknown>) => rpc<T>(fn, args, SERVICE(), SERVICE());

/** งานเบื้องหลัง: อนุญาตเฉพาะคำขอที่ใช้ service_role key หรือ CRON_SECRET */
export function requireServiceCall(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const cron = Deno.env.get("STORAGE_CRON_SECRET");
  if (token && (token === SERVICE() || (cron && token === cron))) return;
  throw new HttpError(403, "เฉพาะงานของระบบเท่านั้น");
}
