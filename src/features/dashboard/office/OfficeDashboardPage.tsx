import { Link } from "react-router-dom";
import { ChevronLeft, ClipboardCheck, FileText, ShieldAlert, UserRound, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DemoBadge, DemoNotice, PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { daysUntil, formatDateLongTH, formatDateTH, formatNumberTH } from "@/lib/format";
import { demoOfficeStats, demoReviewQueue, demoRiskSummary, demoTaskProgress } from "./demo-data";

export function OfficeDashboardPage() {
  const riskTotals = demoRiskSummary.reduce(
    (acc, r) => ({ zero: acc.zero + r.zero, incomplete: acc.incomplete + r.incomplete, notEligible: acc.notEligible + r.notEligible }),
    { zero: 0, incomplete: 0, notEligible: 0 },
  );

  return (
    <>
      <PageHeader
        title="แดชบอร์ดฝ่ายวิชาการ"
        description={`ภาพรวมงานวิชาการ · ${formatDateLongTH(new Date())}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/office/tasks">
              <FileText /> สร้างภาระงาน
            </Link>
          </Button>
        }
      />
      <DemoNotice />

      <section aria-label="สรุปตัวเลขสำคัญ" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ครูทั้งหมด" value={formatNumberTH(demoOfficeStats.teachers)} hint="บุคลากรสายผู้สอน" icon={UserRound} />
        <StatCard label="นักเรียนทั้งหมด" value={formatNumberTH(demoOfficeStats.students)} hint="ม.1 – ม.6" icon={Users} tone="info" />
        <StatCard label="ภาระงานที่เปิดอยู่" value={demoOfficeStats.openTasks} hint="ภาคเรียนปัจจุบัน" icon={FileText} tone="success" />
        <StatCard label="เอกสารรอตรวจ" value={demoOfficeStats.pendingReview} hint="ทุกงานรวมกัน" icon={ClipboardCheck} tone="warning" />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>ความคืบหน้าภาระงานเอกสาร</CardTitle>
              <CardDescription>สัดส่วนครูที่ส่งและได้รับการตรวจรับแล้ว</CardDescription>
            </div>
            <DemoBadge />
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {demoTaskProgress.map((t) => {
                const due = daysUntil(t.dueAt);
                const submittedPct = (t.submitted / t.assigned) * 100;
                const approvedPct = (t.approved / t.assigned) * 100;
                return (
                  <li key={t.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="font-medium">{t.title}</p>
                      <p className={due < 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                        {due < 0 ? `เลยกำหนด ${-due} วัน` : due === 0 ? "ครบกำหนดวันนี้" : `ครบกำหนด ${formatDateTH(t.dueAt)}`}
                      </p>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <Progress value={submittedPct} indicatorClassName="bg-info" label={`ส่งแล้ว ${t.title}`} />
                      <Progress value={approvedPct} indicatorClassName="bg-success" label={`ตรวจรับแล้ว ${t.title}`} />
                    </div>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <span className="mr-1 inline-block size-2 rounded-full bg-info" />
                        ส่งแล้ว {t.submitted}/{t.assigned}
                      </span>
                      <span>
                        <span className="mr-1 inline-block size-2 rounded-full bg-success" />
                        ตรวจรับ {t.approved}
                      </span>
                      {t.revision > 0 && <span className="text-[oklch(0.5_0.12_65)]">ส่งกลับแก้ไข {t.revision}</span>}
                      <span>ค้างส่ง {t.assigned - t.submitted}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>คิวรอตรวจล่าสุด</CardTitle>
              <CardDescription>เอกสารที่ครูส่งเข้ามาใหม่</CardDescription>
            </div>
            <DemoBadge />
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {demoReviewQueue.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.teacher}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.task} · ฉบับที่ {r.version}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.learningArea} · ส่ง {formatDateTH(r.submittedAt)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
            <Button asChild variant="ghost" className="mt-3 w-full">
              <Link to="/office/reviews">
                ดูคิวตรวจทั้งหมด <ChevronLeft className="rotate-180" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" /> นักเรียนที่ต้องติดตามผลการเรียน
            </CardTitle>
            <CardDescription>
              จำนวนรายวิชาที่ติด 0 = {riskTotals.zero} · ร = {riskTotals.incomplete} · มส = {riskTotals.notEligible}
            </CardDescription>
          </div>
          <DemoBadge />
        </CardHeader>
        <CardContent>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="sr-only">สรุปจำนวน 0 ร มส แยกตามระดับชั้น</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">ระดับชั้น</th>
                  <th scope="col" className="py-2 text-right font-medium">0</th>
                  <th scope="col" className="py-2 text-right font-medium">ร</th>
                  <th scope="col" className="py-2 text-right font-medium">มส</th>
                  <th scope="col" className="py-2 text-right font-medium">รวม</th>
                </tr>
              </thead>
              <tbody>
                {demoRiskSummary.map((r) => (
                  <tr key={r.grade} className="border-b last:border-0">
                    <th scope="row" className="py-2 text-left font-medium">{r.grade}</th>
                    <td className="py-2 text-right tabular-nums">{r.zero}</td>
                    <td className="py-2 text-right tabular-nums">{r.incomplete}</td>
                    <td className="py-2 text-right tabular-nums">{r.notEligible}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{r.zero + r.incomplete + r.notEligible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
