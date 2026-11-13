import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, ClipboardCheck, Inbox, Layers, ListChecks, Target } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { DashSection, KpiCard, LiveBadge } from "@/components/dashboard";
import { dbErrorMessage } from "@/lib/db-errors";
import { useCurrentPeriod } from "@/features/dashboard/use-current-period";
import { allVersions, useClassroomCurriculum, useCurricula, useCurriculumCounts, useFrameworkVersions } from "../api";
import { CurriculumNav, EmptyState, Notice, VersionBadge } from "../components";

/** Dashboard หลักสูตร — ตัวเลขจริงจากฐานข้อมูลเท่านั้น (ว่าง = Empty state ไม่ใช่ KPI ปลอม) */
export function CurriculumDashboardPage() {
  const counts = useCurriculumCounts();
  const curricula = useCurricula();
  const frameworks = useFrameworkVersions();
  const period = useCurrentPeriod();
  const classrooms = useClassroomCurriculum(period.year?.id);
  const versions = allVersions(curricula.data);
  const inUse = versions.filter((v) => v.status === "active" || v.status === "approved");
  const c = counts.data;
  const unresolved = classrooms.data?.filter((r) => r.resolution !== "resolved").length ?? 0;
  const noData = !counts.isPending && versions.length === 0;

  return (
    <>
      <PageHeader title="หลักสูตรสถานศึกษา" description="Curriculum Intelligence — ข้อมูลทุกค่าต้องมาจากเอกสารต้นทางที่ลงทะเบียนและผ่านการตรวจโดยคน" />
      <CurriculumNav />
      {counts.error && <p role="alert" className="mb-4 text-sm text-destructive">{dbErrorMessage(counts.error)}</p>}
      {frameworks.data && !frameworks.data.some((f) => f.is_complete) && (
        <Notice tone="warning">
          ยังไม่มีชุดข้อมูลอ้างอิงหลักสูตรแกนกลาง (มาตรฐาน/ตัวชี้วัด) ที่ยืนยันว่าครบ — รายงาน Coverage จะแสดงเป็นผลเบื้องต้นเท่านั้น
        </Notice>
      )}

      {noData ? (
        <EmptyState title="ยังไม่มีข้อมูลหลักสูตรในระบบ">
          เริ่มจาก <Link className="text-primary hover:underline" to="/office/curriculum/imports">ลงทะเบียนเอกสารต้นทาง</Link> และ{" "}
          <Link className="text-primary hover:underline" to="/office/curriculum/versions">สร้างหลักสูตรฉบับร่าง</Link> แล้วนำเข้าข้อมูลผ่านขั้นตอนตรวจสอบ
        </EmptyState>
      ) : (
        <section aria-label="สรุปข้อมูลหลักสูตร" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard label="หลักสูตรที่ใช้อยู่ / อนุมัติ" icon={BookOpen} value={inUse.length} loading={curricula.isPending} />
          <KpiCard label="แผนการเรียน" icon={Layers} value={c?.programs ?? 0} loading={counts.isPending} />
          <KpiCard label="รายวิชา" icon={ListChecks} value={c?.subjects ?? 0} loading={counts.isPending} />
          <KpiCard label="ตัวชี้วัดที่ลงทะเบียน (แกนกลาง)" icon={Target} value={c?.indicators ?? 0} loading={counts.isPending} />
          <KpiCard label="แถวนำเข้ารอตรวจ" icon={ClipboardCheck} tone="accent" value={c?.pendingRows ?? 0} loading={counts.isPending} />
          <KpiCard label="ชุดนำเข้าที่ยังไม่ปิด" icon={Inbox} value={c?.openBatches ?? 0} loading={counts.isPending} />
          <KpiCard label="ข้อขัดแย้งของเอกสารที่เปิดอยู่" icon={AlertTriangle} tone={c?.blockingConflicts ? "alert" : "default"} value={c?.openConflicts ?? 0}
            hint={c?.blockingConflicts ? `blocking ${c.blockingConflicts}` : undefined} loading={counts.isPending} />
          <KpiCard label={`ห้องเรียนที่ยังระบุหลักสูตรไม่ได้${period.year ? ` (ปี ${period.year.year_be})` : ""}`} icon={AlertTriangle}
            tone={unresolved ? "alert" : "ok"} value={unresolved} loading={classrooms.isPending} hint="ต้องมีเอกสารยืนยันการใช้หลักสูตรของรุ่น" />
        </section>
      )}

      {inUse.length > 0 && (
        <DashSection id="in-use" className="mt-6" title={<span className="flex items-center gap-2">หลักสูตรที่อนุมัติ / ใช้อยู่ <LiveBadge /></span>}>
          <ul className="divide-y">
            {inUse.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <Link to={`/office/curriculum/structure?v=${v.id}`} className="font-medium hover:text-primary">{v.curriculum_name} · {v.version_label}</Link>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  กรอบแกนกลาง: {v.framework_status === "confirmed" ? "ยืนยันแล้ว" : "เบื้องต้น (provisional)"} <VersionBadge status={v.status} />
                </span>
              </li>
            ))}
          </ul>
        </DashSection>
      )}
    </>
  );
}
