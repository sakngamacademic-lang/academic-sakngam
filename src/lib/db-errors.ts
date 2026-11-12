/** แปลงข้อผิดพลาดจาก PostgREST/PostgreSQL เป็นข้อความภาษาไทย */
interface PgError {
  code?: string;
  message?: string;
  details?: string;
}

const UNIQUE: Record<string, string> = {
  academic_years_year_key: "มีปีการศึกษานี้อยู่แล้ว",
  academic_years_one_current_idx: "มีปีการศึกษาปัจจุบันอยู่แล้ว",
  terms_year_term_key: "ปีการศึกษานี้มีภาคเรียนนี้อยู่แล้ว",
  terms_one_current_idx: "มีภาคเรียนปัจจุบันอยู่แล้ว",
  classrooms_room_key: "มีห้องเรียนนี้อยู่แล้วในปีการศึกษาเดียวกัน",
  grade_levels_code_key: "รหัสระดับชั้นนี้มีอยู่แล้ว",
  grade_levels_name_key: "ชื่อระดับชั้นนี้มีอยู่แล้ว",
  learning_areas_code_key: "รหัสกลุ่มสาระนี้มีอยู่แล้ว",
  learning_areas_name_key: "ชื่อกลุ่มสาระนี้มีอยู่แล้ว",
  user_roles_unique: "ผู้ใช้นี้ได้รับบทบาทนี้อยู่แล้ว",
  teachers_code_key: "รหัสประจำตัวนี้มีอยู่แล้ว",
  teachers_email_key: "อีเมลนี้ถูกใช้กับครูคนอื่นแล้ว",
  teachers_profile_key: "บัญชีนี้ผูกกับระเบียนครูคนอื่นอยู่แล้ว",
};

const CHECK: Record<string, string> = {
  academic_years_dates_order: "วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น",
  terms_dates_order: "วันปิดภาคเรียนต้องอยู่หลังวันเปิดภาคเรียน",
  academic_years_year_range: "ปีการศึกษา (พ.ศ.) ต้องอยู่ระหว่าง 2500–2700",
  academic_years_max_length: "ปีการศึกษายาวเกิน 400 วัน",
  terms_term_no_range: "ภาคเรียนต้องเป็น 1 หรือ 2",
  classrooms_room_range: "เลขห้องต้องอยู่ระหว่าง 1–99",
  grade_levels_code_format: "รหัสใช้ได้เฉพาะ A–Z, 0–9, - และ _ (ไม่เกิน 16 ตัว)",
  learning_areas_code_format: "รหัสใช้ได้เฉพาะ A–Z, 0–9, - และ _ (ไม่เกิน 16 ตัว)",
  user_roles_scope_check: "หัวหน้ากลุ่มสาระต้องระบุกลุ่มสาระ",
  teachers_code_format: "รหัสประจำตัวใช้ได้เฉพาะ A–Z, 0–9, - และ _ (ไม่เกิน 32 ตัว)",
  teachers_email_format: "รูปแบบอีเมลไม่ถูกต้อง",
};

function findKey(map: Record<string, string>, text: string) {
  return Object.keys(map).find((k) => text.includes(k));
}

export function dbErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต";
  const e = (error ?? {}) as PgError;
  const text = `${e.message ?? ""} ${e.details ?? ""}`;
  switch (e.code) {
    case "23505": {
      const k = findKey(UNIQUE, text);
      return k ? UNIQUE[k]! : "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว";
    }
    case "23514": {
      const k = findKey(CHECK, text);
      return k ? CHECK[k]! : "ข้อมูลไม่ถูกต้องตามเงื่อนไขที่กำหนด";
    }
    case "23503":
      return "ข้อมูลที่อ้างอิงไม่ถูกต้อง หรือไม่ได้อยู่ในโรงเรียนเดียวกัน";
    case "23502":
      return "กรุณากรอกข้อมูลที่จำเป็นให้ครบ";
    case "42501":
      return "คุณไม่มีสิทธิ์ดำเนินการนี้";
    case "P0001":
      return e.message ?? "ข้อมูลไม่ถูกต้อง";
  }
  if (error instanceof Error && error.message) return error.message;
  return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}
