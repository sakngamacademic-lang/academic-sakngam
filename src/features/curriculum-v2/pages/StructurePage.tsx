import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileDown, ListTree, Printer } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { areaOf, gradeLabel, refText } from "../model";
import { activitiesOf, descriptionIndex, fmtN, GRADES, plansOf, rowsOf, sectionLabel, totalsOf } from "../structure";
import { structureTables, toPdf, toWord } from "../exporters";
import { primaryOf, useWorkspace } from "../store";
import type { ConsolidatedRow } from "../consolidate";
import { EmptyV2, Pills, PreviewNotice, yearName } from "../ui";

/** โครงสร้างและรายวิชา: ปี → ชั้น → แผน → ภาคเรียน (3 คลิกหลังเลือกปี) */
export function StructurePage() {
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();
  const years = ws.datasets.map((d) => d.year);
  const year = years.includes(Number(params.get("y"))) ? Number(params.get("y")) : years[years.length - 1] ?? null;
  const d = ws.datasets.find((x) => x.year === year);
  const s = primaryOf(d);
  const grades = GRADES.filter((g) => plansOf(s, g).length);
  const grade = grades.includes(params.get("g") as (typeof GRADES)[number]) ? params.get("g")! : grades[0] ?? null;
  const plans = grade ? plansOf(s, grade) : [];
  const plan = plans.find((p) => p.key === params.get("p")) ?? plans[0] ?? null;
  const term = (params.get("t") === "0" ? 0 : params.get("t") === "2" ? 2 : 1) as 0 | 1 | 2;
  const set = (k: string, v: string) => setParams((p) => { p.set(k, v); if (k === "y") { p.delete("g"); p.delete("p"); } if (k === "g") p.delete("p"); return p; }, { replace: true });
  const rows = useMemo(() => (grade && plan ? rowsOf(s, grade, plan.key, term) : []), [s, grade, plan, term]);
  const desc = useMemo(() => descriptionIndex(d), [d]);
  const [open, setOpen] = useState<ConsolidatedRow | null>(null);

  if (!ws.loaded) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  return (
    <>
      <PageHeader icon={ListTree} title="โครงสร้างและรายวิชา" description="เลือกปี → ชั้น → แผนการเรียน → ภาคเรียน เพื่อดูรายวิชา ชั่วโมง หน่วยกิต และยอดรวม" />
      <PreviewNotice />
      {!d || !s ? <EmptyV2 title="ยังไม่มีโครงสร้างหลักสูตร" text="นำเข้าไฟล์โครงสร้างหลักสูตรก่อน แล้วโครงสร้างรายชั้น/แผน/ภาคเรียนจะแสดงที่นี่" /> : (
        <>
          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <Pills label="ปีหลักสูตร" items={years} value={year} onChange={(v) => set("y", String(v))} render={(v) => `หลักสูตร ${yearName(ws.datasets.find((x) => x.year === v)!)}`} />
            <div role="group" aria-label="ระดับชั้น" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {GRADES.map((g) => <button key={g} type="button" disabled={!grades.includes(g)} aria-pressed={grade === g} onClick={() => set("g", g)}
                className={cn("h-12 rounded-xl border text-base font-semibold shadow-card disabled:opacity-40", grade === g ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50")}>{gradeLabel(g)}</button>)}
            </div>
            {plans.length > 0 && <Pills label="แผนการเรียน" items={plans.map((p) => p.key)} value={plan?.key ?? null} onChange={(v) => set("p", v)} render={(k) => plans.find((p) => p.key === k)!.name} />}
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="ภาคเรียน" className="inline-flex rounded-xl border bg-card p-1">
                {([[1, "ภาคเรียนที่ 1"], [2, "ภาคเรียนที่ 2"], [0, "ทั้งปี"]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={term === k} onClick={() => set("t", String(k))} className={cn("h-9 rounded-lg px-3 text-sm", term === k ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground")}>{l}</button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">แหล่งข้อมูล: {s.fileName}{plan?.rooms.length ? ` · ห้องที่ไฟล์ระบุ: ${plan.rooms.join(", ")} (ยังไม่ผูกห้องในระบบ)` : " · ยังไม่ผูกห้องเรียนกับแผนนี้"}</span>
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toWord(`โครงสร้าง-${year}`, `โครงสร้างหลักสูตร ${yearName(d)}`, structureTables(d, s), s.fileName)}><FileDown /> Word</Button>
                <Button size="sm" variant="outline" onClick={() => toPdf(`โครงสร้างหลักสูตร ${yearName(d)}`, structureTables(d, s), s.fileName)}><Printer /> PDF</Button>
              </span>
            </div>
          </div>
          {grade && plan && <SubjectTable rows={rows} term={term} act={activitiesOf(s, grade, plan.key, term)} desc={desc} onOpen={setOpen} title={`${gradeLabel(grade)} · ${plan.name} · ${term ? `ภาคเรียนที่ ${term}` : "ทั้งปี"}`} />}
        </>
      )}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-[min(34rem,100vw)] overflow-y-auto bg-background p-5">
          {open && (() => { const x = desc.get(open.code); return (
            <>
              <SheetTitle className="text-lg">{open.code} {open.name}</SheetTitle>
              <SheetDescription>{areaOf(open.code)} · {sectionLabel(open.section)} · {fmtN(open.credits)} หน่วยกิต · {fmtN(open.hours)} ชั่วโมง</SheetDescription>
              <h3 className="mt-4 font-medium">คำอธิบายรายวิชา</h3>
              {x ? <><p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{x.text}</p><p className="mt-2 text-xs text-muted-foreground">อ้างอิง: {refText(x.ref)}</p></>
                : <p className="mt-1 text-sm text-muted-foreground">ยังไม่มีคำอธิบายรายวิชาในไฟล์ที่นำเข้าของปีนี้</p>}
              <h3 className="mt-4 font-medium">ตำแหน่งในไฟล์ต้นฉบับ</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">{open.refs.map((r, i) => <li key={i}>{refText(r)}</li>)}</ul>
            </>
          ); })()}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SubjectTable({ rows, term, act, desc, onOpen, title }: { rows: ConsolidatedRow[]; term: 0 | 1 | 2; act: { activities: number; declaredTotal: number | null }; desc: Map<string, unknown>; onOpen: (r: ConsolidatedRow) => void; title: string }) {
  const t = totalsOf(rows);
  const groups = (["basic", "additional", null] as const).map((sec) => [sec, rows.filter((r) => r.section === sec)] as const).filter(([, rs]) => rs.length);
  const all = t.hours + act.activities;
  return (
    <section aria-label={title} className="mt-4 rounded-2xl border bg-card shadow-card">
      <h2 className="border-b p-4 font-semibold">{title}</h2>
      {!rows.length ? <p className="p-4 text-sm text-muted-foreground">ไม่มีรายวิชาในส่วนนี้</p> : groups.map(([sec, rs]) => (
        <div key={String(sec)}>
          <p className="bg-muted/50 px-4 py-2 text-sm font-medium">รายวิชา{sectionLabel(sec)} · {rs.length} วิชา · {fmtN(totalsOf(rs).credits)} หน่วยกิต · {fmtN(totalsOf(rs).hours)} ชม.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-4 py-2">รหัส</th><th className="py-2 pr-2">ชื่อวิชา</th><th className="hidden py-2 pr-2 md:table-cell">กลุ่มสาระ</th>{term === 0 && <th className="py-2 pr-2">ภาค</th>}<th className="py-2 pr-2 text-right">ชั่วโมง</th><th className="py-2 pr-4 text-right">หน่วยกิต</th></tr></thead>
              <tbody>{rs.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
                  <td className="py-2 pr-2"><button type="button" className="text-left text-primary hover:underline" onClick={() => onOpen(r)}>{r.name || <i>(ไม่มีชื่อในไฟล์)</i>}</button>{desc.has(r.code) && <span className="ml-1 text-xs text-muted-foreground">· มีคำอธิบาย</span>}<span className="block text-xs text-muted-foreground md:hidden">{areaOf(r.code)}</span></td>
                  <td className="hidden py-2 pr-2 md:table-cell">{areaOf(r.code)}</td>{term === 0 && <td className="py-2 pr-2">{r.term}</td>}
                  <td className="py-2 pr-2 text-right">{fmtN(r.hours)}</td><td className="py-2 pr-4 text-right">{fmtN(r.credits)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2 border-t p-4 sm:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">หน่วยกิตพื้นฐาน</p><p className="text-lg font-semibold">{fmtN(t.basicC)}</p></div>
        <div><p className="text-xs text-muted-foreground">หน่วยกิตเพิ่มเติม</p><p className="text-lg font-semibold">{fmtN(t.addC)}</p></div>
        <div><p className="text-xs text-muted-foreground">รวมหน่วยกิต</p><p className="text-lg font-semibold">{fmtN(t.credits)}</p></div>
        <div><p className="text-xs text-muted-foreground">รวมเวลาเรียน (รายวิชา {fmtN(t.hours)} + กิจกรรม {fmtN(act.activities)})</p><p className="text-lg font-semibold">{fmtN(all)} ชม.</p>
          {act.declaredTotal != null && act.declaredTotal !== all && <p className="text-xs text-warning">ไฟล์ระบุ {fmtN(act.declaredTotal)} ชม. — ไม่เท่าผลรวม</p>}</div>
      </div>
    </section>
  );
}
