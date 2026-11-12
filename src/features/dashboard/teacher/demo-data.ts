/**
 * ⚠️ DEMO DATA — ข้อมูลจำลองสำหรับแสดงหน้าจอเท่านั้น ไม่ใช่ข้อมูลจริงของโรงเรียน
 * แสดงเฉพาะภายใน <DemoZone> และจะถูกแทนที่ด้วย query จาก Supabase ใน Phase 1.9
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
  submittedAt?: string;
}

export const demoMyTasks: DemoMyTask[] = [
  {
    id: "a1",
    title: "บันทึกหลังการสอน เดือนที่ 1",
    category: "บันทึกหลังสอน",
    dueAt: daysFromToday(2),
    status: "revision_requested",
    version: 1,
    feedback: "กรุณาเพิ่มแนวทางปรับปรุงการสอนในส่วนท้าย และแนบผลงานนักเรียนตัวอย่าง 1 ชิ้น",
  },
  { id: "a2", title: "แผนการจัดการเรียนรู้ ภาคเรียนที่ 2", category: "แผนการสอน", dueAt: daysFromToday(6), status: "assigned", version: 0 },
  { id: "a3", title: "วิจัยในชั้นเรียน (เค้าโครง)", category: "วิจัยในชั้นเรียน", dueAt: daysFromToday(20), status: "assigned", version: 0 },
  { id: "a4", title: "รายงานผลการประเมินกลางภาค", category: "วัดผล", dueAt: daysFromToday(-1), status: "assigned", version: 0 },
  { id: "a5", title: "โครงการสอนรายวิชา", category: "โครงการสอน", dueAt: daysFromToday(-3), status: "submitted", version: 1, submittedAt: daysFromToday(-3) },
  { id: "a6", title: "ตารางสอนรายบุคคล", category: "เอกสารทั่วไป", dueAt: daysFromToday(-10), status: "approved", version: 2, submittedAt: daysFromToday(-12) },
];

export interface DemoHistoryItem {
  id: string;
  task: string;
  version: number;
  fileName: string;
  at: string;
  result: AssignmentStatus;
}

/** ประวัติการส่ง (ทุกฉบับเก็บไว้ ไม่เขียนทับ) */
export const demoSubmissionHistory: DemoHistoryItem[] = [
  { id: "h1", task: "โครงการสอนรายวิชา", version: 1, fileName: "โครงการสอน_ค21101.pdf", at: daysFromToday(-3), result: "submitted" },
  { id: "h2", task: "บันทึกหลังการสอน เดือนที่ 1", version: 1, fileName: "บันทึกหลังสอน_ด1.docx", at: daysFromToday(-5), result: "revision_requested" },
  { id: "h3", task: "ตารางสอนรายบุคคล", version: 2, fileName: "ตารางสอน_v2.xlsx", at: daysFromToday(-12), result: "approved" },
  { id: "h4", task: "ตารางสอนรายบุคคล", version: 1, fileName: "ตารางสอน.xlsx", at: daysFromToday(-15), result: "revision_requested" },
];
