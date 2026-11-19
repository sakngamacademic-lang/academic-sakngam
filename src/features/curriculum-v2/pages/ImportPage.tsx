import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileUp, Loader2, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { consolidate, type Consolidated } from "../consolidate";
import { gradeLabel, refText, type ParsedSource } from "../model";
import { kindOf } from "../parsers";
import { parseFile } from "../loader";
import { sectionLabel, fmtN } from "../structure";
import { removeSource, saveSource, setPrimary, useWorkspace } from "../store";
import { PreviewNotice, useCanManage, userTag, V2, yearName } from "../ui";

interface Pending { file: File; status: "parsing" | "ready" | "error" | "saved"; error?: string; src?: ParsedSource; c?: Consolidated; ack?: boolean; grade?: string }
const LEVEL = { error: "ต้องแก้/ยืนยัน", warning: "ควรตรวจ", info: "ข้อสังเกต" } as const;

/** นำเข้าหลักสูตร: อ่านไฟล์ → แสดงตัวอย่างและประเด็น → ยืนยันก่อนบันทึก (ระยะ Preview บันทึกในเบราว์เซอร์) */
export function ImportPage() {
  const { access } = useAuth();
  const can = useCanManage();
  const ws = useWorkspace();
  const [year, setYear] = useState("");
  const [label, setLabel] = useState("");
  const [items, setItems] = useState<Pending[]>([]);
  const y = Number(year);
  const yearOk = Number.isInteger(y) && y >= 2500 && y <= 2700;
  const ds = ws.datasets.find((d) => d.year === y);

  async function add(files: FileList | null) {
    const list = [...(files ?? [])];
    const bad = list.filter((f) => !kindOf(f.name));
    if (bad.length) toast.error(`ไม่รองรับ: ${bad.map((f) => f.name).join(", ")} (รองรับ .xlsx .docx .pdf)`);
    const next = list.filter((f) => kindOf(f.name)).map((file) => ({ file, status: "parsing" as const }));
    setItems((s) => [...s, ...next]);
    for (const p of next) {
      try { const src = await parseFile(p.file); const c = consolidate(src); setItems((s) => s.map((x) => (x.file === p.file ? { ...x, status: "ready", src, c } : x))); }
      catch (e) { setItems((s) => s.map((x) => (x.file === p.file ? { ...x, status: "error", error: e instanceof Error ? e.message : String(e) } : x))); }
    }
  }
  function save(p: Pending) {
    if (!p.src || !p.c || !yearOk) return;
    const r = saveSource(y, label, { kind: p.src.kind, fileName: p.src.fileName, sha256: p.src.sha256, importedBy: userTag(access?.email),
      rows: p.c.rows, activities: p.src.activities, declared: p.src.declared, descriptions: p.src.descriptions, issues: p.c.issues, notes: p.src.notes });
    setItems((s) => s.map((x) => (x.file === p.file ? { ...x, status: "saved" } : x)));
    toast.success(r === "replaced" ? `${p.src.fileName}: นำเข้าซ้ำ — แทนที่ข้อมูลเดิมของไฟล์นี้ (ไม่เกิดข้อมูลซ้ำ)` : `${p.src.fileName}: บันทึกเข้าหลักสูตร ${y} แล้ว`);
  }

  return (
    <>
      <PageHeader icon={Upload} title="นำเข้าหลักสูตร" description="อ่านไฟล์ XLSX / DOCX / PDF → ตรวจตัวอย่างและประเด็น → ยืนยันก่อนบันทึก · ทุกแถวอ้างอิงไฟล์ ชีต/เซลล์ หรือหน้า PDF" />
      <PreviewNotice />
      {!can && <p className="mb-4 rounded-xl border bg-card p-3 text-sm text-muted-foreground">บัญชีนี้อ่านไฟล์และดูตัวอย่างได้ แต่บันทึกได้เฉพาะผู้ดูแลหลักสูตร</p>}
      <section className="mb-4 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <label className="text-sm"><span className="mb-1 block font-medium">ปีหลักสูตร (พ.ศ.) *</span>
          <Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="เช่น 2569" aria-invalid={!!year && !yearOk} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">ชื่อเรียก (ไม่บังคับ)</span>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น หลักสูตรสถานศึกษา 2569 ฉบับโรงเรียนยืนยัน" /></label>
        <label className={cn("inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground", !yearOk && "pointer-events-none opacity-50")}>
          <FileUp className="size-4" /> เลือกไฟล์
          <input type="file" multiple accept=".xlsx,.docx,.pdf" className="sr-only" aria-label="เลือกไฟล์หลักสูตร" disabled={!yearOk} onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        </label>
        {!yearOk && <p className="text-xs text-muted-foreground sm:col-span-3">ระบุปีหลักสูตรก่อนเลือกไฟล์ — ระบบไม่เดาปีจากชื่อไฟล์</p>}
      </section>

      {ds && (
        <section className="mb-4 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">ไฟล์ที่นำเข้าแล้วของหลักสูตร {yearName(ds)}</h2>
          <p className="text-xs text-muted-foreground">แต่ละไฟล์เก็บแยกกัน (PDF ไม่เขียนทับ Excel) · เลือกไฟล์ที่ใช้แสดงโครงสร้างได้เอง</p>
          <ul className="mt-2 space-y-2">
            {ds.sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{s.fileName}</span>
                <span className="text-xs text-muted-foreground">{s.kind.toUpperCase()} · {s.rows.length} แถว · {new Date(s.importedAt).toLocaleString("th-TH")}</span>
                {ds.primarySourceId === s.id ? <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs">ใช้แสดงผล</span>
                  : can && <Button size="sm" variant="outline" className="h-8" onClick={() => setPrimary(ds.year, s.id, userTag(access?.email))}>ใช้ไฟล์นี้แสดงผล</Button>}
                {can && <Button size="sm" variant="outline" className="h-8 border-destructive/40 text-destructive" onClick={() => removeSource(ds.year, s.id, userTag(access?.email))}><Trash2 /> นำออก</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-4">
        {items.map((p, i) => <PreviewCard key={i} p={p} year={yearOk ? y : null} replace={!!ds?.sources.some((s) => s.sha256 === p.src?.sha256)} can={can}
          onAck={(v) => setItems((s) => s.map((x) => (x === p ? { ...x, ack: v } : x)))} onGrade={(g) => setItems((s) => s.map((x) => (x === p ? { ...x, grade: g } : x)))} onSave={() => save(p)} />)}
      </div>
    </>
  );
}

function PreviewCard({ p, year, replace, can, onAck, onSave, onGrade }: { p: Pending; year: number | null; replace: boolean; can: boolean; onAck: (v: boolean) => void; onSave: () => void; onGrade: (g: string) => void }) {
  const issues = p.c?.issues ?? [];
  const errors = issues.filter((i) => i.level === "error").length;
  const grades = useMemo(() => [...new Set((p.c?.rows ?? []).map((r) => r.grade ?? "ไม่ระบุ"))].sort(), [p.c]);
  const g = p.grade ?? grades[0];
  const rows = (p.c?.rows ?? []).filter((r) => (r.grade ?? "ไม่ระบุ") === g);
  return (
    <article aria-label={`ตัวอย่าง ${p.file.name}`} className="rounded-2xl border bg-card p-4 shadow-card">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{p.file.name}</h2>
        <span className="text-xs text-muted-foreground">{kindOf(p.file.name)?.toUpperCase()}{p.src ? ` · SHA-256 ${p.src.sha256.slice(0, 12)}…` : ""}</span>
        {p.status === "parsing" && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> กำลังอ่าน…</span>}
        {p.status === "saved" && <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="size-4" /> บันทึกแล้ว · <Link className="underline" to={`${V2}/structure?y=${year}`}>ดูโครงสร้าง</Link></span>}
      </header>
      {p.status === "error" && <p role="alert" className="mt-2 text-sm text-destructive">อ่านไฟล์ไม่สำเร็จ: {p.error}</p>}
      {p.src && p.c && (
        <>
          <p className="mt-2 text-sm">พบรายวิชา <b>{p.c.rows.length}</b> แถว (จาก {p.src.rows.length} แถวในไฟล์ · แถวที่เหมือนกันจากตารางซ้ำรวมเป็นแถวเดียว) · คำอธิบายรายวิชา <b>{p.src.descriptions.length}</b> วิชา · ประเด็น {issues.length} ({errors} ต้องแก้/ยืนยัน)</p>
          {p.src.notes.map((n, i) => <p key={i} className="text-xs text-muted-foreground">{n}</p>)}
          {issues.length > 0 && (
            <details className="mt-2 rounded-xl border bg-muted/30 p-2 text-sm" open={errors > 0}>
              <summary className="cursor-pointer font-medium">ประเด็นที่พบ ({issues.length})</summary>
              <ul className="mt-1 max-h-60 space-y-1 overflow-auto">
                {issues.map((x, i) => <li key={i}><span className={cn("mr-1 rounded px-1.5 text-xs", x.level === "error" ? "bg-destructive/15 text-destructive" : x.level === "warning" ? "bg-warning/15" : "bg-muted")}>{LEVEL[x.level]}</span>{x.text} <span className="text-xs text-muted-foreground">({refText(x.ref)})</span></li>)}
              </ul>
            </details>
          )}
          {p.c.rows.length > 0 && (
            <div className="mt-3">
              <div role="group" aria-label="ชั้นในตัวอย่าง" className="mb-2 flex flex-wrap gap-1">
                {grades.map((x) => <button key={x} type="button" aria-pressed={x === g} onClick={() => onGrade(x)} className={cn("h-8 rounded-full border px-3 text-xs", x === g ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{x === "ไม่ระบุ" ? "ไม่ระบุชั้น" : gradeLabel(x)}</button>)}
              </div>
              <div className="max-h-80 overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted"><tr className="text-left"><th className="p-2">แผน</th><th className="p-2">ภาค</th><th className="p-2">หมวด</th><th className="p-2">รหัส</th><th className="p-2">ชื่อวิชา</th><th className="p-2 text-right">นก.</th><th className="p-2 text-right">ชม.</th><th className="hidden p-2 sm:table-cell">อ้างอิง</th></tr></thead>
                  <tbody>{rows.slice(0, 300).map((r, i) => <tr key={i} className="border-t"><td className="p-2">{r.plan ?? <i className="text-destructive">ไม่ระบุ</i>}{r.room ? <span className="block text-xs text-muted-foreground">ห้องตามไฟล์ {r.room}</span> : null}</td><td className="p-2">{r.term ?? "–"}</td><td className="p-2">{sectionLabel(r.section)}</td><td className="p-2 font-mono text-xs">{r.code}</td><td className="p-2">{r.name}</td><td className="p-2 text-right">{fmtN(r.credits)}</td><td className="p-2 text-right">{fmtN(r.hours)}</td><td className="hidden p-2 text-xs text-muted-foreground sm:table-cell">{r.refs.map(refText).join(" | ")}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          {p.status === "ready" && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {errors > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!p.ack} onChange={(e) => onAck(e.target.checked)} /> รับทราบ {errors} ประเด็นที่ต้องแก้/ยืนยัน (แถวที่ไม่ระบุชั้น/แผน/ภาคจะไม่ถูกจัดเข้าโครงสร้าง)</label>}
              <Button disabled={!can || !year || !p.c.rows.length || (errors > 0 && !p.ack)} onClick={onSave}><CheckCircle2 /> {replace ? "ยืนยันนำเข้าซ้ำ (แทนที่ไฟล์เดิม)" : `ยืนยันบันทึกเข้าหลักสูตร ${year ?? ""}`}</Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
