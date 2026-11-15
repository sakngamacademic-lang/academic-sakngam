import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, FileUp, MessageSquareText } from "lucide-react";
import { DashSection, KpiCard, LiveBadge, Tag, type TagTone } from "@/components/dashboard";
import { PageHeader } from "@/components/shared";
import { daysUntil, formatDateLongTH, formatDateTH } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useMyAssignments, useSubmissions, type AssignmentStatus, type MyAssignment } from "@/features/tasks/api";
import { useCurrentPeriod } from "../use-current-period";

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

/** แดชบอร์ดครู — ข้อมูลจริงจากงานที่ได้รับมอบหมาย (RLS: เฉพาะของตนเอง) · ส่งงานที่หน้า "งานที่ได้รับมอบหมาย" */
export function TeacherDashboardPage() {
  const { access } = useAuth();
  const period = useCurrentPeriod();
  const q = useMyAssignments();
  const live = (q.data ?? []).filter((a) => a.task.status === "published" && a.status !== "cancelled");
  const open = live.filter((a) => a.status === "assigned" || a.status === "revision_requested").sort((x, y) => x.task.due_at.localeCompare(y.task.due_at));
  const fix = live.filter((a) => a.status === "revision_requested");
  const near = open.filter((a) => daysUntil(a.task.due_at) <= 7);
  const upcoming = open.filter((a) => daysUntil(a.task.due_at) >= 0 && daysUntil(a.task.due_at) <= 30);

  return (
    <>
      <PageHeader
        title={`สวัสดี ${access?.display_name || "คุณครู"}`}
        description={[period.label, formatDateLongTH(new Date())].filter(Boolean).join(" · ")}
        actions={
          <Link to="/teacher/assignments" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium whitespace-nowrap text-primary-foreground hover:bg-primary/90">
            <FileUp className="size-4" aria-hidden="true" /> ส่งเอกสาร
          </Link>
        }
      />
      {q.error && <p role="alert" className="mb-4 text-sm text-destructive">โหลดงานที่ได้รับมอบหมายไม่สำเร็จ กรุณาลองใหม่</p>}
      <section aria-label="สถานะการส่งงาน" className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="ใกล้ครบกำหนด" icon={CalendarClock} value={near.length} hint="ภายใน 7 วัน" loading={q.isPending} />
        <KpiCard label="ต้องแก้ไข" icon={AlertTriangle} tone="alert" value={fix.length} hint="มีข้อเสนอแนะ" loading={q.isPending} />
        <KpiCard label="รอตรวจ" icon={Clock} tone="accent" value={live.filter((a) => a.status === "submitted").length} loading={q.isPending} />
        <KpiCard label="ตรวจรับแล้ว" icon={CheckCircle2} tone="ok" value={live.filter((a) => a.status === "approved").length} loading={q.isPending} />
      </section>

      {fix.map((a) => <FixCard key={a.id} a={a} />)}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <DashSection id="my-work" className="xl:col-span-2" title={<span className="flex items-center gap-2">งานที่ได้รับมอบหมาย <LiveBadge /></span>} meta={`${live.length} งาน`}>
          {q.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : !live.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีงานที่ได้รับมอบหมาย</p>
          ) : (
            <ul className="divide-y">
              {live.slice(0, 10).map((a) => {
                const canSubmit = a.status === "assigned" || a.status === "revision_requested";
                const due = dueText(a.task.due_at);
                return (
                  <li key={a.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <p className="min-w-0 text-sm">
                      <span className="block font-medium">{a.task.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {canSubmit ? <span className={due.className}>{due.text}</span> : <>ฉบับที่ {a.current_version}{a.last_submitted_at && ` · ส่งเมื่อ ${formatDateTH(a.last_submitted_at)}`}</>}
                      </span>
                    </p>
                    <Tag tone={RESULT[a.status].tone} className="self-start sm:self-auto">{RESULT[a.status].label}</Tag>
                  </li>
                );
              })}
            </ul>
          )}
          <Link to="/teacher/assignments" className="mt-3 inline-block text-sm text-primary hover:underline">ดูทั้งหมด / ส่งงาน</Link>
        </DashSection>
        <DashSection id="deadlines" title="กำหนดส่งที่ใกล้เข้ามา" meta="30 วันข้างหน้า">
          {!upcoming.length ? <p className="text-sm text-muted-foreground">ไม่มีกำหนดส่งใน 30 วัน</p> : (
            <ol className="space-y-3">
              {upcoming.map((a) => {
                const d = daysUntil(a.task.due_at);
                return (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-tight", d <= 3 ? "border-warning/50 text-warning" : "text-foreground")}>
                      <b className="text-base tabular-nums">{d}</b><span className="text-[10px] text-muted-foreground">วัน</span>
                    </span>
                    <p className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{a.task.title}</span>
                      <span className="block text-xs text-muted-foreground">ครบกำหนด {formatDateTH(a.task.due_at)}</span>
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </DashSection>
      </div>
    </>
  );
}

function FixCard({ a }: { a: MyAssignment }) {
  const s = useSubmissions(a.id);
  const comment = s.data?.find((x) => x.review_status === "revision_requested")?.review_comment;
  return (
    <DashSection id={`fix-${a.id}`} highlight className="mb-4"
      title={<span className="flex items-center gap-2"><MessageSquareText className="size-4 text-warning" aria-hidden="true" /> ต้องแก้ไขก่อน</span>}
      actions={<Tag tone="fix">{dueText(a.task.due_at).text}</Tag>}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">{a.task.title} · ฉบับที่ {a.current_version}</p>
          {comment && (
            <blockquote className="mt-2 border-l-2 border-warning/60 pl-3 text-sm text-muted-foreground">
              <span className="block text-xs font-medium text-warning">ข้อเสนอแนะจากผู้ตรวจ</span>{comment}
            </blockquote>
          )}
        </div>
        <Link to="/teacher/assignments" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">ส่งฉบับแก้ไข</Link>
      </div>
    </DashSection>
  );
}
