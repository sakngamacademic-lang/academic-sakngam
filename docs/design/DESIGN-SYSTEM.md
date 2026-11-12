# Design System — Dark Premium Editorial

> แหล่งจริงของค่าทั้งหมด: `docs/design/mockup/design-system.css` (CSS Custom Properties)
> สถานะ: **นำเข้า Production แล้ว (UI Integration V2)** — tokens อยู่ที่ `src/styles/index.css`, Welcome ใช้ `src/features/welcome/welcome.css`

## 1. สี

### พื้นหลังและพื้นผิว
| Token | ค่า | ใช้กับ |
|---|---|---|
| `--bg-0` | `#06070d` | พื้นหลังหน้า (Deep Charcoal) |
| `--bg-1` | `#0a0d19` | การ์ด / section |
| `--bg-2` | `#10142a` | จุดสว่างของ gradient ใน Hero (Dark Navy) |
| `--surface` | `rgba(18,22,42,.66)` + blur 18px | Floating Panel, thumbnail ที่เลือก |
| `--surface-solid` | `#131830` | จานแผนภูมิ |
| `--line` / `--line-strong` | indigo 12% / 24% | เส้นขอบบาง, grid |

### ตัวอักษร (contrast บน `--bg-1`)
| Token | ค่า | ระดับ |
|---|---|---|
| `--text-1` | `#f1f2ff` | หัวเรื่อง, ตัวเลข — AAA |
| `--text-2` | `#b9bedc` | เนื้อหา — AA |
| `--text-3` | `#8a90b4` | label, meta — AA สำหรับข้อความ ≥ 14px |

### Accent (ต่อฉาก — เปลี่ยนแบบ animate ผ่าน `@property --accent`)
| Token | ค่า | ความหมายในระบบ |
|---|---|---|
| `--violet` | `#8b7cf6` | ภาพรวม / รอส่ง |
| `--indigo` | `#6d7cff` | หลักสูตร |
| `--cyan` | `#38d6f5` | วัดผล / รอตรวจ |
| `--mint` | `#5eead4` | เอกสาร / ตรวจรับแล้ว |
| `--amber` | `#f7c56b` | ส่งกลับแก้ไข / ข้อเสนอแนะ |
| `--rose` | `#fb7b93` | เลยกำหนด / ติด 0 (ใช้เท่าที่จำเป็น) |

กฎ: ข้อความบนปุ่ม accent ใช้ `--accent-ink` (#0a0d19) เสมอ · สีสถานะต้องมีข้อความกำกับ ไม่สื่อด้วยสีอย่างเดียว

## 2. ตัวอักษร — IBM Plex Sans Thai

| บทบาท | น้ำหนัก | ขนาด | Line-height |
|---|---|---|---|
| Display บรรทัดบาง (`.t1`) | 200 | `min(6rem, 100cqi / (chars × .6))` | 1.22 |
| Display บรรทัดหนา (`.t2`) | 700 + gradient | `min(7.25rem, …)` | 1.22 |
| Section title | 600 (+ 200 คำนำ) | `clamp(1.6rem → 2.4rem)` | 1.3 |
| KPI | 600, tabular-nums | `clamp(1.6rem → 2.4rem)` | 1.2 |
| Body | 400 | 1rem | **1.7** |
| Label ละติน (EYEBROW) | 500, uppercase, tracking .22em | .75rem | — |

กฎภาษาไทย
- **ห้าม** letter-spacing ติดลบหรือ uppercase tracking กับข้อความไทย (สระ/วรรณยุกต์แตก)
- Display ใช้ line-height ≥ 1.2 และ `padding-block: .04em` เพื่อไม่ให้ `clip-path` ตัดสระบน/ล่างตอน wipe
- กำหนด `--chars` = จำนวนอักษรฐาน (ไม่นับสระบน/ล่าง/วรรณยุกต์) ให้หัวเรื่องย่อพอดีคอลัมน์

## 3. ระยะ รัศมี เงา

- Spacing ฐาน 4px: `--sp-1` .25rem → `--sp-8` 4.5rem · `--gutter` = `clamp(1rem, …, 3rem)`
- Radius: `--r-sm` 10 · `--r-md` 16 · `--r-lg` 24 · `--r-pill`
- `--shadow-float`: inset highlight 1px + เงายาวนุ่ม (ไม่ใช้ขอบหนา)
- `--shadow-glow`: เรืองแสงตามสี accent — ใช้กับจุดเน้นเดียวต่อฉาก (ปุ่มหลัก, จานแผนภูมิ)

## 4. Components

| Component | Class | หมายเหตุ |
|---|---|---|
| Top bar | `.topbar`, `.brand`, `.topnav`, `.pill--demo`, `.userchip` | sticky + blur, ป้าย Demo บังคับแสดงเมื่อใช้ข้อมูลจำลอง |
| Hero | `.hero[data-carousel]`, `.stage`, `.scene` | ทุกฉากซ้อนใน grid cell เดียว → ไม่กระตุกตอนเปลี่ยน |
| Orbit visual | `.scene__visual > .orbit > .orbit__float > .disc` | `transform-origin: 69% -217%` = จุดหมุนเหนือจอ |
| Headline | `.eyebrow`, `.title .t1/.t2`, `.lede` | |
| KPI | `.kpis > .kpi (dt/dd)` , `.kpi--alert` | |
| Floating panel | `.panel`, `.panel__tabs`, `.panel__body`, `.rows/.row`, `.meter`, `.tag--*`, `.steps`, `.quote`, `.dropzone` | glass + เส้นเรืองแสงด้านบน |
| Indicator | `.pager__dot[aria-current]` | จุดยืดเป็นเส้นตอน active |
| Thumbnail | `.strip`, `.thumb[aria-current]`, `.thumb__chart` | mini chart ของฉากนั้น |
| Progress | `.progress__seg.is-done/.is-current`, `.progress__toggle[aria-pressed]` | |
| Sections | `.section`, `.cards/.card`, `.timeline`, `.reveal` | |
| Buttons | `.btn--primary`, `.btn--ghost` | สูงขั้นต่ำ 44px |

### Dashboard components (v2 — ใช้ tokens ชุดเดียวกับ Welcome)

| Component | Class | หมายเหตุ |
|---|---|---|
| App shell | `.app`, `.side`, `.side__link[aria-current=page]`, `.side__badge`, `.side__soon`, `.scrim`, `.app__top`, `.app__content` | Sidebar ติดถาวร ≥1024px, drawer บนจอเล็ก |
| Quick actions | `.qa`, `.qa__item`, `.qa__item--primary` | ปุ่มหลักหนึ่งปุ่มต่อหน้า |
| Stats | `.stats`, `.stat`, `.stat--accent`, `.stat--alert`, `.stat--link` | ตัวเลข tabular, สีเฉพาะที่ต้องสนใจ |
| Box | `.box`, `.box--highlight`, `.box__head`, `.box__meta` | พื้นทึบ `--bg-1` ไม่ใช้ blur (อ่านง่าย เร็ว) |
| Action list | `.todo`, `.tasklist`, `.task__main` | ทุกแถวมีปุ่มทำต่อ |
| Filter | `.toolbar`, `.input`, `.chips`, `.chip[aria-pressed]` | |
| Table | `.table-wrap`, `.table`, `td[data-label]`, `.table-empty` | < 640px แปลงเป็นการ์ดต่อแถว |
| Tabs | `.seg-tabs [role=tab]` | segmented control พร้อมตัวนับ |
| Form | `.form`, `.field`, `.input`, `.dropzone`, `.form__error` | |
| Auth | `.auth`, `.auth__card` | หน้า Login ใช้ระบบเดียวกัน |
| Welcome extras | `.cta-band`, `.btn--lg`, `.btn--sm` | |

กฎ: Dashboard **ไม่ใช้** `.hero`, `.scene`, `.reveal`, parallax หรือ count-up — ใช้ได้เฉพาะ Welcome

## 5. Charts

สร้างเป็น SVG ล้วนจาก `data-*` (ไม่ใช้ library):

| `data-chart` | ใช้เมื่อ | ข้อมูล |
|---|---|---|
| `rings` | ความคืบหน้าหลายตัวชี้วัด (≤3) | `data-values="78,64,52"` (ร้อยละ) |
| `donut` | สัดส่วนของทั้งหมด | `data-values`, `data-colors`, `data-total` |
| `bars` | การกระจาย / เปรียบเทียบ | `data-values`, `data-labels` |
| `line` | แนวโน้มตามเวลา | `data-values`, `data-labels` |
| `gauge` | ค่าร้อยละเดียว | `data-values="64"` |

ทุกแผนภูมิ: `role="img"` + `data-label` (ข้อความสรุปตัวเลข) · `data-mini` = รุ่นย่อสำหรับ thumbnail

## 6. ภาพ

Mockup **ไม่ใช้ภาพถ่าย** — visual ทุกชิ้นเป็นแผนภูมิที่มีความหมายจากข้อมูลจำลอง พื้นหลังเป็น gradient / grid / noise ที่สร้างด้วย CSS
หากในอนาคตใช้ภาพประกอบ ต้องระบุ "ภาพตัวอย่าง" และห้ามใช้ภาพนักเรียนจริง (PDPA)
