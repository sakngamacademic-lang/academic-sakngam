import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ClipboardList, Plus, Send, Users } from "lucide-react";
import { PageHeader, TableToolbar } from "@/components/shared";
import { DashSection, KpiCard, LiveBadge } from "@/components/dashboard";
import { Select } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLearningAreas } from "@/features/master-data/api";
import { matchesSearch } from "@/features/master-data/use-crud-state";
import { dbErrorMessage } from "@/lib/db-errors";
import { formatDateTH } from "@/lib/format";
import { TASK_STATUS_LABELS, useTasks } from "../api";
import { dueText, TaskStatusBadge } from "./TaskStatusBadge";

/** รายการงาน + Dashboard ติดตามผู้รับและสถานะ (ข้อมูลจริง ตามขอบเขต RLS) */
export function TasksPage() {
  const { can } = useAuth();
  const canManage = can("tasks.manage");
  const tasks = useTasks();
  const areas = useLearningAreas();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const areaName = useMemo(() => new Map(areas.data?.map((a) => [a.id, a.name_th])), [areas.data]);

  const all = tasks.data ?? [];
  const rows = all.filter(
    (t) => matchesSearch(search, t.title) && (status === "" || (status === "active" ? t.status === "draft" || t.status === "published" : t.status === status)),
  );
  const published = all.filter((t) => t.status === "published");
  const sum = (k: "total" | "submitted" | "approved" | "overdue") => published.reduce((n, t) => n + (t.progress?.[k] ?? 0), 0);

  return (
    <>
      <PageHeader
        title="ภาระงาน / มอบหมาย"
        description="สร้างงาน แนบแม่แบบ เลือกผู้รับ และติดตามการส่งของครู"
        actions={canManage && <Button asChild><Link to="/office/tasks/create"><Plus /> สร้างภาระงาน</Link></Button>}
      />
      <section aria-label="สรุปงานที่เผยแพร่" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="งานที่เผยแพร่" icon={ClipboardList} value={published.length} loading={tasks.isPending} />
        <KpiCard label="การมอบหมายทั้งหมด" icon={Users} value={sum("total")} loading={tasks.isPending} />
        <KpiCard label="ส่งแล้ว" icon={Send} tone="accent" value={sum("submitted") + sum("approved")} loading={tasks.isPending} />
        <KpiCard label="ยังไม่ส่ง · เลยกำหนด" icon={AlertTriangle} tone="alert" value={sum("overdue")} loading={tasks.isPending} />
      </section>
      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหาชื่องาน">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="กรองตามสถานะงาน" className="sm:w-48">
          <option value="active">ร่าง + เผยแพร่</option>
          <option value="">ทุกสถานะ</option>
          {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </TableToolbar>
      <DashSection id="task-list" title={<span className="flex items-center gap-2">รายการงาน <LiveBadge /></span>} meta={`${rows.length} งาน`}>
        {tasks.isPending ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : tasks.error ? (
          <p role="alert" className="text-sm text-destructive">{dbErrorMessage(tasks.error)}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีงานตามตัวกรอง</p>
        ) : (
          <ul className="divide-y">
            {rows.map((t) => {
              const p = t.progress;
              const done = (p?.submitted ?? 0) + (p?.approved ?? 0);
              const pct = p?.total ? Math.round((done / p.total) * 100) : 0;
              const due = dueText(t.due_at);
              return (
                <li key={t.id} data-testid="task-row" className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/office/tasks/${t.id}`} className="font-medium hover:text-primary hover:underline">{t.title}</Link>
                        <TaskStatusBadge status={t.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.learning_area_id ? `กลุ่มสาระ${areaName.get(t.learning_area_id) ?? ""}` : "ทั้งโรงเรียน"} · ครบกำหนด {formatDateTH(t.due_at)}
                        {t.status === "published" && <span className={`ml-1 ${due.tone}`}>({due.text})</span>}
                      </p>
                    </div>
                    {t.status !== "draft" && p && (
                      <div className="w-full lg:w-80">
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>ส่งแล้ว {done}/{p.total}</span>
                          {p.overdue > 0 && <span className="text-destructive">เลยกำหนด {p.overdue}</span>}
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`ส่งแล้ว ${pct}%`}>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DashSection>
    </>
  );
}
