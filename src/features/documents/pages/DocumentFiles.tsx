import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared";
import { edgeFunctionStorage } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { dbErrorMessage } from "@/lib/db-errors";
import { formatDateTH } from "@/lib/format";
import { documentsKey, formatBytes, lockFile, STATUS_LABELS, type DocFile } from "../api";

const VARIANT: Record<DocFile["status"], BadgeProps["variant"]> = {
  pending: "info",
  ready: "success",
  rejected: "destructive",
  expired: "secondary",
  deleted: "outline",
};

/** รายการเวอร์ชันของเอกสาร พร้อมปุ่มตามสิทธิ์ (ฝั่งฐานข้อมูล/Edge Function ตรวจซ้ำเสมอ) */
export function DocumentFiles({ files, canDelete, canLock }: { files: DocFile[]; canDelete: boolean; canLock: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DocFile | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: documentsKey });

  const download = async (f: DocFile) => {
    setBusy(f.id);
    try {
      await edgeFunctionStorage.download(f.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const lock = async (f: DocFile) => {
    setBusy(f.id);
    try {
      await lockFile(f.id);
      toast.success(`ล็อกฉบับที่ ${f.version} เป็นหลักฐานแล้ว`);
      await refresh();
    } catch (e) {
      toast.error(dbErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ul className="divide-y">
        {files.map((f) => (
          <li key={f.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">ฉบับที่ {f.version}</span>
                <Badge variant={VARIANT[f.status]}>{STATUS_LABELS[f.status]}</Badge>
                {f.locked_at && (
                  <Badge variant="default" title="ตรวจรับเป็นหลักฐานแล้ว ลบไม่ได้">
                    <ShieldCheck className="size-3" /> หลักฐาน
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {f.original_name} · {formatBytes(f.size_bytes)} · {formatDateTH(f.created_at)}
              </p>
              {f.status_reason && f.status !== "ready" && <p className="text-xs text-destructive">{f.status_reason}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              {f.status === "ready" && (
                <Button size="sm" variant="outline" disabled={busy === f.id} onClick={() => void download(f)} aria-label={`ดาวน์โหลดฉบับที่ ${f.version}`}>
                  <Download /> ดาวน์โหลด
                </Button>
              )}
              {canLock && f.status === "ready" && !f.locked_at && (
                <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => void lock(f)} aria-label={`ล็อกฉบับที่ ${f.version} เป็นหลักฐาน`}>
                  <Lock /> ล็อกเป็นหลักฐาน
                </Button>
              )}
              {canDelete && !f.locked_at && f.status !== "deleted" && f.status !== "expired" && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(f)} aria-label={`ลบฉบับที่ ${f.version}`}>
                  <Trash2 /> ลบ
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`ลบฉบับที่ ${deleting?.version ?? ""}?`}
        description="ไฟล์จะถูกลบออกจากที่จัดเก็บ ประวัติการลบยังถูกบันทึกไว้"
        confirmLabel="ลบไฟล์"
        destructive
        onConfirm={async () => {
          try {
            await edgeFunctionStorage.remove(deleting!.id);
            toast.success("ลบไฟล์แล้ว");
            await refresh();
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </>
  );
}
