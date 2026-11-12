import { isAuthError } from "@supabase/supabase-js";

/** แปลงข้อผิดพลาดจาก Supabase Auth เป็นข้อความภาษาไทยที่ไม่เปิดเผยข้อมูลเกินจำเป็น */
export function authErrorMessage(error: unknown): string {
  if (isAuthError(error)) {
    switch (error.code) {
      case "invalid_credentials":
        return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
      case "user_banned":
        return "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อฝ่ายวิชาการ";
      case "email_not_confirmed":
        return "บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาติดต่อผู้ดูแลระบบ";
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
        return "มีการลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
      case "weak_password":
        return "รหัสผ่านไม่ปลอดภัยพอ กรุณาใช้อย่างน้อย 10 ตัวอักษร";
      case "same_password":
        return "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม";
      case "session_expired":
      case "session_not_found":
      case "refresh_token_not_found":
        return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
      case "signup_disabled":
        return "ระบบไม่เปิดให้สมัครสมาชิกเอง กรุณาติดต่อผู้ดูแลระบบ";
    }
    if (error.status === 0 || error.name === "AuthRetryableFetchError") {
      return "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต";
    }
  }
  if (error instanceof TypeError) return "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}

export type SignOutReason = "expired" | "suspended" | "no_school" | "signed_out";

export const SIGN_OUT_MESSAGES: Record<SignOutReason, { tone: "info" | "warning" | "error"; text: string }> = {
  signed_out: { tone: "info", text: "ออกจากระบบเรียบร้อยแล้ว" },
  expired: { tone: "warning", text: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" },
  suspended: { tone: "error", text: "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อฝ่ายวิชาการ" },
  no_school: { tone: "error", text: "บัญชียังไม่ได้ผูกกับโรงเรียน หรือโรงเรียนถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" },
};
