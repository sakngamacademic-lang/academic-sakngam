/** HTTP helpers ร่วมของ Edge Functions: CORS, JSON, ข้อผิดพลาดภาษาไทย */
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * ตรวจ origin กับรายการที่อนุญาต — รองรับ * หนึ่งส่วนในชื่อโดเมนสำหรับ Vercel Preview ที่เปลี่ยนตาม deployment
 * เช่น https://academic-sakngam-*.vercel.app (* = ตัวอักษร/ตัวเลข/ขีด เท่านั้น ไม่ข้ามจุด และต้องเป็น https)
 */
export function originAllowed(origin: string, allowed: string[] = ALLOWED_ORIGINS): boolean {
  if (!origin) return false;
  return allowed.some((a) => {
    if (!a.includes("*")) return a === origin;
    if (!a.startsWith("https://")) return false;
    const re = new RegExp("^" + a.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\/-]/g, "\\$&")).join("[a-z0-9-]+") + "$");
    return re.test(origin);
  });
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": originAllowed(origin) ? origin : ALLOWED_ORIGINS[0]!,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/** ห่อ handler: OPTIONS, POST เท่านั้น, แปลงข้อผิดพลาด (ไม่เปิดเผยรายละเอียดภายใน) */
export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, 405, { error: "method not allowed" });
    try {
      return json(req, 200, await fn(req));
    } catch (e) {
      if (e instanceof HttpError) return json(req, e.status, { error: e.message });
      console.error(e);
      return json(req, 500, { error: "เกิดข้อผิดพลาดภายในระบบจัดเก็บไฟล์" });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "รูปแบบคำขอไม่ถูกต้อง");
  }
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
