# ตรวจทานโครงสร้างหลักสูตรผ่านเว็บ (แทนการแจกไฟล์ Excel)

## ระยะที่ 1 — Preview (ทำแล้ว ไม่เขียนฐานข้อมูล)
หน้า `/office/curriculum/structure-review` อยู่ในเมนู “หลักสูตรโรงเรียน” และเปิดได้เฉพาะบทบาท academic_head, academic_staff และ learning_area_head
- **แหล่งข้อมูล:** ไฟล์ชุดตรวจทาน `.json` (`kind: curriculum-structure-review`) ที่ฝ่ายวิชาการเตรียม
  - เปิดอ่านในเบราว์เซอร์เท่านั้น ไม่อัปโหลด
  - ไม่มีข้อมูลหลักสูตรจริงอยู่ใน repo
- **ขอบเขตการมองเห็น (ใช้สิทธิ์เดิมเท่านั้น):**
  - academic_head / academic_staff / system_admin / executive เห็นทุกกลุ่มสาระ
  - learning_area_head เห็นเฉพาะกลุ่มสาระใน `learning_area_ids` ของตนเอง
  - learning_area_head ที่ยังไม่ได้รับมอบหมายกลุ่มสาระ ไม่เห็นรายการใดเลย
- **ความเห็น:** เลือกได้ 3 แบบ คือ เห็นด้วย / เสนอแก้ไข / ส่งให้ฝ่ายวิชาการ
  - ต้องใส่เหตุผลเมื่อไม่ได้เลือก “เห็นด้วย”
  - ประเด็นที่ขึ้นกับมติระดับโรงเรียน (`dependsOn`) เลือก “เห็นด้วย” ไม่ได้
  - ความเห็นเก็บในหน้าเว็บชั่วคราว และดาวน์โหลดเป็น CSV ได้
- **แท็บสรุปความเห็น:** เฉพาะฝ่ายวิชาการ และระบุชัดว่าผลรวม “ยังไม่ใช่มติ”
- **ประเด็นระดับโรงเรียน:** แยกเป็นแท็บของตนเอง และแสดงสถานะ “รอมติ”
- **โค้ด:**
  - logic: `src/features/curriculum/review/review-package.ts`
  - test: `scripts/review-package.test.ts`
  - หน้า: `pages/StructureReviewPage.tsx`

## สิ่งที่มีอยู่แล้วและควรใช้ต่อ (ไม่สร้างระบบซ้ำ)
| ต้องการ | ของเดิม |
|---|---|
| ทะเบียนประเด็น + สถานะ + การตัดสินโดยหัวหน้าฝ่ายวิชาการ | `source_conflicts` (CF register) + `source_conflict_set_status` (open ↔ needs_decision) + `source_conflict_resolve` (academic_head เท่านั้น บังคับระบุเหตุผล) |
| ค่าฝั่ง A/B, ข้อเสนอ, ผู้มีอำนาจตัดสิน | คอลัมน์ `value_a`, `value_b`, `recommendation`, `decision_authority` และ `source_conflict_annotate` (office staff) |
| อ้างอิงหน้า PDF / ชีต!เซลล์ | `locator_a` / `locator_b` + `private.is_valid_locator` (`pdf:N`, `sheet:Name!A1`) |
| สิทธิ์หัวหน้ากลุ่มสาระเฉพาะกลุ่มตน | `private.can_edit_curriculum_area(learning_area_id)` (academic_head หรือ learning_area_head ที่ได้รับมอบหมาย) |
| Audit | `private.audit_row_change()` trigger |

สิ่งที่ยังไม่มี: ที่เก็บ **ความเห็นของหัวหน้ากลุ่มสาระ** (`source_conflict_annotate` จำกัดให้ office staff ซึ่งไม่รวม learning_area_head)

## ระยะที่ 2 — บันทึกจริง (เสนอ · ต้องอนุมัติ Migration แยก)
1. Migration (forward-only) ประกอบด้วย:
   - เพิ่มคอลัมน์ `source_conflicts.learning_area_id uuid null` เป็น FK ไป learning_areas (null = ประเด็นระดับโรงเรียน)
   - สร้างตาราง `source_conflict_opinions`:
     - คอลัมน์ `conflict_id, reviewer_id, learning_area_id, choice ('agree'|'propose'|'escalate'), note, created_at, updated_at`
     - unique `(conflict_id, reviewer_id)`
     - check: `choice <> 'agree'` ต้องมี `note`
     - ติด audit trigger
   - สร้าง RPC `source_conflict_opinion_set(p_conflict_id, p_choice, p_note)`:
     - security definer + `require_human`
     - ผ่านเมื่อ `private.can_edit_curriculum_area(conflict.learning_area_id)` เป็นจริง
     - ปฏิเสธเมื่อ conflict resolved
     - ปฏิเสธ `agree` เมื่อประเด็นขึ้นกับมติระดับโรงเรียนที่ยังไม่ resolved
   - RLS แบบ select-only:
     - office staff เห็นทั้งหมด
     - learning_area_head เห็นเฉพาะกลุ่มตน
     - ไม่ให้ insert/update/delete ตรง
   - ไม่มีบทบาทใหม่ ไม่ขยายสิทธิ์ของตารางหลักสูตรเดิม
2. นำเข้า 97 ประเด็น + 6 มติระดับโรงเรียนเป็นแถวใน `source_conflicts` (CF ใหม่)
   - academic_head เป็นผู้นำเข้าจากไฟล์ชุดตรวจทาน
   - ต้อง dry-run ก่อน
   - ไม่แตะ CF เดิม 66 รายการ
3. หน้าเว็บเปลี่ยนจาก “เปิดไฟล์” เป็นอ่านจากระบบ ส่วน UI และ logic เดิมใช้ต่อได้
   - ความเห็นบันทึกผ่าน RPC
   - หัวหน้าฝ่ายวิชาการตัดสินผ่าน `source_conflict_resolve` เดิม
4. ทดสอบ pgTAP:
   - สิทธิ์รายกลุ่มสาระ
   - การปฏิเสธ `agree` ของประเด็นที่ขึ้นกับมติ
   - academic_staff/teacher บันทึกความเห็นแทนไม่ได้
   - resolve ได้เฉพาะ academic_head

การบันทึกจริงไม่เปลี่ยนรายวิชาหรือสถานะหลักสูตร การแก้ทะเบียนตามมติเป็นขั้นตอนแยกที่ต้องอนุมัติอีกครั้ง
