import { useState } from "react";
import { CalendarClock, Download, FileText, Inbox, Upload } from "lucide-react";
import { PageHeader, TableToolbar } from "@/components/shared";
import { DashSection, KpiCard, LiveBadge, PendingButton } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { matchesSearch } from "@/features/master-data/use-crud-state";
import { CATEGORY_LABELS, formatBytes, useTaskTemplates } from "@/features/documents/api";
import { edgeFunctionStorage } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { dbErrorMessage } from "@/lib/db-errors";
import { formatDateTH } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EXT_LABELS, isOverdue, useMyAssignments, type MyAssignment } from "../api";
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
  const [expanded, setExpanded] = useState(false);
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
          {open(a) && <PendingButton phase="Phase 1.9"><Upload className="size-3.5" /> ส่งเอกสาร</PendingButton>}
        </div>
      </div>
      {expanded && (
        <div className="mt-3 border-t pt-3">
          {a.task.description && <p className="mb-3 text-sm whitespace-pre-line">{a.task.description}</p>}
          {cancelled && a.task.cancel_reason && <p className="mb-3 text-sm text-destructive">ยกเลิก: {a.task.cancel_reason}</p>}
          <Templates taskId={a.task_id} />
        </div>
      )}
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
