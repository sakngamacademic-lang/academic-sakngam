import { Link } from "react-router-dom";
import { GitCompareArrows, LayoutDashboard, ListTree, Upload } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { gradeLabel } from "../model";
import { GRADES, placedRows, plansOf } from "../structure";
import { primaryOf, useWorkspace } from "../store";
import { EmptyV2, PreviewNotice, Stat, useCanManage, V2, yearName } from "../ui";

/** ภาพรวมหลักสูตร V2: ปีที่นำเข้า แหล่งข้อมูล จำนวนรายวิชา/แผน และประเด็นที่ต้องตรวจ */
export function OverviewPage() {
  const ws = useWorkspace();
  const can = useCanManage();
  return (
    <>
      <PageHeader icon={LayoutDashboard} title="ภาพรวมหลักสูตร" description="หลักสูตรสถานศึกษาแต่ละปีที่นำเข้า พร้อมแหล่งข้อมูลและประเด็นที่ต้องตรวจ"
        actions={can ? <Button asChild><Link to={`${V2}/import`}><Upload /> นำเข้าหลักสูตร</Link></Button> : undefined} />
      <PreviewNotice />
      {!ws.loaded ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : !ws.datasets.length ? (
        <EmptyV2 title="ยังไม่มีข้อมูลหลักสูตรในระบบใหม่" text="เริ่มจากนำเข้าไฟล์โครงสร้างหลักสูตร (XLSX, DOCX หรือ PDF) ของปี 2568 และ 2569 ระบบจะแสดงตัวอย่างและประเด็นที่ต้องตรวจก่อนให้ยืนยัน" />
      ) : (
        <div className="space-y-4">
          {ws.datasets.map((d) => {
            const s = primaryOf(d); const rows = placedRows(s);
            const issues = d.sources.reduce((n, x) => n + x.issues.filter((i) => i.level !== "info").length, 0);
            const plans = GRADES.map((g) => [g, plansOf(s, g).length] as const).filter(([, n]) => n);
            return (
              <section key={d.year} aria-label={`หลักสูตร ${d.year}`} className="rounded-2xl border bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">หลักสูตร {yearName(d)}</h2>
                  <span className="text-sm text-muted-foreground">แหล่งที่ใช้แสดงผล: {s?.fileName ?? "—"} ({d.sources.length} ไฟล์)</span>
                  <span className="ml-auto flex gap-2">
                    <Button asChild size="sm" variant="outline"><Link to={`${V2}/structure?y=${d.year}`}><ListTree /> โครงสร้าง</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link to={`${V2}/compare`}><GitCompareArrows /> เปรียบเทียบ</Link></Button>
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="รายวิชา (แถวในโครงสร้าง)" value={rows.length} />
                  <Stat label="รหัสวิชาไม่ซ้ำ" value={new Set(rows.map((r) => r.code)).size} />
                  <Stat label="แผนการเรียน (รวมทุกชั้น)" value={plans.reduce((n, [, x]) => n + x, 0)} />
                  <Stat label="ประเด็นที่ต้องตรวจ" value={issues} tone={issues ? "warn" : "ok"} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{plans.map(([g, n]) => `${gradeLabel(g)} ${n} แผน`).join(" · ")}</p>
              </section>
            );
          })}
          {ws.log.length > 0 && (
            <section className="rounded-2xl border bg-card p-4">
              <h2 className="mb-2 font-semibold">ประวัติการนำเข้า (ในเครื่องนี้)</h2>
              <ul className="space-y-1 text-sm">
                {[...ws.log].reverse().slice(0, 10).map((l, i) => (
                  <li key={i} className="text-muted-foreground">{new Date(l.at).toLocaleString("th-TH")} · {l.by} · {{ import: "นำเข้า", replace: "นำเข้าซ้ำ (แทนที่)", remove: "นำออก", set_primary: "เลือกแหล่งแสดงผล", clear: "ล้างพื้นที่ทำงาน" }[l.action]} {l.year || ""} {l.file ?? ""}{l.rows != null ? ` (${l.rows} แถว)` : ""}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
