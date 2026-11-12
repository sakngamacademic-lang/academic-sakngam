/**
 * ⚠️ DEMO DATA — ข้อมูลจำลองสำหรับแสดงหน้าจอเท่านั้น ไม่ใช่ข้อมูลจริงของโรงเรียน
 * แสดงเฉพาะภายใน <DemoZone> และจะถูกแทนที่ด้วย query จาก Supabase ใน Phase 1.8–1.10
 */
import type { TagTone } from "@/components/dashboard";
import { daysFromToday } from "../demo-utils";

export const demoOfficeKpis = { pendingReview: 17, oldestPendingDays: 3, overdue: 9, overdueTasks: 5 };

export interface DemoTodo {
  id: string;
  tone: TagTone;
  tag: string;
  title: string;
  detail: string;
  action: string;
}

export const demoPendingTasks: DemoTodo[] = [
  { id: "p1", tone: "late", tag: "ด่วน", title: "ตรวจรับเอกสารที่ค้างเกิน 3 วัน", detail: "6 ฉบับ · บันทึกหลังการสอน", action: "ตรวจ" },
  { id: "p2", tone: "fix", tag: "ติดตาม", title: "แจ้งเตือนครูที่ยังไม่ส่งโครงการสอน", detail: "2 คน · เลยกำหนด 3 วัน", action: "แจ้งเตือน" },
  { id: "p3", tone: "todo", tag: "วางแผน", title: "สร้างงาน “บันทึกหลังการสอน เดือนที่ 2”", detail: "กำหนดเปิดสัปดาห์หน้า", action: "สร้าง" },
  { id: "p4", tone: "wait", tag: "ข้อมูล", title: "ยืนยันครูที่ปรึกษา ม.4/2", detail: "ยังไม่กำหนด", action: "กำหนด" },
];

/** ร้อยละครูที่ส่งแล้วต่องาน */
export const demoSubmissionProgress = {
  values: [96, 83, 65, 19],
  labels: ["โครงการสอน", "บันทึกฯ ด.1", "แผนฯ", "วิจัยฯ"],
  label: "ข้อมูลจำลอง ร้อยละครูที่ส่งแล้ว: โครงการสอน 96, บันทึกหลังสอนเดือน 1 83, แผนการจัดการเรียนรู้ 65, วิจัยในชั้นเรียน 19",
};

export const demoRisk = [
  { key: "zero", label: "ติด 0", value: 31, color: "var(--rose)" },
  { key: "incomplete", label: "ติด ร", value: 19, color: "var(--amber)" },
  { key: "notEligible", label: "ติด มส", value: 9, color: "var(--violet)" },
] as const;

export type QueueStatus = "wait" | "fix" | "late";
export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = { wait: "รอตรวจ", fix: "ส่งกลับแก้ไข", late: "เลยกำหนด" };

export interface DemoQueueItem {
  id: string;
  teacher: string;
  learningArea: string;
  task: string;
  version: number | null;
  submittedAt: string | null;
  status: QueueStatus;
  lateDays?: number;
  action: string;
}

export const demoReviewQueue: DemoQueueItem[] = [
  { id: "q1", teacher: "ครูตัวอย่าง ก", learningArea: "คณิตศาสตร์", task: "แผนการจัดการเรียนรู้ ภาคเรียนที่ 2", version: 1, submittedAt: daysFromToday(0), status: "wait", action: "ตรวจ" },
  { id: "q2", teacher: "ครูตัวอย่าง ข", learningArea: "วิทยาศาสตร์และเทคโนโลยี", task: "บันทึกหลังการสอน เดือนที่ 1", version: 2, submittedAt: daysFromToday(-1), status: "wait", action: "ตรวจ" },
  { id: "q3", teacher: "ครูตัวอย่าง ค", learningArea: "ภาษาไทย", task: "โครงการสอนรายวิชา", version: 1, submittedAt: daysFromToday(-3), status: "fix", action: "ดู" },
  { id: "q4", teacher: "ครูตัวอย่าง ง", learningArea: "ภาษาต่างประเทศ", task: "โครงการสอนรายวิชา", version: null, submittedAt: null, status: "late", lateDays: 3, action: "แจ้งเตือน" },
  { id: "q5", teacher: "ครูตัวอย่าง จ", learningArea: "ศิลปะ", task: "บันทึกหลังการสอน เดือนที่ 1", version: 1, submittedAt: daysFromToday(-3), status: "wait", action: "ตรวจ" },
];
