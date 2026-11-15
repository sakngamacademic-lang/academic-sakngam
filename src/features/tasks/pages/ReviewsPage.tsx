import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { DataTable, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { daysUntil, formatDateTH } from "@/lib/format";
import { useReviewQueue, type ReviewQueueItem } from "../api";
import { ReviewDialog } from "./TaskDetailPage";

const name = (r: ReviewQueueItem) => (r.teacher ? `${r.teacher.prefix}${r.teacher.first_name} ${r.teacher.last_name}` : "ครู");

/** ตรวจรับเอกสาร — งานที่ส่งแล้วรอตรวจทุกงาน (เก่าที่สุดก่อน) · สิทธิ์จริงตรวจที่ RPC ตามขอบเขตงาน */
export function ReviewsPage() {
  const q = useReviewQueue();
  const { can } = useAuth();
  const [target, setTarget] = useState<{ id: string; name: string; status: string } | null>(null);
  return (
    <>
      <PageHeader title="ตรวจรับเอกสาร" description="เอกสารที่ครูส่งแล้วและรอตรวจ — ตรวจรับหรือขอแก้ไขพร้อมเหตุผล ทุกเวอร์ชันถูกเก็บไว้" />
      <DataTable
        caption="เอกสารรอตรวจ"
        loading={q.isPending}
        error={q.error ? dbErrorMessage(q.error) : null}
        rows={q.data}
        rowKey={(r) => r.id}
        emptyText="ไม่มีเอกสารรอตรวจ"
        columns={[
          { key: "teacher", header: "ครู", cell: (r) => <span className="font-medium">{name(r)}</span> },
          { key: "task", header: "งาน", cell: (r) => <Link className="hover:text-primary" to={`/office/tasks/${r.task_id}`}>{r.task?.title}</Link> },
          { key: "ver", header: "ฉบับ", cell: (r) => r.current_version, hideOnMobile: true },
          { key: "at", header: "ส่งเมื่อ", cell: (r) => (r.last_submitted_at ? `${formatDateTH(r.last_submitted_at)} (${-daysUntil(r.last_submitted_at)} วัน)` : "–"), hideOnMobile: true },
        ]}
        actions={(r) => (
          <Button size="sm" onClick={() => setTarget({ id: r.id, name: name(r), status: r.status })}><ClipboardCheck /> ตรวจ</Button>
        )}
      />
      <ReviewDialog target={target} canReview={can("tasks.manage")} onClose={() => setTarget(null)} />
    </>
  );
}
