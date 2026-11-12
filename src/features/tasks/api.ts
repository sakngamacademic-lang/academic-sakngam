import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";

/**
 * ภาระงาน (Phase 1.7) — สถานะตาม state machine ใน PHASE-0.md §6
 * เขียนเนื้อหางานตรงผ่าน RLS · เผยแพร่ / ยกเลิก / ยกเลิกรายคน ผ่าน RPC เท่านั้น
 */
export type TaskStatus = "draft" | "published" | "closed" | "cancelled";
export type AssignmentStatus = "assigned" | "submitted" | "revision_requested" | "approved" | "cancelled";

export interface Task {
  id: string;
  term_id: string | null;
  learning_area_id: string | null;
  title: string;
  description: string;
  category: string;
  starts_at: string;
  due_at: string;
  allowed_exts: string[];
  max_files: number;
  status: TaskStatus;
  created_by: string | null;
  published_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface TaskProgress {
  task_id: string;
  total: number;
  assigned: number;
  submitted: number;
  revision_requested: number;
  approved: number;
  cancelled: number;
  overdue: number;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  teacher_id: string;
  status: AssignmentStatus;
  current_version: number;
  last_submitted_at: string | null;
  assigned_at: string;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  draft: "ฉบับร่าง",
  published: "เผยแพร่แล้ว",
  closed: "ปิดรับแล้ว",
  cancelled: "ยกเลิก",
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  assigned: "ยังไม่ส่ง",
  submitted: "ส่งแล้ว รอตรวจ",
  revision_requested: "ส่งกลับแก้ไข",
  approved: "ตรวจรับแล้ว",
  cancelled: "ยกเลิก",
};

export const EXT_LABELS: Record<string, string> = { pdf: "PDF", doc: "DOC", docx: "DOCX", xls: "XLS", xlsx: "XLSX" };

/** ยังต้องส่งและเลยกำหนด — คำนวณจาก due_at (ไม่เก็บเป็นสถานะ) */
export const isOverdue = (due: string, status: AssignmentStatus, taskStatus: TaskStatus = "published") =>
  taskStatus === "published" && (status === "assigned" || status === "revision_requested") && new Date(due) < new Date();

export const tasksKey = ["tasks"] as const;
const TASK_COLS = "id, term_id, learning_area_id, title, description, category, starts_at, due_at, allowed_exts, max_files, status, created_by, published_at, cancel_reason, created_at";

export function useTasks() {
  return useQuery({
    queryKey: tasksKey,
    queryFn: async () => {
      const sb = requireSupabase();
      const [tasks, progress] = await Promise.all([
        sb.from("tasks").select(TASK_COLS).order("due_at", { ascending: true }),
        sb.from("task_progress").select("*"),
      ]);
      if (tasks.error) throw tasks.error;
      if (progress.error) throw progress.error;
      const byId = new Map((progress.data as TaskProgress[]).map((p) => [p.task_id, p]));
      return (tasks.data as Task[]).map((t) => ({ ...t, progress: byId.get(t.id) }));
    },
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: [...tasksKey, id],
    enabled: !!id,
    queryFn: async () => {
      const sb = requireSupabase();
      const [task, assignments] = await Promise.all([
        sb.from("tasks").select(TASK_COLS).eq("id", id!).maybeSingle(),
        sb.from("task_assignments").select("id, task_id, teacher_id, status, current_version, last_submitted_at, assigned_at").eq("task_id", id!),
      ]);
      if (task.error) throw task.error;
      if (assignments.error) throw assignments.error;
      return { task: task.data as Task | null, assignments: assignments.data as TaskAssignment[] };
    },
  });
}

export type TaskInput = Pick<Task, "title" | "description" | "category" | "term_id" | "learning_area_id" | "starts_at" | "due_at" | "allowed_exts" | "max_files">;

export async function createTask(v: TaskInput): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await requireSupabase().from("tasks").insert({ id, ...v });
  if (error) throw error;
  return id;
}

export async function updateTask(id: string, v: TaskInput) {
  const { data, error } = await requireSupabase().from("tasks").update(v).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("แก้ไขไม่ได้ งานอาจถูกยกเลิกแล้ว หรือคุณไม่มีสิทธิ์");
}

export type PublishMode = "all" | "learning_areas" | "teachers";

export async function publishTask(taskId: string, mode: PublishMode, areaIds: string[], teacherIds: string[]) {
  const { data, error } = await requireSupabase().rpc("task_publish", {
    p_task_id: taskId,
    p_mode: mode,
    p_learning_area_ids: mode === "learning_areas" ? areaIds : null,
    p_teacher_ids: mode === "teachers" ? teacherIds : null,
  });
  if (error) throw error;
  return (data as { assigned_count: number; skipped_count: number }[])[0]!;
}

export async function cancelTask(taskId: string, reason: string) {
  const { error } = await requireSupabase().rpc("task_cancel", { p_task_id: taskId, p_reason: reason });
  if (error) throw error;
}

export async function cancelAssignment(assignmentId: string) {
  const { error } = await requireSupabase().rpc("assignment_cancel", { p_assignment_id: assignmentId });
  if (error) throw error;
}

export interface MyAssignment extends TaskAssignment {
  task: Task;
}

/** งานที่ได้รับมอบหมายของครู — RLS ส่งมาเฉพาะของตนเอง */
export function useMyAssignments() {
  return useQuery({
    queryKey: [...tasksKey, "mine"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("task_assignments")
        .select(`id, task_id, teacher_id, status, current_version, last_submitted_at, assigned_at, task:tasks(${TASK_COLS})`)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as MyAssignment[]).filter((a) => a.task);
    },
  });
}
