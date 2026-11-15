import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";

/**
 * ทะเบียนนักเรียน — ใช้ตาราง students / classroom_students เดิม (RLS เป็นผู้กำหนดสิทธิ์: ฝ่ายวิชาการเขียนได้, ครูเห็นเฉพาะนักเรียนที่เกี่ยวข้อง)
 * school_id ใส่โดยฐานข้อมูล · ไม่มีข้อมูลตัวอย่างในโค้ด
 */
export const studentsKey = ["students"] as const;
export type StudentStatus = "active" | "transferred" | "graduated" | "withdrawn";
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: "กำลังศึกษา",
  transferred: "ย้ายสถานศึกษา",
  graduated: "จบการศึกษา",
  withdrawn: "ลาออก / พ้นสภาพ",
};

export interface Student {
  id: string;
  student_code: string;
  prefix: string;
  first_name: string;
  last_name: string;
  status: StudentStatus;
  classroom_students: { id: string; classroom_id: string; student_no: number | null }[];
}

export const studentName = (s: Pick<Student, "prefix" | "first_name" | "last_name">) => `${s.prefix}${s.first_name} ${s.last_name}`;

export function useStudents() {
  return useQuery({
    queryKey: studentsKey,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("students")
        .select("id, student_code, prefix, first_name, last_name, status, classroom_students(id, classroom_id, student_no)")
        .order("student_code");
      if (error) throw error;
      return data as Student[];
    },
  });
}

export type StudentInput = Pick<Student, "student_code" | "prefix" | "first_name" | "last_name" | "status">;

export async function insertStudent(values: StudentInput, classroomId: string | null) {
  const sb = requireSupabase();
  const { data, error } = await sb.from("students").insert(values).select("id").single();
  if (error) throw error;
  if (classroomId) {
    const { error: e2 } = await sb.from("classroom_students").insert({ classroom_id: classroomId, student_id: data.id });
    if (e2) throw e2;
  }
}

export async function updateStudent(student: Student, values: StudentInput, classroomId: string | null) {
  const sb = requireSupabase();
  const { data, error } = await sb.from("students").update(values).eq("id", student.id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("ไม่มีสิทธิ์แก้ไขรายการนี้ หรือรายการถูกเปลี่ยนแปลงไปแล้ว");
  const current = student.classroom_students[0];
  if ((current?.classroom_id ?? null) === classroomId) return;
  // ย้ายห้อง: เพิ่มห้องใหม่ก่อน แล้วค่อยถอดห้องเดิม (ไม่ลบนักเรียน ไม่ลบประวัติอื่น)
  if (classroomId) {
    const { error: e2 } = await sb.from("classroom_students").insert({ classroom_id: classroomId, student_id: student.id });
    if (e2) throw e2;
  }
  if (current) {
    const { error: e3 } = await sb.from("classroom_students").delete().eq("id", current.id);
    if (e3) throw e3;
  }
}
