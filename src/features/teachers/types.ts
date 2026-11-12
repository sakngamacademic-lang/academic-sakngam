/** ทะเบียนครูและบุคลากร — ตรงกับตาราง public.teachers (migration 20261115000100) */
export type TeacherPosition = "executive" | "teacher" | "assistant_teacher" | "government_employee" | "contract_teacher" | "support_staff";
export type EmploymentStatus = "active" | "on_leave" | "transferred" | "retired" | "resigned";

export interface Teacher {
  id: string;
  profile_id: string | null;
  teacher_code: string;
  prefix: string;
  first_name: string;
  last_name: string;
  position: TeacherPosition;
  learning_area_id: string | null;
  employment_status: EmploymentStatus;
  email: string | null;
  updated_at: string;
}

export const POSITION_LABELS: Record<TeacherPosition, string> = {
  executive: "ผู้บริหารสถานศึกษา",
  teacher: "ครู",
  assistant_teacher: "ครูผู้ช่วย",
  government_employee: "พนักงานราชการ",
  contract_teacher: "ครูอัตราจ้าง",
  support_staff: "บุคลากรสนับสนุน",
};

export const STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "ปฏิบัติงาน",
  on_leave: "ลาศึกษา / ลาพัก",
  transferred: "ย้าย",
  retired: "เกษียณ",
  resigned: "ลาออก",
};

export const PREFIX_OPTIONS = ["นาย", "นาง", "นางสาว", "ดร.", "ว่าที่ร้อยตรี", "ว่าที่ร้อยตรีหญิง"] as const;

export const fullName = (t: Pick<Teacher, "prefix" | "first_name" | "last_name">) => `${t.prefix}${t.first_name} ${t.last_name}`;
