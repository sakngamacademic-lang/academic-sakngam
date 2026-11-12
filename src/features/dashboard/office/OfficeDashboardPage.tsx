import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  FilePlus2,
  Layers,
  School,
  Search,
  Shapes,
  Timer,
} from "lucide-react";
import { DashSection, DemoZone, KpiCard, LiveBadge, PendingButton, QuickActions, Tag, type QuickAction } from "@/components/dashboard";
import { BarsChart, DonutChart } from "@/components/charts/charts";
import { PageHeader } from "@/components/shared";
import { daysUntil, formatDateLongTH, formatDateTH, formatNumberTH } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useClassrooms, useGradeLevels, useLearningAreas } from "@/features/master-data/api";
import { useCurrentPeriod } from "../use-current-period";
import {
  demoOfficeKpis,
  demoPendingTasks,
  demoReviewQueue,
  demoRisk,
  demoSubmissionProgress,
  QUEUE_STATUS_LABEL,
  type QueueStatus,
} from "./demo-data";

const REVIEW_PHASE = "Phase 1.10";

/** ข้อมูลพื้นฐานปัจจุบัน — ข้อมูลจริงจาก Supabase (Phase 1.4) */
function MasterDataSummary() {
  const period = useCurrentPeriod();
  const classrooms = useClassrooms();
  const areas = useLearningAreas();
  const grades = useGradeLevels();
  const yearId = period.year?.id;
  const roomCount = classrooms.data?.filter((c) => c.is_active && c.academic_year_id === yearId).length ?? 0;
  const areaCount = areas.data?.filter((a) => a.is_active).length ?? 0;
  const gradeCount = grades.data?.filter((g) => g.is_active).length ?? 0;
  const failed = period.isError || classrooms.isError || areas.isError || grades.isError;

  return (
    <section aria-labelledby="live-title" className="mb-2">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="live-title" className="text-sm font-semibold text-muted-foreground">ข้อมูลพื้นฐานปัจจุบัน</h2>
        <LiveBadge />
      </div>
      {failed ? (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          โหลดข้อมูลพื้นฐานไม่สำเร็จ กรุณารีเฟรชหน้า
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard
            label="ปีการศึกษาปัจจุบัน"
            icon={CalendarDays}
            loading={period.isLoading}
            value={period.year ? period.year.year_be : "–"}
            hint={period.year ? undefined : "ยังไม่ได้ตั้งปีปัจจุบัน"}
          />
          <KpiCard
            label="ภาคเรียนปัจจุบัน"
            icon={Timer}
            loading={period.isLoading}
            value={period.term ? period.term.term_no : "–"}
            hint={period.term ? `${formatDateTH(period.term.starts_on)} – ${formatDateTH(period.term.ends_on)}` : "ยังไม่ได้ตั้งภาคเรียนปัจจุบัน"}
          />
          <KpiCard
            label="ห้องเรียน"
            icon={School}
            loading={classrooms.isLoading || period.isLoading}
            value={formatNumberTH(roomCount)}
            hint={period.year ? `ที่เปิดใช้ในปี ${period.year.year_be}` : "ปีการศึกษาปัจจุบัน"}
          />
          <KpiCard
            label="กลุ่มสาระ / ระดับชั้น"
            icon={Shapes}
            loading={areas.isLoading || grades.isLoading}
            value={
              <>
                {formatNumberTH(areaCount)}
                <span className="mx-1 text-lg font-normal text-muted-foreground">/</span>
                {formatNumberTH(gradeCount)}
              </>
            }
            hint="ที่เปิดใช้งานและคุณมีสิทธิ์เห็น"
          />
        </div>
      )}
    </section>
  );
}

const CHIPS: { value: QueueStatus | ""; label: string }[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "wait", label: "รอตรวจ" },
  { value: "fix", label: "ส่งกลับแก้ไข" },
  { value: "late", label: "เลยกำหนด" },
];
const QUEUE_TONE = { wait: "wait", fix: "fix", late: "late" } as const;

function submittedLabel(iso: string | null) {
  if (!iso) return "ยังไม่ส่ง";
  const d = -daysUntil(iso);
  return d === 0 ? "วันนี้" : d === 1 ? "เมื่อวาน" : `${d} วันก่อน`;
}

/** คิวตรวจรับเอกสาร (Demo) — ค้นหา/กรองทำงานจริงบนข้อมูลจำลอง ปุ่มตรวจปิดไว้จนกว่าระบบจะพร้อม */
function ReviewQueue() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<QueueStatus | "">("");
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return demoReviewQueue.filter(
      (r) => (!status || r.status === status) && (!term || `${r.teacher} ${r.task} ${r.learningArea}`.toLowerCase().includes(term)),
    );
  }, [q, status]);

  return (
    <DashSection
      id="queue"
      title="คิวตรวจรับเอกสาร"
      className="mt-4"
      actions={
        <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
          <label className="relative block">
            <span className="sr-only">ค้นหาในคิวตรวจรับ</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อครูหรือชื่องาน"
              className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 lg:w-64"
            />
          </label>
          <div role="group" aria-label="กรองตามสถานะ" className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={status === c.value}
                onClick={() => setStatus(c.value)}
                className={cn(
                  "h-9 rounded-full border px-3 text-xs transition-colors",
                  status === c.value ? "border-primary/60 bg-primary/15 text-foreground" : "text-muted-foreground hover:border-input hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <table className="w-full text-sm max-sm:block">
        <caption className="sr-only">คิวตรวจรับเอกสาร (ข้อมูลจำลอง)</caption>
        <thead className="max-sm:hidden">
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">ครู</th>
            <th scope="col" className="py-2 pr-3 font-medium">งาน</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">ฉบับ</th>
            <th scope="col" className="py-2 pr-3 font-medium">ส่งเมื่อ</th>
            <th scope="col" className="py-2 pr-3 font-medium">สถานะ</th>
            <th scope="col" className="py-2 font-medium"><span className="sr-only">จัดการ</span></th>
          </tr>
        </thead>
        <tbody className="max-sm:grid max-sm:gap-3">
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-3 max-sm:gap-y-1 max-sm:rounded-xl max-sm:border max-sm:p-3 max-sm:last:border">
              <td className="py-3 pr-3 align-top max-sm:col-span-2 max-sm:py-0">
                <span className="block font-medium">{r.teacher}</span>
                <span className="block text-xs text-muted-foreground">{r.learningArea}</span>
              </td>
              <td data-label="งาน" className="py-3 pr-3 align-top max-sm:contents">
                <span className="text-xs text-muted-foreground sm:hidden">งาน</span>
                <span>{r.task}</span>
              </td>
              <td className="py-3 pr-3 text-right align-top tabular-nums max-sm:contents">
                <span className="text-xs text-muted-foreground sm:hidden">ฉบับ</span>
                <span className="max-sm:text-left">{r.version ?? "–"}</span>
              </td>
              <td className="py-3 pr-3 align-top whitespace-nowrap max-sm:contents">
                <span className="text-xs text-muted-foreground sm:hidden">ส่งเมื่อ</span>
                <span>{submittedLabel(r.submittedAt)}</span>
              </td>
              <td className="py-3 pr-3 align-top max-sm:contents">
                <span className="text-xs text-muted-foreground sm:hidden">สถานะ</span>
                <span>
                  <Tag tone={QUEUE_TONE[r.status]}>
                    {r.status === "late" ? `เลยกำหนด ${r.lateDays} วัน` : QUEUE_STATUS_LABEL[r.status]}
                  </Tag>
                </span>
              </td>
              <td className="py-2 text-right align-top max-sm:col-span-2 max-sm:pt-2 max-sm:text-left">
                <PendingButton phase={REVIEW_PHASE}>{r.action}</PendingButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบรายการที่ตรงกับตัวกรอง</p>}
    </DashSection>
  );
}

export function OfficeDashboardPage() {
  const { can, access } = useAuth();
  const period = useCurrentPeriod();
  const canViewTasks = can("tasks.view");
  const canManageTasks = can("tasks.manage");
  const canViewAssessment = can("assessment.view");
  const canManageMasterData = can("masterdata.manage");
  const riskTotal = demoRisk.reduce((a, r) => a + r.value, 0);

  const actions: QuickAction[] = [
    ...(canManageTasks
      ? [
          { label: "สร้างภาระงาน", to: "/office/tasks", icon: FilePlus2, primary: true, soon: "Phase 1.8" },
          { label: "ตรวจรับเอกสาร", to: "/office/reviews", icon: ClipboardCheck, soon: REVIEW_PHASE },
        ]
      : []),
    { label: canManageMasterData ? "จัดการปีการศึกษา" : "ปีการศึกษา", to: "/office/academic-years", icon: CalendarDays, primary: !canManageTasks },
    { label: "ห้องเรียน", to: "/office/classrooms", icon: School },
    ...(!canManageTasks ? [{ label: "ระดับชั้น", to: "/office/grade-levels", icon: Layers }] : []),
  ];

  return (
    <>
      <PageHeader
        title="แดชบอร์ดฝ่ายวิชาการ"
        description={[access?.school?.name_th, period.label, formatDateLongTH(new Date())].filter(Boolean).join(" · ")}
      />

      <QuickActions items={actions} />
      <MasterDataSummary />

      {(canViewTasks || canViewAssessment) && (
        <DemoZone id="demo-office" title="งานเอกสารและการติดตามผล" phase="Phase 1.8–1.10">
          {canViewTasks && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4">
              <KpiCard label="เอกสารรอตรวจ" icon={ClipboardCheck} tone="accent" value={demoOfficeKpis.pendingReview} hint={`เก่าที่สุด ${demoOfficeKpis.oldestPendingDays} วัน`} />
              <KpiCard label="เลยกำหนดส่ง" icon={AlertTriangle} tone="alert" value={demoOfficeKpis.overdue} hint={`จาก ${demoOfficeKpis.overdueTasks} งาน`} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {canViewTasks && (
              <DashSection id="todo" title="งานที่ต้องดำเนินการ" meta={`${demoPendingTasks.length} รายการ`} className="lg:col-span-2 2xl:col-span-1">
                <ul className="divide-y">
                  {demoPendingTasks.map((t) => (
                    <li key={t.id} className="grid grid-cols-[4.75rem_1fr] items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[4.75rem_1fr_auto]">
                      <Tag tone={t.tone} className="justify-center">{t.tag}</Tag>
                      <p className="min-w-0 text-sm">
                        <span className="block font-medium">{t.title}</span>
                        <span className="block text-xs text-muted-foreground">{t.detail}</span>
                      </p>
                      <div className="col-start-2 sm:col-start-auto">
                        <PendingButton phase={REVIEW_PHASE}>{t.action}</PendingButton>
                      </div>
                    </li>
                  ))}
                </ul>
              </DashSection>
            )}

            {canViewTasks && (
              <DashSection id="progress" title="ความคืบหน้าการส่งเอกสาร" meta="ร้อยละของครูที่ส่งแล้ว">
                <div className="mx-auto max-w-xs">
                  <BarsChart values={demoSubmissionProgress.values} labels={demoSubmissionProgress.labels} label={demoSubmissionProgress.label} />
                </div>
              </DashSection>
            )}

            {canViewAssessment && (
              <DashSection id="risk" title="ผลการเรียนที่ต้องติดตาม" meta={period.label ?? undefined}>
                <div className="flex items-center gap-5">
                  <div className="w-36 shrink-0 sm:w-40">
                    <DonutChart
                      values={demoRisk.map((r) => r.value)}
                      colors={demoRisk.map((r) => r.color)}
                      center="รายการ"
                      label={`ข้อมูลจำลอง ต้องติดตาม ${riskTotal} รายการ: ${demoRisk.map((r) => `${r.label} ${r.value}`).join(", ")}`}
                    />
                  </div>
                  <ul className="space-y-2 text-sm">
                    {demoRisk.map((r) => (
                      <li key={r.key} className="flex items-center gap-2 whitespace-nowrap">
                        <span className="size-2.5 rounded-sm" style={{ background: r.color }} aria-hidden="true" />
                        {r.label} <b className="tabular-nums">{r.value}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              </DashSection>
            )}
          </div>

          {canViewTasks && <ReviewQueue />}
        </DemoZone>
      )}
    </>
  );
}
