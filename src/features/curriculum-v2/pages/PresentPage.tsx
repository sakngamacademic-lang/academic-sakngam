import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, BookOpen, ExternalLink, FileText, Loader2, Maximize2, Paperclip, Pencil, Plus, Presentation, Search, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import { PdfPages, findCodePages, readPlanMeta, type CodeHit } from "../PdfPages";
import { addBook, addFiles, addPlans, moveFile, movePlan, removeBook, removeFile, removePlan, renameBook, useBooks, type Book, type PlanFile } from "../books";
import { gradeWarning, planTitle } from "../plans";

/** นำเสนอเล่มหลักสูตร: กดปุ่ม → เปิดเล่ม (PDF) เต็มจอ · แนบเล่ม/แผนการสอนครั้งเดียว เก็บในเครื่องนี้ */
export function PresentPage() {
  const { books, plans, loaded } = useBooks();
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const current = open ? books.find((b) => b.id === open) ?? null : null;
  const subjectBooks = books.filter((b) => b.group === "subject");
  const unsorted = plans.filter((p) => !p.bookId || !books.some((b) => b.id === p.bookId));
  const onPlans = async (files: File[]) => {
    if (!files.length) return;
    setBusy(`กำลังอ่านหัวแผน ${files.length} ไฟล์…`);
    const added = await addPlans(files, readPlanMeta);
    const n = added.filter((p) => p.bookId).length;
    setBusy(`แนบแผนแล้ว ${added.length} ไฟล์ · จัดเข้ากลุ่มสาระตามรหัสวิชา ${n} ไฟล์${added.length - n ? ` · รอเลือกกลุ่มสาระ ${added.length - n} ไฟล์` : ""}`);
  };
  return (
    <>
      <PageHeader icon={Presentation} title="นำเสนอเล่มหลักสูตร" description="กดปุ่มเพื่อเปิดเล่มเต็มจอ · แนบไฟล์ PDF ของเล่มและแผนการจัดการเรียนรู้ไว้ครั้งเดียว (เก็บในเบราว์เซอร์เครื่องนี้ ไม่อัปโหลด)"
        actions={<span className="flex flex-wrap gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted"><FileText className="size-4" /> แนบแผนการสอน (PDF)
            <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="แนบแผนการจัดการเรียนรู้" onChange={(e) => { void onPlans([...(e.target.files ?? [])]); e.target.value = ""; }} /></label>
          <Button variant={edit ? "default" : "outline"} onClick={() => setEdit((v) => !v)}><Pencil /> {edit ? "เสร็จสิ้นการจัดเล่ม" : "จัดการเล่ม / แนบไฟล์"}</Button>
        </span>} />
      {busy && <p role="status" className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm">{busy}</p>}
      {!loaded ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {books.filter((b) => !b.group).map((b) => <BookCard key={b.id} b={b} plans={[]} edit={edit} onOpen={() => setOpen(b.id)} />)}
            {edit && <button type="button" onClick={() => addBook()} className="flex min-h-40 items-center justify-center gap-2 rounded-3xl border-2 border-dashed text-muted-foreground hover:border-primary hover:text-primary"><Plus /> เพิ่มปุ่มเล่ม</button>}
          </div>
          <section aria-label="หลักสูตรรายวิชา">
            <h2 className="mb-3 text-xl font-bold">หลักสูตรรายวิชา <span className="text-base font-normal text-muted-foreground">· แยกตามกลุ่มสาระ พร้อมแผนการจัดการเรียนรู้</span></h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subjectBooks.map((b) => <BookCard key={b.id} b={b} plans={plans.filter((p) => p.bookId === b.id)} edit={edit} small onOpen={() => setOpen(b.id)} />)}
              {edit && <button type="button" onClick={() => addBook("subject")} className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-muted-foreground hover:border-primary hover:text-primary"><Plus /> เพิ่มปุ่มรายวิชา</button>}
            </div>
          </section>
          {unsorted.length > 0 && (
            <section aria-label="แผนที่ยังไม่ได้จัดกลุ่มสาระ" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
              <h2 className="mb-1 font-semibold">แผนที่ยังไม่ได้จัดกลุ่มสาระ ({unsorted.length})</h2>
              <p className="mb-2 text-sm text-muted-foreground">ไม่พบรหัสวิชาในหัวแผน — เลือกกลุ่มสาระเอง</p>
              <ul className="space-y-1 text-sm">
                {unsorted.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 truncate">{p.name}</span>
                    <select aria-label={`เลือกกลุ่มสาระของ ${p.name}`} value="" onChange={(e) => movePlan(p.id, e.target.value || null)} className="h-8 rounded-md border bg-background px-2">
                      <option value="">— เลือกกลุ่มสาระ —</option>
                      {subjectBooks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                    <button type="button" aria-label={`ลบ ${p.name}`} onClick={() => removePlan(p.id)} className="text-destructive"><Trash2 className="size-4" /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {current && <Viewer b={current} plans={plans.filter((p) => p.bookId === current.id)} onClose={() => setOpen(null)} />}
    </>
  );
}

function BookCard({ b, plans, edit, small, onOpen }: { b: Book; plans: PlanFile[]; edit: boolean; small?: boolean; onOpen: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const ready = b.files.length > 0 || plans.length > 0;
  if (!edit) return (
    <button type="button" onClick={() => (ready ? onOpen() : input.current?.click())} aria-label={`เปิดเล่ม ${b.title}`}
      className={cn("group relative flex flex-col justify-end overflow-hidden text-left", small ? "min-h-28 rounded-2xl p-4" : "min-h-48 rounded-3xl p-6", "text-white shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-[color:var(--gold)]")}
      style={{ background: "linear-gradient(135deg, #1f4278 0%, #142b4e 100%)" }}>
      <BookOpen className={cn("absolute right-4 top-4 text-[color:var(--gold)] opacity-90 transition-transform group-hover:scale-110", small ? "size-8" : "size-14")} />
      <span className={cn("font-bold leading-tight", small ? "pr-10 text-lg" : "text-2xl sm:text-3xl")}>{b.title}</span>
      {b.subtitle && <span className="mt-1 text-sm text-white/80">{b.subtitle}</span>}
      <span className="mt-3 flex flex-wrap gap-1.5">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[color:var(--gold)] px-3 py-1 text-sm font-semibold text-[#142b4e]">
          {b.files.length ? <>เปิดเล่ม{b.files.length > 1 ? ` (${b.files.length} ส่วน)` : ""}</> : plans.length ? "ดูแผนการสอน" : <><Paperclip className="size-4" /> แนบไฟล์ PDF</>}
        </span>
        {plans.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm"><FileText className="size-4" /> แผนการสอน {plans.length} แผน</span>}
      </span>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label={`แนบไฟล์ ${b.title}`} onClick={(e) => e.stopPropagation()} onChange={(e) => { addFiles(b.id, [...(e.target.files ?? [])]); e.target.value = ""; }} />
    </button>
  );
  return (
    <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-card">
      <Input aria-label="ชื่อปุ่ม" value={b.title} onChange={(e) => renameBook(b.id, e.target.value, b.subtitle)} className="text-lg font-semibold" />
      <Input aria-label="คำอธิบายใต้ปุ่ม" value={b.subtitle} onChange={(e) => renameBook(b.id, b.title, e.target.value)} placeholder="คำอธิบายใต้ปุ่ม (ไม่บังคับ)" />
      <ol className="space-y-1 text-sm">
        {b.files.map((f, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1">
            <span className="w-6 text-muted-foreground">{i + 1}.</span><span className="flex-1 truncate">{f.name}</span><span className="text-xs text-muted-foreground">{(f.size / 1048576).toFixed(1)} MB</span>
            <button type="button" aria-label="เลื่อนขึ้น" onClick={() => moveFile(b.id, i, -1)}><ArrowUp className="size-4" /></button>
            <button type="button" aria-label="เลื่อนลง" onClick={() => moveFile(b.id, i, 1)}><ArrowDown className="size-4" /></button>
            <button type="button" aria-label={`ลบ ${f.name}`} onClick={() => removeFile(b.id, i)} className="text-destructive"><Trash2 className="size-4" /></button>
          </li>
        ))}
        {!b.files.length && <li className="text-muted-foreground">ยังไม่มีไฟล์เล่ม</li>}
      </ol>
      {plans.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label={`แผนการสอน ${b.title}`}>
          {plans.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1">
              <FileText className="size-4 text-muted-foreground" /><span className="flex-1 truncate">{p.meta.code ? `${p.meta.code} · ` : ""}{planTitle(p.meta, p.name)}</span>
              <button type="button" aria-label={`ลบแผน ${p.name}`} onClick={() => removePlan(p.id)} className="text-destructive"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground"><Paperclip className="size-4" /> แนบไฟล์ PDF (เลือกได้หลายไฟล์)
          <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label={`แนบไฟล์ ${b.title}`} onChange={(e) => { addFiles(b.id, [...(e.target.files ?? [])]); e.target.value = ""; }} /></label>
        <Button size="sm" variant="outline" className="border-destructive/40 text-destructive" onClick={() => removeBook(b.id)}><Trash2 /> ลบปุ่มนี้</Button>
      </div>
    </div>
  );
}

type View = { kind: "part"; i: number } | { kind: "plans" } | { kind: "plan"; id: string };

function Viewer({ b, plans, onClose }: { b: Book; plans: PlanFile[]; onClose: () => void }) {
  const [view, setView] = useState<View>(b.files.length ? { kind: "part", i: 0 } : { kind: "plans" });
  const [pages, setPages] = useState(0);
  const [jump, setJump] = useState("");
  const [goTo, setGoTo] = useState<{ page: number; at: number } | undefined>();
  const [finding, setFinding] = useState<string | null>(null);
  const [hits, setHits] = useState<{ code: string; list: CodeHit[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const plan = view.kind === "plan" ? plans.find((p) => p.id === view.id) : undefined;
  const file = view.kind === "part" ? b.files[view.i] : plan;
  const url = useMemo(() => (file ? URL.createObjectURL(new Blob([file.blob], { type: "application/pdf" })) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const show = (v: View) => { setView(v); setPages(0); setGoTo(undefined); setJump(""); };
  const go = () => { const n = Number(jump); if (n >= 1 && n <= pages) setGoTo({ page: n, at: Date.now() }); };
  const jumpTo = (h: CodeHit) => { show({ kind: "part", i: h.part }); setGoTo({ page: h.page, at: Date.now() }); };
  /** เชื่อมแผน → เล่ม: หาทุกหน้าที่มีรหัสวิชาในเล่มของกลุ่มสาระนี้ เปิดหน้าคำอธิบายรายวิชาก่อน */
  const findInBook = async (code: string) => {
    setFinding(`กำลังหา ${code} ในเล่ม…`); setHits(null);
    const list = await findCodePages(b.files.map((f) => f.blob), code);
    if (!list.length) { setFinding(`ไม่พบรหัส ${code} ในเล่มของปุ่มนี้`); return; }
    setFinding(null); setHits({ code, list });
    jumpTo(list.find((h) => h.kind === "คำอธิบายรายวิชา") ?? list[0]!);
  };
  const tab = (active: boolean) => cn("h-8 rounded-full px-3 text-sm", active ? "bg-[color:var(--gold)] font-semibold text-[#142b4e]" : "bg-white/10 hover:bg-white/20");
  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label={`เล่ม ${b.title}`} className="fixed inset-0 z-50 flex flex-col bg-[#0f1f3a]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-white">
        <BookOpen className="size-5 text-[color:var(--gold)]" />
        <span className="mr-2 font-semibold">{b.title}</span>
        {(b.files.length > 1 || plans.length > 0) && b.files.map((f, i) => (
          <button key={i} type="button" onClick={() => show({ kind: "part", i })} title={f.name} className={tab(view.kind === "part" && view.i === i)}>{partLabel(f.name, i)}</button>
        ))}
        {plans.length > 0 && <button type="button" onClick={() => show({ kind: "plans" })} className={tab(view.kind !== "part")}><FileText className="mr-1 inline size-4" />แผนการจัดการเรียนรู้ ({plans.length})</button>}
        {view.kind !== "plans" && pages > 0 && (
          <form className="flex items-center gap-1 text-sm" onSubmit={(e) => { e.preventDefault(); go(); }}>
            <span className="text-white/70">ไปหน้า</span>
            <input aria-label="ไปหน้า" inputMode="numeric" value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))} className="h-8 w-14 rounded-md bg-white/10 px-2 text-white" />
            <span className="text-white/70">/ {pages}</span>
          </form>
        )}
        <span className="ml-auto flex gap-2">
          {url && view.kind !== "plans" && <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-3 text-sm hover:bg-white/20"><ExternalLink className="size-4" /> แท็บใหม่</a>}
          <button type="button" onClick={() => void box.current?.requestFullscreen?.()} className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-3 text-sm hover:bg-white/20"><Maximize2 className="size-4" /> เต็มจอ</button>
          <button type="button" onClick={onClose} aria-label="ปิดเล่ม" className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-3 text-sm hover:bg-white/20"><X className="size-4" /> ปิด</button>
        </span>
      </div>
      {plan && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2 text-sm text-white">
          <button type="button" onClick={() => show({ kind: "plans" })} className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-3 hover:bg-white/20"><ArrowLeft className="size-4" /> รายการแผน</button>
          <span className="font-medium">{plan.meta.code ? `${plan.meta.code} ${plan.meta.subject ?? ""} · ` : ""}{planTitle(plan.meta, plan.name)}</span>
          {plan.meta.code && b.files.length > 0 && <button type="button" onClick={() => void findInBook(plan.meta.code!)} className="inline-flex h-8 items-center gap-1 rounded-md bg-[color:var(--gold)] px-3 font-semibold text-[#142b4e]"><Search className="size-4" /> ดูรายวิชานี้ในเล่มหลักสูตร</button>}
        </div>
      )}
      {hits && view.kind === "part" && (
        <div role="navigation" aria-label={`หน้าที่เกี่ยวกับ ${hits.code}`} className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-t border-white/10 px-3 py-2 text-sm text-white">
          <span className="text-white/70">{hits.code} ในเล่ม:</span>
          {hits.list.map((h, k) => (
            <button key={k} type="button" onClick={() => jumpTo(h)} className="h-7 shrink-0 rounded-full bg-white/10 px-2.5 hover:bg-white/20">{h.kind} · {b.files.length > 1 ? `${partLabel(b.files[h.part]!.name, h.part)} ` : ""}น.{h.page}</button>
          ))}
          <button type="button" aria-label="ปิดแถบหน้าที่เกี่ยวข้อง" onClick={() => setHits(null)} className="ml-1 text-white/60 hover:text-white"><X className="size-4" /></button>
        </div>
      )}
      {finding && <p role="status" className="flex items-center gap-2 px-3 pb-2 text-sm text-white/80">{finding.startsWith("กำลัง") && <Loader2 className="size-4 animate-spin" />}{finding}</p>}
      <div className="flex-1 overflow-y-auto">
        {view.kind === "plans" ? <PlanList b={b} plans={plans} onOpen={(id) => show({ kind: "plan", id })} onFind={(c) => void findInBook(c)} />
          : file ? <PdfPages key={view.kind === "part" ? `${b.id}-${view.i}` : view.id} blob={file.blob} onPages={setPages} goTo={goTo} />
          : <p className="p-6 text-white">ยังไม่มีไฟล์</p>}
      </div>
    </div>
  );
}

/** รายการแผน จัดกลุ่มตามรหัสวิชา เรียงตามแผนที่ */
function PlanList({ b, plans, onOpen, onFind }: { b: Book; plans: PlanFile[]; onOpen: (id: string) => void; onFind: (code: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, PlanFile[]>();
    for (const p of plans) { const k = p.meta.code ?? ""; m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.entries()].sort(([a], [c]) => (a || "~").localeCompare(c || "~")).map(([code, ps]) => [code, [...ps].sort((x, y) => (x.meta.planNo ?? 999) - (y.meta.planNo ?? 999))] as const);
  }, [plans]);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 text-white sm:p-6">
      {groups.map(([code, ps]) => {
        const m = ps[0]!.meta;
        return (
          <section key={code || "none"} aria-label={`รายวิชา ${code || "ไม่ระบุรหัส"}`} className="rounded-2xl bg-white/5 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{code ? `${code} ${m.subject ?? ""}` : "ไม่พบรหัสวิชาในหัวแผน"}</h3>
              {m.grade && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">ม.{m.grade} (ตามแผน)</span>}
              <span className="text-sm text-white/60">{ps.length} แผน</span>
              {code && b.files.length > 0 && <button type="button" onClick={() => onFind(code)} className="ml-auto inline-flex h-8 items-center gap-1 rounded-md bg-[color:var(--gold)] px-3 text-sm font-semibold text-[#142b4e]"><Search className="size-4" /> ดูรายวิชานี้ในเล่มหลักสูตร</button>}
            </div>
            <ul className="space-y-2">
              {ps.map((p) => {
                const warn = gradeWarning(p.meta);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => onOpen(p.id)} className="w-full rounded-xl bg-white/10 p-3 text-left hover:bg-white/20">
                      <span className="block font-medium">{planTitle(p.meta, p.name)}</span>
                      <span className="block text-sm text-white/70">{[p.meta.unit && `หน่วยที่ ${p.meta.unit}`, p.meta.term && p.meta.year && `ภาคเรียนที่ ${p.meta.term}/${p.meta.year}`, p.meta.teacher && `ผู้สอน ${p.meta.teacher}`].filter(Boolean).join(" · ") || p.name}</span>
                      {warn && <span className="mt-1 flex items-center gap-1 text-xs text-amber-300"><AlertTriangle className="size-3.5" /> {warn}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** ชื่อแท็บจากชื่อไฟล์ (เช่น "ไทยต้น(ปรับปรุง69).pdf" → "ไทยต้น(ปรับปรุง69)") */
function partLabel(name: string, i: number) {
  const n = name.replace(/\.pdf$/i, "").trim();
  return n.length > 0 && n.length <= 28 ? n : `ส่วนที่ ${i + 1}`;
}
