import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ASSIGNMENT_STATUS_LABELS, TASK_STATUS_LABELS, type AssignmentStatus, type TaskStatus } from "../api";

const TASK_VARIANT: Record<TaskStatus, BadgeProps["variant"]> = { draft: "secondary", published: "default", closed: "outline", cancelled: "outline" };
const ASSIGN_VARIANT: Record<AssignmentStatus, BadgeProps["variant"]> = {
  assigned: "secondary",
  submitted: "info",
  revision_requested: "warning",
  approved: "success",
  cancelled: "outline",
};

export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => <Badge variant={TASK_VARIANT[status]}>{TASK_STATUS_LABELS[status]}</Badge>;

export function AssignmentStatusBadge({ status, overdue }: { status: AssignmentStatus; overdue?: boolean }) {
  if (overdue) return <Badge variant="destructive">เลยกำหนด</Badge>;
  return <Badge variant={ASSIGN_VARIANT[status]}>{ASSIGNMENT_STATUS_LABELS[status]}</Badge>;
}

/** ข้อความกำหนดส่งแบบสัมพัทธ์ */
export function dueText(due: string) {
  const ms = new Date(due).getTime() - Date.now();
  const days = Math.floor(Math.abs(ms) / 86400000);
  const hours = Math.floor(Math.abs(ms) / 3600000);
  if (ms < 0) return { text: days >= 1 ? `เลยกำหนด ${days} วัน` : `เลยกำหนด ${hours} ชั่วโมง`, tone: "text-destructive" };
  if (days < 1) return { text: `เหลือ ${hours} ชั่วโมง`, tone: "text-destructive" };
  if (days <= 3) return { text: `อีก ${days} วัน`, tone: "text-warning" };
  return { text: `อีก ${days} วัน`, tone: "text-muted-foreground" };
}
