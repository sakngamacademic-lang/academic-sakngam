import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import type { Teacher } from "./types";

/**
 * ทะเบียนครู — RLS เป็นผู้กำหนดว่าเห็นแถวใด (ทั้งโรงเรียน / เฉพาะกลุ่มสาระ / เฉพาะของตนเอง)
 * school_id ใส่โดยฐานข้อมูล · profile_id เปลี่ยนได้ผ่าน RPC link/unlink เท่านั้น
 */
export const teachersKey = ["teachers"] as const;
const COLUMNS = "id, profile_id, teacher_code, prefix, first_name, last_name, position, learning_area_id, employment_status, email, updated_at";

export function useTeachers() {
  return useQuery({
    queryKey: teachersKey,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("teachers").select(COLUMNS).order("teacher_code");
      if (error) throw error;
      return data as Teacher[];
    },
  });
}

export type TeacherInput = Pick<Teacher, "teacher_code" | "prefix" | "first_name" | "last_name" | "position" | "learning_area_id" | "employment_status" | "email">;

export async function insertTeacher(values: TeacherInput) {
  const { error } = await requireSupabase().from("teachers").insert(values);
  if (error) throw error;
}

export async function updateTeacher(id: string, values: TeacherInput) {
  const { data, error } = await requireSupabase().from("teachers").update(values).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("ไม่มีสิทธิ์แก้ไขรายการนี้ หรือรายการถูกเปลี่ยนแปลงไปแล้ว");
}

export async function linkTeacherAccount(teacherId: string, profileId: string) {
  const { error } = await requireSupabase().rpc("link_teacher_account", { p_teacher_id: teacherId, p_profile_id: profileId });
  if (error) throw error;
}

export async function unlinkTeacherAccount(teacherId: string) {
  const { error } = await requireSupabase().rpc("unlink_teacher_account", { p_teacher_id: teacherId });
  if (error) throw error;
}

export interface SchoolAccount {
  id: string;
  email: string | null;
  display_name: string;
  is_active: boolean;
}

/** บัญชีผู้ใช้ในโรงเรียน (มีอยู่แล้วใน Auth) — ใช้เลือกตอนผูกบัญชี ไม่สร้างบัญชีใหม่ */
export function useSchoolAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ["teachers", "accounts"],
    enabled,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("profiles").select("id, email, display_name, is_active").order("email");
      if (error) throw error;
      return data as SchoolAccount[];
    },
  });
}
