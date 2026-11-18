import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Award, CheckCircle2, CircleDashed, FileDown, Loader2, MonitorPlay, Plus, Printer, ShieldCheck, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useSourceDocuments } from "../api";
import { formatLocator, SourcePdfLink } from "../components";
import { catKey, saveCriterion, setCategory, setEvidence, useCategoryData, verifyCriterion, type CategoryData, type Criterion } from "./api";
import { CATEGORIES, classify, criterionResult, EVIDENCE_LABEL, STAGE_LABEL, STRENGTH_LABEL, type Candidate, type Category, type EvidenceResult, type EvidenceRow, type Strength } from "./classify";
import { CriteriaImport } from "./CriteriaImport";
import { LocalAnalysis } from "./LocalAnalysis";
import { exportCategoryReport } from "./report";

const STATUS_LABEL = { proposed: "รอตรวจความสอดคล้อง", confirmed: "ผู้ดูแลยืนยันแล้ว", rejected: "ไม่เกี่ยวข้อง (ตรวจแล้ว)" } as const;
const EV_TONE: Record<EvidenceResult, string> = {
  direct: "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]", partial: "bg-[var(--tone-orange-bg)] text-[var(--tone-orange-fg)]",
  pending: "bg-[var(--tone-blue-bg)] text-[var(--tone-blue-fg)]", none: "bg-muted text-muted-foreground",
};
export function EvBadge({ r }: { r: EvidenceResult }) {
  const I = r === "direct" ? CheckCircle2 : r === "partial" ? CircleDashed : r === "pending" ? CircleDashed : XCircle;
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", EV_TONE[r])}><I className="size-3.5" aria-hidden="true" />{EVIDENCE_LABEL[r]}</span>;
}
const LOC_RE = /^pdf:[1-9][0-9]*$/;

/** ส่วน “ประเภทหลักสูตรและเกณฑ์ประเมิน” ในหน้าภาพรวมหลักสูตร */
export function CategorySection({ versionId, versionLabel }: { versionId: string; versionLabel: string }) {
  const data = useCategoryData(versionId);
  const { can } = useAuth();
  const admin = can("curriculum.manage");
  const [cat, setCat] = useState<Category>("vocational");
  const [present, setPresent] = useState(false);
  const cands = useMemo(() => (data.data ? classify(data.data) : []), [data.data]);
  if (data.isPending) return <Shell><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> กำลังจัดหมวดจากข้อมูลหลักสูตร…</p></Shell>;
  if (data.error || !data.data) return <Shell><p role="alert" className="text-sm text-destructive">{dbErrorMessage(data.error)}</p></Shell>;
  const d = data.data;
  const inCat = cands.filter((c) => c.category === cat);
  const crit = d.criteria.filter((c) => c.categories.includes(cat));
  return (
    <Shell actions={<>
      <Button size="sm" variant="outline" onClick={() => exportCategoryReport("word", versionLabel, d, cands)}><FileDown /> Word</Button>
      <Button size="sm" variant="outline" onClick={() => exportCategoryReport("pdf", versionLabel, d, cands)}><Printer /> PDF</Button>
      <Button size="sm" onClick={() => setPresent(true)}><MonitorPlay /> โหมดนำเสนอ</Button>
    </>}>
      {!d.installed && (
        <p role="note" className="mb-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          ระบบบันทึกผลการตรวจ/ทะเบียนเกณฑ์ยังไม่ได้ติดตั้งบนฐานข้อมูลนี้ (รอผู้ดูแลอนุมัติและรัน migration <code>20261203000100</code>) — ตอนนี้แสดงข้อเสนอการจัดหมวดจากข้อมูลจริงได้ แต่ยังยืนยัน/บันทึกเกณฑ์ไม่ได้
        </p>
      )}
      <LocalAnalysis versionId={versionId} data={d} />
      <details className="mt-4 rounded-2xl border p-3 sm:p-4">
        <summary className="cursor-pointer font-semibold">รายละเอียดรายหมวดและเกณฑ์ประเมิน (สำหรับฝ่ายวิชาการ)</summary>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">ดูข้อเสนอการจัดหมวดทั้ง 5 ประเภท และนำเข้าเกณฑ์ระดับ 5 จาก PDF ต้นฉบับ — ปกติไม่ต้องจัดการทีละรายการ</p>
      <div role="tablist" aria-label="ประเภทหลักสูตร" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {CATEGORIES.map((c) => {
            const items = cands.filter((x) => x.category === c.key);
            const ok = items.filter((x) => x.status === "confirmed").length;
            return (
              <button key={c.key} type="button" role="tab" aria-selected={cat === c.key} onClick={() => setCat(c.key)}
                className={cn("min-h-16 rounded-xl border px-3 py-2 text-left shadow-card transition-colors", cat === c.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40")}>
                <span className="block text-sm font-semibold leading-snug">{c.label}</span>
                <span className={cn("block text-xs", cat === c.key ? "text-primary-foreground/85" : "text-muted-foreground")}>{items.length} รายการ · ยืนยันแล้ว {ok} · เกณฑ์ {d.criteria.filter((k) => k.categories.includes(c.key)).length}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <ItemsPanel items={inCat} cat={cat} versionId={versionId} admin={admin && d.installed} />
          <CriteriaPanel crit={crit} cat={cat} data={d} items={inCat} versionId={versionId} admin={admin && d.installed} />
        </div>
      </details>
      {present && <Presentation versionLabel={versionLabel} data={d} cands={cands} onClose={() => setPresent(false)} />}
    </Shell>
  );
}

function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-labelledby="cat-h" className="mt-6 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="cat-h" className="flex items-center gap-2 text-lg font-semibold"><Award className="size-5 text-[var(--gold)]" aria-hidden="true" /> ประเภทหลักสูตรและเกณฑ์ประเมิน</h2>
          <p className="text-sm text-muted-foreground">จัดหมวดจากข้อมูลหลักสูตรจริง เชื่อมกับเกณฑ์ที่บันทึกจากเอกสารต้นฉบับ — ระบบไม่ประกาศผลระดับคุณภาพเอง</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ รายการในหมวด (มุมมองจัดเตรียมหลักฐาน)
function ItemsPanel({ items, cat, versionId, admin }: { items: Candidate[]; cat: Category; versionId: string; admin: boolean }) {
  const qc = useQueryClient();
  const [type, setType] = useState("");
  const [strength, setStrength] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(40);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = items.filter((c) => (!type || c.targetType === type) && (!strength || c.strength === strength) && (!status || c.status === status))
    .sort((a, b) => Number(a.status === "proposed") - Number(b.status === "proposed") || SRANK[b.strength] - SRANK[a.strength] || a.label.localeCompare(b.label, "th"));
  const groups = (["lower", "upper", null] as const).map((st) => ({ st, rows: rows.filter((c) => c.stage === st) })).filter((g) => g.rows.length);
  const decide = async (c: Candidate, s: "confirmed" | "rejected") => {
    const reason = window.prompt(s === "confirmed" ? "เหตุผลการจัดหมวด (เช่น ตรวจกับหลักสูตร PDF หน้า …)" : "เหตุผลที่ไม่จัดอยู่ในหมวดนี้", c.stored?.reason ?? c.reasons[0] ?? "");
    if (!reason?.trim()) return;
    setBusy(c.targetId);
    try {
      await setCategory({ versionId, category: cat, targetType: c.targetType, targetId: c.targetId, status: s, reason: reason.trim(), docId: c.sourceDocId, locator: c.locator });
      toast.success("บันทึกผลการตรวจแล้ว (ไม่เปลี่ยนข้อมูลรายวิชาทางการ)");
      await qc.invalidateQueries({ queryKey: catKey });
    } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(null); }
  };
  return (
    <div className="rounded-2xl border p-3">
      <p className="mb-2 font-semibold">รายวิชา แผนการเรียน และกิจกรรมที่เกี่ยวข้อง</p>
      <div className="mb-2 grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
        <Select aria-label="ชนิดรายการ" value={type} onChange={(e) => setType(e.target.value)}><option value="">ทุกชนิด</option><option value="program">แผนการเรียน</option><option value="subject">รายวิชา</option><option value="activity">กิจกรรม</option></Select>
        <Select aria-label="ระดับหลักฐาน" value={strength} onChange={(e) => setStrength(e.target.value)}><option value="">ทุกระดับหลักฐาน</option>{(Object.keys(STRENGTH_LABEL) as Strength[]).map((k) => <option key={k} value={k}>{STRENGTH_LABEL[k]}</option>)}</Select>
        <Select aria-label="สถานะการตรวจ" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </div>
      {!rows.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">ไม่พบรายการในหมวดนี้จากข้อมูลหลักสูตร — ผู้ดูแลเพิ่มได้หลังตรวจเอกสาร</p> : groups.map(({ st, rows: gr }) => {
        const subs = gr.filter((c) => c.targetType === "subject");
        return (
          <section key={st ?? "none"} aria-label={st ? STAGE_LABEL[st] : "ไม่ระบุช่วงชั้น"} className="mt-3 first:mt-0">
            <div className="sticky top-16 z-[1] -mx-1 rounded-lg bg-accent/90 px-2 py-1.5 backdrop-blur">
              <p className="text-sm font-semibold">{st ? STAGE_LABEL[st] : "ไม่ระบุช่วงชั้น"} · {gr.length} รายการ{subs.length ? ` · รายวิชา ${subs.length} วิชา` : ""}</p>
              {subs.length > 0 && <p className="line-clamp-2 text-xs text-muted-foreground">รหัสวิชา: {subs.map((c) => c.label.split(" ")[0]).join(", ")}</p>}
            </div>
            <ul className="divide-y">
              {gr.slice(0, limit).map((c) => <Item key={`${c.targetType}-${c.targetId}`} c={c} admin={admin} busy={busy !== null} onDecide={decide} />)}
            </ul>
          </section>
        );
      })}
      {rows.length > limit && <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 60)}>แสดงเพิ่ม ({rows.length - limit})</Button>}
    </div>
  );
}

const SRANK: Record<Strength, number> = { structural: 4, content: 3, partial: 2, keyword: 1, insufficient: 0 };
const STRENGTH_VARIANT: Record<Strength, "info" | "success" | "warning" | "secondary" | "outline"> = { structural: "info", content: "success", partial: "warning", keyword: "warning", insufficient: "outline" };
function Item({ c, admin, busy, onDecide }: { c: Candidate; admin: boolean; busy: boolean; onDecide: (c: Candidate, s: "confirmed" | "rejected") => void }) {
  return (
    <li className="space-y-1 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{c.label}</span>
        <Badge variant={c.status === "confirmed" ? "success" : c.status === "rejected" ? "outline" : "secondary"}>{STATUS_LABEL[c.status]}</Badge>
        <Badge variant={STRENGTH_VARIANT[c.strength]}>{STRENGTH_LABEL[c.strength]}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{c.sub}</p>
      <ul className="list-disc pl-5 text-xs">{(c.stored ? [c.stored.reason] : c.reasons).map((r, i) => <li key={i}>{r}</li>)}</ul>
      {c.competencies.length > 0 && (
        <details className="rounded-lg bg-muted/40 px-2 py-1 text-xs">
          <summary className="cursor-pointer font-medium">สมรรถนะที่เกี่ยวข้อง ({c.competencies.length}): {c.competencies.map((k) => k.label).join(" · ")}</summary>
          <ul className="mt-1 space-y-1">{c.competencies.map((k) => <li key={k.label}><b>{k.label}</b> — {k.evidence}</li>)}</ul>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        ที่มา: {formatLocator(c.locator)} <SourcePdfLink docId={c.sourceDocId} locator={c.locator} />
        {admin && (
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => onDecide(c, "confirmed")}><CheckCircle2 /> ยืนยันว่าอยู่ในหมวด</Button>
            <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => onDecide(c, "rejected")}><XCircle /> ไม่เกี่ยวข้อง</Button>
          </span>
        )}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ เกณฑ์ + หลักฐาน
function CriteriaPanel({ crit, cat, data, items, versionId, admin }: { crit: Criterion[]; cat: Category; data: CategoryData; items: Candidate[]; versionId: string; admin: boolean }) {
  const [adding, setAdding] = useState<"" | "one" | "import">("");
  return (
    <div className="space-y-3 rounded-2xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">เกณฑ์ประเมินที่เชื่อมโยง</p>
        {admin && <span className="flex flex-wrap gap-1">
          <Button size="sm" onClick={() => setAdding(adding === "import" ? "" : "import")}><FileDown /> นำเข้าเกณฑ์จาก PDF ต้นฉบับ</Button>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setAdding(adding === "one" ? "" : "one")}>กรอกเอง (กรณีพิเศษ)</Button>
        </span>}
      </div>
      {adding === "import" && <CriteriaImport cat={cat} existing={data.criteria} onDone={() => setAdding("")} />}
      {adding === "one" && <CriterionForm cat={cat} parents={data.criteria} onDone={() => setAdding("")} />}
      {!crit.length && (
        <div className="rounded-xl border border-dashed p-4 text-sm">
          <p className="font-medium">ยังไม่มีเกณฑ์ในทะเบียนสำหรับหมวดนี้</p>
          <p className="text-muted-foreground">ระบบไม่สร้างเกณฑ์หรือค่าขั้นต่ำเอง — ขั้นต่อไป: ลงทะเบียน PDF แบบประเมินที่หน้า “นำเข้าเอกสารหลักสูตร” แล้วกด “นำเข้าเกณฑ์จาก PDF ต้นฉบับ” ระบบจะอ่านข้อความและแยกข้อให้ตรวจก่อนบันทึก</p>
        </div>
      )}
      {crit.map((k) => <CriterionCard key={k.id} k={k} data={data} items={items} versionId={versionId} admin={admin} />)}
    </div>
  );
}

function CriterionCard({ k, data, items, versionId, admin }: { k: Criterion; data: CategoryData; items: Candidate[]; versionId: string; admin: boolean }) {
  const qc = useQueryClient();
  const ev = data.evidence.filter((e) => e.criterion_id === k.id);
  const res = criterionResult(ev);
  const [open, setOpen] = useState(false);
  const name = (e: EvidenceRow) => items.find((c) => c.targetId === e.target_id)?.label ?? (e.target_type === "source_document" ? "เอกสารหลักฐาน" : e.target_type);
  const verify = async (s: "verified" | "draft") => {
    try { await verifyCriterion(k.id, s); toast.success(s === "verified" ? "ยืนยันเกณฑ์แล้ว" : "เปลี่ยนเป็นร่างแล้ว"); await qc.invalidateQueries({ queryKey: catKey }); } catch (e) { toast.error(dbErrorMessage(e)); }
  };
  return (
    <article className="rounded-xl border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs">{k.code}</code><span className="font-medium">{k.title_th}</span>
        <Badge variant={k.status === "verified" ? "success" : "warning"}>{k.status === "verified" ? "เกณฑ์ยืนยันแล้ว" : "เกณฑ์ร่าง (ยังไม่ตรวจกับต้นฉบับ)"}</Badge>
        <EvBadge r={res} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{[k.issuer, k.edition, k.year_be && `พ.ศ. ${k.year_be}`, k.quality_level && `ระดับคุณภาพ ${k.quality_level}`].filter(Boolean).join(" · ") || "ยังไม่ระบุหน่วยงาน/ฉบับ"}</p>
      {k.requirement_th && <p className="mt-1 whitespace-pre-wrap">{k.requirement_th}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">ต้นฉบับ: {formatLocator(k.source_locator)} <SourcePdfLink docId={k.source_document_id} locator={k.source_locator} />
        {admin && (k.status === "verified" ? <Button size="sm" variant="ghost" className="h-7" onClick={() => verify("draft")}>เปลี่ยนเป็นร่าง</Button>
          : <Button size="sm" variant="outline" className="h-7" disabled={!k.source_document_id || !k.source_locator} title={!k.source_locator ? "ต้องมีเอกสารและเลขหน้าก่อน" : undefined} onClick={() => verify("verified")}><ShieldCheck /> ยืนยันเกณฑ์</Button>)}
      </div>
      <div className="mt-2 border-t pt-2">
        <p className="text-xs font-medium">หลักฐาน ({ev.length})</p>
        <ul className="mt-1 space-y-1">
          {ev.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
              <EvBadge r={e.status === "confirmed" ? e.result : e.status === "rejected" ? "none" : "pending"} /> {name(e)} · {formatLocator(e.source_locator)} <SourcePdfLink docId={e.source_document_id} locator={e.source_locator} />
              {e.note && <span className="text-muted-foreground">— {e.note}</span>}
            </li>
          ))}
          {!ev.length && <li className="text-xs text-muted-foreground">ยังไม่มีหลักฐานยืนยัน</li>}
        </ul>
        {admin && (open ? <EvidenceForm criterion={k} items={items} versionId={versionId} onDone={() => setOpen(false)} /> : <Button size="sm" variant="ghost" className="mt-1" onClick={() => setOpen(true)}><Plus /> ตรวจ/แนบหลักฐาน</Button>)}
      </div>
    </article>
  );
}

function EvidenceForm({ criterion, items, versionId, onDone }: { criterion: Criterion; items: Candidate[]; versionId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const docs = useSourceDocuments();
  const [target, setTarget] = useState("");
  const [doc, setDoc] = useState("");
  const [page, setPage] = useState("");
  const [result, setResult] = useState<EvidenceResult>("pending");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const item = items.find((c) => `${c.targetType}:${c.targetId}` === target);
  const isDoc = target === "doc";
  const docId = isDoc ? doc : item?.sourceDocId ?? null;
  const locator = page.trim() ? `pdf:${page.trim()}` : item?.locator ?? null;
  const confirmed = result === "direct" || result === "partial";
  const submit = async () => {
    if (!target || (isDoc && !doc)) { toast.error("เลือกหลักฐาน"); return; }
    if (locator && !LOC_RE.test(locator.split(";")[0]!)) { toast.error("เลขหน้าไม่ถูกต้อง"); return; }
    if (confirmed && (!docId || !locator)) { toast.error("หลักฐานตรงเกณฑ์/บางส่วนต้องมีเอกสารและเลขหน้า"); return; }
    if (result === "none" && !note.trim()) { toast.error("ระบุเหตุผลเมื่อไม่ใช่หลักฐาน"); return; }
    setBusy(true);
    try {
      await setEvidence({ criterionId: criterion.id, versionId, targetType: isDoc ? "source_document" : item!.targetType, targetId: isDoc ? doc : item!.targetId, result,
        status: result === "pending" ? "proposed" : result === "none" ? "rejected" : "confirmed", note: note.trim() || null, docId, locator });
      toast.success("บันทึกผลตรวจหลักฐานแล้ว");
      await qc.invalidateQueries({ queryKey: catKey });
      onDone();
    } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 grid gap-2 rounded-lg border p-2 sm:grid-cols-2">
      <div className="sm:col-span-2"><FormField label="หลักฐาน" htmlFor={`et-${criterion.id}`}><Select id={`et-${criterion.id}`} value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">เลือก</option><option value="doc">เอกสารหลักฐานกิจกรรมจริง (จากทะเบียนเอกสาร)</option>
        {items.filter((c) => c.status !== "rejected").slice(0, 300).map((c) => <option key={`${c.targetType}:${c.targetId}`} value={`${c.targetType}:${c.targetId}`}>{c.label}</option>)}
      </Select></FormField></div>
      {isDoc && <div className="sm:col-span-2"><FormField label="เอกสาร (ลงทะเบียน/อัปโหลดที่หน้า นำเข้าเอกสารหลักสูตร)" htmlFor={`ed-${criterion.id}`}><Select id={`ed-${criterion.id}`} value={doc} onChange={(e) => setDoc(e.target.value)}>
        <option value="">เลือกเอกสาร</option>{(docs.data ?? []).filter((x) => !x.parent_id).map((x) => <option key={x.id} value={x.id}>{x.register_code} {x.title}</option>)}</Select></FormField></div>}
      <FormField label="เลขหน้า PDF" htmlFor={`ep-${criterion.id}`}><Input id={`ep-${criterion.id}`} inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ""))} placeholder={item?.locator ?? "เช่น 120"} /></FormField>
      <FormField label="ผลการตรวจ" htmlFor={`er-${criterion.id}`}><Select id={`er-${criterion.id}`} value={result} onChange={(e) => setResult(e.target.value as EvidenceResult)}>
        {(Object.keys(EVIDENCE_LABEL) as EvidenceResult[]).map((r) => <option key={r} value={r}>{EVIDENCE_LABEL[r]}</option>)}</Select></FormField>
      <div className="sm:col-span-2"><FormField label="หมายเหตุ/เหตุผล" htmlFor={`en-${criterion.id}`}><Input id={`en-${criterion.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></FormField></div>
      <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={busy} onClick={submit}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} บันทึก</Button><Button size="sm" variant="ghost" onClick={onDone}>ยกเลิก</Button></div>
    </div>
  );
}

function CriterionForm({ cat, parents, onDone }: { cat: Category; parents: Criterion[]; onDone: () => void }) {
  const qc = useQueryClient();
  const docs = useSourceDocuments();
  const [f, setF] = useState({ code: "", title_th: "", issuer: "", edition: "", year_be: "", quality_level: "5", requirement_th: "", report_section: "", parent_id: "", source_document_id: "", page: "" });
  const [cats, setCats] = useState<Category[]>([cat]);
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof f, label: string, extra?: ReactNode) => (
    <FormField label={label} htmlFor={`cf-${k}`}>{extra ?? <Input id={`cf-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</FormField>
  );
  const submit = async () => {
    if (!f.code.trim() || !f.title_th.trim()) { toast.error("ระบุรหัสและข้อความเกณฑ์ตามต้นฉบับ"); return; }
    setBusy(true);
    try {
      await saveCriterion(null, { ...f, categories: cats, source_locator: f.page ? `pdf:${f.page}` : "", page: undefined });
      toast.success("บันทึกเกณฑ์เป็นร่างแล้ว — ตรวจกับต้นฉบับแล้วกดยืนยันเกณฑ์");
      await qc.invalidateQueries({ queryKey: catKey });
      onDone();
    } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-2">
      <p className="text-xs text-muted-foreground sm:col-span-2">คัดลอกข้อความเกณฑ์และเงื่อนไขจากแบบประเมินต้นฉบับตามจริง — ห้ามแต่งข้อความหรือค่าขั้นต่ำเพิ่ม</p>
      {field("code", "รหัสเกณฑ์ (เช่น ข้อ/ประเด็นในแบบประเมิน)")}
      {field("parent_id", "เป็นองค์ประกอบย่อยของ", <Select id="cf-parent_id" value={f.parent_id} onChange={(e) => setF({ ...f, parent_id: e.target.value })}><option value="">— เกณฑ์หลัก —</option>{parents.filter((p) => !p.parent_id).map((p) => <option key={p.id} value={p.id}>{p.code} {p.title_th.slice(0, 40)}</option>)}</Select>)}
      <div className="sm:col-span-2">{field("title_th", "ชื่อ/ข้อความเกณฑ์")}</div>
      {field("issuer", "หน่วยงานที่กำหนด")}{field("edition", "ฉบับ")}{field("year_be", "ปี พ.ศ.")}{field("quality_level", "ระดับคุณภาพ")}
      <div className="sm:col-span-2"><FormField label="เงื่อนไขที่ต้องผ่าน (ตามต้นฉบับ)" htmlFor="cf-req"><textarea id="cf-req" className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={f.requirement_th} onChange={(e) => setF({ ...f, requirement_th: e.target.value })} maxLength={4000} /></FormField></div>
      {field("report_section", "หัวข้อรายงาน", <Select id="cf-report_section" value={f.report_section} onChange={(e) => setF({ ...f, report_section: e.target.value })}><option value="">—</option>{REPORT_SECTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>)}
      <fieldset className="text-sm"><legend className="font-medium">ประเภทหลักสูตรที่เกี่ยวข้อง</legend><div className="mt-1 flex flex-wrap gap-1">{CATEGORIES.map((c) => (
        <label key={c.key} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"><input type="checkbox" checked={cats.includes(c.key)} onChange={(e) => setCats(e.target.checked ? [...cats, c.key] : cats.filter((x) => x !== c.key))} />{c.short}</label>))}</div></fieldset>
      {field("source_document_id", "เอกสารต้นฉบับของเกณฑ์", <Select id="cf-source_document_id" value={f.source_document_id} onChange={(e) => setF({ ...f, source_document_id: e.target.value })}><option value="">เลือกเอกสาร</option>{(docs.data ?? []).filter((x) => !x.parent_id).map((x) => <option key={x.id} value={x.id}>{x.register_code} {x.title}</option>)}</Select>)}
      {field("page", "เลขหน้า PDF", <Input id="cf-page" inputMode="numeric" value={f.page} onChange={(e) => setF({ ...f, page: e.target.value.replace(/\D/g, "") })} />)}
      <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={busy} onClick={submit}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} บันทึกเป็นร่าง</Button><Button size="sm" variant="ghost" onClick={onDone}>ยกเลิก</Button></div>
    </div>
  );
}
export const REPORT_SECTIONS: [string, string][] = [
  ["structure", "หลักสูตรสถานศึกษาและโครงสร้างเวลาเรียน"], ["vocational", "หลักสูตรสมรรถนะอาชีพ ม.ต้น/ม.ปลาย"], ["local", "หลักสูตรท้องถิ่นและแหล่งเรียนรู้"],
  ["activities", "กิจกรรมพัฒนาผู้เรียน"], ["graduation", "เกณฑ์การจบการศึกษา"], ["community", "การมีส่วนร่วมของชุมชน"],
];

// ------------------------------------------------------------------ โหมดนำเสนอ (เฉพาะหลักฐานที่ยืนยันแล้ว)
function Presentation({ versionLabel, data, cands, onClose }: { versionLabel: string; data: CategoryData; cands: Candidate[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const c = CATEGORIES[i]!;
  const ok = cands.filter((x) => x.category === c.key && x.status === "confirmed");
  const crit = data.criteria.filter((k) => k.categories.includes(c.key) && k.status === "verified");
  return (
    <div role="dialog" aria-modal="true" aria-label="โหมดนำเสนอ" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{versionLabel} · โหมดนำเสนอ (แสดงเฉพาะข้อมูลที่ฝ่ายวิชาการยืนยันแล้ว)</p>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}><X /> ปิด</Button>
        </div>
        <div className="mb-6 flex flex-wrap gap-2">{CATEGORIES.map((x, n) => <Button key={x.key} size="sm" variant={n === i ? "default" : "outline"} onClick={() => setI(n)}>{x.short}</Button>)}</div>
        <h2 className="text-2xl font-bold sm:text-3xl">{c.label}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-card">
            <p className="text-lg font-semibold">หลักสูตรและกิจกรรมของโรงเรียน ({ok.length})</p>
            <ul className="mt-2 space-y-2">{ok.slice(0, 30).map((x) => <li key={x.targetId}><p className="font-medium">{x.label}</p><p className="text-sm text-muted-foreground">{x.stored?.reason} · {formatLocator(x.locator)}</p></li>)}
              {!ok.length && <li className="text-muted-foreground">ยังไม่มีรายการที่ยืนยันแล้ว</li>}</ul>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-card">
            <p className="text-lg font-semibold">เกณฑ์และหลักฐาน</p>
            <ul className="mt-2 space-y-3">{crit.map((k) => {
              const ev = data.evidence.filter((e) => e.criterion_id === k.id && e.status === "confirmed");
              return <li key={k.id}><p className="font-medium">{k.code} {k.title_th}</p><EvBadge r={criterionResult(ev)} />
                <ul className="mt-1 text-sm text-muted-foreground">{ev.map((e) => <li key={e.id}>• {cands.find((x) => x.targetId === e.target_id)?.label ?? "เอกสารหลักฐาน"} ({formatLocator(e.source_locator)})</li>)}</ul></li>;
            })}{!crit.length && <li className="text-muted-foreground">ยังไม่มีเกณฑ์ที่ยืนยันแล้ว</li>}</ul>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">หมายเหตุ: ข้อมูลนี้เป็นหลักฐานประกอบการพิจารณา ไม่ใช่การประกาศผลระดับคุณภาพ</p>
      </div>
    </div>
  );
}
