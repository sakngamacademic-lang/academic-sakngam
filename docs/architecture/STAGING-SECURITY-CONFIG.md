# ตั้งค่าความปลอดภัย Supabase Staging (`ifwercnzbnkpadikqigj`) — เจ้าของโปรเจกต์ทำใน Dashboard

> ตรวจเมื่อ 15 พ.ย. 2569 (อ่านอย่างเดียว): `disable_signup=false` · `site_url=http://localhost:3000` · Redirect URLs ว่าง · รหัสผ่านขั้นต่ำ 6
> Session ของ AI แก้ค่า Auth ผ่าน API ไม่ได้ (ถูกปฏิเสธ) — ต้องทำเอง แล้วรันสคริปต์ตรวจด้านล่าง

## ขั้นตอน (Dashboard → Authentication)
1. **Sign In / Providers → User Signups**: ปิด *Allow new users to sign up* (บัญชีสร้างโดยผู้ดูแลเท่านั้น — Invite / Add user)
2. **Sign In / Providers → Email**: *Minimum password length* = **10** · เปิด *Confirm email* ไว้ (ห้าม auto-confirm)
3. **URL Configuration**
   - *Site URL*: URL ของ Vercel **Preview** ที่ใช้งานจริง (`https://<ชื่อ>.vercel.app`) — ไม่ใช่ localhost
   - *Redirect URLs*: เพิ่ม `https://<ชื่อ>.vercel.app/**` (ลิงก์ลืมรหัสผ่านกลับมาที่แอป) · ถ้ามี Preview แบบ branch ให้เพิ่ม pattern เฉพาะโดเมนของโปรเจกต์นี้ (ไม่ใช้ `*` ทั้งโดเมน)
4. **Providers**: ปิด Anonymous sign-ins · ไม่เปิด provider ที่ไม่ใช้
5. ตรวจซ้ำ (token อ่านได้ ผ่าน Environment Secret):
   ```bash
   SUPABASE_ACCESS_TOKEN=… NODE_USE_ENV_PROXY=1 node scripts/staging/check-auth-config.mjs ifwercnzbnkpadikqigj --site-url https://<ชื่อ>.vercel.app
   ```
   ทุกข้อต้องเป็น ✅ (exit 0)

## Vercel (Preview scope เท่านั้น)
`VITE_SUPABASE_URL=https://ifwercnzbnkpadikqigj.supabase.co` · `VITE_SUPABASE_ANON_KEY` (anon/publishable ของ project เดียวกัน — ห้ามใส่ service_role) · `VITE_APP_ENV=staging` · Redeploy แบบไม่ใช้ cache แล้วดูป้าย `Supabase ifwercnzbnkpadikqigj` ใต้ฟอร์ม Login
