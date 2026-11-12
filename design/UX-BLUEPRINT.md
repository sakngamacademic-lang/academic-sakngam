# UX Blueprint — Dark Premium Editorial Experience

> สถานะ: **MOCKUP รออนุมัติ** · ยังไม่นำเข้า Production UI (`src/`) · ข้อมูลทั้งหมดเป็นข้อมูลจำลอง
> ไฟล์: `design/mockup/office-mockup.html`, `design/mockup/teacher-mockup.html`

## 1. แนวคิด

เปลี่ยนหน้าแรกของทั้งสอง Portal จาก "Dashboard = Sidebar + การ์ดเรียงกัน" เป็น **Hero Carousel แบบนิตยสาร**
ที่ให้แต่ละโมดูลหลักมี "ฉาก" ของตัวเอง:

| องค์ประกอบ | หน้าที่ |
|---|---|
| **Large Hero / Oversized Typography** | หัวเรื่องสองน้ำหนัก (บาง 200 + หนา 700) บอกว่า "ตอนนี้ดูเรื่องอะไร" ในพริบตา |
| **Orbit Visual** | แผนภูมิหลักของฉาก (radial / donut / bar / gauge) อยู่บนจานวงกลม หมุนเข้า-ออกตามวงโคจร |
| **Floating Information Panel** | แผงลอยด้านขวา มี 2 แท็บ — ข้อมูลที่ต้องตัดสินใจจริง (คิวตรวจ, รายการเสี่ยง, ฯลฯ) |
| **KPI Row** | ตัวเลขสำคัญ 4 ตัวต่อฉาก นับขึ้น (count-up) ตอนเข้าฉาก |
| **Vertical Slide Indicator** | ด้านซ้าย บอกตำแหน่งฉาก + กระโดดไปฉากใดก็ได้ |
| **Horizontal Thumbnail Carousel** | ด้านล่าง แต่ละ thumbnail เป็นแผนภูมิย่อของฉากนั้น (ไม่ใช่รูปตกแต่ง) |
| **Progress Indicator** | แถบแบ่งตามจำนวนฉาก + ปุ่มเล่นอัตโนมัติ (ปิดเป็นค่าเริ่มต้น) |
| **Sections ใต้ Hero** | ทางลัด/ปฏิทิน/กำหนดส่ง ปรากฏด้วย scroll reveal — หน้าเลื่อนได้ตามปกติ ไม่ scroll-jack |

## 2. Portal A — Academic Office (5 ฉาก)

| # | ฉาก | หัวเรื่อง (บาง / หนา) | Visual | KPI | Floating Panel (แท็บ 1 / แท็บ 2) | Action หลัก |
|---|---|---|---|---|---|---|
| 1 | ACADEMIC OVERVIEW | ภาพรวม / งานวิชาการ | Radial 3 วง (ส่ง / ตรวจรับ / บันทึกผล) | ครู, นักเรียน, ห้อง, งานเปิด | ความคืบหน้าภาคเรียน / สิ่งที่ต้องทำสัปดาห์นี้ | เปิดแดชบอร์ด |
| 2 | CURRICULUM | หลักสูตร / สถานศึกษา | Donut 8 กลุ่มสาระ | กลุ่มสาระ, รายวิชา, ตัวชี้วัด, % ผูกรายวิชา | รายวิชาต่อกลุ่มสาระ / Gauge ความครอบคลุมตัวชี้วัด | โครงสร้างหลักสูตร |
| 3 | ASSESSMENT | ผลสัมฤทธิ์ / ทางการเรียน | Bar การกระจายเกรด 4–0 | GPA, % ได้ 3 ขึ้นไป, % บันทึกผล, รออนุมัติ | Line แนวโน้มรายภาค / เกรดเฉลี่ยรายกลุ่มสาระ | ทะเบียนผลการเรียน |
| 4 | DOCUMENT MANAGEMENT | ภาระงาน / เอกสารครู | Gauge % ตรวจรับแล้ว | งานเปิด, รอตรวจ, ส่งกลับแก้ไข, เลยกำหนด | คิวรอตรวจ / ความคืบหน้ารายงาน | สร้างภาระงาน |
| 5 | STUDENT MONITORING | ติดตาม / นักเรียน | Donut 0 / ร / มส | 0, ร, มส, กลุ่มเสี่ยง | Bar รายระดับชั้น / นักเรียนที่ควรพบก่อน | เปิดทะเบียนติดตาม |

## 3. Portal B — Teacher (4 ฉาก)

| # | ฉาก | หัวเรื่อง | Visual | Floating Panel | Action หลัก |
|---|---|---|---|---|---|
| 1 | MY ACADEMIC SPACE | สวัสดี / ครูตัวอย่าง ก | Radial (ส่งแล้ว / ตรวจรับ / กรอกคะแนน) | สิ่งที่ควรทำก่อน / รายวิชาที่สอน | ดูงานสัปดาห์นี้ |
| 2 | MY ASSIGNMENTS | งานที่ / ได้รับมอบหมาย | Bar งานครบกำหนดรายสัปดาห์ | ต้องทำ / เสร็จแล้ว (พร้อมสถานะ) | ดาวน์โหลดแม่แบบ |
| 3 | DOCUMENT SUBMISSION | ส่ง / แผนการสอน | Gauge % ส่งครบ | Dropzone + ไฟล์ที่เลือก / ประวัติฉบับ (versioning) | เลือกไฟล์เพื่อส่ง |
| 4 | REVIEW & FEEDBACK | ผลการตรวจ / ข้อเสนอแนะ | Donut สถานะงาน | ข้อเสนอแนะที่ต้องแก้ / การแจ้งเตือน | ส่งฉบับแก้ไข |

สถานะงานใช้คำและสีเดียวกับ state machine ใน `docs/architecture/PHASE-0.md`:
`รอส่ง (violet)` → `รอตรวจ (cyan)` → `ส่งกลับแก้ไข (amber)` / `ตรวจรับแล้ว (mint)` · `เลยกำหนด (rose)` เป็นค่าคำนวณ

## 4. Navigation Model

```
Top bar ─ Brand │ เมนูฉาก (desktop ≥1200px) │ Demo badge │ ผู้ใช้
Hero ──── Vertical indicator (ซ้าย) │ Scene │ Thumbnail strip + Progress (ล่าง)
Below ─── Sections ปกติ (ทางลัด / ปฏิทิน / กำหนดส่ง) — เลื่อนหน้าได้อิสระ
```

- ทุกทางเปลี่ยนฉากให้ผลเหมือนกัน: ลูกศร, thumbnail, จุดแนวตั้ง, เมนูบน, คีย์บอร์ด, ปัดนิ้ว
- ปุ่ม Action ในฉากนำไปยัง route จริงของระบบ (เช่น `/office/tasks`) เมื่อนำเข้า production — ใน mockup เป็นลิงก์ตัวอย่าง
- **ไม่บังคับ scroll**: Hero ไม่ pin หน้า และไม่ผูกการเลื่อนหน้ากับการเปลี่ยนฉาก (ต่างจาก reference ที่ใช้ ScrollTrigger)
- ฉากที่ไม่แสดงถูกตั้ง `inert` — Tab ไม่หลงเข้าไปในเนื้อหาที่มองไม่เห็น

## 5. Responsive

| Breakpoint | Layout |
|---|---|
| **Desktop ≥ 1200px** | Grid 3 คอลัมน์ไม่สมมาตร: Visual (ซ้าย, ใหญ่) · หัวเรื่องซ้อนทับ visual 18% · Floating Panel ขวา + parallax ย้อนทิศ · Thumbnail + Progress แถวเดียวด้านล่าง · เมนูฉากบน Top bar |
| **Tablet 768–1199px** | 2 คอลัมน์: Visual + หัวเรื่องแถวบน, KPI/Action + Panel แถวล่าง (น้ำหนักซ้าย-ขวาเท่ากัน) · Progress ขึ้นบรรทัดใหม่ |
| **Mobile < 768px** | คอลัมน์เดียว: Visual (≤300px) → หัวเรื่อง → KPI 2×2 → Action → Panel ใต้ Hero · Thumbnail เลื่อนแนวนอนแบบ scroll-snap · ไม่มีปุ่มลูกศร (ใช้ปัด/แตะ thumbnail) · ไม่มี parallax เมาส์ |

ขนาดหัวเรื่องคำนวณจากความกว้างคอลัมน์ (`cqi`) และจำนวนอักษรฐาน (`--chars`) จึงไม่ล้นจอแม้คำยาว เช่น "ได้รับมอบหมาย"

## 6. Accessibility

- `section[aria-roledescription=carousel]` + `article[aria-roledescription=slide]` + live region ประกาศ "ฉากที่ n จาก N: ชื่อฉาก"
- คีย์บอร์ด: `←/→` เปลี่ยนฉาก, `Home/End` ฉากแรก/สุดท้าย (ทำงานเมื่อโฟกัสอยู่ใน Hero) · แท็บใน Panel ใช้ `←/→` ของตัวเองโดยไม่เปลี่ยนฉาก
- Autoplay **ปิดเป็นค่าเริ่มต้น**, มีปุ่มหยุด/เล่น, หยุดชั่วคราวเมื่อ hover/focus, ถูกซ่อนเมื่อ `prefers-reduced-motion`
- แผนภูมิทุกตัวมี `role="img"` + `aria-label` สรุปตัวเลข; ตัวเลขสำคัญแสดงเป็นข้อความด้วย (ไม่พึ่งสีอย่างเดียว)
- Skip link, focus ring สี accent, ขนาดเป้ากดขั้นต่ำ 44px สำหรับปุ่มหลัก

## 7. แนวทางนำเข้า Production (หลังอนุมัติ)

1. แปลง `design-system.css` tokens → Tailwind `@theme` (เพิ่ม dark theme ให้ทั้งระบบ)
2. สร้าง `components/editorial/` : `HeroCarousel`, `Scene`, `FloatingPanel`, `KpiRow`, `ThumbStrip`, `Charts/*`
3. ใช้เป็นหน้า `/office` และ `/teacher` แทน dashboard ปัจจุบัน โดยดึงข้อมูลจริงจาก Supabase ทีละฉากเมื่อแต่ละ Phase พร้อม
4. ฉากที่ข้อมูลยังไม่พร้อม (หลักสูตร/วัดผล) แสดง "อยู่ระหว่างพัฒนา" แทนตัวเลขจำลอง — **ห้ามแสดงข้อมูลจำลองใน production**
5. ทุกปุ่มยังเคารพ RBAC เดิม (เช่น ผู้บริหารไม่เห็น "สร้างภาระงาน")
