import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";

/** Metadata ของเอกสาร (PostgreSQL) — RLS กำหนดว่าใครเห็นเอกสารใด ไฟล์จริงเข้าถึงผ่าน Storage Adapter เท่านั้น */
export type FileStatus = "pending" | "ready" | "rejected" | "expired" | "deleted";

export interface DocFile {
  id: string;
  version: number;
  original_name: string;
  file_ext: string;
  size_bytes: number;
  status: FileStatus;
  status_reason: string | null;
  sha256: string | null;
  created_at: string;
  locked_at: string | null;
}

export interface DocumentRow {
  id: string;
  title: string;
  category: string;
  latest_version: number;
  created_at: string;
  teacher: { teacher_code: string; prefix: string; first_name: string; last_name: string } | null;
  files: DocFile[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  lesson_plan: "แผนการจัดการเรียนรู้",
  post_teaching_record: "บันทึกหลังการสอน",
  course_syllabus: "โครงการสอน",
  classroom_research: "วิจัยในชั้นเรียน",
  assessment_report: "รายงานการวัดผล",
  general: "เอกสารทั่วไป",
};

export const STATUS_LABELS: Record<FileStatus, string> = {
  pending: "กำลังอัปโหลด",
  ready: "พร้อมใช้งาน",
  rejected: "ไม่ผ่านการตรวจไฟล์",
  expired: "อัปโหลดไม่สำเร็จ",
  deleted: "ลบแล้ว",
};

export const documentsKey = ["documents"] as const;

export function useDocuments() {
  return useQuery({
    queryKey: documentsKey,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("documents")
        .select(
          "id, title, category, latest_version, created_at, teacher:teachers(teacher_code, prefix, first_name, last_name), files(id, version, original_name, file_ext, size_bytes, status, status_reason, sha256, created_at, locked_at)",
        )
        .eq("kind", "teacher_document")
        .order("created_at", { ascending: false })
        .order("version", { referencedTable: "files", ascending: false });
      if (error) throw error;
      return data as unknown as DocumentRow[];
    },
  });
}

/** แม่แบบเอกสารของภาระงาน (kind = task_template) — RLS: ผู้ที่เห็นงานนั้น */
export function useTaskTemplates(taskId: string | undefined) {
  return useQuery({
    queryKey: [...documentsKey, "templates", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("documents")
        .select("id, files(id, version, original_name, file_ext, size_bytes, status, status_reason, sha256, created_at, locked_at)")
        .eq("kind", "task_template")
        .eq("task_id", taskId!)
        .order("created_at");
      if (error) throw error;
      return (data as unknown as { id: string; files: DocFile[] }[]).flatMap((d) => d.files.filter((f) => f.status === "ready"));
    },
  });
}

export async function lockFile(fileId: string) {
  const { error } = await requireSupabase().rpc("storage_lock_file", { p_file_id: fileId });
  if (error) throw error;
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
