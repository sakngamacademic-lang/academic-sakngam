import { useMemo, useState } from "react";
import { FileDown, GitCompareArrows, Printer } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import { compareCurricula, CHANGE_LABEL, secLabel, type Change, type ChangeKind, type Side } from "../compare";
import { compareTables, toExcel, toPdf, toWord } from "../exporters";
import { gradeLabel, refText } from "../model";
import { fmtN, GRADES } from "../structure";
import { primaryOf, useWorkspace } from "../store";
import { EmptyV2, PreviewNotice, yearName } from "../ui";

const KINDS = Object.keys(CHANGE_LABEL) as ChangeKind[];
const TONE: Partial<Record<ChangeKind, string>> = { added: "bg-success/15", removed: "bg-destructive/10 text-destructive", review: "bg-warning/20" };

/** เปรียบเทียบหลักสูตรสองปี (ค่าเริ่มต้น: สองปีล่าสุดที่นำเข้า) */
export function ComparePage() {
  const ws = useWorkspace();
  const years = ws.datasets.map((d) => d.year);
  const [ya, setYa] = useState<number | null>(null), [yb, setYb] = useState<number | null>(null);
  const A = ws.datasets.find((d) => d.year === (ya ?? years[years.length - 2])), B = ws.datasets.find((d) => d.year === (yb ?? years[years.length - 1]));
  const sa = primaryOf(A), sb = primaryOf(B);
  const res = useMemo(() => (sa && sb && A !== B ? compareCurricula(sa.rows, sb.rows) : null), [sa, sb, A, B]);
  const [kind, setKind] = useState<ChangeKind | "">(""); const [grade, setGrade] = useState(""); const [area, setArea] = useState(""); const [q, setQ] = useState("");
  const list = (res?.changes ?? []).filter((c) => (!kind || c.kind === kind) && (!grade || c.grade === grade) && (!area || c.area === area) && (!q || [c.a?.code, c.a?.name, c.b?.code, c.b?.name, ...(c.a?.places ?? []), ...(c.b?.places ?? [])].join(" ").includes(q)));
  const counts = new Map<ChangeKind, number>(); for (const c of res?.changes ?? []) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  const areas = [...new Set((res?.changes ?? []).map((c) => c.area))].sort();
  const la = A ? yearName(A) : "", lb = B ? yearName(B) : "";
  const exportT = () => compareTables(la, lb, res!);
  const srcTxt = `${la}: ${sa?.fileName} · ${lb}: ${sb?.fileName}`;

  if (!ws.loaded) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  return (
    <>
      <PageHeader icon={GitCompareArrows} title="เปรียบเทียบหลักสูตร" description="รายวิชาเพิ่ม/ไม่มีในปีถัดไป/เปลี่ยนรหัส ชื่อ ชั่วโมง หน่วยกิต ประเภท ภาคเรียน และแผน — กรณีไม่แน่ใจแสดงเป็น “รอตรวจทาน”" />
      <PreviewNotice />
      {years.length < 2 ? <EmptyV2 title="ต้องมีหลักสูตรอย่างน้อยสองปี" text="นำเข้าหลักสูตรปี 2568 และ 2569 (หรือสองปีใด ๆ) แล้วกลับมาที่หน้านี้" /> : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
            <label className="text-sm"><span className="mb-1 block text-muted-foreground">ปีตั้งต้น</span><Select aria-label="ปีตั้งต้น" value={A?.year ?? ""} onChange={(e) => setYa(Number(e.target.value))}>{ws.datasets.map((d) => <option key={d.year} value={d.year}>{yearName(d)}</option>)}</Select></label>
            <span className="pb-2">→</span>
            <label className="text-sm"><span className="mb-1 block text-muted-foreground">ปีเปรียบเทียบ</span><Select aria-label="ปีเปรียบเทียบ" value={B?.year ?? ""} onChange={(e) => setYb(Number(e.target.value))}>{ws.datasets.map((d) => <option key={d.year} value={d.year}>{yearName(d)}</option>)}</Select></label>
            <p className="text-xs text-muted-foreground">แหล่งข้อมูล: {srcTxt}</p>
            {res && <span className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toExcel(`เปรียบเทียบ-${A?.year}-${B?.year}`, exportT(), srcTxt)}><FileDown /> Excel</Button>
              <Button size="sm" variant="outline" onClick={() => toWord(`เปรียบเทียบ-${A?.year}-${B?.year}`, `เปรียบเทียบหลักสูตร ${la} → ${lb}`, exportT(), srcTxt)}><FileDown /> Word</Button>
              <Button size="sm" variant="outline" onClick={() => toPdf(`เปรียบเทียบหลักสูตร ${la} → ${lb}`, exportT(), srcTxt)}><Printer /> PDF</Button>
            </span>}
          </div>
          {A === B && <p className="mt-3 text-sm text-warning">เลือกปีที่ต่างกัน</p>}
          {res && (
            <>
              <section aria-label="สรุปการเปลี่ยนแปลง" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {KINDS.map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(kind === k ? "" : k)} className={cn("rounded-xl border bg-card p-3 text-left", kind === k && "border-primary ring-1 ring-primary", k === "review" && counts.get(k) && "border-warning/50")}>
                    <span className="block text-xs text-muted-foreground">{CHANGE_LABEL[k]}</span><span className="text-xl font-semibold">{counts.get(k) ?? 0}</span>
                  </button>
                ))}
              </section>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Select aria-label="กรองชั้น" value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">ทุกชั้น</option>{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</Select>
                <Select aria-label="กรองกลุ่มสาระ" value={area} onChange={(e) => setArea(e.target.value)}><option value="">ทุกกลุ่มสาระ</option>{areas.map((a) => <option key={a}>{a}</option>)}</Select>
                <input aria-label="ค้นหารหัส ชื่อ หรือแผน" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส/ชื่อ/แผน" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
              </div>
              <ul className="mt-3 space-y-2">
                {list.slice(0, 400).map((c, i) => <ChangeCard key={i} c={c} la={la} lb={lb} />)}
                {!list.length && <li className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">ไม่มีรายการในตัวกรองนี้</li>}
              </ul>
              <section className="mt-6">
                <h2 className="mb-2 font-semibold">แผนการเรียน</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {res.plans.filter((p) => p.kind !== "same").map((p, i) => (
                    <li key={i} className={cn("rounded-xl border bg-card p-3 text-sm", p.kind === "plan_review" && "border-warning/50")}>
                      <b>{gradeLabel(p.grade)}</b> · {{ plan_added: "แผนเพิ่ม", plan_removed: "แผนลด", plan_review: "รอตรวจทาน", same: "" }[p.kind]}: {p.a ?? "—"} → {p.b ?? "—"} <span className="block text-xs text-muted-foreground">{p.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="mt-6 overflow-x-auto rounded-2xl border bg-card">
                <h2 className="p-4 font-semibold">ชั่วโมงและหน่วยกิตรวม</h2>
                <table className="w-full text-sm">
                  <thead><tr className="border-t text-left text-xs text-muted-foreground"><th className="px-4 py-2">ชั้น</th><th className="py-2 pr-2">แผน</th><th className="py-2 pr-2">ช่วง</th><th className="py-2 pr-2 text-right">ชม. {A?.year}</th><th className="py-2 pr-2 text-right">ชม. {B?.year}</th><th className="py-2 pr-2 text-right">นก. {A?.year}</th><th className="py-2 pr-4 text-right">นก. {B?.year}</th></tr></thead>
                  <tbody>{res.totals.filter((t) => !grade || t.grade === grade).map((t, i) => {
                    const diff = t.a && t.b && (t.a.hours !== t.b.hours || t.a.credits !== t.b.credits);
                    return <tr key={i} className={cn("border-t", t.term === 0 && "font-medium", diff && "bg-warning/10")}><td className="px-4 py-1.5">{gradeLabel(t.grade)}</td><td className="py-1.5 pr-2">{t.plan}</td><td className="py-1.5 pr-2">{t.term ? `ภาค ${t.term}` : "ทั้งปี"}</td><td className="py-1.5 pr-2 text-right">{fmtN(t.a?.hours)}</td><td className="py-1.5 pr-2 text-right">{fmtN(t.b?.hours)}</td><td className="py-1.5 pr-2 text-right">{fmtN(t.a?.credits)}</td><td className="py-1.5 pr-4 text-right">{fmtN(t.b?.credits)}</td></tr>;
                  })}</tbody>
                </table>
                <p className="px-4 py-2 text-xs text-muted-foreground">ชั่วโมงในตารางนี้เป็นผลรวมรายวิชา (ไม่รวมกิจกรรมพัฒนาผู้เรียน)</p>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

function SideBox({ s, label }: { s: Side | null; label: string }) {
  return (
    <div className="rounded-lg border bg-background p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {s ? <>
        <p><span className="font-mono text-xs">{s.code}</span> {s.name}</p>
        <p className="text-xs text-muted-foreground">{secLabel(s.section)} · {fmtN(s.credits)} นก. · {fmtN(s.hours)} ชม. · {s.places.join(", ")}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">หลักฐาน: {s.refs.slice(0, 3).map(refText).join(" | ")}</p>
      </> : <p className="text-sm text-muted-foreground">— ไม่มี</p>}
    </div>
  );
}
function ChangeCard({ c, la, lb }: { c: Change; la: string; lb: string }) {
  return (
    <li className="rounded-xl border bg-card p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2"><span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", TONE[c.kind] ?? "bg-muted")}>{CHANGE_LABEL[c.kind]}</span><b>{gradeLabel(c.grade)}</b><span className="text-muted-foreground">{c.area}</span><span>{c.detail}</span></p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2"><SideBox s={c.a} label={la} /><SideBox s={c.b} label={lb} /></div>
    </li>
  );
}
