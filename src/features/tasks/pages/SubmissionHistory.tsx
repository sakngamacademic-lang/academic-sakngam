import { Download, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/documents/api";
import { edgeFunctionStorage } from "@/lib/storage";
import { formatDateTH } from "@/lib/format";
import { toast } from "@/lib/toast";
import { REVIEW_LABELS, useSubmissions } from "../api";

const VARIANT = { pending: "warning", approved: "success", revision_requested: "destructive" } as const;

/** ประวัติการส่งทุกเวอร์ชัน + ผลตรวจ — ไฟล์ที่ส่งถูกล็อกเป็นหลักฐาน */
export function SubmissionHistory({ assignmentId }: { assignmentId: string }) {
  const q = useSubmissions(assignmentId);
  if (q.isPending) return <p className="text-xs text-muted-foreground">กำลังโหลดประวัติการส่ง…</p>;
  if (q.error) return <p role="alert" className="text-xs text-destructive">โหลดประวัติการส่งไม่สำเร็จ</p>;
  if (!q.data?.length) return <p className="text-xs text-muted-foreground">ยังไม่มีการส่ง</p>;
  return (
    <ol className="space-y-2" aria-label="ประวัติการส่ง">
      {q.data.map((s) => (
        <li key={s.id} className="rounded-lg border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <b>ครั้งที่ {s.version}</b>
              <Badge variant={VARIANT[s.review_status]}>{REVIEW_LABELS[s.review_status]}</Badge>
              {s.is_late && <Badge variant="outline">ส่งหลังกำหนด</Badge>}
              <span className="text-xs text-muted-foreground">{formatDateTH(s.submitted_at)}</span>
            </span>
            {s.file && (
              <Button size="sm" variant="ghost" aria-label={`ดาวน์โหลด ${s.file.original_name}`}
                onClick={() => edgeFunctionStorage.download(s.file!.id).catch((e: Error) => toast.error(e.message))}>
                <Download /> {s.file.original_name} <span className="text-xs text-muted-foreground">({formatBytes(s.file.size_bytes)})</span> <Lock className="size-3" aria-label="ล็อกแล้ว" />
              </Button>
            )}
          </div>
          {s.note && <p className="mt-1 text-xs text-muted-foreground">หมายเหตุผู้ส่ง: {s.note}</p>}
          {s.review_comment && <p className="mt-1 text-xs">ความเห็นผู้ตรวจ: {s.review_comment}</p>}
        </li>
      ))}
    </ol>
  );
}
