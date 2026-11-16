import { assertEquals } from "jsr:@std/assert@1";
import { originAllowed } from "./http.ts";

const list = ["http://localhost:5173", "https://academic-sakngam-*-sakngamacademic-lang.vercel.app", "https://sakngam.example.ac.th"];

Deno.test("origin ตรงตัวผ่าน", () => {
  assertEquals(originAllowed("http://localhost:5173", list), true);
  assertEquals(originAllowed("https://sakngam.example.ac.th", list), true);
});
Deno.test("Vercel Preview ตาม wildcard ผ่าน", () => {
  assertEquals(originAllowed("https://academic-sakngam-git-claude-stoic-sakngamacademic-lang.vercel.app", list), true);
  assertEquals(originAllowed("https://academic-sakngam-abc123-sakngamacademic-lang.vercel.app", list), true);
});
Deno.test("wildcard ไม่ข้ามจุด/โดเมนอื่น และต้อง https", () => {
  assertEquals(originAllowed("https://academic-sakngam-x.evil.com-sakngamacademic-lang.vercel.app", list), false);
  assertEquals(originAllowed("https://evil.vercel.app", list), false);
  assertEquals(originAllowed("http://academic-sakngam-x-sakngamacademic-lang.vercel.app", list), false);
  assertEquals(originAllowed("", list), false);
});
