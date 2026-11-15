import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  FilePlus2,
  Layers,
  School,
  Shapes,
  Timer,
  Link2,
  Users,
  UserX,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DashSection, KpiCard, LiveBadge, QuickActions, type QuickAction } from "@/components/dashboard";
import { PageHeader } from "@/components/shared";
import { daysUntil, formatDateLongTH, formatDateTH, formatNumberTH } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthProvider";
import { useClassrooms, useGradeLevels, useLearningAreas } from "@/features/master-data/api";
import { useTeachers } from "@/features/teachers/api";
import { useCurrentPeriod } from "../use-current-period";
import { useReviewQueue, useTasks } from "@/features/tasks/api";


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

/** ทะเบียนครู — ข้อมูลจริง (Phase 1.5) ขอบเขตตาม RLS: ทั้งโรงเรียน หรือเฉพาะกลุ่มสาระของหัวหน้ากลุ่มสาระ */
function TeacherRegistrySummary() {
  const teachers = useTeachers();
  const areas = useLearningAreas();
  const active = teachers.data?.filter((t) => t.employment_status === "active") ?? [];
  const linked = active.filter((t) => t.profile_id).length;
  const byArea = (areas.data ?? [])
    .map((a) => ({ id: a.id, name: a.name_th, count: active.filter((t) => t.learning_area_id === a.id).length }))
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count);
  const noArea = active.filter((t) => !t.learning_area_id).length;
  const max = Math.max(1, ...byArea.map((a) => a.count), noArea);

  return (
    <DashSection
      id="registry"
      className="mt-6"
      title={<span className="flex items-center gap-2">ทะเบียนครูและบุคลากร <LiveBadge /></span>}
      actions={<Link to="/office/teachers" className="text-sm text-primary hover:underline">เปิดทะเบียน</Link>}
    >
      {teachers.isError ? (
        <p role="alert" className="text-sm text-destructive">โหลดทะเบียนครูไม่สำเร็จ</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
            <KpiCard label="ปฏิบัติงาน" icon={Users} loading={teachers.isPending} value={formatNumberTH(active.length)} />
            <KpiCard label="มีบัญชีเข้าระบบ" icon={Link2} tone="accent" loading={teachers.isPending} value={formatNumberTH(linked)} />
            <KpiCard label="ยังไม่มีบัญชี" icon={UserX} loading={teachers.isPending} value={formatNumberTH(active.length - linked)} />
          </div>
          <div className="min-w-0">
            <h3 className="mb-3 text-sm text-muted-foreground">จำนวนครูที่ปฏิบัติงาน แยกตามกลุ่มสาระ</h3>
            {active.length === 0 && !teachers.isPending ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลครูที่คุณมีสิทธิ์เห็น</p>
            ) : (
              <ul className="space-y-2.5">
                {[...byArea, ...(noArea ? [{ id: "none", name: "ไม่สังกัดกลุ่มสาระ", count: noArea }] : [])].map((a) => (
                  <li key={a.id} className="grid grid-cols-[minmax(0,11rem)_1fr_2rem] items-center gap-3 text-sm">
                    <span className="truncate">{a.name}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(a.count / max) * 100}%` }} />
                    </span>
                    <b className="text-right tabular-nums">{a.count}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </DashSection>
  );
}

/** งานเอกสารและการติดตาม — ข้อมูลจริง (tasks / task_progress / task_assignments) · RLS จำกัดตามบทบาท */
function DocumentTracking() {
  const tasks = useTasks();
  const queue = useReviewQueue();
  const published = (tasks.data ?? []).filter((t) => t.status === "published");
  const sum = (k: "submitted" | "overdue" | "total" | "approved") => published.reduce((n, t) => n + (t.progress?.[k] ?? 0), 0);
  const oldest = queue.data?.[0]?.last_submitted_at;
  const oldestDays = oldest ? -daysUntil(oldest) : null;
  if (tasks.error || queue.error) return <p role="alert" className="mt-4 text-sm text-destructive">โหลดข้อมูลงานเอกสารไม่สำเร็จ</p>;
  return (
    <section aria-label="งานเอกสารและการติดตามผล" className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="เอกสารรอตรวจ" icon={ClipboardCheck} tone="accent" value={sum("submitted")} loading={tasks.isPending}
          hint={oldestDays !== null ? `เก่าที่สุด ${oldestDays} วัน` : undefined} />
        <KpiCard label="เลยกำหนดส่ง" icon={AlertTriangle} tone="alert" value={sum("overdue")} loading={tasks.isPending}
          hint={`จาก ${published.filter((t) => (t.progress?.overdue ?? 0) > 0).length} งาน`} />
        <KpiCard label="ตรวจรับแล้ว" icon={ClipboardCheck} tone="ok" value={sum("approved")} loading={tasks.isPending} hint={`จาก ${sum("total")} การมอบหมาย`} />
        <KpiCard label="งานที่เปิดรับ" icon={Timer} value={published.length} loading={tasks.isPending} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashSection id="progress" title={<span className="flex items-center gap-2">ความคืบหน้าการส่งเอกสาร <LiveBadge /></span>} meta="งานที่เปิดรับ">
          {!published.length ? <p className="text-sm text-muted-foreground">ยังไม่มีงานที่เผยแพร่</p> : (
            <ul className="space-y-3">
              {published.slice(0, 8).map((t) => {
                const p = t.progress; const total = p?.total ?? 0; const done = (p?.submitted ?? 0) + (p?.approved ?? 0);
                return (
                  <li key={t.id} className="text-sm">
                    <div className="flex justify-between gap-2"><Link to={`/office/tasks/${t.id}`} className="truncate hover:text-primary">{t.title}</Link>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{done}/{total}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`ส่งแล้ว ${done} จาก ${total}`}>
                      <div className="h-full bg-primary" style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">ครบกำหนด {formatDateTH(t.due_at)}{p?.overdue ? ` · เลยกำหนด ${p.overdue}` : ""}{p?.revision_requested ? ` · ขอแก้ไข ${p.revision_requested}` : ""}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </DashSection>
        <DashSection id="queue" title={<span className="flex items-center gap-2">คิวตรวจรับเอกสาร <LiveBadge /></span>} meta={`${queue.data?.length ?? 0} รายการ`}>
          {!queue.data?.length ? <p className="text-sm text-muted-foreground">ไม่มีเอกสารรอตรวจ</p> : (
            <ul className="divide-y text-sm">
              {queue.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.teacher ? `${r.teacher.prefix}${r.teacher.first_name} ${r.teacher.last_name}` : "ครู"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.task?.title} · ฉบับที่ {r.current_version} · ส่ง {r.last_submitted_at ? formatDateTH(r.last_submitted_at) : "–"}</span>
                  </span>
                  <Link to={`/office/tasks/${r.task_id}`} className="shrink-0 text-xs text-primary hover:underline">ตรวจ</Link>
                </li>
              ))}
            </ul>
          )}
        </DashSection>
      </div>
    </section>
  );
}

export function OfficeDashboardPage() {
  const { can, access } = useAuth();
  const period = useCurrentPeriod();
  const canViewTasks = can("tasks.view");
  const canManageTasks = can("tasks.manage");
  const canViewAssessment = can("assessment.view");
  const canManageMasterData = can("masterdata.manage");

  const actions: QuickAction[] = [
    ...(canManageTasks
      ? [
          { label: "สร้างภาระงาน", to: "/office/tasks/create", icon: FilePlus2, primary: true },
          { label: "ภาระงาน / ตรวจรับ", to: "/office/tasks", icon: ClipboardCheck },
        ]
      : []),
    { label: canManageMasterData ? "จัดการปีการศึกษา" : "ปีการศึกษา", to: "/office/academic-years", icon: CalendarDays, primary: !canManageTasks },
    { label: "ทะเบียนครู", to: "/office/teachers", icon: Users },
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
      <TeacherRegistrySummary />

      {canViewTasks && <DocumentTracking />}
      {canViewAssessment && (
        <DashSection id="risk" className="mt-4" title="ผลการเรียนที่ต้องติดตาม" meta={period.label ?? undefined}>
          <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลคะแนน/การมาเรียนในระบบ — จะแสดงเมื่อเริ่มบันทึกผลการเรียน (ไม่แสดงตัวเลขจำลอง)</p>
        </DashSection>
      )}
    </>
  );
}
