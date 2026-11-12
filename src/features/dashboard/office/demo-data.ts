/**
 * ⚠️ DEMO DATA — ข้อมูลจำลองสำหรับแสดงหน้าจอเท่านั้น ไม่ใช่ข้อมูลจริงของโรงเรียน
 * จะถูกแทนที่ด้วย query จาก Supabase ใน Phase 1.8–1.10
 */
import type { AssignmentStatus } from "@/components/shared";
import { daysFromToday } from "../demo-utils";

export const demoOfficeStats = {
  teachers: 48,
  students: 812,
  openTasks: 5,
  pendingReview: 17,
};

export interface DemoTaskProgress {
  id: string;
  title: string;
  category: string;
  dueAt: string;
  assigned: number;
  submitted: number;
  approved: number;
  revision: number;
}

export const demoTaskProgress: DemoTaskProgress[] = [
  { id: "t1", title: "แผนการจัดการเรียนรู้ ภาคเรียนที่ 2", category: "แผนการสอน", dueAt: daysFromToday(6), assigned: 48, submitted: 31, approved: 22, revision: 4 },
  { id: "t2", title: "บันทึกหลังการสอน เดือนที่ 1", category: "บันทึกหลังสอน", dueAt: daysFromToday(2), assigned: 48, submitted: 40, approved: 35, revision: 2 },
  { id: "t3", title: "โครงการสอนรายวิชา", category: "โครงการสอน", dueAt: daysFromToday(-3), assigned: 48, submitted: 46, approved: 44, revision: 1 },
  { id: "t4", title: "วิจัยในชั้นเรียน (เค้าโครง)", category: "วิจัยในชั้นเรียน", dueAt: daysFromToday(20), assigned: 48, submitted: 9, approved: 3, revision: 0 },
];

export interface DemoReviewItem {
  id: string;
  teacher: string;
  learningArea: string;
  task: string;
  version: number;
  submittedAt: string;
  status: AssignmentStatus;
}

export const demoReviewQueue: DemoReviewItem[] = [
  { id: "r1", teacher: "ครูตัวอย่าง ก", learningArea: "คณิตศาสตร์", task: "แผนการจัดการเรียนรู้ ภาคเรียนที่ 2", version: 1, submittedAt: daysFromToday(0), status: "submitted" },
  { id: "r2", teacher: "ครูตัวอย่าง ข", learningArea: "วิทยาศาสตร์และเทคโนโลยี", task: "บันทึกหลังการสอน เดือนที่ 1", version: 2, submittedAt: daysFromToday(-1), status: "submitted" },
  { id: "r3", teacher: "ครูตัวอย่าง ค", learningArea: "ภาษาไทย", task: "แผนการจัดการเรียนรู้ ภาคเรียนที่ 2", version: 1, submittedAt: daysFromToday(-1), status: "submitted" },
  { id: "r4", teacher: "ครูตัวอย่าง ง", learningArea: "ภาษาต่างประเทศ", task: "บันทึกหลังการสอน เดือนที่ 1", version: 1, submittedAt: daysFromToday(-2), status: "submitted" },
];

/** สรุปนักเรียนที่มีผล 0 / ร / มส แยกตามระดับชั้น */
export const demoRiskSummary = [
  { grade: "ม.1", zero: 6, incomplete: 3, notEligible: 2 },
  { grade: "ม.2", zero: 9, incomplete: 5, notEligible: 1 },
  { grade: "ม.3", zero: 4, incomplete: 2, notEligible: 3 },
  { grade: "ม.4", zero: 7, incomplete: 6, notEligible: 2 },
  { grade: "ม.5", zero: 3, incomplete: 1, notEligible: 0 },
  { grade: "ม.6", zero: 2, incomplete: 2, notEligible: 1 },
];
