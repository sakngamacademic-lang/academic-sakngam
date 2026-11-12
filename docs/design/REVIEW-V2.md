# Review Report — Mockup V2 (Animation & Interaction)

> สถานะ: **อนุมัติระดับแนวคิด** · ยังไม่อนุมัตินำเข้า Production UI
> วันที่ตรวจ: 2569-11-12 · เครื่องมือ: Playwright (Chromium) · ข้อมูลจำลองทั้งหมด

## 1. วิธีตรวจ

```bash
node docs/design/mockup/tests/mockup-check.mjs
```

```bash
node docs/design/mockup/tests/mockup-check.mjs --screenshots
```

- สคริปต์เสิร์ฟไฟล์ใน `docs/design/mockup/` ด้วย HTTP server ในตัว — ไม่ใช้ Production UI, Supabase หรือ dev server
- ขนาดจอที่ตรวจ: Desktop 1440×900, Tablet 900×1180, Mobile 390×844 (touch), Desktop + `prefers-reduced-motion: reduce`
- Screenshot ความละเอียด 2× เก็บที่ `docs/design/screenshots/`

**ผลล่าสุด: 65 / 65 ผ่าน · ไม่มี console / page error**

## 2. Screenshots

| หน้า | Desktop (1440×900) | Mobile (390×844) |
|---|---|---|
| Welcome | `screenshots/welcome-desktop.png` | `screenshots/welcome-mobile.png` |
| Office Dashboard | `screenshots/office-dashboard-desktop.png` | `screenshots/office-dashboard-mobile.png` · `screenshots/office-dashboard-mobile-drawer.png` |
| Teacher Dashboard | `screenshots/teacher-dashboard-desktop.png` | `screenshots/teacher-dashboard-mobile.png` |

## 3. Animation — Welcome Page

| รายการ | ผลตรวจ | อ้างอิง spec |
|---|---|---|
| เปลี่ยนฉาก: ฉากเดิมได้ `is-leaving` ฉากใหม่ได้ `is-entering` พร้อมกัน | ✅ | ANIMATION-SPEC §2 |
| ล้าง class transition ครบภายใน 2.3 วินาที (spec 2.2s) | ✅ | §2 |
| สี accent เปลี่ยนตามฉาก (`--accent` ผ่าน `@property`) | ✅ | §2 |
| Parallax: `--px/--py` อัปเดตตามเมาส์ (เฉพาะอุปกรณ์มีเมาส์) | ✅ | §3 |
| Scroll reveal แสดงครบเมื่อเลื่อนถึง | ✅ | §4 |
| `prefers-reduced-motion`: เปลี่ยนฉากทันที, ไม่มี animation ทำงาน, reveal แสดงทันที, ซ่อน autoplay | ✅ 4/4 | §7 |

## 4. Interaction — Welcome Page

| รายการ | ผลตรวจ |
|---|---|
| ปุ่มลูกศรถัดไป / ก่อนหน้า | ✅ |
| คลิก Thumbnail | ✅ |
| Vertical indicator | ✅ |
| เมนูบน (data-goto) กระโดดไปฉาก | ✅ |
| คีย์บอร์ด Home / End / ← / → และวนรอบ | ✅ |
| ลากเมาส์ (desktop) และปัดนิ้ว (mobile touch) เปลี่ยนฉาก | ✅ |
| ฉากที่ซ่อนเป็น `inert` · live region ประกาศ "ฉากที่ n จาก 5" | ✅ |
| Autoplay ปิดเป็นค่าเริ่มต้น และเปิด/ปิดได้ | ✅ |
| เนื้อหาทุกฉากอ่านได้โดยไม่ต้องเปลี่ยน slide (Features 4 การ์ด + CTA band) | ✅ |
| CTA เมื่อยังไม่ login → `login.html` (ทุกปุ่ม) | ✅ |
| CTA เมื่อ login แล้ว → dashboard ตามบทบาท (ครู / ฝ่ายวิชาการ) | ✅ |
| **ไม่มี Role Selector** (ตรวจองค์ประกอบจริง ดูข้อ 7) | ✅ |

## 5. Interaction — Dashboards

| รายการ | Office | Teacher |
|---|---|---|
| Sidebar ติดถาวรบน desktop | ✅ | ✅ |
| ไม่มี carousel / scene / reveal | ✅ | ✅ |
| **ไม่มี animation ทำงานเลย** (`document.getAnimations()` = 0) | ✅ | ✅ |
| ไม่มี Role Selector | ✅ | ✅ |
| Stats 4 · Quick actions 4 · กราฟ 2 · ตาราง 5 แถว | ✅ | – |
| Chip กรองสถานะ · ค้นหา · Empty state | ✅ | – |
| ปุ่ม "ส่งเอกสาร" บน Top bar · การ์ด "ต้องแก้ไขก่อน" | – | ✅ |
| ครบ 4 สถานะ (ใกล้ครบกำหนด / ต้องแก้ไข / รอตรวจ / ส่งแล้ว) | – | ✅ |
| คลิกการ์ดสถิติ → เปิดแท็บที่ตรงกัน · แท็บใช้คีย์บอร์ดได้ | – | ✅ |
| Mobile: Drawer เปิด/ปิด (Esc) · ตารางเป็นการ์ด | ✅ | – |
| Mobile: ปุ่มส่งเอกสารเห็นโดยไม่ต้องเลื่อน | – | ✅ |

## 6. Responsive

| หน้า | Mobile ไม่มี scroll แนวนอน | Tablet ไม่มี scroll แนวนอน |
|---|---|---|
| Welcome | ✅ (หัวเรื่องทุกฉากไม่ล้นคอลัมน์) | ✅ |
| Login | ✅ | – |
| Office Dashboard | ✅ | ✅ |
| Teacher Dashboard | ✅ | ✅ |

## 7. การตรวจ Role Selector (แก้จากรอบก่อน)

รอบก่อนเทสต์ค้นคำว่า "เลือกบทบาท" ในข้อความทั้งหน้า จึง fail เพราะเจอประโยคอธิบาย "ไม่มีการเลือกบทบาทเอง"
รอบนี้ตรวจเฉพาะ **องค์ประกอบที่ผู้ใช้โต้ตอบได้** (`findRoleSelectors()` ใน `mockup-check.mjs`):

1. `select / input / textarea / radiogroup / listbox / combobox` ที่ name / id / aria-label / label เกี่ยวกับ role, บทบาท, portal
2. `option` ที่เป็นชื่อบทบาท (ครูผู้สอน, ฝ่ายวิชาการ, ผู้บริหาร, ผู้ดูแลระบบ, teacher, office)
3. ลิงก์ที่ส่ง `?role= / ?as= / ?portal=` ใน URL
4. ปุ่ม / ลิงก์ / แท็บ / label ที่ข้อความชวนเลือกบทบาท เช่น "เข้าแบบครู", "เข้าในฐานะฝ่ายวิชาการ", "เลือกบทบาท", "login as"
5. องค์ประกอบที่มี `data-role` / `data-select-role`

และตรวจเพิ่มว่า (ก) ฟอร์ม Login มีเฉพาะอีเมล + รหัสผ่าน (ข) CTA ทุกปุ่มในหน้า Welcome ไปปลายทางเดียวกันที่ระบบเลือก
ตรวจ 4 หน้า: Welcome, Login, Office Dashboard, Teacher Dashboard — **ไม่พบเลย**

> หมายเหตุ: `?session=office|teacher` ในหน้า Welcome เป็นเครื่องมือจำลองสถานะ login สำหรับผู้ตรวจ mockup เท่านั้น
> ไม่ได้เป็นองค์ประกอบบนหน้าจอ และไม่มีใน Production

## 8. สิ่งที่พบและแก้ไขในรอบนี้

| # | ปัญหา | สาเหตุ | การแก้ |
|---|---|---|---|
| 1 | เทสต์ Role Selector fail | ค้นข้อความทั้งหน้า (false positive) | เปลี่ยนเป็นตรวจองค์ประกอบจริง (ข้อ 7) |
| 2 | เทสต์ "transition ค้าง" fail | เทสต์รอ 1.7s แต่ spec ลบ class ที่ 2.2s | รอ 2.3s ตาม spec |
| 3 | หัวเรื่อง "ระบบบริหาร" และ "มอบหมาย" ล้นจอบนมือถือ | ค่า `--chars` ต่ำกว่าจำนวนอักษรฐานจริง | แก้เป็น 9 และ 7 · ปรับ "ส่ง · ตรวจรับ" เป็น 11 · เทสต์ตรวจทุกฉาก ไม่ใช่เฉพาะฉากแรก |
| 4 | ปุ่ม "ส่งเอกสาร" บน Top bar มือถือ (Teacher) ตัดเป็น 2 บรรทัด | ปุ่มไม่ได้กำหนด nowrap | ปุ่มไม่ตัดบรรทัด ข้อความรองย่อด้วย "…" |
| 5 | แท็บสถานะบนมือถือถูกตัดโดยไม่มีสัญญาณว่าเลื่อนได้ | ไม่มี affordance | เพิ่มขอบขวาจาง (mask) |

## 9. ข้อสังเกตที่ยังไม่แก้ (รอความเห็น)

- `welcome-desktop.png` มีขนาดราว 2.9 MB เพราะพื้นผิว noise ที่ความละเอียด 2× — ถ้าต้องการลดขนาดใน repo สามารถแปลงเป็น WebP ได้
- Sidebar ใน screenshot แบบเต็มหน้าจะดูสั้นกว่าเนื้อหา เพราะเป็น `position: fixed` (ในเบราว์เซอร์จริงสูงเต็มจอเสมอ) — screenshot รอบนี้จึงถ่ายเฉพาะส่วนที่เห็นบนจอ
- Mockup ใช้ฟอนต์จาก Google Fonts ถ้าเปิดแบบออฟไลน์จะใช้ฟอนต์สำรองของระบบ

## 10. ตำแหน่งไฟล์ใน Git

```
docs/design/
├─ UX-BLUEPRINT.md · DESIGN-SYSTEM.md · ANIMATION-SPEC.md · REVIEW-V2.md
├─ mockup/        welcome.html · login.html · office-dashboard.html · teacher-dashboard.html
│                 design-system.css · interaction.js · tests/mockup-check.mjs
├─ screenshots/   7 ภาพ (2×)
└─ archive/       office-mockup-v1.html · teacher-mockup-v1.html · README.md
```
