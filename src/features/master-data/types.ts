export interface LearningArea {
  id: string;
  code: string;
  name_th: string;
  sort_order: number;
  is_active: boolean;
}

export interface AcademicYear {
  id: string;
  year_be: number;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
  note: string | null;
}

export interface Term {
  id: string;
  academic_year_id: string;
  term_no: 1 | 2;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}

export type GradeStage = "primary" | "lower_secondary" | "upper_secondary" | "other";

export interface GradeLevel {
  id: string;
  code: string;
  name_th: string;
  stage: GradeStage;
  level_order: number;
  is_active: boolean;
}

export interface Classroom {
  id: string;
  academic_year_id: string;
  grade_level_id: string;
  room_no: number;
  is_active: boolean;
}

export interface AreaHeadAssignment {
  id: string;
  user_id: string;
  learning_area_id: string;
}

export interface SchoolProfile {
  id: string;
  display_name: string;
  email: string | null;
  is_active: boolean;
}

export const STAGE_LABELS: Record<GradeStage, string> = {
  primary: "ประถมศึกษา",
  lower_secondary: "มัธยมศึกษาตอนต้น",
  upper_secondary: "มัธยมศึกษาตอนปลาย",
  other: "อื่น ๆ",
};

/** ระดับชั้นมาตรฐาน ป.1–ป.6, ม.1–ม.6 */
export const STANDARD_GRADE_LEVELS: Omit<GradeLevel, "id" | "is_active">[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ code: `P${n}`, name_th: `ป.${n}`, stage: "primary" as const, level_order: n })),
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    code: `M${n}`,
    name_th: `ม.${n}`,
    stage: (n <= 3 ? "lower_secondary" : "upper_secondary") as GradeStage,
    level_order: 6 + n,
  })),
];

/** 8 กลุ่มสาระการเรียนรู้ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน */
export const STANDARD_LEARNING_AREAS: Omit<LearningArea, "id" | "is_active">[] = [
  { code: "TH", name_th: "ภาษาไทย", sort_order: 1 },
  { code: "MA", name_th: "คณิตศาสตร์", sort_order: 2 },
  { code: "SC", name_th: "วิทยาศาสตร์และเทคโนโลยี", sort_order: 3 },
  { code: "SO", name_th: "สังคมศึกษา ศาสนา และวัฒนธรรม", sort_order: 4 },
  { code: "PE", name_th: "สุขศึกษาและพลศึกษา", sort_order: 5 },
  { code: "AR", name_th: "ศิลปะ", sort_order: 6 },
  { code: "CT", name_th: "การงานอาชีพ", sort_order: 7 },
  { code: "FL", name_th: "ภาษาต่างประเทศ", sort_order: 8 },
];
