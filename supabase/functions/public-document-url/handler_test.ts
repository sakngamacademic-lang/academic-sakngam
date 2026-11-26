import { assertEquals } from "jsr:@std/assert@1";
import { handler } from "./handler.ts";

Deno.env.set("SUPABASE_URL", "http://db.test");
Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
const post = (body: unknown) => new Request("http://fn.test/public-document-url", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

Deno.test("public-document-url: รหัสเอกสารไม่ถูกต้อง → 400 (ไม่เรียกฐานข้อมูล)", async () => {
  let called = false;
  const orig = globalThis.fetch;
  globalThis.fetch = (() => { called = true; return Promise.resolve(new Response("[]")); }) as typeof fetch;
  try {
    const res = await handler(post({ documentId: "x" }));
    assertEquals(res.status, 400);
    assertEquals(called, false);
  } finally { globalThis.fetch = orig; }
});

Deno.test("public-document-url: เอกสารที่ยังไม่อนุมัติเผยแพร่ → 403 และไม่มี URL", async () => {
  const orig = globalThis.fetch;
  let auth = "";
  globalThis.fetch = ((_u: string, init?: RequestInit) => {
    auth = new Headers(init?.headers).get("authorization") ?? "";
    return Promise.resolve(new Response(JSON.stringify({ code: "42501", message: "ไม่พบเอกสาร หรือเอกสารนี้ยังไม่ได้รับอนุมัติให้เผยแพร่" }), { status: 403 }));
  }) as typeof fetch;
  try {
    const res = await handler(post({ documentId: "11111111-0000-4000-a000-000000000001" }));
    assertEquals(res.status, 403);
    assertEquals("url" in (await res.json()), false);
    assertEquals(auth, "Bearer service"); // ฐานข้อมูลตรวจด้วยฟังก์ชันที่ให้ service_role เท่านั้น
  } finally { globalThis.fetch = orig; }
});
