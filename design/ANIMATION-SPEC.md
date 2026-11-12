# Animation Spec — Dark Premium Editorial

> Implementation: `design/mockup/design-system.css` (§8 Motion) + `design/mockup/interaction.js`
> ใช้ CSS keyframes + class (`is-leaving` / `is-entering`) และ `requestAnimationFrame` เฉพาะแถบโค้ง / count-up / parallax — ไม่มี library

## 1. Easing & Duration Tokens

| Token | ค่า | ใช้กับ |
|---|---|---|
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | ทุกอย่างที่ "เข้า" |
| `--ease-in` | `cubic-bezier(.7,0,.84,0)` | ทุกอย่างที่ "ออก" |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` | สี accent, แถบโค้งช่วงยืด |
| `--dur-scene-out` | .55s | visual ออก |
| `--dur-scene-in` | .95s | visual เข้า |
| `--delay-scene-in` | .28s | เริ่ม visual ใหม่ (ซ้อนกับของเดิมเล็กน้อย) |
| `--stagger` | 60ms | KPI / แถวใน panel |
| `--autoplay` | 7s | ต่อฉาก (เมื่อเปิด) |

## 2. Scene Transition Timeline (เปลี่ยน 1 ฉาก ≈ 1.45s)

`--dir` = +1 (ถัดไป) / −1 (ย้อนกลับ) — เลือกทางที่สั้นกว่าอัตโนมัติเมื่อกระโดดข้ามฉาก

| เวลา (s) | ฉากเดิม (`.is-leaving`) | ฉากใหม่ (`.is-entering`) | พื้นหลัง |
|---|---|---|---|
| 0.00 | Visual หมุนออกตามวงโคจร `rotate(dir×46°)` + fade (.55s ease-in) | — | แถบโค้งเริ่มยืด (0→.6s ease-in-out) · `--accent` เริ่มเปลี่ยนสี (.8s) |
| 0.00 | `.t1` wipe ออกไปทางขวา `clip-path` (.42s) | | |
| 0.06 | `.t2` wipe ออกไปทางซ้าย (.42s) | | |
| 0.00 | eyebrow / lede / KPI / action / panel: fade-up ออก (.3s) | | |
| 0.28 | | Visual หมุนเข้าจากอีกฝั่ง `rotate(−dir×46°) scale(.92)` → 0 (.95s ease-out) | |
| 0.42 | | Panel: `translateY(18px) scale(.97)` → 0 (.6s) | |
| 0.50 | | Eyebrow rise-in (.4s) | |
| 0.52 | | `.t1` wipe เข้าจากขวา (.7s) | |
| 0.55 | | แผนภูมิวาดเส้น `stroke-dasharray 0→ค่า` (1.2s) · แท่ง `scaleY 0→1` stagger 70ms · แถวใน panel rise stagger 60ms | |
| 0.60 | | `.t2` wipe เข้าจากซ้าย (.7s) | แถบโค้งหดเข้าตำแหน่งของฉากใหม่ (.85s ease-out) |
| 0.72 | | Lede rise-in | |
| 0.75 | | KPI count-up (.9s easeOutCubic) | |
| 0.78 | | KPI rise stagger 60ms | |
| 0.80 | | Meter bar `scaleX 0→1` (.9s) | |
| 1.00 | | Action buttons rise-in | |
| 0.62 | ลบ `is-leaving` → ซ่อน (`visibility:hidden` + `inert`) | | |
| 2.20 | | ลบ `is-entering` | |

กดเปลี่ยนฉากระหว่าง transition ได้ทันที: ล้าง timer และ class ทั้งหมดแล้วเริ่มใหม่ (ไม่มีคิวค้าง)

## 3. Parallax

| Layer | Pointer depth (`--d`) | Scroll factor (`--k`) |
|---|---|---|
| Grid | −10px | .06 |
| Orb A (accent) | +26px | .14 |
| Orb B (cyan) | −38px | .22 |
| Arc band | +14px | .10 |
| Orbit visual | +18px | — |
| Floating panel (desktop) | −10px (ทิศตรงข้าม → มีมิติ) | — |

- `--px/--py` ∈ [−.5, .5] จากตำแหน่งเมาส์ใน Hero; `--sy` = scrollY (จำกัดไม่เกินความสูง Hero)
- อัปเดตผ่าน `requestAnimationFrame` ครั้งเดียวต่อเฟรม, ใช้ `transform` เท่านั้น
- Pointer parallax เฉพาะ `(hover:hover) and (pointer:fine)` — ไม่ทำบนจอสัมผัส

## 4. Scroll Reveal

`.reveal` → `opacity 0, translateY(28px) scale(.985)` → ปกติ เมื่อเข้าจอ 15% (IntersectionObserver, rootMargin −8% ล่าง)
.8s ease-out, stagger 80ms ภายใน `.reveal-group` · แสดงครั้งเดียว (unobserve) · ไม่มี JS = แสดงทันที

## 5. Micro-interactions

| องค์ประกอบ | Interaction |
|---|---|
| Vertical dot | active ยืดเป็นเส้น 2.2rem + เรืองแสง (.45s ease-out) |
| Thumbnail | active ยกขึ้น 3px + glass + เงา (.45s) |
| ปุ่มหลัก | hover ยก 2px; ลูกศร active scale .94 |
| Progress | segment ปัจจุบันเติมเต็มตาม `--autoplay` เมื่อเปิด autoplay; หยุดเมื่อ hover/focus |
| Panel tabs | เส้นใต้สี accent, สลับเนื้อหาทันที |

## 6. Input Rules

| Input | ผล |
|---|---|
| ปัดแนวนอน > 44px และมากกว่าแนวตั้ง 1.4 เท่า | เปลี่ยนฉาก (`touch-action: pan-y` → เลื่อนหน้าแนวตั้งได้ปกติ) |
| `←` `→` | ฉากก่อน/ถัดไป (วนรอบ) |
| `Home` `End` | ฉากแรก / ฉากสุดท้าย |
| ปุ่ม ← → ภายใน tablist | สลับแท็บ ไม่เปลี่ยนฉาก |
| Wheel / scroll | **ไม่เปลี่ยนฉาก** — เลื่อนหน้าตามปกติ |

## 7. prefers-reduced-motion

- ปิด animation/transition ทั้งหมด (`!important`), เปลี่ยนฉากทันที (ไม่ใส่ `is-leaving/is-entering`)
- ไม่มี parallax, count-up แสดงค่าสุดท้ายทันที, แถบโค้งกระโดดไปตำแหน่งใหม่
- ปุ่ม autoplay ถูกซ่อนและปิด; reveal แสดงทันที
- ฟังการเปลี่ยนค่า media query ระหว่างใช้งานด้วย

## 8. Performance Budget

- Animate เฉพาะ `transform`, `opacity`, `clip-path`, `stroke-dasharray` — ไม่มี layout thrash
- `will-change` เฉพาะ `.orbit` และ `.bg-layer`
- ไม่มี scroll listener ที่อ่าน layout นอกจาก `scrollY`; ทั้งหมดผ่าน rAF
- ไม่มี dependency ภายนอกนอกจากฟอนต์ (Google Fonts)
