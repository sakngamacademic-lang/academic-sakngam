import { useState } from "react";
import { CalendarClock, Download, FileText, Inbox, Upload } from "lucide-react";
import { PageHeader, TableToolbar } from "@/components/shared";
import { DashSection, KpiCard, LiveBadge } from "@/components/dashboard";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-controls";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { matchesSearch } from "@/features/master-data/use-crud-state";
import { CATEGORY_LABELS, formatBytes, useTaskTemplates } from "@/features/documents/api";
import { edgeFunctionStorage, StorageError } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { dbErrorMessage } from "@/lib/db-errors";
import { formatDateTH } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EXT_LABELS, isOverdue, submitAssignment, tasksKey, useMyAssignments, useSubmissions, type MyAssignment } from "../api";
import { SubmissionHistory } from "./SubmissionHistory";
import { AssignmentStatusBadge, dueText } from "./TaskStatusBadge";

type Tab = "todo" | "soon" | "done" | "cancelled";
const TABS: { key: Tab; label: string }[] = [
  { key: "todo", label: "ยังไม่ส่ง" },
  { key: "soon", label: "ใกล้ครบกำหนด" },
  { key: "done", label: "ส่งแล้ว" },
  { key: "cancelled", label: "ยกเลิก" },
];
const open = (a: MyAssignment) => a.task.status === "published" && (a.status === "assigned" || a.status === "revision_requested");
const soon = (a: MyAssignment) => {
  const left = new Date(a.task.due_at).getTime() - Date.now();
  return open(a) && left >= 0 && left < 7 * 86400000; // ไม่นับงานที่เลยกำหนดแล้ว
};
const inTab: Record<Tab, (a: MyAssignment) => boolean> = {
  todo: open,
  soon,
  done: (a) => a.status === "submitted" || a.status === "approved",
  cancelled: (a) => a.status === "cancelled" || a.task.status === "cancelled",
};

/** งานที่ได้รับมอบหมาย (ครู) — ข้อมูลจริง เรียงตามวันครบกำหนด */
export function MyAssignmentsPage() {
  const q = useMyAssignments();
  const [tab, setTab] = useState<Tab>("todo");
  const [search, setSearch] = useState("");
  const all = q.data ?? [];
  const rows = all
    .filter((a) => inTab[tab](a) && matchesSearch(search, a.task.title, a.task.description))
    .sort((x, y) => x.task.due_at.localeCompare(y.task.due_at));
  const overdue = all.filter((a) => isOverdue(a.task.due_at, a.status, a.task.status)).length;

  return (
    <>
      <PageHeader title="งานที่ได้รับมอบหมาย" description="ดูกำหนดส่ง ข้อกำหนด และดาวน์โหลดแม่แบบ — การส่งเอกสารจะเปิดใน Phase 1.9" />
      <section aria-label="สรุปงานของฉัน" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="ยังไม่ส่ง" icon={Inbox} value={all.filter(open).length} loading={q.isPending} onClick={() => setTab("todo")} />
        <KpiCard label="ใกล้ครบกำหนด (7 วัน)" icon={CalendarClock} tone="accent" value={all.filter(soon).length} loading={q.isPending} onClick={() => setTab("soon")} />
        <KpiCard label="เลยกำหนด" icon={CalendarClock} tone="alert" value={overdue} loading={q.isPending} onClick={() => setTab("todo")} />
        <KpiCard label="ส่งแล้ว" icon={FileText} tone="ok" value={all.filter(inTab.done).length} loading={q.isPending} onClick={() => setTab("done")} />
      </section>

      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหาชื่องาน" />
      <div role="tablist" aria-label="สถานะงาน" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap",
              tab === t.key ? "border-primary/60 bg-primary/15" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{all.filter(inTab[t.key]).length}</span>
          </button>
        ))}
      </div>

      <DashSection id="assignments" title={<span className="flex items-center gap-2">รายการงาน <LiveBadge /></span>} meta={`${rows.length} งาน`}>
        {q.isPending ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : q.error ? (
          <p role="alert" className="text-sm text-destructive">{dbErrorMessage(q.error)}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีงานในหมวดนี้</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((a) => <AssignmentCard key={a.id} a={a} />)}
          </ul>
        )}
      </DashSection>
    </>
  );
}

function AssignmentCard({ a }: { a: MyAssignment }) {
  const [expanded, setExpanded] = useState(a.status === "revision_requested");
  const [submitting, setSubmitting] = useState(false);
  const overdue = isOverdue(a.task.due_at, a.status, a.task.status);
  const due = dueText(a.task.due_at);
  const cancelled = a.task.status === "cancelled" || a.status === "cancelled";
  return (
    <li data-testid="assignment" className={cn("rounded-xl border p-3 sm:p-4", overdue && "border-destructive/40", cancelled && "opacity-70")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{a.task.title}</span>
            <AssignmentStatusBadge status={cancelled ? "cancelled" : a.status} overdue={overdue} />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {CATEGORY_LABELS[a.task.category]} · ครบกำหนด {formatDateTH(a.task.due_at)}
            {open(a) && <span className={cn("ml-1 font-medium", due.tone)}>({due.text})</span>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            รับไฟล์: {a.task.allowed_exts.map((e) => EXT_LABELS[e]).join(", ")} · ไม่เกิน {a.task.max_files} ไฟล์
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? "ซ่อนรายละเอียด" : "รายละเอียด / แม่แบบ"}
          </Button>
          {open(a) && <Button size="sm" onClick={() => setSubmitting(true)}><Upload className="size-3.5" /> {a.status === "revision_requested" ? "ส่งฉบับแก้ไข" : "ส่งเอกสาร"}</Button>}
        </div>
      </div>
      {expanded && (
        <div className="mt-3 border-t pt-3">
          {a.task.description && <p className="mb-3 text-sm whitespace-pre-line">{a.task.description}</p>}
          {cancelled && a.task.cancel_reason && <p className="mb-3 text-sm text-destructive">ยกเลิก: {a.task.cancel_reason}</p>}
          <Templates taskId={a.task_id} />
          <p className="mt-4 mb-2 text-xs font-medium text-muted-foreground">ประวัติการส่ง</p>
          <SubmissionHistory assignmentId={a.id} />
        </div>
      )}
      <SubmitDialog a={a} open={submitting} onClose={() => setSubmitting(false)} />
    </li>
  );
}

function Templates({ taskId }: { taskId: string }) {
  const tpl = useTaskTemplates(taskId);
  if (tpl.isPending) return <p className="text-xs text-muted-foreground">กำลังโหลดแม่แบบ…</p>;
  if (!tpl.data?.length) return <p className="text-xs text-muted-foreground">ไม่มีแม่แบบเอกสาร</p>;
  return (
    <ul className="space-y-2" aria-label="แม่แบบเอกสาร">
      {tpl.data.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">{f.original_name} <span className="text-xs text-muted-foreground">· {formatBytes(f.size_bytes)}</span></span>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`ดาวน์โหลดแม่แบบ ${f.original_name}`}
            onClick={() => edgeFunctionStorage.download(f.id).catch((e: Error) => toast.error(e.message))}
          >
            <Download /> ดาวน์โหลด
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** ส่งเอกสาร: อัปโหลดผ่าน Storage เดิม (เวอร์ชันใหม่ของเอกสารเดิมเมื่อส่งฉบับแก้) แล้วผูกกับงาน — ไฟล์ที่ส่งถูกล็อกเป็นหลักฐาน */
function SubmitDialog({ a, open: isOpen, onClose }: { a: MyAssignment; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const history = useSubmissions(isOpen ? a.id : undefined);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ext = file?.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const extOk = !file || a.task.allowed_exts.includes(ext);
  const lastComment = history.data?.find((s) => s.review_status === "revision_requested")?.review_comment;
  const submit = async () => {
    if (!file) return;
    setError(null);
    try {
      setStage("กำลังอัปโหลด…");
      const prevDoc = history.data?.[0]?.file?.document_id;
      const up = await edgeFunctionStorage.upload(file, prevDoc ? { documentId: prevDoc } : { title: a.task.title, category: a.task.category });
      setStage("กำลังส่งงาน…");
      const v = await submitAssignment(a.id, up.fileId, note.trim() || null);
      toast.success(`ส่งงานแล้ว (ครั้งที่ ${v})`);
      setFile(null);
      setNote("");
      onClose();
      await qc.invalidateQueries({ queryKey: tasksKey });
    } catch (e) {
      setError(e instanceof StorageError ? e.message : dbErrorMessage(e));
    } finally {
      setStage(null);
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !stage && onClose()}>
      <DialogContent title={a.status === "revision_requested" ? "ส่งฉบับแก้ไข" : "ส่งเอกสาร"} description={a.task.title}>
        <div className="space-y-4">
          {lastComment && a.status === "revision_requested" && (
            <p role="note" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">สิ่งที่ต้องแก้ไข: {lastComment}</p>
          )}
          <FormField label={`ไฟล์ (${a.task.allowed_exts.map((e) => EXT_LABELS[e]).join(", ")} ≤ 20 MB)`} htmlFor="submit-file">
            <input id="submit-file" type="file" accept={a.task.allowed_exts.map((e) => `.${e}`).join(",")} disabled={Boolean(stage)}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </FormField>
          {!extOk && <p role="alert" className="text-sm text-destructive">งานนี้รับเฉพาะไฟล์ {a.task.allowed_exts.map((e) => EXT_LABELS[e]).join(", ")}</p>}
          <FormField label="หมายเหตุถึงผู้ตรวจ (ไม่บังคับ)" htmlFor="submit-note">
            <textarea id="submit-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} disabled={Boolean(stage)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </FormField>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={Boolean(stage)}>ยกเลิก</Button>
            <Button onClick={() => void submit()} disabled={!file || !extOk || Boolean(stage) || history.isPending}>{stage ?? "ส่งงาน"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
