import { AlertTriangle, CheckCircle2, Clock, FileText, MessageSquareText, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DemoBadge, DemoNotice, PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { daysUntil, formatDateLongTH, formatDateTH } from "@/lib/format";
import { demoMyTasks } from "./demo-data";

function dueLabel(dueAt: string) {
  const d = daysUntil(dueAt);
  if (d < 0) return { text: `เลยกำหนด ${-d} วัน`, className: "text-destructive" };
  if (d === 0) return { text: "ครบกำหนดวันนี้", className: "text-destructive" };
  if (d <= 3) return { text: `อีก ${d} วัน`, className: "text-[oklch(0.5_0.12_65)]" };
  return { text: `ครบกำหนด ${formatDateTH(dueAt)}`, className: "text-muted-foreground" };
}

export function TeacherDashboardPage() {
  const isOpen = (s: string) => s === "assigned" || s === "revision_requested";
  const todo = demoMyTasks.filter((t) => isOpen(t.status)).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const revisions = demoMyTasks.filter((t) => t.status === "revision_requested");
  const count = {
    todo: todo.length,
    overdue: todo.filter((t) => daysUntil(t.dueAt) < 0).length,
    waiting: demoMyTasks.filter((t) => t.status === "submitted").length,
    approved: demoMyTasks.filter((t) => t.status === "approved").length,
  };

  return (
    <>
      <PageHeader title="แดชบอร์ดของฉัน" description={`ภาระงานเอกสารของคุณ · ${formatDateLongTH(new Date())}`} />
      <DemoNotice />

      <section aria-label="สรุปภาระงาน" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="งานที่ต้องส่ง" value={count.todo} icon={FileText} />
        <StatCard label="เลยกำหนด" value={count.overdue} icon={AlertTriangle} tone="destructive" />
        <StatCard label="รอตรวจ" value={count.waiting} icon={Clock} tone="info" />
        <StatCard label="ตรวจรับแล้ว" value={count.approved} icon={CheckCircle2} tone="success" />
      </section>

      {revisions.length > 0 && (
        <Card className="mt-6 border-warning/60">
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="size-4" /> ข้อเสนอแนะจากฝ่ายวิชาการ
              </CardTitle>
              <CardDescription>งานที่ถูกส่งกลับให้แก้ไข</CardDescription>
            </div>
            <DemoBadge />
          </CardHeader>
          <CardContent className="space-y-3">
            {revisions.map((t) => (
              <div key={t.id} className="rounded-lg bg-warning/10 p-3">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">“{t.feedback}”</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>งานที่ต้องดำเนินการ</CardTitle>
            <CardDescription>เรียงตามวันครบกำหนด</CardDescription>
          </div>
          <DemoBadge />
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {todo.map((t) => {
              const due = dueLabel(t.dueAt);
              const overdue = daysUntil(t.dueAt) < 0;
              return (
                <li key={t.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{t.title}</p>
                      <StatusBadge status={t.status} overdue={overdue} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.category} · <span className={due.className}>{due.text}</span>
                    </p>
                  </div>
                  {/* ปุ่มยังไม่ทำงาน — ระบบส่งเอกสารจะเปิดใน Phase 1.9 */}
                  <Button size="sm" variant={t.status === "revision_requested" ? "default" : "outline"} disabled title="เปิดใช้งานใน Phase 1.9">
                    <Upload /> {t.status === "revision_requested" ? "ส่งฉบับแก้ไข" : "ส่งเอกสาร"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
