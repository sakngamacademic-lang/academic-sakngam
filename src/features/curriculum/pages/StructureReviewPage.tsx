import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, FileDown, FileJson, Landmark, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLearningAreas } from "@/features/master-data/api";
import { cn } from "@/lib/utils";
import {
  canAgree, CHOICE_LABEL, gradeLabel, KIND_LABEL, opinionError, opinionsCsv, parseReviewPackage, summarize, visibleAreaCodes,
  type Choice, type Opinion, type ReviewItem, type ReviewPackage,
} from "../review/review-package";

/**
 * ตรวจทานโครงสร้างหลักสูตรผ่านเว็บ (ระยะ Preview)
 * - ข้อมูลมาจากไฟล์ชุดตรวจทาน (.json) ที่เปิดในเบราว์เซอร์ — ไม่อัปโหลด ไม่เขียนฐานข้อมูล
 * - ความเห็นเก็บในหน้าเว็บนี้ชั่วคราว (หายเมื่อปิดหน้า) · ดาวน์โหลด CSV ได้
 * - ขอบเขตการมองเห็นใช้สิทธิ์เดิม: หัวหน้ากลุ่มสาระเห็นเฉพาะกลุ่มที่ได้รับมอบหมาย (learning_area_ids)
 */
type Tab = "items" | "school" | "summary";
const GRADES = ["M1", "M2", "M3", "M4", "M5", "M6"];

export function StructureReviewPage() {
  const { roles, access } = useAuth();
  const areasQ = useLearningAreas();
  const [pkg, setPkg] = useState<ReviewPackage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("items");
  const [area, setArea] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [ops, setOps] = useState<Record<string, Opinion>>({});
  const isHead = roles.some((r) => r === "academic_head" || r === "academic_staff" || r === "system_admin");

  const myCodes = useMemo(() => (areasQ.data ?? []).filter((a) => access?.learning_area_ids.includes(a.id)).map((a) => a.code), [areasQ.data, access]);
  const allowed = useMemo(() => (pkg ? visibleAreaCodes(roles, myCodes, pkg.areas.map((a) => a.code)) : []), [pkg, roles, myCodes]);
  const items = useMemo(() => (pkg?.items ?? []).filter((i) => allowed.includes(i.area) && (!area || i.area === area) && (!grade || i.grade === grade)), [pkg, allowed, area, grade]);
  const sum = useMemo(() => (pkg ? summarize(pkg, ops, allowed) : []), [pkg, ops, allowed]);

  async function open(f: File | undefined) {
    if (!f) return;
    try { setPkg(parseReviewPackage(await f.text())); setErr(null); setOps({}); setArea(null); setGrade(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  const setOp = (id: string, patch: Partial<Opinion>) => setOps((o) => ({ ...o, [id]: { choice: o[id]?.choice ?? "escalate", note: o[id]?.note ?? "", ...patch } }));

  return (
    <>
      <PageHeader icon={ClipboardCheck} title="ตรวจทานโครงสร้างหลักสูตร 2569" description="หัวหน้ากลุ่มสาระตรวจเฉพาะรายวิชาของกลุ่มตนเอง เทียบ PDF / Excel / ทะเบียนในระบบ แล้วให้ความเห็น" />
      <p role="note" className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">ตัวอย่าง (Preview) — ความเห็นยังไม่ถูกบันทึกลงระบบ และจะหายเมื่อปิดหน้านี้ · ไม่มีการเปลี่ยนข้อมูลหลักสูตร</p>

      {!pkg ? (
        <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
          <p className="font-medium">เปิดไฟล์ชุดตรวจทาน (.json) ที่ฝ่ายวิชาการเตรียมไว้</p>
          <p className="mt-1 text-sm text-muted-foreground">ระยะ Preview: ไฟล์อ่านในเครื่องนี้เท่านั้น · ระยะถัดไปจะดึงจากระบบโดยตรงโดยไม่ต้องเปิดไฟล์</p>
          <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground">
            <FileJson className="size-4" /> เลือกไฟล์ชุดตรวจทาน
            <input type="file" accept=".json,application/json" className="sr-only" aria-label="เลือกไฟล์ชุดตรวจทาน" onChange={(e) => void open(e.target.files?.[0])} />
          </label>
          {err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
        </div>
      ) : !allowed.length ? (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">บัญชีนี้ยังไม่ได้รับมอบหมายกลุ่มสาระ จึงไม่มีรายการให้ตรวจ (ใช้สิทธิ์เดิมของระบบ ไม่เพิ่มสิทธิ์อัตโนมัติ)</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">แหล่งข้อมูล: ① {pkg.source.pdf} · ② {pkg.source.xlsx} · ③ {pkg.source.registry}</p>
          <section aria-label="ภาพรวมกลุ่มสาระ" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {sum.map((s) => (
              <button key={s.code} type="button" aria-pressed={area === s.code} onClick={() => { setArea(area === s.code ? null : s.code); setTab("items"); }}
                className={cn("rounded-xl border bg-card p-3 text-left shadow-card", area === s.code && "border-primary ring-1 ring-primary")}>
                <span className="block truncate text-sm font-medium">{s.name}</span>
                <span className="text-2xl font-semibold">{s.total}</span> <span className="text-xs text-muted-foreground">ประเด็น</span>
                <span className="mt-1 block text-xs text-muted-foreground">ตอบแล้ว {s.answered}/{s.total}{s.waitingSchool ? ` · รอมติโรงเรียน ${s.waitingSchool}` : ""}</span>
              </button>
            ))}
          </section>

          <div role="tablist" aria-label="มุมมอง" className="mb-3 flex gap-1 border-b">
            {([["items", `ประเด็นรายวิชา (${pkg.items.filter((i) => allowed.includes(i.area)).length})`, ListChecks], ["school", `ประเด็นระดับโรงเรียน (${pkg.decisions.length})`, Landmark], ...(isHead ? [["summary", "สรุปความเห็น", ClipboardCheck] as const] : [])] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm", tab === k ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground")}><Icon className="size-4" />{l}</button>
            ))}
          </div>

          {tab === "items" && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="กรองชั้น">
                {[null, ...GRADES].map((g) => (
                  <button key={g ?? "all"} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}
                    className={cn("h-9 rounded-full border px-3 text-sm", grade === g ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{g ? gradeLabel(g) : "ทุกชั้น"}</button>
                ))}
                {area && <span className="text-sm text-muted-foreground">กลุ่มสาระ: {pkg.areas.find((a) => a.code === area)?.name} <button type="button" className="underline" onClick={() => setArea(null)}>ล้าง</button></span>}
              </div>
              <div className="space-y-3">
                {items.map((it) => <ItemCard key={it.id} it={it} op={ops[it.id]} onChange={(p) => setOp(it.id, p)} />)}
                {!items.length && <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">ไม่มีประเด็นในตัวกรองนี้</p>}
              </div>
            </>
          )}

          {tab === "school" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">ประเด็นระดับโรงเรียนตัดสินโดยหัวหน้าฝ่ายวิชาการ — ประเด็นรายวิชาที่ขึ้นกับมติเหล่านี้เลือก “เห็นด้วย” ไม่ได้จนกว่าจะมีมติ</p>
              {pkg.decisions.map((d) => {
                const n = pkg.items.filter((i) => i.dependsOn.includes(d.no) && allowed.includes(i.area)).length;
                return (
                  <article key={d.no} className="rounded-xl border bg-card p-4">
                    <h3 className="font-medium">ข้อ {d.no}. {d.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">ผลต่อ: {d.affects}{n ? ` · ประเด็นรายวิชาที่รอมตินี้ ${n} ข้อ` : ""}</p>
                    <p className="mt-1 text-xs text-muted-foreground">อ้างอิง: {d.refs}</p>
                    <span className="mt-2 inline-block rounded-md bg-warning/15 px-2 py-0.5 text-xs text-warning">รอมติ</span>
                  </article>
                );
              })}
            </div>
          )}

          {tab === "summary" && isHead && (
            <section className="space-y-4">
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">กลุ่มสาระ</th><th className="p-2 text-right">ประเด็น</th><th className="p-2 text-right">ตอบแล้ว</th><th className="p-2 text-right">เห็นด้วย</th><th className="p-2 text-right">เสนอแก้ไข</th><th className="p-2 text-right">ส่งฝ่ายวิชาการ</th><th className="p-2 text-right">รอมติโรงเรียน</th></tr></thead>
                  <tbody>{sum.map((s) => <tr key={s.code} className="border-b"><td className="p-2">{s.name}</td><td className="p-2 text-right">{s.total}</td><td className="p-2 text-right">{s.answered}</td><td className="p-2 text-right">{s.agree}</td><td className="p-2 text-right">{s.propose}</td><td className="p-2 text-right">{s.escalate}</td><td className="p-2 text-right">{s.waitingSchool}</td></tr>)}</tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-2 font-medium">ความเห็นที่ต้องพิจารณา (เสนอแก้ไข / ส่งให้ฝ่ายวิชาการ)</h3>
                <ul className="space-y-2">
                  {pkg.items.filter((i) => allowed.includes(i.area) && ops[i.id] && ops[i.id]!.choice !== "agree").map((i) => (
                    <li key={i.id} className="rounded-xl border bg-card p-3 text-sm"><b>{i.id}</b> · {gradeLabel(i.grade)} · <span className="font-mono">{i.code}</span> {i.name} — <span className="font-medium">{CHOICE_LABEL[ops[i.id]!.choice]}</span>: {ops[i.id]!.note || <i className="text-destructive">ยังไม่ระบุเหตุผล</i>}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">ผลรวมนี้ยังไม่ใช่มติ — การตัดสินจริงใช้ขั้นตอนเดิมของหัวหน้าฝ่ายวิชาการ (ระยะถัดไป)</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([opinionsCsv(pkg, ops)], { type: "text/csv" })); a.download = "ความเห็นตรวจทาน2569.csv"; a.click(); }}><FileDown /> ดาวน์โหลดความเห็น (CSV)</Button>
            </section>
          )}
        </>
      )}
    </>
  );
}

function ItemCard({ it, op, onChange }: { it: ReviewItem; op: Opinion | undefined; onChange: (p: Partial<Opinion>) => void }) {
  const error = opinionError(it, op);
  const rows: [string, { value: string | null; ref: string | null }][] = [["① PDF", it.pdf], ["② Excel", it.xls], ["③ ทะเบียนในระบบ", it.reg]];
  return (
    <article aria-label={`ประเด็น ${it.id}`} className="rounded-2xl border bg-card p-4 shadow-card">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-sm font-semibold">{it.code}</span>
        <span className="font-medium">{it.name}</span>
        <span className="text-sm text-muted-foreground">{gradeLabel(it.grade)} · {it.id}</span>
        <span className="ml-auto rounded-md bg-muted px-2 py-0.5 text-xs">{KIND_LABEL[it.kind]}</span>
      </header>
      <p className="mt-2 text-sm">{it.issue}</p>
      {it.dependsOn.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" />ขึ้นกับมติระดับโรงเรียนข้อ {it.dependsOn.join(", ")} — ยังเลือก “เห็นด้วย” ไม่ได้</p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5 pr-2 font-normal">แหล่ง</th><th className="py-1.5 pr-2 font-normal">ค่า (ชื่อ หน่วยกิต(ชั่วโมง))</th><th className="py-1.5 font-normal">อ้างอิง</th></tr></thead>
          <tbody>{rows.map(([l, v]) => <tr key={l} className="border-b last:border-0"><td className="py-1.5 pr-2 whitespace-nowrap">{l}</td><td className="py-1.5 pr-2">{v.value ?? <span className="text-muted-foreground">— ไม่มี</span>}</td><td className="py-1.5 font-mono text-xs text-muted-foreground">{v.ref ?? (l.startsWith("③") ? "ทะเบียน" : "—")}</td></tr>)}</tbody>
        </table>
      </div>
      {it.evidence && <p className="mt-2 text-xs text-muted-foreground">หลักฐานเพิ่มเติม: {it.evidence}</p>}
      <p className="mt-1 text-xs text-muted-foreground">แผน/ภาคเรียน: {it.plans}{it.proposal ? ` · ค่าที่เสนอในร่าง: ${it.proposal}` : ""}</p>
      <fieldset className="mt-3">
        <legend className="mb-1.5 text-sm font-medium">ความเห็นของหัวหน้ากลุ่มสาระ</legend>
        <div className="flex flex-wrap gap-2">
          {(["agree", "propose", "escalate"] as Choice[]).map((c) => {
            const disabled = c === "agree" && !canAgree(it);
            return (
              <label key={c} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm", op?.choice === c && "border-primary bg-accent", disabled && "cursor-not-allowed opacity-50")}>
                <input type="radio" name={`op-${it.id}`} value={c} checked={op?.choice === c} disabled={disabled} onChange={() => onChange({ choice: c })} />{CHOICE_LABEL[c]}
              </label>
            );
          })}
        </div>
        <textarea aria-label={`เหตุผลหรือหมายเหตุ ${it.id}`} rows={2} value={op?.note ?? ""} onChange={(e) => onChange({ note: e.target.value })}
          placeholder={op?.choice === "propose" ? "ระบุค่าที่ควรเป็นและเหตุผล" : "เหตุผลหรือหมายเหตุ (บังคับเมื่อเสนอแก้ไข/ส่งให้ฝ่ายวิชาการ)"}
          className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </fieldset>
    </article>
  );
}
