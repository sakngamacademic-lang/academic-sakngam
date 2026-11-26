# Production Runbook — https://academic-sakngam.vercel.app

เว็บหลักมีลิงก์เดียว ใช้ทั้งงานฝ่ายวิชาการ (ต้อง Login) และหน้าเยี่ยมชม `/visit` (ไม่ต้อง Login · เฉพาะที่อนุมัติเผยแพร่)
ลิงก์ Preview ใช้ทดสอบโค้ดเท่านั้น — ไม่ใช้แนบไฟล์หรือจัดการข้อมูลจริง

## ที่เก็บข้อมูล (ถาวร)
| อะไร | อยู่ที่ไหน |
|---|---|
| ไฟล์ PDF/Excel | Cloudflare R2 bucket `sakngam-academic-documents` (private) |
| ตำแหน่งไฟล์ (object key), ทะเบียนเอกสาร | Supabase `files`, `source_documents` |
| เล่มนำเสนอ ม.ต้น/ม.ปลาย/แผน | Supabase `presentation_items` (migration `20261209000100`) |
| สถานะเผยแพร่สาธารณะ | Supabase `public_releases` (migration `20261208000100`) |

ไม่มีเอกสารหลักเก็บใน LocalStorage/IndexedDB — เปลี่ยนเครื่อง เปลี่ยนลิงก์ หรือ Deploy ใหม่ เอกสารไม่หาย
(ไฟล์แบบเดิมที่ค้างใน IndexedDB ของเบราว์เซอร์: หน้านำเสนอเล่มมีแผง “ย้ายขึ้นระบบ” — ต้องเปิดจากลิงก์และเครื่องเดิมที่เคยแนบ)

## ค่าที่ต้องตั้ง (ครั้งเดียว)
1. **Vercel → Environment Variables** (ติ๊ก Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_ENV`
   (Production ใช้ `production` เพื่อซ่อนแถบ “เวอร์ชันพัฒนา”)
2. **Vercel → Deployment Protection** = Standard Protection (โดเมน Production เปิดได้โดยไม่ต้อง Login Vercel)
3. **Vercel → Git → Production Branch** = `main`
4. **Supabase → Edge Functions → Secrets** `ALLOWED_ORIGINS` =
   `https://academic-sakngam.vercel.app,https://academic-sakngam-academicsakngam.vercel.app,https://academic-sakngam-*-academicsakngam.vercel.app`
5. **Supabase → Authentication → URL Configuration**: Site URL = `https://academic-sakngam.vercel.app` · Redirect URLs เพิ่ม `https://academic-sakngam.vercel.app/**`
6. **Cloudflare R2 → CORS**: AllowedOrigins มี `https://academic-sakngam.vercel.app` · Methods `GET, PUT` · Headers `content-type`

## ขั้นตอนอัปเดตทุกครั้ง (URL เดิมตลอด)
1. พัฒนาบน Branch พัฒนา → Vercel สร้าง Preview → ทดสอบ (typecheck / build / pgTAP / เปิดหน้าเว็บ)
2. ถ้ามี Migration ใหม่: ผู้ดูแลรันใน SQL Editor แล้วบันทึก `supabase_migrations.schema_migrations` (forward-only · ไม่ Reset)
3. ถ้ามี Edge Function ใหม่/แก้ไข: `supabase functions deploy <ชื่อ> --project-ref <ref>`
4. ผู้ใช้อนุมัติเป็นลายลักษณ์อักษร → merge เข้า `main` → Vercel Deploy ไปที่ `academic-sakngam.vercel.app` อัตโนมัติ
5. ตรวจหลัง Deploy: หน้าแรก, Login, `/visit`, เปิด PDF 1 เล่ม, หน้านำเสนอเล่มยังเห็นเล่มครบ
