import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, CloudUpload, ExternalLink, FileText, Globe, Loader2, Maximize2, Paperclip, Pencil, Presentation, RefreshCw, Search, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSourceDocuments } from "@/features/curriculum/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { isMainSite } from "@/lib/env";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PdfPages, findCodePages, readPlanMeta, type CodeHit } from "../PdfPages";
import { markFile, markPlan, setFileStage, useBooks } from "../books";
import { attachExisting, attachFile, fetchBlob, libKey, normArea, openInTab, publishItem, removeItem, STAGES, STAGE_SHORT, STAGE_TEXT, useLibrary, type LibArea, type LibItem, type Library, type Stage, type Target } from "../library";
import { gradeWarning, planTitle } from "../plans";

/**
 * นำเสนอเล่มหลักสูตร: กดปุ่ม → เปิดเล่ม (PDF) เต็มจอ
 * ที่เก็บถาวร: ไฟล์ใน Cloudflare R2 · ตำแหน่ง/กลุ่มสาระ/ระดับใน Supabase — เปิดจากเครื่องหรือลิงก์ใดก็เห็นชุดเดียวกัน
 * แต่ละกลุ่มสาระแยกเล่ม ม.ต้น / ม.ปลาย · สิทธิ์แก้ไขบังคับที่ฐานข้อมูล
 */
/** ข้อความจาก RPC ของเรา (ภาษาไทย) ใช้ตรง ๆ — ที่เหลือแปลด้วย dbErrorMessage */
const errText = (e: unknown) => {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && /[ก-๙]/.test(m) ? m : dbErrorMessage(e);
};
const dateTh = (s: string) => new Date(s).toLocaleDateString("th-TH", { dateStyle: "medium" });
const pill = "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold";
const cardBg = { background: "linear-gradient(135deg, #1f4278 0%, #142b4e 100%)" };

function useActions() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label);
    try { await fn(); if (ok) toast.success(ok); await qc.invalidateQueries({ queryKey: libKey }); return true; }
    catch (e) { toast.error(errText(e)); return false; }
    finally { setBusy(null); }
  };
  return { busy, run };
}
type Run = ReturnType<typeof useActions>["run"];

export function PresentPage() {
  const lib = useLibrary();
  const { can } = useAuth();
  // แนบ/แก้ไขเอกสารทำได้เฉพาะบนเว็บหลัก — ลิงก์ทดสอบ (Preview) ดูได้อย่างเดียว
  const main = isMainSite();
  const canEdit = main && can("curriculum.edit");
  const canAdmin = main && can("curriculum.manage");
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState<{ areaId: string | null; start: number } | null>(null);
  const { busy, run } = useActions();
  const data = lib.data;
  const school = data?.items.filter((i) => i.kind === "school_book") ?? [];
  const viewerBooks = open ? (open.areaId ? STAGES.flatMap((s) => data?.items.filter((i) => i.kind === "area_book" && i.learning_area_id === open.areaId && i.stage === s) ?? []) : school) : [];
  const viewerPlans = open?.areaId ? data?.items.filter((i) => i.kind === "lesson_plan" && i.learning_area_id === open.areaId) ?? [] : [];

  return (
    <>
      <PageHeader icon={Presentation} title="นำเสนอเล่มหลักสูตร" description="กดปุ่มเพื่อเปิดเล่มเต็มจอ · แต่ละกลุ่มสาระแยกเล่ม ม.ต้น / ม.ปลาย · ไฟล์เก็บในระบบถาวร เปิดได้จากทุกเครื่อง"
        actions={canEdit && data?.installed ? <Button variant={edit ? "default" : "outline"} onClick={() => setEdit((v) => !v)}><Pencil /> {edit ? "เสร็จสิ้นการจัดเล่ม" : "จัดการเล่ม / แนบไฟล์"}</Button> : undefined} />
      {busy && <p role="status" className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"><Loader2 className="size-4 animate-spin" /> {busy}</p>}
      {lib.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        : lib.isError || !data ? <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">โหลดรายการเล่มไม่สำเร็จ: {errText(lib.error)}</p>
        : !data.installed ? <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">ฐานข้อมูลนี้ยังไม่ได้ติดตั้ง migration <code>20261209000100_presentation_items</code> — ผู้ดูแลระบบต้องรันใน SQL Editor ก่อน จึงจะเก็บเล่มแบบถาวรได้</p>
        : (
          <div className="space-y-6">
            {canEdit && <LegacyPanel lib={data} run={run} busy={!!busy} />}
            <div className="grid gap-4 sm:grid-cols-2">
              {edit ? <SchoolEdit items={school} run={run} busy={!!busy} canAdmin={canAdmin} /> : <SchoolCard items={school} onOpen={(start) => setOpen({ areaId: null, start })} />}
            </div>
            <section aria-label="หลักสูตรรายวิชา">
              <h2 className="mb-3 text-xl font-bold">หลักสูตรรายวิชา <span className="text-base font-normal text-muted-foreground">· แยกตามกลุ่มสาระ ม.ต้น / ม.ปลาย พร้อมแผนการจัดการเรียนรู้</span></h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.areas.map((a) => {
                  const items = data.items.filter((i) => i.learning_area_id === a.id);
                  return edit ? <AreaEdit key={a.id} area={a} items={items} run={run} busy={!!busy} canAdmin={canAdmin} />
                    : <AreaCard key={a.id} area={a} items={items} onOpen={(start) => setOpen({ areaId: a.id, start })} />;
                })}
                {!data.areas.length && <p className="text-sm text-muted-foreground">ยังไม่มีกลุ่มสาระในข้อมูลพื้นฐาน</p>}
              </div>
            </section>
          </div>
        )}
      {open && <Viewer title={open.areaId ? data?.areas.find((a) => a.id === open.areaId)?.name_th ?? "" : "หลักสูตรสถานศึกษา"} books={viewerBooks} plans={viewerPlans} start={open.start} onClose={() => setOpen(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ การ์ด (โหมดดู)
function SchoolCard({ items, onOpen }: { items: LibItem[]; onOpen: (start: number) => void }) {
  return (
    <button type="button" disabled={!items.length} onClick={() => onOpen(0)} aria-label="เปิดเล่ม หลักสูตรสถานศึกษา"
      className="group relative flex min-h-48 flex-col justify-end overflow-hidden rounded-3xl p-6 text-left text-white shadow-lg transition-transform enabled:hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-[color:var(--gold)]" style={cardBg}>
      <BookOpen className="absolute right-4 top-4 size-14 text-[color:var(--gold)] opacity-90" aria-hidden="true" />
      <span className="text-2xl font-bold leading-tight sm:text-3xl">หลักสูตรสถานศึกษา</span>
      <span className="mt-1 text-sm text-white/80">เล่มหลักสูตรโรงเรียน</span>
      <span className={cn(pill, "mt-3", items.length ? "bg-[color:var(--gold)] text-[#142b4e]" : "border border-white/40 font-medium text-white/80")}>
        {items.length ? <>เปิดเล่ม{items.length > 1 ? ` (${items.length} ส่วน)` : ""}</> : "ยังไม่มีเล่ม"}
      </span>
    </button>
  );
}
function AreaCard({ area, items, onOpen }: { area: LibArea; items: LibItem[]; onOpen: (start: number) => void }) {
  const books = STAGES.map((s) => items.find((i) => i.kind === "area_book" && i.stage === s));
  const present = books.filter(Boolean) as LibItem[];
  const plans = items.filter((i) => i.kind === "lesson_plan");
  return (
    <div className="relative flex min-h-28 flex-col justify-end overflow-hidden rounded-2xl p-4 text-white shadow-lg" style={cardBg}>
      <BookOpen className="absolute right-4 top-4 size-8 text-[color:var(--gold)] opacity-90" aria-hidden="true" />
      <span className="pr-10 text-lg font-bold leading-tight">{area.name_th}</span>
      <span className="mt-3 flex flex-wrap gap-1.5">
        {STAGES.map((s, k) => books[k]
          ? <button key={s} type="button" onClick={() => onOpen(present.indexOf(books[k]!))} aria-label={`เปิดเล่ม ${area.name_th} ${STAGE_SHORT[s]}`} className={cn(pill, "bg-[color:var(--gold)] text-[#142b4e] hover:brightness-105")}><BookOpen className="size-4" /> {STAGE_SHORT[s]}</button>
          : <span key={s} className={cn(pill, "border border-white/30 font-medium text-white/60")}>{STAGE_SHORT[s]} · ยังไม่มี</span>)}
        {plans.length > 0 && <button type="button" onClick={() => onOpen(-1)} className={cn(pill, "bg-white/15 font-medium")}><FileText className="size-4" /> แผนการสอน {plans.length} แผน</button>}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ การ์ด (โหมดจัดการ)
function FilePick({ label, multiple, disabled, onFiles, primary }: { label: ReactNode; multiple?: boolean; disabled?: boolean; onFiles: (f: File[]) => void; primary?: boolean }) {
  return (
    <label className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs", primary ? "bg-primary text-primary-foreground" : "border hover:bg-muted", disabled && "pointer-events-none opacity-50")}>
      {label}<input type="file" accept="application/pdf,.pdf" multiple={multiple} disabled={disabled} className="sr-only" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) onFiles(f); }} />
    </label>
  );
}
function ItemRow({ item, label, run, busy, canAdmin, replaceTarget }: { item: LibItem; label: string; run: Run; busy: boolean; canAdmin: boolean; replaceTarget?: Target }) {
  const remove = () => { const r = window.prompt(`เหตุผลที่นำ “${item.title}” ออก (ไฟล์ยังอยู่ในระบบ ไม่ถูกลบ)`); if (r?.trim()) void run("กำลังนำออก…", () => removeItem(item.id, r.trim()), "นำออกจากหน้านำเสนอแล้ว"); };
  return (
    <li className="rounded-lg bg-muted/50 px-2 py-1.5 text-sm">
      <p className="flex items-center gap-2"><span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-xs font-semibold">{label}</span><span className="min-w-0 flex-1 truncate" title={item.doc.title}>{item.doc.title}</span></p>
      <p className="mt-0.5 text-xs text-muted-foreground">{item.doc.register_code}{item.doc.page_count ? ` · ${item.doc.page_count} หน้า` : ""} · ปรับปรุง {dateTh(item.created_at)}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5">
        {item.published ? <span className="inline-flex items-center gap-1 text-xs text-[var(--tone-green-fg)]"><CheckCircle2 className="size-4" /> เผยแพร่แล้ว</span>
          : canAdmin && item.kind !== "lesson_plan" && <button type="button" disabled={busy} onClick={() => void run("กำลังเผยแพร่…", () => publishItem(item), "เผยแพร่บนหน้าเยี่ยมชมแล้ว")} className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted disabled:opacity-50"><Globe className="size-3.5" /> เผยแพร่</button>}
        {replaceTarget && !item.published && <FilePick disabled={busy} label={<><RefreshCw className="size-3.5" /> เปลี่ยนไฟล์</>} onFiles={([f]) => void run(`กำลังอัปโหลด ${f!.name}…`, () => attachFile(f!, f!.name, { ...replaceTarget, replace: true }), "เปลี่ยนไฟล์แล้ว (ไฟล์เดิมยังอยู่ในทะเบียนเอกสาร)")} />}
        {!item.published && <button type="button" disabled={busy} onClick={remove} aria-label={`นำ ${item.title} ออก`} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="size-3.5" /> นำออก</button>}
      </p>
    </li>
  );
}
/** เลือกเอกสาร PDF ที่อยู่ในระบบแล้ว (ไม่ต้องอัปโหลดซ้ำ) — เฉพาะผู้ดูแลหลักสูตร */
function ExistingPick({ onPick, disabled }: { onPick: (docId: string) => void; disabled: boolean }) {
  const docs = useSourceDocuments();
  const list = (docs.data ?? []).filter((d) => d.file_id && d.status !== "archived" && d.doc_type !== "structure_workbook");
  if (!list.length) return null;
  return (
    <select aria-label="เลือกจากเอกสารในระบบ" value="" disabled={disabled} onChange={(e) => e.target.value && onPick(e.target.value)} className="h-8 max-w-full rounded-md border bg-background px-1 text-xs">
      <option value="">หรือเลือกจากเอกสารในระบบ…</option>
      {list.map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}
    </select>
  );
}
function SchoolEdit({ items, run, busy, canAdmin }: { items: LibItem[]; run: Run; busy: boolean; canAdmin: boolean }) {
  const t = (title: string): Target => ({ kind: "school_book", areaId: null, stage: null, title });
  return (
    <div className="space-y-2 rounded-3xl border bg-card p-4 shadow-card">
      <p className="text-lg font-semibold">หลักสูตรสถานศึกษา</p>
      <ul className="space-y-1.5">{items.map((i, k) => <ItemRow key={i.id} item={i} label={`ส่วนที่ ${k + 1}`} run={run} busy={busy} canAdmin={canAdmin} />)}{!items.length && <li className="text-sm text-muted-foreground">ยังไม่มีเล่ม</li>}</ul>
      {canAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <FilePick primary multiple disabled={busy} label={<><Paperclip className="size-4" /> แนบไฟล์ PDF</>} onFiles={(fs) => void (async () => { for (const f of fs) if (!(await run(`กำลังอัปโหลด ${f.name}…`, () => attachFile(f, f.name, t(f.name.replace(/\.pdf$/i, ""))), `แนบ ${f.name} แล้ว`))) break; })()} />
          <ExistingPick disabled={busy} onPick={(id) => void run("กำลังผูกเอกสาร…", () => attachExisting(id, t("หลักสูตรสถานศึกษา")), "ผูกเอกสารแล้ว")} />
        </div>
      ) : <p className="text-xs text-muted-foreground">เฉพาะผู้ดูแลหลักสูตรจัดการเล่มหลักสูตรสถานศึกษาได้</p>}
    </div>
  );
}
function AreaEdit({ area, items, run, busy, canAdmin }: { area: LibArea; items: LibItem[]; run: Run; busy: boolean; canAdmin: boolean }) {
  const plans = items.filter((i) => i.kind === "lesson_plan");
  const bookT = (s: Stage): Target => ({ kind: "area_book", areaId: area.id, stage: s, title: `${area.name_th} ${STAGE_SHORT[s]}` });
  const addPlans = async (fs: File[]) => {
    for (const f of fs) {
      const meta = await readPlanMeta(f).catch(() => ({}));
      if (!(await run(`กำลังอัปโหลดแผน ${f.name}…`, () => attachFile(f, f.name, { kind: "lesson_plan", areaId: area.id, stage: null, title: planTitle(meta, f.name), meta }), `แนบแผน ${f.name} แล้ว`))) break;
    }
  };
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-card">
      <p className="font-semibold">{area.name_th}</p>
      <ul className="space-y-1.5">
        {STAGES.map((s) => {
          const it = items.find((i) => i.kind === "area_book" && i.stage === s);
          return it ? <ItemRow key={s} item={it} label={STAGE_SHORT[s]} run={run} busy={busy} canAdmin={canAdmin} replaceTarget={bookT(s)} /> : (
            <li key={s} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-2 py-1.5 text-sm">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{STAGE_SHORT[s]}</span>
              <FilePick primary disabled={busy} label={<><Paperclip className="size-3.5" /> แนบ {STAGE_TEXT[s]}</>} onFiles={([f]) => void run(`กำลังอัปโหลด ${f!.name}…`, () => attachFile(f!, f!.name, bookT(s)), `แนบ ${area.name_th} ${STAGE_SHORT[s]} แล้ว`)} />
              {canAdmin && <ExistingPick disabled={busy} onPick={(id) => void run("กำลังผูกเอกสาร…", () => attachExisting(id, bookT(s)), "ผูกเอกสารแล้ว")} />}
            </li>
          );
        })}
        {plans.map((p) => <ItemRow key={p.id} item={p} label="แผน" run={run} busy={busy} canAdmin={canAdmin} />)}
      </ul>
      <FilePick multiple disabled={busy} label={<><FileText className="size-3.5" /> แนบแผนการสอน (PDF)</>} onFiles={(fs) => void addPlans(fs)} />
    </div>
  );
}

// ------------------------------------------------------------------ ย้ายไฟล์เดิมที่ค้างในเบราว์เซอร์ขึ้นระบบ
/** ไฟล์ที่เคยแนบแบบเดิมอยู่ใน IndexedDB ของเบราว์เซอร์นี้ (ผูกกับลิงก์นี้) → อัปโหลดขึ้น R2 + บันทึกในฐานข้อมูล · ไม่ลบไฟล์เดิม · ไม่เดาระดับ/กลุ่มสาระ */
function LegacyPanel({ lib, run, busy }: { lib: Library; run: Run; busy: boolean }) {
  const { books, plans, loaded } = useBooks();
  const [areaPick, setAreaPick] = useState<Record<string, string>>({});
  const areaOf = (title: string) => lib.areas.find((a) => normArea(a.name_th) === normArea(title))?.id ?? null;
  const rows = useMemo(() => [
    ...books.flatMap((b) => b.files.map((f, i) => ({ key: `${b.id}/${i}`, name: f.name, size: f.size, blob: f.blob, done: !!f.itemId, subject: b.group === "subject", bookId: b.id, index: i, bookTitle: b.title, stage: f.stage ?? null, plan: null as null | (typeof plans)[number] }))),
    ...plans.map((p) => ({ key: `plan/${p.id}`, name: p.name, size: p.size, blob: p.blob, done: !!p.itemId, subject: true, bookId: p.bookId ?? "", index: -1, bookTitle: books.find((b) => b.id === p.bookId)?.title ?? "", stage: null, plan: p })),
  ], [books, plans]);
  const todo = rows.filter((r) => !r.done);
  if (!loaded || !rows.length || !todo.length) return rows.length && !todo.length ? <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">ไฟล์เดิมในเบราว์เซอร์นี้ย้ายขึ้นระบบครบแล้ว ({rows.length} ไฟล์)</p> : null;

  const target = (r: (typeof rows)[number]): Target | string => {
    if (!r.subject) return { kind: "school_book", areaId: null, stage: null, title: r.name.replace(/\.pdf$/i, "") };
    const areaId = areaPick[r.key] || areaOf(r.bookTitle);
    if (!areaId) return "เลือกกลุ่มสาระ";
    const area = lib.areas.find((a) => a.id === areaId)!;
    if (r.plan) return { kind: "lesson_plan", areaId, stage: null, title: planTitle(r.plan.meta, r.name), meta: r.plan.meta };
    if (!r.stage) return "เลือกระดับ";
    // ช่องที่มีเล่มอยู่แล้วไม่ทับ และไม่อัปโหลดซ้ำ (ฐานข้อมูลบังคับซ้ำอีกชั้น)
    if (lib.items.some((i) => i.kind === "area_book" && i.learning_area_id === areaId && i.stage === r.stage)) return `${STAGE_SHORT[r.stage]} ของ${area.name_th}มีเล่มในระบบแล้ว — ไม่ทับ`;
    return { kind: "area_book", areaId, stage: r.stage, title: `${area.name_th} ${STAGE_SHORT[r.stage]}` };
  };
  const move = (r: (typeof rows)[number]) => {
    const t = target(r);
    if (typeof t === "string") return Promise.resolve(false);
    return run(`กำลังย้าย ${r.name} ขึ้นระบบ…`, async () => { const id = await attachFile(r.blob, r.name, t); if (r.plan) markPlan(r.plan.id, id); else markFile(r.bookId, r.index, { itemId: id }); }, `ย้าย ${r.name} ขึ้นระบบแล้ว`);
  };
  const ready = todo.filter((r) => typeof target(r) !== "string");
  return (
    <section aria-label="ไฟล์เดิมในเบราว์เซอร์นี้" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
      <h2 className="flex items-center gap-2 font-semibold"><CloudUpload className="size-5" /> พบไฟล์เดิมในเบราว์เซอร์นี้ {todo.length} ไฟล์ ที่ยังไม่ได้เก็บในระบบถาวร</h2>
      <p className="mt-1 text-sm text-muted-foreground">ไฟล์ชุดนี้เห็นได้เฉพาะเครื่องนี้และลิงก์นี้ — กดย้ายขึ้นระบบเพื่อให้เปิดได้จากทุกเครื่อง (ไฟล์เดิมในเบราว์เซอร์ไม่ถูกลบ · ช่องที่มีเล่มอยู่แล้วจะไม่ถูกทับ)</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {todo.map((r) => {
          const t = target(r);
          return (
            <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-background/70 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate" title={r.name}>{r.name} <span className="text-xs text-muted-foreground">({(r.size / 1048576).toFixed(1)} MB · {r.plan ? "แผนการสอน" : r.subject ? r.bookTitle : "เล่มหลักสูตรสถานศึกษา"})</span></span>
              {r.subject && !areaOf(r.bookTitle) && (
                <select aria-label={`กลุ่มสาระของ ${r.name}`} value={areaPick[r.key] ?? ""} onChange={(e) => setAreaPick((m) => ({ ...m, [r.key]: e.target.value }))} className="h-8 rounded-md border border-amber-500 bg-background px-1 text-xs">
                  <option value="">— เลือกกลุ่มสาระ —</option>{lib.areas.map((a) => <option key={a.id} value={a.id}>{a.name_th}</option>)}
                </select>
              )}
              {r.subject && !r.plan && (
                <select aria-label={`ระดับของ ${r.name}`} value={r.stage ?? ""} onChange={(e) => setFileStage(r.bookId, r.index, (e.target.value || undefined) as Stage | undefined)} className={cn("h-8 rounded-md border bg-background px-1 text-xs", !r.stage && "border-amber-500")}>
                  <option value="">— เลือกระดับ —</option>{STAGES.map((s) => <option key={s} value={s}>{STAGE_TEXT[s]}</option>)}
                </select>
              )}
              {typeof t === "string" ? <span className="text-xs text-amber-700 dark:text-amber-300">{t}</span>
                : <Button size="sm" disabled={busy} onClick={() => void move(r)}><CloudUpload /> ย้ายขึ้นระบบ</Button>}
            </li>
          );
        })}
      </ul>
      {ready.length > 1 && <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void (async () => { for (const r of ready) await move(r); })()}><CloudUpload /> ย้ายทั้งหมดที่พร้อม ({ready.length} ไฟล์)</Button>}
    </section>
  );
}

// ------------------------------------------------------------------ ตัวเปิดเล่ม
type View = { kind: "part"; i: number } | { kind: "plans" } | { kind: "plan"; id: string };
function useBlob(fileId: string | null | undefined) {
  const [s, setS] = useState<{ blob?: Blob; err?: string }>({});
  useEffect(() => {
    if (!fileId) { setS({}); return; }
    let alive = true; setS({});
    fetchBlob(fileId).then((blob) => alive && setS({ blob }), (e) => alive && setS({ err: errText(e) }));
    return () => { alive = false; };
  }, [fileId]);
  return s;
}
const meta = (p: LibItem) => p.meta ?? {};

function Viewer({ title, books, plans, start, onClose }: { title: string; books: LibItem[]; plans: LibItem[]; start: number; onClose: () => void }) {
  const [view, setView] = useState<View>(start < 0 || !books.length ? { kind: "plans" } : { kind: "part", i: Math.min(start, books.length - 1) });
  const [pages, setPages] = useState(0);
  const [jump, setJump] = useState("");
  const [goTo, setGoTo] = useState<{ page: number; at: number } | undefined>();
  const [finding, setFinding] = useState<string | null>(null);
  const [hits, setHits] = useState<{ code: string; list: CodeHit[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const plan = view.kind === "plan" ? plans.find((p) => p.id === view.id) : undefined;
  const item = view.kind === "part" ? books[view.i] : plan;
  const { blob, err } = useBlob(view.kind === "plans" ? null : item?.doc.file_id);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const show = (v: View) => { setView(v); setPages(0); setGoTo(undefined); setJump(""); };
  const go = () => { const n = Number(jump); if (n >= 1 && n <= pages) setGoTo({ page: n, at: Date.now() }); };
  const jumpTo = (h: CodeHit) => { show({ kind: "part", i: h.part }); setGoTo({ page: h.page, at: Date.now() }); };
  const partLabel = (b: LibItem, i: number) => (b.stage ? STAGE_SHORT[b.stage] : books.length > 1 ? `ส่วนที่ ${i + 1}` : "เล่ม");
  /** เชื่อมแผน → เล่ม: หาทุกหน้าที่มีรหัสวิชาในเล่มของกลุ่มสาระนี้ เปิดหน้าคำอธิบายรายวิชาก่อน */
  const findInBook = async (code: string) => {
    setFinding(`กำลังหา ${code} ในเล่ม…`); setHits(null);
    try {
      const list = await findCodePages(await Promise.all(books.map((b) => fetchBlob(b.doc.file_id!))), code);
      if (!list.length) { setFinding(`ไม่พบรหัส ${code} ในเล่มของกลุ่มสาระนี้`); return; }
      setFinding(null); setHits({ code, list });
      jumpTo(list.find((h) => h.kind === "คำอธิบายรายวิชา") ?? list[0]!);
    } catch (e) { setFinding(errText(e)); }
  };
  const tab = (active: boolean) => cn("h-8 rounded-full px-3 text-sm", active ? "bg-[color:var(--gold)] font-semibold text-[#142b4e]" : "bg-white/10 hover:bg-white/20");
  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label={`เล่ม ${title}`} className="fixed inset-0 z-50 flex flex-col bg-[#0f1f3a]">
      <div className="flex items-center gap-1.5 px-2 py-2 text-white sm:gap-2 sm:px-3">
        <BookOpen className="hidden size-5 text-[color:var(--gold)] sm:block" />
        <span className="mr-1 max-w-[40vw] truncate font-semibold sm:mr-2 sm:max-w-none">{title}</span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] sm:gap-2">
        {(books.length > 1 || plans.length > 0) && books.map((b, i) => (
          <button key={b.id} type="button" onClick={() => show({ kind: "part", i })} title={b.doc.title} className={"shrink-0 " + tab(view.kind === "part" && view.i === i)}>{partLabel(b, i)}</button>
        ))}
        {plans.length > 0 && <button type="button" onClick={() => show({ kind: "plans" })} className={"shrink-0 " + tab(view.kind !== "part")}><FileText className="mr-1 inline size-4" />แผนการจัดการเรียนรู้ ({plans.length})</button>}
        {view.kind !== "plans" && pages > 0 && (
          <form className="flex shrink-0 items-center gap-1 text-sm" onSubmit={(e) => { e.preventDefault(); go(); }}>
            <span className="hidden text-white/70 sm:inline">ไปหน้า</span>
            <input aria-label="ไปหน้า" inputMode="numeric" value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))} placeholder="หน้า" className="h-8 w-12 rounded-md bg-white/10 px-2 text-white placeholder:text-white/40 sm:w-14" />
            <span className="text-white/70">/ {pages}</span>
          </form>
        )}
        </div>
        <span className="flex shrink-0 gap-1.5 sm:gap-2">
          {item?.doc.file_id && view.kind !== "plans" && <button type="button" onClick={() => void openInTab(item.doc.file_id!).catch((e) => toast.error(errText(e)))} className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-3 text-sm hover:bg-white/20"><ExternalLink className="size-4" /><span className="sr-only sm:not-sr-only">แท็บใหม่</span></button>}
          <button type="button" onClick={() => void box.current?.requestFullscreen?.()} className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-3 text-sm hover:bg-white/20"><Maximize2 className="size-4" /><span className="sr-only sm:not-sr-only">เต็มจอ</span></button>
          <button type="button" onClick={onClose} aria-label="ปิดเล่ม" className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-3 text-sm hover:bg-white/20"><X className="size-4" /><span className="sr-only sm:not-sr-only">ปิด</span></button>
        </span>
      </div>
      {plan && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2 text-sm text-white">
          <button type="button" onClick={() => show({ kind: "plans" })} className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-3 hover:bg-white/20"><ArrowLeft className="size-4" /> รายการแผน</button>
          <span className="font-medium">{meta(plan).code ? `${meta(plan).code} ${meta(plan).subject ?? ""} · ` : ""}{plan.title}</span>
          {meta(plan).code && books.length > 0 && <button type="button" onClick={() => void findInBook(meta(plan).code!)} className="inline-flex h-8 items-center gap-1 rounded-md bg-[color:var(--gold)] px-3 font-semibold text-[#142b4e]"><Search className="size-4" /> ดูรายวิชานี้ในเล่มหลักสูตร</button>}
        </div>
      )}
      {hits && view.kind === "part" && (
        <div role="navigation" aria-label={`หน้าที่เกี่ยวกับ ${hits.code}`} className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-t border-white/10 px-3 py-2 text-sm text-white">
          <span className="text-white/70">{hits.code} ในเล่ม:</span>
          {hits.list.map((h, k) => <button key={k} type="button" onClick={() => jumpTo(h)} className="h-7 shrink-0 rounded-full bg-white/10 px-2.5 hover:bg-white/20">{h.kind} · {books.length > 1 ? `${partLabel(books[h.part]!, h.part)} ` : ""}น.{h.page}</button>)}
          <button type="button" aria-label="ปิดแถบหน้าที่เกี่ยวข้อง" onClick={() => setHits(null)} className="ml-1 text-white/60 hover:text-white"><X className="size-4" /></button>
        </div>
      )}
      {finding && <p role="status" className="flex items-center gap-2 px-3 pb-2 text-sm text-white/80">{finding.startsWith("กำลัง") && <Loader2 className="size-4 animate-spin" />}{finding}</p>}
      <div className="flex-1 overflow-y-auto">
        {view.kind === "plans" ? <PlanList plans={plans} hasBooks={books.length > 0} onOpen={(id) => show({ kind: "plan", id })} onFind={(c) => void findInBook(c)} />
          : err ? <p className="p-6 text-white">เปิดไฟล์ไม่ได้: {err}</p>
          : blob && item ? <PdfPages key={item.id} blob={blob} onPages={setPages} goTo={goTo} />
          : item ? <p className="flex items-center gap-2 p-6 text-white"><Loader2 className="size-5 animate-spin" /> กำลังดาวน์โหลดเล่มจากระบบ…</p>
          : <p className="p-6 text-white">ยังไม่มีไฟล์</p>}
      </div>
    </div>
  );
}

/** รายการแผน จัดกลุ่มตามรหัสวิชา เรียงตามแผนที่ */
function PlanList({ plans, hasBooks, onOpen, onFind }: { plans: LibItem[]; hasBooks: boolean; onOpen: (id: string) => void; onFind: (code: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, LibItem[]>();
    for (const p of plans) { const k = meta(p).code ?? ""; m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.entries()].sort(([a], [c]) => (a || "~").localeCompare(c || "~")).map(([code, ps]) => [code, [...ps].sort((x, y) => (meta(x).planNo ?? 999) - (meta(y).planNo ?? 999))] as const);
  }, [plans]);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 text-white sm:p-6">
      {groups.map(([code, ps]) => {
        const m = meta(ps[0]!);
        return (
          <section key={code || "none"} aria-label={`รายวิชา ${code || "ไม่ระบุรหัส"}`} className="rounded-2xl bg-white/5 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{code ? `${code} ${m.subject ?? ""}` : "ไม่พบรหัสวิชาในหัวแผน"}</h3>
              {m.grade && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">ม.{m.grade} (ตามแผน)</span>}
              <span className="text-sm text-white/60">{ps.length} แผน</span>
              {code && hasBooks && <button type="button" onClick={() => onFind(code)} className="ml-auto inline-flex h-8 items-center gap-1 rounded-md bg-[color:var(--gold)] px-3 text-sm font-semibold text-[#142b4e]"><Search className="size-4" /> ดูรายวิชานี้ในเล่มหลักสูตร</button>}
            </div>
            <ul className="space-y-2">
              {ps.map((p) => {
                const pm = meta(p), warn = gradeWarning(pm);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => onOpen(p.id)} className="w-full rounded-xl bg-white/10 p-3 text-left hover:bg-white/20">
                      <span className="block font-medium">{p.title}</span>
                      <span className="block text-sm text-white/70">{[pm.unit && `หน่วยที่ ${pm.unit}`, pm.term && pm.year && `ภาคเรียนที่ ${pm.term}/${pm.year}`, pm.teacher && `ผู้สอน ${pm.teacher}`].filter(Boolean).join(" · ") || p.doc.title}</span>
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
