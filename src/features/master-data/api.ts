import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import type { AcademicYear, AreaHeadAssignment, Classroom, GradeLevel, LearningArea, SchoolProfile, Term } from "./types";

/**
 * การเข้าถึงข้อมูลพื้นฐาน — RLS จำกัดให้เห็น/แก้เฉพาะโรงเรียนของผู้ใช้
 * school_id ใส่โดยฐานข้อมูล (column default) ฝั่ง client ไม่ส่งเอง
 */
export type MasterTable = "learning_areas" | "academic_years" | "terms" | "grade_levels" | "classrooms";

const COLUMNS: Record<MasterTable, string> = {
  learning_areas: "id, code, name_th, sort_order, is_active",
  academic_years: "id, year_be, starts_on, ends_on, is_current, note",
  terms: "id, academic_year_id, term_no, starts_on, ends_on, is_current",
  grade_levels: "id, code, name_th, stage, level_order, is_active",
  classrooms: "id, academic_year_id, grade_level_id, room_no, is_active",
};

const ORDER: Record<MasterTable, [string, boolean][]> = {
  learning_areas: [["sort_order", true], ["code", true]],
  academic_years: [["year_be", false]],
  terms: [["starts_on", false]],
  grade_levels: [["level_order", true]],
  classrooms: [["room_no", true]],
};

export const mdKey = (table: MasterTable) => ["master-data", table] as const;

async function listTable<T>(table: MasterTable): Promise<T[]> {
  let q = requireSupabase().from(table).select(COLUMNS[table]);
  for (const [col, asc] of ORDER[table]) q = q.order(col, { ascending: asc });
  const { data, error } = await q;
  if (error) throw error;
  return data as T[];
}

export const useLearningAreas = () => useQuery({ queryKey: mdKey("learning_areas"), queryFn: () => listTable<LearningArea>("learning_areas") });
export const useAcademicYears = () => useQuery({ queryKey: mdKey("academic_years"), queryFn: () => listTable<AcademicYear>("academic_years") });
export const useTerms = () => useQuery({ queryKey: mdKey("terms"), queryFn: () => listTable<Term>("terms") });
export const useGradeLevels = () => useQuery({ queryKey: mdKey("grade_levels"), queryFn: () => listTable<GradeLevel>("grade_levels") });
export const useClassrooms = () => useQuery({ queryKey: mdKey("classrooms"), queryFn: () => listTable<Classroom>("classrooms") });

export async function insertRows(table: MasterTable, values: Record<string, unknown> | Record<string, unknown>[]) {
  const { error } = await requireSupabase().from(table).insert(values);
  if (error) throw error;
}

export async function updateRow(table: MasterTable, id: string, values: Record<string, unknown>) {
  const { data, error } = await requireSupabase().from(table).update(values).eq("id", id).select("id");
  if (error) throw error;
  // RLS ไม่ให้แก้ = ไม่มีแถวถูกแก้ (PostgREST ไม่ส่ง error)
  if (!data || data.length === 0) throw new Error("ไม่มีสิทธิ์แก้ไขรายการนี้ หรือรายการถูกเปลี่ยนแปลงไปแล้ว");
}

export async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/** mutation + toast ภาษาไทย + invalidate cache */
export function useMdMutation<V>(
  fn: (vars: V) => Promise<unknown>,
  opts: { success: string | ((vars: V, result: unknown) => string); invalidate: readonly (readonly unknown[])[] },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      toast.success(typeof opts.success === "function" ? opts.success(vars, result) : opts.success);
      opts.invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
    },
    onError: (err) => toast.error(dbErrorMessage(err)),
  });
}

// --------------------------------------------------------------- learning area heads
export const areaHeadsKey = ["master-data", "area-heads"] as const;

export function useAreaHeads(enabled: boolean) {
  return useQuery({
    queryKey: areaHeadsKey,
    enabled,
    queryFn: async () => {
      const sb = requireSupabase();
      const [roles, profiles] = await Promise.all([
        sb.from("user_roles").select("id, user_id, learning_area_id").eq("role", "learning_area_head"),
        sb.from("profiles").select("id, display_name, email, is_active").order("display_name"),
      ]);
      if (roles.error) throw roles.error;
      if (profiles.error) throw profiles.error;
      return { assignments: roles.data as AreaHeadAssignment[], profiles: profiles.data as SchoolProfile[] };
    },
  });
}

export async function assignAreaHead(userId: string, schoolId: string, learningAreaId: string) {
  const { error } = await requireSupabase()
    .from("user_roles")
    .insert({ user_id: userId, school_id: schoolId, role: "learning_area_head", learning_area_id: learningAreaId });
  if (error) throw error;
}

export async function revokeAreaHead(assignmentId: string) {
  const { data, error } = await requireSupabase().from("user_roles").delete().eq("id", assignmentId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("ไม่สามารถถอนสิทธิ์ได้ (ไม่มีสิทธิ์ หรือเป็นสิทธิ์ของตนเอง)");
}
