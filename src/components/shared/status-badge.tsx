import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * สถานะของงานที่มอบหมาย — ตรงกับ state machine ใน docs/architecture/PHASE-0.md
 * "overdue" ไม่ใช่สถานะที่เก็บในฐานข้อมูล แต่คำนวณจากวันครบกำหนด
 */
export type AssignmentStatus = "assigned" | "submitted" | "revision_requested" | "approved" | "cancelled";

const statusMeta: Record<AssignmentStatus, { label: string; variant: BadgeProps["variant"] }> = {
  assigned: { label: "รอส่ง", variant: "secondary" },
  submitted: { label: "รอตรวจ", variant: "info" },
  revision_requested: { label: "ส่งกลับแก้ไข", variant: "warning" },
  approved: { label: "ตรวจรับแล้ว", variant: "success" },
  cancelled: { label: "ยกเลิก", variant: "outline" },
};

export function StatusBadge({ status, overdue = false }: { status: AssignmentStatus; overdue?: boolean }) {
  if (overdue && (status === "assigned" || status === "revision_requested")) {
    return <Badge variant="destructive">เลยกำหนด</Badge>;
  }
  const meta = statusMeta[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
