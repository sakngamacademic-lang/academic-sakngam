import { useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, FileUp, History, MessageSquareText, Upload } from "lucide-react";
import { DashSection, DemoZone, KpiCard, PendingButton, Tag, type TagTone } from "@/components/dashboard";
import { PageHeader } from "@/components/shared";
import type { AssignmentStatus } from "@/components/shared";
import { daysUntil, formatDateLongTH, formatDateTH } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCurrentPeriod } from "../use-current-period";
import { demoMyTasks, demoSubmissionHistory, type DemoMyTask } from "./demo-data";

const SUBMIT_PHASE = "Phase 1.9";

type TabKey = "due" | "fix" | "wait" | "done";
const TABS: { key: TabKey; label: string }[] = [
  { key: "due", label: "ใกล้ครบกำหนด" },
  { key: "fix", label: "ต้องแก้ไข" },
  { key: "wait", label: "รอตรวจ" },
  { key: "done", label: "ส่งแล้ว" },
];

const RESULT: Record<AssignmentStatus, { label: string; tone: TagTone }> = {
  assigned: { label: "รอส่ง", tone: "todo" },
  submitted: { label: "รอตรวจ", tone: "wait" },
  revision_requested: { label: "ส่งกลับแก้ไข", tone: "fix" },
  approved: { label: "ตรวจรับแล้ว", tone: "ok" },
  cancelled: { label: "ยกเลิก", tone: "todo" },
};

function dueText(dueAt: string) {
  const d = daysUntil(dueAt);
  if (d < 0) return { text: `เลยกำหนด ${-d} วัน`, className: "text-destructive" };
  if (d === 0) return { text: "ครบกำหนดวันนี้", className: "text-destructive" };
  if (d <= 3) return { text: `อีก ${d} วัน`, className: "text-warning" };
  return { text: `อีก ${d} วัน`, className: "text-muted-foreground" };
}

const byDue = (a: DemoMyTask, b: DemoMyTask) => a.dueAt.localeCompare(b.dueAt);

export function TeacherDashboardPage() {
  const { access } = useAuth();
  const period = useCurrentPeriod();
  const [tab, setTab] = useState<TabKey>("due");
  const [taskToSubmit, setTaskToSubmit] = useState<string>("");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({ due: null, fix: null, wait: null, done: null });

  const lists: Record<TabKey, DemoMyTask[]> = {
    due: demoMyTasks.filter((t) => t.status === "assigned").sort(byDue),
    fix: demoMyTasks.filter((t) => t.status === "revision_requested").sort(byDue),
    wait: demoMyTasks.filter((t) => t.status === "submitted"),
    done: demoMyTasks.filter((t) => t.status === "submitted" || t.status === "approved"),
  };
  const openable = demoMyTasks.filter((t) => t.status === "assigned" || t.status === "revision_requested").sort(byDue);
  const upcoming = openable.filter((t) => daysUntil(t.dueAt) >= 0 && daysUntil(t.dueAt) <= 30);
  const nearCount = lists.due.filter((t) => daysUntil(t.dueAt) <= 7).length;

  const openTab = (key: TabKey) => {
    setTab(key);
    document.getElementById("my-work")?.scrollIntoView({ block: "start" });
  };
  const startSubmit = (id: string) => {
    setTaskToSubmit(id);
    document.getElementById("submit")?.scrollIntoView({ block: "start" });
  };
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = TABS[(i + d + TABS.length) % TABS.length]!.key;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <PageHeader
        title={`สวัสดี ${access?.display_name || "คุณครู"}`}
        description={[period.label, formatDateLongTH(new Date())].filter(Boolean).join(" · ")}
        actions={
          <a
            href="#submit"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium whitespace-nowrap text-primary-foreground hover:bg-primary/90"
          >
            <FileUp className="size-4" aria-hidden="true" /> ส่งเอกสาร
          </a>
        }
      />

      <DemoZone id="demo-teacher" title="ภาระงานเอกสารของฉัน" phase={SUBMIT_PHASE}>
        <section aria-label="สถานะการส่งงาน" className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard label="ใกล้ครบกำหนด" icon={CalendarClock} value={nearCount} hint="ภายใน 7 วัน" onClick={() => openTab("due")} />
          <KpiCard label="ต้องแก้ไข" icon={AlertTriangle} tone="alert" value={lists.fix.length} hint="มีข้อเสนอแนะ" onClick={() => openTab("fix")} />
          <KpiCard label="รอตรวจ" icon={Clock} tone="accent" value={lists.wait.length} hint="ส่งแล้ว รอฝ่ายวิชาการ" onClick={() => openTab("wait")} />
          <KpiCard label="ส่งแล้ว / ตรวจรับ" icon={CheckCircle2} tone="ok" value={lists.done.length} hint="ภาคเรียนนี้" onClick={() => openTab("done")} />
        </section>

        {lists.fix.map((t) => (
          <DashSection
            key={t.id}
            id={`fix-${t.id}`}
            highlight
            className="mb-4"
            title={
              <span className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-warning" aria-hidden="true" /> ต้องแก้ไขก่อน
              </span>
            }
            actions={<Tag tone="fix">{dueText(t.dueAt).text.replace("อีก", "ครบกำหนดอีก")}</Tag>}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t.title} · ฉบับที่ {t.version}
                </p>
                <blockquote className="mt-2 border-l-2 border-warning/60 pl-3 text-sm text-muted-foreground">
                  <span className="block text-xs font-medium text-warning">ข้อเสนอแนะจากฝ่ายวิชาการ</span>
                  {t.feedback}
                </blockquote>
              </div>
              <button
                type="button"
                onClick={() => startSubmit(t.id)}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Upload className="size-4" aria-hidden="true" /> ส่งฉบับแก้ไข
              </button>
            </div>
          </DashSection>
        ))}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <DashSection id="my-work" title="งานที่ได้รับมอบหมาย" meta={`${demoMyTasks.length} งาน`} className="xl:col-span-2">
            <div
              role="tablist"
              aria-label="สถานะงาน"
              className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1 max-sm:[mask-image:linear-gradient(90deg,#000_85%,transparent)]"
            >
              {TABS.map((t, i) => (
                <button
                  key={t.key}
                  ref={(el) => {
                    tabRefs.current[t.key] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${t.key}`}
                  aria-selected={tab === t.key}
                  aria-controls={`panel-${t.key}`}
                  tabIndex={tab === t.key ? 0 : -1}
                  onClick={() => setTab(t.key)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
                    tab === t.key ? "border-primary/60 bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{lists[t.key].length}</span>
                </button>
              ))}
            </div>
            {TABS.map((t) => (
              <ul key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={tab !== t.key} className="divide-y">
                {lists[t.key].map((task) => {
                  const due = dueText(task.dueAt);
                  const canSubmit = task.status === "assigned" || task.status === "revision_requested";
                  return (
                    <li key={task.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <p className="min-w-0 text-sm">
                        <span className="block font-medium">{task.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {task.category} ·{" "}
                          {canSubmit ? (
                            <span className={due.className}>{due.text}</span>
                          ) : (
                            <>ฉบับที่ {task.version}{task.submittedAt && ` · ส่งเมื่อ ${formatDateTH(task.submittedAt)}`}</>
                          )}
                        </span>
                      </p>
                      {canSubmit ? (
                        <button
                          type="button"
                          onClick={() => startSubmit(task.id)}
                          className={cn(
                            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg px-3 text-xs font-medium sm:self-auto",
                            daysUntil(task.dueAt) <= 7 || task.status === "revision_requested"
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "border hover:bg-accent",
                          )}
                        >
                          <Upload className="size-3.5" aria-hidden="true" />
                          {task.status === "revision_requested" ? "ส่งฉบับแก้ไข" : "ส่งเอกสาร"}
                        </button>
                      ) : (
                        <Tag tone={RESULT[task.status].tone} className="self-start sm:self-auto">{RESULT[task.status].label}</Tag>
                      )}
                    </li>
                  );
                })}
                {lists[t.key].length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">ไม่มีงานในสถานะนี้</li>}
              </ul>
            ))}
          </DashSection>

          <DashSection id="deadlines" title="กำหนดส่งที่ใกล้เข้ามา" meta="30 วันข้างหน้า">
            <ol className="space-y-3">
              {upcoming.map((t) => {
                const d = daysUntil(t.dueAt);
                return (
                  <li key={t.id} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-tight",
                        d <= 3 ? "border-warning/50 text-warning" : "text-foreground",
                      )}
                    >
                      <b className="text-base tabular-nums">{d}</b>
                      <span className="text-[10px] text-muted-foreground">วัน</span>
                    </span>
                    <p className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{t.title}</span>
                      <span className="block text-xs text-muted-foreground">ครบกำหนด {formatDateTH(t.dueAt)}</span>
                    </p>
                  </li>
                );
              })}
            </ol>
          </DashSection>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <DashSection id="submit" title="ส่งเอกสาร" meta="PDF / Word / Excel · ไม่เกิน 20 MB">
            <form className="space-y-3" onSubmit={(e) => e.preventDefault()} aria-describedby="submit-pending">
              <p id="submit-pending" role="note" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                ระบบอัปโหลดเอกสารเปิดใช้งานใน {SUBMIT_PHASE} — ตอนนี้ยังส่งไฟล์ไม่ได้
              </p>
              <div className="space-y-1.5">
                <label htmlFor="submit-task" className="block text-sm font-medium">งานที่จะส่ง</label>
                <select
                  id="submit-task"
                  value={taskToSubmit || openable[0]?.id || ""}
                  onChange={(e) => setTaskToSubmit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {openable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {t.status === "revision_requested" ? " (ฉบับแก้ไข)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset disabled className="space-y-3">
                <legend className="sr-only">ไฟล์และหมายเหตุ (ยังไม่เปิดใช้งาน)</legend>
                <div className="rounded-xl border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
                  <FileUp className="mx-auto mb-1 size-5" aria-hidden="true" />
                  <label htmlFor="submit-file" className="cursor-not-allowed">เลือกไฟล์ (ยังไม่เปิดใช้งาน)</label>
                  <input id="submit-file" type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="submit-note" className="block text-sm font-medium">หมายเหตุถึงฝ่ายวิชาการ (ไม่บังคับ)</label>
                  <textarea id="submit-note" rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60" />
                </div>
              </fieldset>
              <PendingButton phase={SUBMIT_PHASE} size="md">
                <Upload className="size-4" aria-hidden="true" /> ส่งเอกสาร (ยังไม่เปิดใช้งาน)
              </PendingButton>
            </form>
          </DashSection>

          <DashSection
            id="history"
            className="xl:col-span-2"
            title={
              <span className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" aria-hidden="true" /> ประวัติการส่ง
              </span>
            }
            meta="ทุกฉบับเก็บไว้ ไม่เขียนทับ"
          >
            <ul className="divide-y">
              {demoSubmissionHistory.map((h) => (
                <li key={h.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <p className="min-w-0 text-sm">
                    <span className="block font-medium">
                      {h.task} · ฉบับที่ {h.version}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {h.fileName} · {formatDateTH(h.at)}
                    </span>
                  </p>
                  <Tag tone={RESULT[h.result].tone} className="self-start sm:self-auto">{RESULT[h.result].label}</Tag>
                </li>
              ))}
            </ul>
          </DashSection>
        </div>
      </DemoZone>
    </>
  );
}
