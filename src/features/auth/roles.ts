/**
 * บทบาทและสิทธิ์ฝั่ง UI — ต้องตรงกับ enum public.app_role
 * ⚠️ ใช้ควบคุมการแสดงผลเท่านั้น การอนุญาตจริงบังคับด้วย RLS ในฐานข้อมูล
 */
export const APP_ROLES = [
  "system_admin",
  "academic_head",
  "academic_staff",
  "learning_area_head",
  "executive",
  "teacher",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  system_admin: "ผู้ดูแลระบบ",
  academic_head: "หัวหน้าฝ่ายวิชาการ",
  academic_staff: "เจ้าหน้าที่วิชาการ",
  learning_area_head: "หัวหน้ากลุ่มสาระ",
  executive: "ผู้บริหาร",
  teacher: "ครูผู้สอน",
};

/** ใครเข้า portal ใดได้ */
export const OFFICE_ROLES: readonly AppRole[] = [
  "system_admin",
  "academic_head",
  "academic_staff",
  "learning_area_head",
  "executive",
];
export const TEACHER_ROLES: readonly AppRole[] = ["teacher"];

/** ความสามารถย่อยที่ใช้ซ่อน/แสดงปุ่มหรือส่วนของหน้าจอ */
const CAPABILITIES = {
  "tasks.view": ["academic_head", "academic_staff", "learning_area_head", "executive"],
  "tasks.manage": ["academic_head", "academic_staff", "learning_area_head"],
  "assessment.view": ["academic_head", "academic_staff", "learning_area_head", "executive"],
} satisfies Record<string, readonly AppRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function hasAnyRole(roles: readonly AppRole[], allowed: readonly AppRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

export function can(roles: readonly AppRole[], capability: Capability): boolean {
  return hasAnyRole(roles, CAPABILITIES[capability]);
}

/** หน้าแรกหลังเข้าสู่ระบบ: ฝ่ายวิชาการก่อน ถ้าไม่มีสิทธิ์จึงไประบบครู */
export function defaultPortalPath(roles: readonly AppRole[]): string | null {
  if (hasAnyRole(roles, OFFICE_ROLES)) return "/office";
  if (hasAnyRole(roles, TEACHER_ROLES)) return "/teacher";
  return null;
}

/** เรียงบทบาทตามลำดับใน APP_ROLES เพื่อแสดงบทบาทหลักก่อน */
export function sortRoles(roles: readonly AppRole[]): AppRole[] {
  return [...roles].sort((a, b) => APP_ROLES.indexOf(a) - APP_ROLES.indexOf(b));
}
