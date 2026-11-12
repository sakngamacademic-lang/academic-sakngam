/**
 * ⚠️ DEMO DATA — ข้อมูลจำลองสำหรับแสดงหน้าจอเท่านั้น ไม่ใช่ข้อมูลจริงของโรงเรียน
 * จะถูกแทนที่ด้วย query จาก Supabase ใน Phase 1.9
 */
import type { AssignmentStatus } from "@/components/shared";
import { daysFromToday } from "../demo-utils";

export interface DemoMyTask {
  id: string;
  title: string;
  category: string;
  dueAt: string;
  status: AssignmentStatus;
  version: number;
  feedback?: string;
}

export const demoMyTasks: DemoMyTask[] = [
  {
    id: "a1",
    title: "บันทึกหลังการสอน เดือนที่ 1",
    category: "บันทึกหลังสอน",
    dueAt: daysFromToday(2),
    status: "revision_requested",
    version: 1,
    feedback: "กรุณาเพิ่มข้อเสนอแนะการปรับปรุงการสอนในส่วนท้ายของบันทึก",
  },
  { id: "a2", title: "แผนการจัดการเรียนรู้ ภาคเรียนที่ 2", category: "แผนการสอน", dueAt: daysFromToday(6), status: "assigned", version: 0 },
  { id: "a3", title: "วิจัยในชั้นเรียน (เค้าโครง)", category: "วิจัยในชั้นเรียน", dueAt: daysFromToday(20), status: "assigned", version: 0 },
  { id: "a4", title: "รายงานผลการประเมินกลางภาค", category: "วัดผล", dueAt: daysFromToday(-1), status: "assigned", version: 0 },
  { id: "a5", title: "โครงการสอนรายวิชา", category: "โครงการสอน", dueAt: daysFromToday(-3), status: "submitted", version: 1 },
  { id: "a6", title: "ตารางสอนรายบุคคล", category: "เอกสารทั่วไป", dueAt: daysFromToday(-10), status: "approved", version: 2 },
];
