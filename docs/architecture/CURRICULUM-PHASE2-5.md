# Curriculum Management Phase 2–5 (สรุปทางเทคนิค)

| Phase | Migration | ตาราง/วัตถุใหม่ | หน้าเว็บ |
|---|---|---|---|
| 2 ทะเบียนมาตรฐาน & ตรวจรับรอง PDF | `20261202000100_framework_registry` | `framework_strands`, `indicators.stage_kind`, `framework_competencies`; RPC ค้นหา/สรุป/ประวัติ/ความครบถ้วน; ยอมรับหลายรายการเฉพาะรายการไม่มีปัญหา | `/office/curriculum/indicators` (แท็บทะเบียน), `/office/curriculum/analysis` |
| 3 คำอธิบาย/โครงสร้างรายวิชา | `20261202000200_course_syllabus` | `course_syllabi`, `course_syllabus_targets`, `course_units`, `course_unit_targets`; `my_course_subjects`, `course_syllabus_open/get/transition/check` | `/teacher/courses-plan`, `/office/curriculum/syllabi` |
| 4 แผนการจัดการเรียนรู้ | `20261202000300_lesson_plans` | `lesson_plans`, `lesson_plan_reviews`, `lesson_plan_documents`; `lesson_plan_create/copy/transition/get/list` | `/teacher/lesson-plans`, `/office/curriculum/lesson-plans` |
| 5 กิจกรรม · ตารางสอน · เล่ม · Dashboard | `20261202000400_activities_timetable_dashboard` | `activity_groups`, view `v_timetable_feed`, `curriculum_book_data`, `academic_readiness_summary` | `/office/curriculum/readiness` |

หลักที่บังคับที่ฐานข้อมูล
- ไม่ผ่อน RLS เดิม (เช่น `subjects`) — ครูเห็นรายวิชาผ่าน RPC ที่จำกัดกลุ่มสาระ/รายวิชาที่สอน
- ผู้จัดทำตรวจ/อนุมัติงานของตนเองไม่ได้ · แก้เนื้อหาได้เฉพาะร่าง/ส่งกลับ · ฉบับใหม่ไม่ทับฉบับเดิม · Audit Log ทุกตาราง
- ไม่สมมติชนิดตัวชี้วัด (ระหว่างทาง/ปลายทาง) · ไม่คำนวณ % ถ้ากรอบยังไม่ยืนยันว่าครบ · ไม่คำนวณคาบจากหน่วยกิต · ไม่มีเกณฑ์ผ่านกิจกรรมเริ่มต้น · คะแนนรวมเทียบเฉพาะเกณฑ์ที่โรงเรียนยืนยัน (`grading_policies.params.total_score`)
- เล่มหลักสูตรสร้างจากข้อมูลจริง ส่วนที่ไม่อนุมัติมีเครื่องหมาย “ร่าง” ไม่สร้างข้อความประกาศ/ผู้ลงนาม

API ตารางสอน: `GET /rest/v1/v_timetable_feed` (JWT ผู้ใช้ · RLS ตามสิทธิ์) — คอลัมน์ ปี/ภาค/หลักสูตร/แผน/ชั้น/ห้อง/วิชา/กลุ่มเรียน/คาบต่อสัปดาห์/ครู/ข้อมูลที่ขาด

เทสต์: pgTAP 029 (14) · 030 (22) · 031 (17) · 032 (10) · 027/028 ผ่านซ้ำ · deno analyzer
