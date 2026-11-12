# UX Blueprint — Sak Ngam Academic (v2)

> สถานะ: **MOCKUP รออนุมัติ** · ยังไม่นำเข้า Production UI (`src/`) · ข้อมูลทั้งหมดเป็นข้อมูลจำลอง
> v2 (ปรับตามแนวคิดใหม่): Hero Carousel / DishOrbit ใช้เป็น **Welcome Page เท่านั้น** — Dashboard ทั้งสอง Portal เป็นหน้าทำงานแบบ Functional

| Mockup | ไฟล์ | บทบาทของหน้า |
|---|---|---|
| Welcome Page | `docs/design/mockup/welcome.html` | ประสบการณ์แรก แนะนำความสามารถระบบ + ปุ่ม "เข้าสู่ระบบงานวิชาการ" |
| Login (จำลอง) | `docs/design/mockup/login.html` | แสดงว่าหน้า Login ใช้ Design System เดียวกัน (ของจริง = `/login` จาก Phase 1.3) |
| Office Dashboard | `docs/design/mockup/office-dashboard.html` | หน้าทำงานประจำวันของฝ่ายวิชาการ |
| Teacher Dashboard | `docs/design/mockup/teacher-dashboard.html` | หน้าทำงานประจำวันของครู |

Mockup v1 (Hero Carousel เป็น Dashboard) **ถูกแทนที่แล้ว** และย้ายไปเก็บที่ `docs/design/archive/` (ไม่ลบ) · ผลตรวจ V2: `docs/design/REVIEW-V2.md`

---

## 1. หลักการ (UX Rules)

| # | กฎ | ผลต่อการออกแบบ |
|---|---|---|
| 1 | **Welcome = ความสวยงามและประสบการณ์** | Hero Carousel, Oversized Typography, Floating Panel, Parallax, Scroll Reveal อยู่ที่หน้านี้หน้าเดียว |
| 2 | **Dashboard = ความเร็วและการทำงาน** | Sidebar + เนื้อหาเห็นได้ทันทีโดยไม่ต้องเลื่อน slide · ตัวเลขสำคัญอยู่บนสุด · ทุกงานมีปุ่มทำต่อในบรรทัดเดียวกัน |
| 3 | **ตารางและแบบฟอร์มไม่มี animation รบกวน** | Dashboard ไม่มี transition เข้า-ออก ไม่มี count-up ไม่มี parallax · มีเพียง hover/focus state |
| 4 | **ไม่บังคับเลื่อนหรือเปลี่ยน slide เพื่อเข้าถึงข้อมูล** | Welcome: เนื้อหาทุกฉากสรุปซ้ำใน section ด้านล่าง + ปุ่ม CTA อยู่ในทุกฉากและบน Top bar · Dashboard: ไม่มี carousel |
| 5 | **Design System เดียว** | `design-system.css` เดียวทั้ง 4 หน้า — สี ฟอนต์ ระยะ เงา tag สถานะ แผนภูมิ ใช้ร่วมกัน · ต่างกันแค่ระดับ motion |
| 6 | **ไม่มีการเลือกบทบาทเอง** | ไม่มีปุ่ม "เข้าแบบครู / เข้าแบบฝ่ายวิชาการ" ที่ใดเลย บทบาทมาจากฐานข้อมูลเท่านั้น |
| 7 | **หน้า public ไม่แสดงข้อมูลจริง** | Welcome ไม่ query ฐานข้อมูล ตัวเลขเป็นข้อเท็จจริงของระบบ (6 บทบาท, 8 กลุ่มสาระ) หรือ "ภาพตัวอย่าง" เท่านั้น |

---

## 2. Information Architecture

```mermaid
flowchart TB
  W["/  Welcome Page<br/>(public · ไม่ดึงข้อมูล)"]
  L["/login<br/>(Phase 1.3)"]
  O["/office  Office Dashboard"]
  T["/teacher  Teacher Dashboard"]
  F["403 / no-access"]

  W -- "เข้าสู่ระบบงานวิชาการ" --> CTA{มี session?}
  CTA -- ไม่มี --> L
  CTA -- มี --> R{defaultPortalPath(roles)}
  L -- "login สำเร็จ" --> R
  R -- "มีบทบาทฝ่ายวิชาการ" --> O
  R -- "มีเฉพาะ teacher" --> T
  R -- "ไม่มีบทบาท / ถูกระงับ" --> F
  O <-. "สลับ portal (เฉพาะผู้มีทั้งสองบทบาท)" .-> T
```

---

## 3. Authentication Flow (ใช้ระบบ Phase 1.3 เดิมทั้งหมด)

| สถานการณ์ | ผลลัพธ์ | ใช้ของเดิม |
|---|---|---|
| ยังไม่ login → กด CTA | ไป `/login` | `RequireAuth` / `Navigate` |
| Login สำเร็จ | ไป portal ตามบทบาท (หรือหน้าที่ตั้งใจเข้าก่อน login) | `LoginPage` + `defaultPortalPath(roles)` |
| Login อยู่แล้ว → กด CTA | ข้ามหน้า Login ไป portal ตามบทบาททันที | `useAuth().status` + `defaultPortalPath` |
| มีทั้งบทบาทฝ่ายวิชาการและครู | เข้า `/office` ก่อน · สลับได้จาก Sidebar ("ไประบบครู") | กฎเดิมใน `roles.ts` |
| บัญชีถูกระงับ / ไม่มีบทบาท | ออกจากระบบพร้อมข้อความ / หน้า 403 | `AuthProvider`, `ForbiddenPage` |
| เข้า `/office` หรือ `/teacher` โดยตรง | Route guard เดิมทำงานเหมือนเดิม | `RequireAuth` + `RequireRoles` |

**การเปลี่ยนแปลง Production ที่เสนอ (ยังไม่ทำ):** เปลี่ยน route `/` จาก `HomeRedirect` เป็น `WelcomePage` (public)
โดย CTA คำนวณปลายทางจาก `useAuth()`: `signed_out → /login`, `signed_in → defaultPortalPath(roles) ?? /no-access`
ไม่ต้องแก้ Auth, Database หรือ RLS

Mockup จำลองสถานะ session ด้วย `?session=office|teacher` (เครื่องมือผู้ตรวจเท่านั้น ไม่ใช่ UI ของผู้ใช้)
และหน้า login จำลองตัดสินบทบาทจากอีเมล เพื่อแสดงว่า "ระบบเลือก ไม่ใช่ผู้ใช้เลือก"

---

## 4. Welcome Page

Dark Premium Editorial — Hero Carousel 5 ฉาก แสดง **ความสามารถของระบบ** (ไม่ใช่ข้อมูลโรงเรียน)

| # | ฉาก | หัวเรื่อง (บาง / หนา) | Visual (ภาพตัวอย่าง) | Floating Panel |
|---|---|---|---|---|
| 1 | Sak Ngam Academic | ระบบบริหาร / งานวิชาการ | Radial rings | สองพื้นที่ทำงาน ระบบเดียว |
| 2 | Curriculum & Master Data | หลักสูตร / ข้อมูลพื้นฐาน | Donut 8 กลุ่มสาระ | ขั้นตอนขึ้นปีการศึกษาใหม่ |
| 3 | Assessment | วัดและ / ประเมินผล | Bar การกระจายเกรด | Line แนวโน้ม (ตัวอย่าง) |
| 4 | Document Workflow | มอบหมาย / ส่ง · ตรวจรับ | Gauge | วงจรเอกสาร 4 ขั้น |
| 5 | Student Monitoring | ติดตาม / นักเรียน | Donut 0 ร มส | ความปลอดภัยข้อมูล (RLS / RBAC / Audit) |

องค์ประกอบ: Top bar (CTA ถาวร) · Vertical indicator · Orbit visual · Oversized typography · KPI · Floating panel ·
Thumbnail strip + Progress · Section "ระบบเดียวสำหรับทุกคน" + CTA band (สรุปเนื้อหาทุกฉากโดยไม่ต้องเปลี่ยน slide)

**ปุ่มหลัก "เข้าสู่ระบบงานวิชาการ"** ปรากฏ 3 ตำแหน่ง: Top bar (ทุกหน้าจอ), ทุกฉากของ Hero, CTA band ท้ายหน้า

---

## 5. Office Dashboard (Functional)

```
┌ Sidebar ───────────┐┌ Top bar: ชื่อหน้า · ภาคเรียน · Demo · แจ้งเตือน ───────────────┐
│ แดชบอร์ด          ││ Quick Actions: [สร้างภาระงาน] [คิวตรวจรับ] [นำเข้า Excel] [รายงาน] │
│ ภาระงานเอกสาร     ││ Stats: ครู · นักเรียน · รอตรวจ (accent) · เลยกำหนด (alert)        │
│  · รายการงาน       ││ ┌ งานที่ต้องดำเนินการ ┐┌ ความคืบหน้าการส่ง ┐┌ 0/ร/มส ┐          │
│  · ตรวจรับ (17)    ││ │ tag + งาน + ปุ่มทำ  ││ Bar chart           ││ Donut   │          │
│ ทะเบียน           ││ └─────────────────────┘└─────────────────────┘└─────────┘          │
│ ข้อมูลพื้นฐาน      ││ คิวตรวจรับเอกสาร: ค้นหา + chip กรองสถานะ + ตาราง + ปุ่มตรวจ      │
│ วิชาการ (เร็วๆนี้) │└────────────────────────────────────────────────────────────────────┘
│ ไประบบครู · ผู้ใช้ │
└────────────────────┘
```

| ส่วน | เนื้อหา | หมายเหตุ |
|---|---|---|
| Sidebar Navigation | กลุ่มเมนูเดียวกับ `src/portals/office/navigation.ts` + badge จำนวนงานรอตรวจ | กรองตามบทบาทเหมือนเดิม (เช่น ผู้บริหารไม่เห็นเมนูจัดการ) |
| Quick Actions | 4 ปุ่ม ปุ่มแรกเป็น primary | ซ่อนตาม capability (`tasks.manage`, `imports`) |
| สถิติภาพรวม | 4 การ์ด ตัวเลขใหญ่ + คำอธิบายสั้น | สีเฉพาะการ์ดที่ต้องการความสนใจ |
| งานที่ต้องดำเนินการ | รายการเรียงตามความเร่งด่วน ทุกแถวมีปุ่มทำต่อ | ไม่ต้องเปิดหน้าอื่นเพื่อรู้ว่าต้องทำอะไร |
| กราฟวิเคราะห์ | Bar ความคืบหน้าการส่ง, Donut 0/ร/มส | แสดงนิ่ง ไม่มี draw animation |
| ตารางข้อมูล | คิวตรวจรับ: ค้นหา + chip กรอง + ปุ่มต่อแถว | มือถือแสดงเป็นการ์ดต่อแถว ไม่ต้องเลื่อนแนวนอน |

## 6. Teacher Dashboard (Functional)

| ส่วน | เนื้อหา |
|---|---|
| Top bar | ทักทาย + สรุปสั้น ("มี 1 งานเลยกำหนด") + **ปุ่ม "ส่งเอกสาร" (primary) ถาวร** |
| ภาระงานของฉัน (stats) | ใกล้ครบกำหนด · ต้องแก้ไข (alert) · รอตรวจ · ส่งแล้ว — คลิกแล้วเปิดแท็บที่ตรงกัน |
| ต้องแก้ไขก่อน | การ์ดเน้นสี amber แสดงข้อเสนอแนะเต็ม + ปุ่ม "ส่งฉบับแก้ไข" — อยู่บนสุดเพราะเร่งด่วนที่สุด |
| รายการงาน | Segmented tabs: ใกล้ครบกำหนด / ต้องแก้ไข / รอตรวจ / ส่งแล้ว · ทุกงานที่ยังส่งได้มีปุ่ม "ส่งเอกสาร" ในบรรทัด |
| ส่งเอกสาร | ฟอร์มสั้น: เลือกงาน → วางไฟล์ → หมายเหตุ → ส่ง (ไม่มี animation) |

สถานะงานใช้คำและสีเดียวกับ state machine ใน `docs/architecture/PHASE-0.md`:
`รอส่ง (violet)` → `รอตรวจ (cyan)` → `ส่งกลับแก้ไข (amber)` / `ตรวจรับแล้ว (mint)` · `เลยกำหนด (rose)` เป็นค่าคำนวณ

---

## 7. Responsive

| | Welcome | Dashboard |
|---|---|---|
| Desktop ≥ 1200 / ≥ 1024 | Hero 3 คอลัมน์ไม่สมมาตร, Floating panel ขวา, Thumbnail ล่าง | Sidebar ติดถาวร 17rem, เนื้อหา grid 3 คอลัมน์ (≥1100) |
| Tablet 768–1199 | Hero 2 คอลัมน์สมดุล | Sidebar เป็น drawer, stats 4 คอลัมน์, กล่อง 2 คอลัมน์ |
| Mobile < 768 | คอลัมน์เดียว, Panel ใต้ Hero, ปัดเปลี่ยนฉาก, ปุ่ม CTA ย่อบน Top bar | Drawer + ปุ่มเมนู, stats 2×2, ตารางเป็นการ์ด, ปุ่ม "ส่งเอกสาร" อยู่บน Top bar เสมอ |

## 8. Accessibility

- Welcome: carousel semantics + live region, คีย์บอร์ด `←/→/Home/End`, autoplay ปิดเป็นค่าเริ่มต้น, `prefers-reduced-motion`, ฉากที่ไม่แสดงเป็น `inert`
- Dashboard: skip link, landmark (`aside` / `main`), `aria-current="page"` ในเมนู, drawer ปิดด้วย `Esc` และคืนโฟกัส, chip กรองใช้ `aria-pressed`, แท็บใช้ `role=tablist` + ลูกศร, ตารางมี `caption` และ `data-label` บนมือถือ
- เป้ากดขั้นต่ำ 40–44px, สถานะไม่สื่อด้วยสีอย่างเดียว (มีข้อความใน tag เสมอ)

## 9. แผนนำเข้า Production (หลังอนุมัติ — ยังไม่ทำ)

1. Tokens → Tailwind `@theme` (dark theme ทั้งระบบ)
2. `WelcomePage` ที่ `/` (public) + CTA ตาม `useAuth()` — ไม่แตะ Auth/Route guard
3. ปรับ `AppShell` / dashboard ของ `/office`, `/teacher` ตาม layout ในข้อ 5–6 โดยใช้ข้อมูลจริงเมื่อแต่ละ Phase พร้อม
4. ส่วนที่ข้อมูลยังไม่พร้อม แสดง "อยู่ระหว่างพัฒนา" — **ห้ามแสดงข้อมูลจำลองใน production**
5. Hero carousel ใช้ไฟล์ CSS/JS แยก lazy-load เฉพาะหน้า Welcome เพื่อไม่ให้ Dashboard หนักขึ้น
