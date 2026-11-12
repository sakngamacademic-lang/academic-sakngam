# Sak Ngam Academic Platform

ระบบบริหารงานวิชาการ โรงเรียนสักงามวิทยา — สำหรับ **ฝ่ายวิชาการ** (`/office`) และ **ครูผู้สอน** (`/teacher`)

> สถานะปัจจุบัน: **Phase 1.4 — Master Data Management**
> เข้าสู่ระบบด้วย Supabase Auth จริง (local) ตัวเลขบนแดชบอร์ดยังเป็น **ข้อมูลจำลอง (Demo)**
> แผนสถาปัตยกรรม: [`docs/architecture/PHASE-0.md`](docs/architecture/PHASE-0.md)

## เทคโนโลยี

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Vite, React 19, TypeScript (strict) |
| Routing | React Router (`/office/*`, `/teacher/*`) |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) + lucide-react, ฟอนต์ IBM Plex Sans Thai |
| ข้อมูล | TanStack Query, React Hook Form + Zod |
| Backend (เริ่ม Phase 1.2) | Supabase (PostgreSQL + RLS + Auth + Edge Functions) |

## การติดตั้ง

ต้องมี Node.js 20 ขึ้นไป (แนะนำ 22 LTS)

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

เปิด http://localhost:5173

| คำสั่ง | หน้าที่ |
|---|---|
| `npm run dev` | เปิดเซิร์ฟเวอร์สำหรับพัฒนา |
| `npm run typecheck` | ตรวจ TypeScript |
| `npm run build` | ตรวจ type แล้ว build ไปที่ `dist/` |
| `npm run preview` | เปิดดูผลลัพธ์จากการ build |

## ฐานข้อมูล Supabase (Local เท่านั้น)

ต้องมี Docker ที่ทำงานอยู่ ส่วน Supabase CLI ติดตั้งมาเป็น devDependency แล้ว

```bash
npm run db:start
```

```bash
npm run db:reset
```

```bash
npm run db:test
```

- `db:start` เปิด Supabase local (API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`) แล้วนำค่า `API_URL` และ `ANON_KEY` จาก `npx supabase status` ไปใส่ใน `.env.local`
- `db:reset` ล้างฐานข้อมูล local แล้วรัน migrations และ `supabase/seed.sql` ใหม่
- `db:test` รัน pgTAP tests ใน `supabase/tests/database/`
- **ห้ามรัน migration ทดสอบบน hosted Supabase** และ seed ใช้กับ local เท่านั้น
- บัญชีทดสอบใน seed (local เท่านั้น) มีรหัสผ่าน `LocalDev#2569` เช่น `admin@snw.test`, `head@snw.test`, `staff@snw.test`, `areahead@snw.test`, `exec@snw.test`, `teacher1@snw.test`, `suspended@snw.test` (บัญชีถูกระงับ), `admin@other.test` (โรงเรียนอื่น)
- ปิดการสมัครสมาชิกเอง (`enable_signup = false`) เพราะบัญชีต้องสร้างโดยผู้ดูแล
- ตารางใหม่ **ไม่ถูกเปิดให้ Data API อัตโนมัติ** ทุก migration ต้อง `enable row level security` และ `grant` ให้ชัดเจน

### Migrations (forward-only)

| ไฟล์ | เนื้อหา |
|---|---|
| `20261112000100_foundation.sql` | schema `private`, ปิด auto-expose, enum `app_role`, `set_updated_at()` |
| `20261112000200_core_identity.sql` | `schools`, `profiles`, `user_roles`, trigger สร้าง profile |
| `20261112000300_audit_logs.sql` | `audit_logs` แบบ append-only + audit triggers |
| `20261112000400_rls_policies.sql` | helper functions ตรวจสิทธิ์, grants, RLS policies |
| `20261113000100_get_my_access.sql` | RPC อ่านบัญชีและบทบาทของผู้ใช้ปัจจุบัน |
| `20261114000100_master_data_tables.sql` | `learning_areas`, `academic_years`, `terms`, `grade_levels`, `classrooms` + กฎวันที่ |
| `20261114000200_learning_area_scope.sql` | scope กลุ่มสาระใน `user_roles`, helper ตรวจสิทธิ์กลุ่มสาระ |
| `20261114000300_master_data_rls.sql` | grants ระดับคอลัมน์, RLS, RPC ตั้งปี/ภาคปัจจุบัน และคัดลอกห้องเรียน |

ห้ามแก้ไฟล์ migration ที่ push แล้ว ถ้าต้องเปลี่ยนให้สร้างไฟล์ใหม่ด้วย `npx supabase migration new <name>`

## การยืนยันตัวตนและสิทธิ์ (Phase 1.3)

- เข้าสู่ระบบด้วยอีเมลและรหัสผ่านผ่าน Supabase Auth ไม่เปิดให้สมัครเอง
- บทบาทอ่านจาก RPC `public.get_my_access()` ในฐานข้อมูล ไม่ได้อ่านจาก localStorage หรือ `user_metadata`
- ระบบดึงบทบาทใหม่ทุกครั้งที่ token ถูกต่ออายุ เมื่อกลับมาที่แท็บ และทุก 5 นาที จึงเห็นผลเมื่อมีการถอนสิทธิ์หรือระงับบัญชี
- บัญชีที่ `is_active = false` จะถูกบังคับออกจากระบบพร้อมข้อความแจ้ง
- Route guard (`src/features/auth/guards.tsx`) ควบคุมแค่ UI เท่านั้น การอนุญาตจริงอยู่ที่ RLS
- สิทธิ์ของเมนูกำหนดที่ `roles` ใน `src/portals/*/navigation.ts` ถ้าเข้า URL โดยตรงโดยไม่มีสิทธิ์จะได้หน้า 403
- ลืมรหัสผ่าน: `/forgot-password` → อีเมล → `/reset-password` (local ดูอีเมลที่ Mailpit `http://127.0.0.1:54324`) ส่วน production ต้องตั้งค่า SMTP ก่อน

### ทดสอบ E2E (Playwright + Supabase local)

```bash
npx supabase status -o env
```

นำ `API_URL` และ `ANON_KEY` ไปใส่ใน `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) แล้วรัน

```bash
npm run db:reset
```

```bash
npm run test:e2e
```

ชุดทดสอบจะ `supabase db reset` ฐานข้อมูล local ก่อนรันทุกครั้ง (ข้ามได้ด้วย `E2E_SKIP_DB_RESET=1`) และปฏิเสธการรันถ้า `VITE_SUPABASE_URL` ไม่ใช่ localhost

## ข้อมูลพื้นฐาน (Phase 1.4)

หน้าใน Academic Office: `/office/academic-years`, `/office/terms`, `/office/grade-levels`, `/office/classrooms`, `/office/learning-areas`

| บทบาท | ปี/ภาค/ระดับชั้น/ห้องเรียน | กลุ่มสาระ | มอบหมายหัวหน้ากลุ่มสาระ |
|---|---|---|---|
| system_admin | จัดการ | จัดการ | ✅ (เท่านั้น) |
| academic_head | จัดการ | จัดการ | ดูได้ |
| academic_staff | จัดการ | ดู | – |
| learning_area_head | ดู | ดูเฉพาะกลุ่มสาระของตน | – |
| executive | ดู | ดู | – |
| teacher | อ่านผ่าน API ได้ แต่ไม่มีหน้าใน portal | ไม่เห็น | – |

- ไม่มีการลบจริง: ระดับชั้น ห้องเรียน และกลุ่มสาระใช้ "ปิดใช้งาน" ส่วนปีการศึกษาและภาคเรียนเก็บถาวรเสมอ
- ปี/ภาคปัจจุบันตั้งผ่าน RPC `set_current_academic_year` / `set_current_term` เท่านั้น จึงมีได้ทีละหนึ่งเสมอ
- ขึ้นปีการศึกษาใหม่: เพิ่มปี → เพิ่มภาคเรียน → "คัดลอกจากปีอื่น" ในหน้าห้องเรียน (RPC `copy_classrooms`) → ตั้งเป็นปีปัจจุบัน
- `school_id` ฐานข้อมูลใส่ให้อัตโนมัติ ผู้ใช้กำหนดเองไม่ได้ และ composite FK กันการอ้างอิงข้ามโรงเรียน
- หัวหน้ากลุ่มสาระ = แถว `user_roles` ที่ role `learning_area_head` + `learning_area_id` เปลี่ยนได้โดยการลบแล้วเพิ่มใหม่โดย system_admin เท่านั้น (ไม่มีสิทธิ์ UPDATE)
- ตารางในอนาคตที่ผูกกลุ่มสาระให้ใช้ `private.can_access_learning_area(learning_area_id)` ใน RLS

## Environment Variables

ดู `.env.example` — ทุกตัวเป็นค่า **public** ที่จะถูกฝังใน bundle

- ใส่ได้เฉพาะ Supabase `local` หรือ `staging` และใช้ได้เฉพาะ **anon key**
- **ห้าม** ใส่ `service_role` key, รหัสผ่านฐานข้อมูล หรือ key ของ Cloudflare R2 ในฝั่ง frontend (key เหล่านี้อยู่ใน secrets ของ Edge Functions เท่านั้น)
- `.env.local` ถูก ignore โดย Git แล้ว

## โครงสร้างโปรเจกต์

```
src/
├─ app/                 # router, providers, หน้าระดับแอป (เลือกระบบ, 404)
├─ components/
│  ├─ ui/               # primitives แบบ shadcn/ui (button, card, badge, sheet, progress)
│  ├─ layout/           # AppShell (sidebar + mobile menu), brand, banner
│  └─ shared/           # PageHeader, StatCard, StatusBadge, DemoNotice, ComingSoon
├─ features/            # 1 โฟลเดอร์ = 1 โมดูล
│  ├─ navigation/       # ชนิดข้อมูลเมนู + สร้าง routes จากเมนู
│  └─ dashboard/        # แดชบอร์ด office / teacher (+ demo-data.ts)
├─ portals/
│  ├─ office/           # เมนูและ routes ฝ่ายวิชาการ
│  └─ teacher/          # เมนูและ routes ระบบครู
├─ lib/                 # env (Zod), supabase client, query client, format (วันที่ พ.ศ.)
└─ styles/index.css     # Tailwind + design tokens
```

### การเพิ่มหน้าใหม่

1. สร้างหน้าใน `src/features/<module>/`
2. ใส่ element ใน `pages` ของ `src/portals/<portal>/routes.tsx` โดยใช้ key ตรงกับ `path` ของเมนู
3. ลบ `plannedPhase` ออกจากเมนูใน `src/portals/<portal>/navigation.ts`

เมนูที่ยังมี `plannedPhase` จะแสดงหน้า "อยู่ระหว่างการพัฒนา" ให้อัตโนมัติ

### ข้อตกลง

- ข้อมูลจำลองอยู่ในไฟล์ `demo-data.ts` เท่านั้น และทุกหน้าที่ใช้ต้องแสดง `<DemoNotice />` หรือ `<DemoBadge />`
- วันที่เก็บเป็น ค.ศ. แล้วแสดงเป็น พ.ศ. ผ่าน `src/lib/format.ts`
- สิทธิ์การเข้าถึงจริงจะบังคับด้วย RLS ที่ฐานข้อมูล ส่วน route guard ฝั่ง client มีไว้เพื่อ UX เท่านั้น
- feature หนึ่งไม่ควร import ไฟล์ภายในของ feature อื่นโดยตรง

## แผนการพัฒนา

| Phase | เนื้อหา | สถานะ |
|---|---|---|
| 0 | สถาปัตยกรรม & แผนงาน | ✅ |
| 1.1 | Project scaffold, layouts, navigation, demo dashboards | ✅ |
| 1.2 | Supabase local + core migrations | ✅ |
| 1.3 | Authentication & route guard ตามบทบาท | ✅ |
| 1.4 | ข้อมูลพื้นฐาน (ปี/ภาค/ระดับชั้น/ห้องเรียน/กลุ่มสาระ) + scope หัวหน้ากลุ่มสาระ | ✅ |
| 1.5–1.12 | ทะเบียนครู, ไฟล์/R2, ระบบภาระงานเอกสาร, แจ้งเตือน, นำเข้า Excel | ⏳ |

รายละเอียดแต่ละขั้นอยู่ใน `docs/architecture/PHASE-0.md` หัวข้อ 11
