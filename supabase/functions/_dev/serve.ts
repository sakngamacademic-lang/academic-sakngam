/**
 * Local dev server สำหรับ Edge Functions (ใช้เมื่อ Supabase Edge Runtime image ใช้ไม่ได้)
 * รันโค้ด handler เดียวกับที่ deploy ด้วย Deno: http://127.0.0.1:54330/functions/v1/<name>
 *   deno run --allow-net --allow-env --env-file=supabase/functions/.env.local supabase/functions/_dev/serve.ts
 */
import { handler as uploadUrl } from "../storage-upload-url/handler.ts";
import { handler as confirmUpload } from "../storage-confirm-upload/handler.ts";
import { handler as downloadUrl } from "../storage-download-url/handler.ts";
import { handler as del } from "../storage-delete/handler.ts";
import { handler as cleanup } from "../storage-cleanup/handler.ts";

const routes: Record<string, (r: Request) => Promise<Response>> = {
  "storage-upload-url": uploadUrl,
  "storage-confirm-upload": confirmUpload,
  "storage-download-url": downloadUrl,
  "storage-delete": del,
  "storage-cleanup": cleanup,
};

const port = Number(Deno.env.get("FUNCTIONS_PORT") ?? 54330);
Deno.serve({ port, hostname: "127.0.0.1" }, (req) => {
  const name = new URL(req.url).pathname.replace(/^\/functions\/v1\//, "").split("/")[0] ?? "";
  if (name === "health") return new Response("ok");
  const h = routes[name];
  return h ? h(req) : new Response("not found", { status: 404 });
});
