import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, ClipboardCheck, Inbox, Layers, ListChecks, Target } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { DashSection, KpiCard, LiveBadge } from "@/components/dashboard";
import { dbErrorMessage } from "@/lib/db-errors";
import { useCurrentPeriod } from "@/features/dashboard/use-current-period";
import {
  allVersions, BATCH_KIND_LABELS, COMPLIANCE_LABELS, CONFLICT_CATEGORY_LABELS, useClassroomCurriculum, useCompliance, useConflicts, useCurricula,
  useCurriculumCounts, useFrameworkVersions, useImportPipeline, useMappingCounts, useStructureSummary, type ComplianceStatus,
} from "../api";
import { CurriculumNav, EmptyState, Notice, useSelectedVersion, VersionBadge, VersionPicker } from "../components";

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
          <KpiCard label="ข้อขัดแย้งที่ยังไม่ตัดสิน" icon={AlertTriangle} tone={c?.blockingConflicts ? "alert" : "default"} value={c?.openConflicts ?? 0}
            hint={c?.blockingConflicts ? `blocking ${c.blockingConflicts}` : undefined} loading={counts.isPending} />
          <KpiCard label={`ห้องเรียนที่ยังระบุหลักสูตรไม่ได้${period.year ? ` (ปี ${period.year.year_be})` : ""}`} icon={AlertTriangle}
            tone={unresolved ? "alert" : "ok"} value={unresolved} loading={classrooms.isPending} hint="ต้องมีเอกสารยืนยันการใช้หลักสูตรของรุ่น" />
        </section>
      )}

      {!noData && <Analytics />}

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

const PIPE_COLS = [["needs_review", "รอตรวจ"], ["error", "ผิดพลาด"], ["approved", "อนุมัติแล้ว"], ["committed", "บันทึกแล้ว"], ["skipped", "ข้าม"], ["total", "ทั้งหมด"]] as const;
const COMPLIANCE_ORDER: ComplianceStatus[] = ["pass", "warning", "fail", "insufficient_data"];

/** วิเคราะห์ฉบับที่เลือก: ข้อมูลที่ยืนยันแล้วแยกจากข้อมูลรอตรวจเสมอ */
function Analytics() {
  const sel = useSelectedVersion();
  const id = sel.selected?.id;
  const summary = useStructureSummary(id);
  const pipeline = useImportPipeline(id);
  const compliance = useCompliance(id);
  const mapping = useMappingCounts(id);
  const conflicts = useConflicts();
  const grades = [...new Set(summary.data?.map((r) => r.grade_code))].sort();
  const g = (grade: string, type: "basic" | "additional") => summary.data?.filter((r) => r.grade_code === grade && r.subject_type === type) ?? [];
  const sum = (rows: { credits: number; learning_hours: number; subjects: number }[], k: "credits" | "learning_hours" | "subjects") => rows.reduce((n, r) => n + Number(r[k]), 0);
  const openConf = conflicts.data?.filter((c) => c.status !== "resolved") ?? [];
  const byCat = Object.entries(openConf.reduce<Record<string, number>>((m, c) => ({ ...m, [c.category]: (m[c.category] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const compCount = (s: ComplianceStatus) => compliance.data?.filter((r) => r.status === s).length ?? 0;
  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <VersionPicker value={id ?? ""} onChange={sel.select} versions={sel.versions} />
        {sel.selected && <VersionBadge status={sel.selected.status} />}
      </div>
      <DashSection id="verified-structure" title={<span className="flex items-center gap-2">โครงสร้างที่บันทึกแล้ว (ยืนยันแล้ว) <LiveBadge /></span>} meta="รวมทุกแผน · หน่วยกิต (ชั่วโมง)">
        {summary.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : !grades.length ? (
          <EmptyState title="ยังไม่มีรายวิชาที่ผ่านการอนุมัติและบันทึก">ตัวเลขด้านล่างเป็นสถานะงานตรวจ — ยังไม่ใช่หลักสูตรที่ใช้งานจริง</EmptyState>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">หน่วยกิตและชั่วโมงแยกชั้น</caption>
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">ชั้น</th><th className="py-2 text-right">วิชาพื้นฐาน</th><th className="py-2 text-right">วิชาเพิ่มเติม</th><th className="py-2 text-right">หน่วยกิต</th><th className="py-2 text-right">ชั่วโมง</th></tr></thead>
              <tbody>{grades.map((gr) => { const all = [...g(gr, "basic"), ...g(gr, "additional")]; return (
                <tr key={gr} className="border-b last:border-0"><td className="py-2">{gr.replace("M", "ม.")}</td><td className="py-2 text-right tabular-nums">{sum(g(gr, "basic"), "subjects")}</td><td className="py-2 text-right tabular-nums">{sum(g(gr, "additional"), "subjects")}</td><td className="py-2 text-right tabular-nums">{sum(all, "credits").toFixed(1)}</td><td className="py-2 text-right tabular-nums">{sum(all, "learning_hours")}</td></tr>
              ); })}</tbody>
            </table>
          </div>
        )}
      </DashSection>
      <DashSection id="pipeline" title="สถานะงานตรวจข้อมูลนำเข้า" meta="ข้อมูลรอตรวจ — ยังไม่ยืนยัน">
          {!pipeline.data || !Object.keys(pipeline.data).length ? <p className="text-sm text-muted-foreground">ไม่มีชุดนำเข้า</p> : (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="sr-only">สถานะแถวนำเข้า</caption>
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">ชุด</th>{PIPE_COLS.map(([, l]) => <th key={l} className="py-2 text-right">{l}</th>)}</tr></thead>
                <tbody>{Object.entries(pipeline.data).map(([k, v]) => (
                  <tr key={k} className="border-b last:border-0"><td className="py-2">{BATCH_KIND_LABELS[k as keyof typeof BATCH_KIND_LABELS] ?? k}</td>{PIPE_COLS.map(([c]) => <td key={c} className="py-2 text-right tabular-nums">{v[c] ?? 0}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
      </DashSection>
      <div className="grid gap-4 xl:grid-cols-2">
        <DashSection id="compliance" title="ผลตรวจตามเกณฑ์" meta={<Link className="text-primary hover:underline" to="/office/curriculum/reports">ดูรายงาน</Link>}>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {COMPLIANCE_ORDER.map((s) => <li key={s} className="rounded-lg border px-3 py-2"><p className="text-xs text-muted-foreground">{COMPLIANCE_LABELS[s]}</p><p className="text-lg font-semibold tabular-nums">{compliance.isPending ? "…" : compCount(s)}</p></li>)}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">“ข้อมูลไม่พอ” = ยังไม่มีข้อมูลที่บันทึกแล้ว หรือเกณฑ์ยังไม่ได้รับการยืนยัน — ไม่นับเป็นผ่าน</p>
        </DashSection>
        <DashSection id="conflicts-cat" title="ข้อขัดแย้งที่ยังไม่ตัดสิน" meta={<Link className="text-primary hover:underline" to="/office/curriculum/conflicts">{openConf.length} รายการ</Link>}>
          {!byCat.length ? <p className="text-sm text-muted-foreground">ไม่มี</p> : (
            <ul className="divide-y text-sm">{byCat.map(([k, n]) => <li key={k} className="flex justify-between py-1.5"><span>{CONFLICT_CATEGORY_LABELS[k as keyof typeof CONFLICT_CATEGORY_LABELS] ?? k}</span><b className="tabular-nums">{n}</b></li>)}</ul>
          )}
        </DashSection>
        <DashSection id="mapping" title="Mapping ตัวชี้วัด">
          <ul className="grid grid-cols-3 gap-2 text-sm">
            {([["verified", "ยืนยันแล้ว"], ["pending", "รอตรวจ"], ["rejected", "ปฏิเสธ"]] as const).map(([k, l]) => <li key={k} className="rounded-lg border px-3 py-2"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold tabular-nums">{mapping.data?.[k] ?? "…"}</p></li>)}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">ยังไม่มีชุดตัวชี้วัดแกนกลางที่ยืนยัน จึงไม่แสดงเปอร์เซ็นต์ความครอบคลุม</p>
        </DashSection>
      </div>
    </div>
  );
}
