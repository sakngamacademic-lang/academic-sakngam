import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Check, FileSearch, Loader2, RotateCcw, ScanText, ShieldCheck, X } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { DashSection } from "@/components/dashboard";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { StorageError } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { allVersions, curriculumKey, useCurricula, useSourceDocuments, type SourceDocument } from "../api";
import {
  AI_STATUS_LABELS, commitFramework, confirmFramework, decideItems, describeValue, DOC_CLASS_LABELS, effectiveValue, FRAMEWORK_CLASSES,
  bulkAcceptable, EMPTY_FILTERS, FLAG_FILTERS, itemHistory, useAnalysisSearch, useAnalysisSummary, type HistoryRow, type ItemFilters, type SummaryRow,
  ITEM_STATUS_LABELS, ITEM_TYPE_LABELS, isActive, isStale, JOB_STATUS_LABELS, otherYears, progressText, reapStale, resumeAnalysis, startAnalysis, useAiCapability, useAnalyses,
  useComplianceReview, useFrameworkVersionsWithCounts, VERDICT_LABELS, VERDICT_ORDER,
  type AnalysisItem, type DocumentAnalysis, type ItemStatus, type ReviewRow, type Verdict,
} from "../analysis-api";
import { CurriculumNav, formatLocator, SourcePdfLink } from "../components";

const TARGET_YEAR = 2569;
const errMsg = (e: unknown) => (e instanceof StorageError ? e.message : dbErrorMessage(e));
const ITEM_TONE: Record<ItemStatus, BadgeProps["variant"]> = {
  extracted: "secondary", insufficient: "warning", duplicate: "outline", accepted: "success", rejected: "destructive", committed: "success",
};
const VERDICT_TONE: Record<Verdict, BadgeProps["variant"]> = { pass: "success", fail: "destructive", insufficient_data: "secondary", conflict_pending: "warning" };

/**
 * วิเคราะห์เอกสารอัตโนมัติ: อัปโหลด → ระบบอ่าน/จำแนก/สกัด (เบื้องหลัง) → ผู้ดูแลตรวจเทียบต้นฉบับ → ยืนยันเข้ากรอบแกนกลาง → เปรียบเทียบหลักสูตร 2569
 * การอ่านเอกสารไม่ใช่การอนุมัติ — ทุกการยืนยันทำโดยผู้ดูแลหลักสูตร (academic_head) และบันทึก Audit Log
 */
export function AnalysisPage() {
  const { can } = useAuth();
  const canManage = can("curriculum.manage");
  const qc = useQueryClient();
  const sources = useSourceDocuments();
  const analyses = useAnalyses();
  const ai = useAiCapability();
  const [allowAi, setAllowAi] = useState(false);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: curriculumKey });
  // งานที่ค้าง (เช่น Edge Function ถูกหยุดเพราะเกิน CPU) → แสดงเป็น failed พร้อมเหตุผล เมื่อเปิดหน้านี้
  const hasStale = analyses.data?.some((a) => isStale(a)) ?? false;
  useEffect(() => {
    if (!hasStale) return;
    reapStale().then((n) => { if (n > 0) void refresh(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStale]);

  const latestByDoc = useMemo(() => {
    const m = new Map<string, DocumentAnalysis>();
    for (const a of analyses.data ?? []) if (!m.has(a.source_document_id)) m.set(a.source_document_id, a);
    return m;
  }, [analyses.data]);
  const withFile = (sources.data ?? []).filter((d) => d.file_id);
  const current = analyses.data?.find((a) => a.id === selected) ?? null;
  const currentDoc = sources.data?.find((d) => d.id === current?.source_document_id);
  const aiEnabled = ai.data?.ai.enabled === true;

  const resume = async (a: DocumentAnalysis) => {
    setBusyDoc(a.source_document_id);
    try {
      await resumeAnalysis(a.id);
      toast.success("สั่งทำต่อจากหน้าที่ค้างแล้ว — ทำงานเบื้องหลัง");
      setSelected(a.id);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyDoc(null);
      await refresh();
    }
  };

  const run = async (d: SourceDocument) => {
    setBusyDoc(d.id);
    try {
      const r = await startAnalysis(d.id, aiEnabled && allowAi);
      toast.success(`เริ่มวิเคราะห์ ${d.register_code} แล้ว — ทำงานเบื้องหลัง ใช้หน้าเว็บต่อได้`);
      setSelected(r.analysisId);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyDoc(null);
      await refresh();
    }
  };

  return (
    <>
      <PageHeader title="วิเคราะห์เอกสารหลักสูตร (อัตโนมัติ)"
        description="ระบบอ่าน จำแนก และสกัดข้อมูลพร้อมหน้า PDF/เซลล์อ้างอิง — ผลวิเคราะห์ยังไม่ใช่ข้อมูลที่อนุมัติ ผู้ดูแลหลักสูตรต้องตรวจและยืนยันทุกครั้ง" />
      <CurriculumNav />

      <DashSection id="ai" title={<span className="flex items-center gap-2"><Bot className="size-4" /> ความสามารถที่เปิดใช้</span>}>
        <ul className="space-y-1 text-sm">
          <li><Badge variant="success">ใช้งานได้</Badge> อ่าน PDF (ข้อความ) / Excel · จำแนกประเภท · สกัดปี กลุ่มสาระ ระดับชั้น มาตรฐาน ตัวชี้วัด รายวิชา หน่วยกิต ชั่วโมง เวลาเรียน แผนการเรียน (rule-based)</li>
          <li>
            {ai.isPending ? <Badge variant="outline">กำลังตรวจ…</Badge> : aiEnabled ? <Badge variant="success">AI เปิดใช้</Badge> : <Badge variant="secondary">AI ยังไม่เปิดใช้</Badge>}{" "}
            {aiEnabled ? `ช่วยจำแนกประเภทเมื่อระบบไม่มั่นใจ (${ai.data?.ai.model}) — ส่งเฉพาะข้อความบางหน้า ไม่ส่งไฟล์` : ai.data?.ai.reason ?? (ai.error ? "ตรวจสถานะ AI ไม่ได้ (ฟังก์ชันอาจยังไม่ได้ติดตั้ง)" : "")}
          </li>
          {ai.data && (
            <li>
              {ai.data.version ? <Badge variant="success">Edge Function {ai.data.version}</Badge> : <Badge variant="destructive">Edge Function รุ่นเดิม</Badge>}{" "}
              {ai.data.version ? "อ่าน PDF แบบแบ่งรอบ มี checkpoint ทำต่อได้" : "ฟังก์ชันที่ติดตั้งยังอ่าน PDF ทั้งไฟล์ในครั้งเดียว (เกิน CPU กับไฟล์หลายร้อยหน้า) — ต้อง deploy curriculum-document-analyze รุ่นล่าสุด"}
            </li>
          )}
          <li><Badge variant="secondary">ยังไม่รองรับ</Badge> หน้า PDF ที่เป็นภาพสแกน (ไม่มี OCR) → แสดงเป็น “ข้อมูลไม่พอ” ให้ผู้ดูแลกรอกจากต้นฉบับ</li>
        </ul>
        {aiEnabled && canManage && (
          <div className="mt-2"><Checkbox label="อนุญาตให้ส่งข้อความบางหน้าให้ AI เมื่อระบบจำแนกไม่มั่นใจ (ต่อครั้ง)" checked={allowAi} onChange={(e) => setAllowAi(e.target.checked)} /></div>
        )}
      </DashSection>

      <DashSection id="docs" className="mt-4" title="เอกสารที่มีไฟล์" meta={`${withFile.length} รายการ`}>
        {analyses.error && (
          <p role="alert" className="mb-2 text-sm text-destructive">โหลดสถานะงานวิเคราะห์ไม่สำเร็จ: {errMsg(analyses.error)} — สถานะด้านล่างอาจไม่ถูกต้อง</p>
        )}
        {sources.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : !withFile.length ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีเอกสารที่แนบไฟล์ — อัปโหลดที่ <Link className="text-primary underline-offset-4 hover:underline" to="/office/curriculum/imports">แหล่งข้อมูล & นำเข้า</Link></p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {withFile.map((d) => {
              const a = latestByDoc.get(d.id);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <code className="text-xs">{d.register_code}</code>
                  <span className="min-w-40 flex-1 font-medium">{d.title}</span>
                  {a ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge variant={a.status === "failed" ? "destructive" : a.status === "done" ? "success" : "outline"}>
                        {isActive(a) && <Loader2 className="size-3 animate-spin" />} {isStale(a) ? "ค้าง" : JOB_STATUS_LABELS[a.status]}
                      </Badge>
                      {isActive(a) && <span className="text-xs text-muted-foreground">{progressText(a)}</span>}
                      {a.doc_class && <Badge variant="secondary">{DOC_CLASS_LABELS[a.doc_class]}{a.class_confidence ? ` · มั่นใจ ${Math.round(a.class_confidence * 100)}%` : ""}</Badge>}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">{analyses.error ? "ไม่ทราบสถานะ" : analyses.isPending ? "กำลังโหลด…" : "ยังไม่วิเคราะห์"}</span>}
                  {a && <Button size="sm" variant="ghost" onClick={() => setSelected(a.id)}><FileSearch /> ดูผล</Button>}
                  {canManage && a && (a.status === "failed" || isStale(a)) && !Object.keys(a.item_counts).length && (
                      <Button size="sm" variant="outline" disabled={busyDoc !== null} onClick={() => resume(a)} title="ประมวลผลต่อจากหน้าที่ค้าง (ไม่สร้างงานใหม่)">
                        {busyDoc === d.id ? <Loader2 className="animate-spin" /> : <RotateCcw />} ทำต่อ
                      </Button>
                  )}
                  {canManage && (
                    <Button size="sm" variant="outline" disabled={busyDoc !== null || a?.status === "queued" || a?.status === "running"} onClick={() => run(d)}>
                      {busyDoc === d.id ? <Loader2 className="animate-spin" /> : <ScanText />} {a ? "วิเคราะห์ใหม่" : "วิเคราะห์"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DashSection>

      {current && <AnalysisDetail key={current.id} a={current} doc={currentDoc} canManage={canManage} onChanged={refresh} />}

      <FrameworkVersions canManage={canManage} onChanged={refresh} />
      <ComparisonSection />
    </>
  );
}

function AnalysisDetail({ a, doc, canManage, onChanged }: { a: DocumentAnalysis; doc?: SourceDocument; canManage: boolean; onChanged: () => Promise<unknown> }) {
  const [f, setF] = useState<ItemFilters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(100);
  const items = useAnalysisSearch(a.status === "done" ? a.id : undefined, f, limit);
  const summary = useAnalysisSummary(a.status === "done" ? a.id : undefined);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Record<string, HistoryRow[] | "loading">>({});
  const setFilter = (k: keyof ItemFilters, v: string) => { setF({ ...f, [k]: v }); setLimit(100); setPicked(new Set()); };
  const [editing, setEditing] = useState<AnalysisItem | null>(null);
  const [rejecting, setRejecting] = useState<AnalysisItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const years = otherYears(a, TARGET_YEAR);
  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const [k, n] of Object.entries(a.item_counts)) {
      const [t, s] = k.split(":");
      byType[t!] = (byType[t!] ?? 0) + n;
      byStatus[s!] = (byStatus[s!] ?? 0) + n;
    }
    return { byType, byStatus };
  }, [a.item_counts]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const pickedItems = (items.data ?? []).filter((i) => picked.has(i.id));
  const sum = summary.data ?? [];
  const tot = (pred: (r: SummaryRow) => boolean) => sum.filter(pred).reduce((x, r) => x + r.n, 0);
  const total = tot(() => true);
  const done = tot((r) => r.status === "accepted" || r.status === "committed" || r.status === "rejected");
  const areaCodes = [...new Set(sum.map((r) => r.area_code).filter(Boolean))] as string[];
  const gradeCodes = [...new Set(sum.map((r) => r.grade).filter(Boolean))].sort() as string[];
  const showHistory = async (id: string) => {
    if (history[id]) return setHistory(({ [id]: _x, ...rest }) => rest);
    setHistory({ ...history, [id]: "loading" });
    try { const h = await itemHistory(id); setHistory((x) => ({ ...x, [id]: h })); } catch (e) { toast.error(errMsg(e)); setHistory(({ [id]: _x, ...rest }) => rest); }
  };

  return (
    <DashSection id="analysis" className="mt-4" title={`ผลวิเคราะห์ ${doc?.register_code ?? ""}`} meta={`${JOB_STATUS_LABELS[a.status]} · ${new Date(a.created_at).toLocaleString("th-TH")}`}>
      {a.status === "failed" && <p role="alert" className="text-sm text-destructive">วิเคราะห์ไม่สำเร็จ: {a.error} {a.attempts > 0 && `(สั่งทำต่อแล้ว ${a.attempts}/5 ครั้ง)`}</p>}
      {isActive(a) && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> กำลังวิเคราะห์เบื้องหลังเป็นรอบ ๆ ({progressText(a)} · รอบที่ {a.chunk_count}) — หน้านี้อัปเดตเอง ใช้งานหน้าอื่นได้</p>}
      {isStale(a) && <p role="alert" className="text-sm text-destructive">งานนี้ไม่มีความเคลื่อนไหวเกิน 10 นาที ({progressText(a)}) — กด “ทำต่อ” ที่รายการเอกสารเพื่อประมวลผลต่อจากหน้าที่ค้าง</p>}
      {a.status === "done" && (
        <>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border p-3">
              <p><b>ประเภทเอกสาร:</b> {a.doc_class ? DOC_CLASS_LABELS[a.doc_class] : "–"} {a.class_confidence != null && <span className="text-muted-foreground">(มั่นใจ {Math.round(a.class_confidence * 100)}%)</span>}</p>
              <p className="text-xs text-muted-foreground">{AI_STATUS_LABELS[a.ai_status] ?? a.ai_status}{a.ai_note ? ` — ${a.ai_note}` : ""} · {a.engine}</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {a.class_evidence.slice(0, 8).map((e, i) => (
                  <li key={i}>{DOC_CLASS_LABELS[e.class]}: “{e.phrase}” · {formatLocator(e.locator)} <SourcePdfLink docId={a.source_document_id} locator={e.locator} /></li>
                ))}
                {!a.class_evidence.length && <li>ไม่พบวลีที่ใช้จำแนก — ข้อมูลไม่พอ</li>}
              </ul>
            </div>
            <div className="rounded-xl border p-3">
              <p><b>หน้า:</b> {a.page_count ?? "–"} · <b>รายการ:</b> {Object.values(counts.byType).reduce((x, y) => x + y, 0)}</p>
              <p className="text-xs">{Object.entries(counts.byType).map(([t, n]) => `${ITEM_TYPE_LABELS[t] ?? t} ${n}`).join(" · ")}</p>
              <p className="text-xs text-muted-foreground">{Object.entries(counts.byStatus).map(([s, n]) => `${ITEM_STATUS_LABELS[s as ItemStatus] ?? s} ${n}`).join(" · ")}</p>
              {typeof a.meta.page_count_mismatch === "string" && <p className="mt-1 text-xs text-destructive">{a.meta.page_count_mismatch}</p>}
              {years.length > 0 && (
                <p className="mt-1 rounded-md bg-warning/10 p-2 text-xs">พบปีหลักสูตร {years.join(", ")} (ปีถัดไป) — เก็บเป็นผลวิเคราะห์เพื่อเปรียบเทียบเท่านั้น ระบบไม่สร้าง คัดลอก หรือแก้หลักสูตรปีนั้นอัตโนมัติ</p>
              )}
            </div>
          </div>

          <section aria-label="ความคืบหน้าการตรวจรับรอง" className="mt-3 rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b>ความคืบหน้าการตรวจ: {done}/{total} รายการ</b>
              <span className="text-xs text-muted-foreground">ยอมรับ {tot((r) => r.status === "accepted")} · บันทึกเข้าฐานแล้ว {tot((r) => r.status === "committed")} · ปฏิเสธ {tot((r) => r.status === "rejected")} · รอตรวจ {tot((r) => r.status === "extracted")} · ข้อมูลไม่พอ {tot((r) => r.status === "insufficient")} · ซ้ำ {tot((r) => r.status === "duplicate")}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
              <div className="h-full bg-primary" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              มาตรฐาน {tot((r) => r.item_type === "standard")} · ตัวชี้วัด {tot((r) => r.item_type === "indicator")} · มีค่าขัดแย้ง {tot((r) => r.conflicted)} · ซ่อมอักขระไทย {tot((r) => r.repaired)} · หน้าที่อ่านไม่ได้ {tot((r) => r.item_type === "unreadable")}
            </p>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <FormField label="ชนิดข้อมูล" htmlFor="ai-type">
              <Select id="ai-type" value={f.type} onChange={(e) => setFilter("type", e.target.value)}>
                <option value="">ทั้งหมด</option>
                {Object.keys(counts.byType).map((t) => <option key={t} value={t}>{ITEM_TYPE_LABELS[t] ?? t}</option>)}
              </Select>
            </FormField>
            <FormField label="สถานะ" htmlFor="ai-status">
              <Select id="ai-status" value={f.status} onChange={(e) => setFilter("status", e.target.value)}>
                <option value="">ทั้งหมด</option>
                {Object.entries(ITEM_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </FormField>
            <FormField label="กลุ่มสาระ (อักษร)" htmlFor="ai-area">
              <Select id="ai-area" value={f.area} onChange={(e) => setFilter("area", e.target.value)}>
                <option value="">ทั้งหมด</option>
                {areaCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormField>
            <FormField label="ระดับชั้น" htmlFor="ai-grade">
              <Select id="ai-grade" value={f.grade} onChange={(e) => setFilter("grade", e.target.value)}>
                <option value="">ทั้งหมด</option>
                {gradeCodes.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </FormField>
            <FormField label="มาตรฐาน" htmlFor="ai-std"><Input id="ai-std" value={f.standard} onChange={(e) => setFilter("standard", e.target.value)} placeholder="เช่น ว 1.1" /></FormField>
            <FormField label="ข้อสังเกต" htmlFor="ai-flag">
              <Select id="ai-flag" value={f.flag} onChange={(e) => setFilter("flag", e.target.value)}>
                <option value="">ทั้งหมด</option>
                {Object.entries(FLAG_FILTERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </FormField>
            <FormField label="ค้นหา" htmlFor="ai-q"><Input id="ai-q" value={f.search} onChange={(e) => setFilter("search", e.target.value)} placeholder="รหัสหรือข้อความ" /></FormField>
          </div>
          {canManage && (
            <div className="sticky bottom-2 z-10 mt-2 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 text-sm shadow-sm">
              <span>เลือก {pickedItems.length} รายการ</span>
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set((items.data ?? []).filter(bulkAcceptable).map((i) => i.id)))}>เลือกรายการที่ยอมรับพร้อมกันได้</Button>
              <Button size="sm" variant="outline" disabled={busy || !pickedItems.length}
                onClick={() => window.confirm(`ยอมรับ ${pickedItems.length} รายการที่เลือก — ตรวจเทียบต้นฉบับครบแล้วใช่หรือไม่`)
                  && act(() => decideItems(pickedItems.map((i) => i.id), "accept"), `ยอมรับ ${pickedItems.length} รายการ`).then(() => setPicked(new Set()))}>
                <Check /> ยอมรับที่เลือก
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || !pickedItems.length} onClick={() => setRejecting(pickedItems)}><X /> ปฏิเสธที่เลือก</Button>
              <span className="text-xs text-muted-foreground">รายการที่ซ้ำ/ขัดแย้ง/ข้อมูลไม่พอ ต้องตรวจทีละรายการ</span>
            </div>
          )}

          {items.isPending ? <p className="mt-3 text-sm text-muted-foreground">กำลังโหลดรายการ…</p> : items.error ? <p role="alert" className="mt-3 text-sm text-destructive">{errMsg(items.error)}</p> : (
            <ul className="mt-3 space-y-2" data-testid="analysis-items">
              {(items.data ?? []).map((i) => (
                <li key={i.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage && i.status !== "committed" && (
                      <input type="checkbox" aria-label={`เลือก ${i.item_key}`} className="size-4" checked={picked.has(i.id)}
                        onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
                    )}
                    <Badge variant={ITEM_TONE[i.status]}>{ITEM_STATUS_LABELS[i.status]}</Badge>
                    <span className="text-xs text-muted-foreground">{ITEM_TYPE_LABELS[i.item_type] ?? i.item_type}</span>
                    <code className="text-xs">{i.item_key}</code>
                    <span className="text-xs text-muted-foreground">{formatLocator(i.locator)}</span>
                    <SourcePdfLink docId={a.source_document_id} locator={i.locator} />
                    {i.proposed_by === "ai" && <Badge variant="outline">AI</Badge>}
                    {i.confidence != null && <span className="text-xs text-muted-foreground">มั่นใจ {Math.round(i.confidence * 100)}%</span>}
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div><p className="text-xs font-medium text-muted-foreground">ข้อความต้นฉบับ</p><p className="whitespace-pre-wrap break-words">{i.excerpt || "–"}</p></div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{i.edited ? "ค่าที่ผู้ดูแลแก้" : "ค่าที่ระบบอ่าน"}</p>
                      <p className="break-words">{describeValue(i.item_type, effectiveValue(i))}</p>
                    </div>
                  </div>
                  {i.flags.length > 0 && (
                    <ul className="mt-1 text-xs text-warning">
                      {i.flags.map((f, k) => <li key={k}>⚠ {f.message_th}{f.existing ? ` (เดิม: “${f.existing}”)` : ""}</li>)}
                    </ul>
                  )}
                  {i.decision_note && <p className="mt-1 text-xs text-muted-foreground">หมายเหตุผู้ตรวจ: {i.decision_note}</p>}
                  <button type="button" className="mt-1 text-xs text-primary underline-offset-4 hover:underline" onClick={() => showHistory(i.id)}>
                    {history[i.id] ? "ซ่อนประวัติ" : "ดูประวัติการตรวจ/แก้ไข"}
                  </button>
                  {history[i.id] === "loading" && <p className="text-xs text-muted-foreground">กำลังโหลด…</p>}
                  {Array.isArray(history[i.id]) && (
                    <ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {(history[i.id] as HistoryRow[]).map((h, k) => (
                        <li key={k}>{new Date(h.at).toLocaleString("th-TH")} · {h.actor_name} · {h.action === "INSERT" ? "ระบบอ่านเอกสาร" : ITEM_STATUS_LABELS[h.status as ItemStatus] ?? h.status}{h.decision_note ? ` — ${h.decision_note}` : ""}{h.edited ? " (แก้ค่า)" : ""}</li>
                      ))}
                    </ol>
                  )}
                  {canManage && i.status !== "committed" && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {i.status !== "accepted" && i.status !== "insufficient" && i.locator && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideItems([i.id], "accept"), "ยอมรับแล้ว")}><Check /> ยอมรับ</Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(i)}>แก้ไขแล้วยอมรับ</Button>
                      {i.status !== "rejected" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting([i])}><X /> ปฏิเสธ</Button>}
                      {(i.status === "accepted" || i.status === "rejected") && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideItems([i.id], "reset"), "ย้อนกลับเป็นรอตรวจ")}><RotateCcw /> ย้อนกลับ</Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
              {!items.data?.length && <li className="text-sm text-muted-foreground">ไม่มีรายการในตัวกรองนี้</li>}
              {(items.data?.length ?? 0) >= limit && limit < 500 && <li><Button size="sm" variant="ghost" onClick={() => setLimit(limit + 100)}>แสดงเพิ่ม</Button></li>}
            </ul>
          )}

          {canManage && a.doc_class && FRAMEWORK_CLASSES.includes(a.doc_class) && <CommitFramework a={a} onChanged={onChanged} />}
          {a.doc_class && !FRAMEWORK_CLASSES.includes(a.doc_class) && (
            <p className="mt-3 text-xs text-muted-foreground">เอกสารประเภทนี้ใช้เป็นหลักฐานเปรียบเทียบ — รายวิชา/โครงสร้างของหลักสูตรสถานศึกษายังนำเข้าผ่าน “ชุดนำเข้า” เดิม (ตรวจรายแถว → อนุมัติ) ไม่เขียนทับทะเบียนหลักสูตรอัตโนมัติ</p>
          )}
        </>
      )}
      <EditDialog item={editing} onClose={() => setEditing(null)} onSave={(edited, locator, note) => act(() => decideItems([editing!.id], "accept", { edited, locator, note }), "แก้ไขและยอมรับแล้ว").then(() => setEditing(null))} />
      <RejectDialog items={rejecting} onClose={() => setRejecting(null)} onSave={(note) => act(() => decideItems(rejecting!.map((i) => i.id), "reject", { note }), "ปฏิเสธแล้ว").then(() => setRejecting(null))} />
    </DashSection>
  );
}

const EDIT_FIELDS: Record<string, string[]> = {
  standard: ["code", "area_name", "statement"],
  indicator: ["standard_code", "grade", "number", "statement"],
  subject: ["code", "name_th", "credits", "hours", "grades"],
};

function EditDialog({ item, onClose, onSave }: { item: AnalysisItem | null; onClose: () => void; onSave: (v: Record<string, unknown>, locator: string | undefined, note: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loc, setLoc] = useState("");
  const [note, setNote] = useState("");
  const fields = item ? EDIT_FIELDS[item.item_type] ?? Object.keys(item.extracted).filter((k) => typeof item.extracted[k] !== "object") : [];
  useEffect(() => {
    if (!item) return;
    const v = effectiveValue(item);
    setVals(Object.fromEntries(fields.map((k) => [k, v[k] == null ? "" : String(v[k])])));
    setLoc(item.locator ?? "");
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`แก้ไข ${item.item_key}`} description="กรอกตามต้นฉบับเท่านั้น (เปิด PDF ตามหน้าที่อ้างอิง) — การแก้จะยอมรับรายการนี้พร้อมบันทึกผู้แก้ใน Audit Log" className="max-w-xl">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const base = effectiveValue(item);
          const next: Record<string, unknown> = { ...base };
          for (const k of fields) next[k] = vals[k]?.trim() ? (["credits", "hours"].includes(k) && !isNaN(Number(vals[k])) ? Number(vals[k]) : vals[k]!.trim()) : null;
          if (item.item_type === "indicator" && next.standard_code && next.grade && next.number) next.full_code = `${next.standard_code} ${next.grade}/${next.number}`;
          onSave(next, loc.trim() && loc.trim() !== item.locator ? loc.trim() : undefined, note.trim());
        }}>
          {fields.map((k) => (
            <FormField key={k} label={k} htmlFor={`ed-${k}`}>
              <Input id={`ed-${k}`} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            </FormField>
          ))}
          <FormField label="พิกัดอ้างอิง" htmlFor="ed-loc" hint="เช่น pdf:12 หรือ sheet:ชีต1!A5"><Input id="ed-loc" value={loc} onChange={(e) => setLoc(e.target.value)} required /></FormField>
          <FormField label="หมายเหตุ" htmlFor="ed-note"><Input id="ed-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button><Button type="submit">บันทึกและยอมรับ</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ items, onClose, onSave }: { items: AnalysisItem[] | null; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState("");
  if (!items) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setNote(""); onClose(); } }}>
      <DialogContent title="ปฏิเสธข้อมูลที่อ่านผิด" description={items.map((i) => i.item_key).join(", ")}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) onSave(note.trim()); }}>
          <FormField label="เหตุผล (บังคับ)" htmlFor="rj-note"><Input id="rj-note" value={note} onChange={(e) => setNote(e.target.value)} required maxLength={500} /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button><Button type="submit" variant="destructive" disabled={!note.trim()}>ปฏิเสธ</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommitFramework({ a, onChanged }: { a: DocumentAnalysis; onChanged: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, number | string> | null>(null);
  const years = (a.meta.curriculum_years as number[] | undefined) ?? [];
  return (
    <div className="mt-4 rounded-xl border p-3">
      <p className="font-medium">บันทึกเข้าฐานมาตรฐานและตัวชี้วัด (กรอบแกนกลาง)</p>
      <p className="text-xs text-muted-foreground">บันทึกเฉพาะ “มาตรฐาน/ตัวชี้วัด” ที่ยอมรับแล้ว · ไม่เขียนทับข้อมูลเดิม (ค่าต่าง = ข้ามและติดธง) · ฉบับที่ยืนยันแล้วแก้ไม่ได้ — ระบุชื่อกรอบและฉบับตามหน้าปกเอกสาร</p>
      <form className="mt-2 grid gap-2 md:grid-cols-4" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (k: string) => String(f.get(k) ?? "").trim();
        setBusy(true);
        try {
          const r = await commitFramework(a.id, { code: g("code"), name: g("name"), label: g("label"), year: g("year") ? Number(g("year")) : null });
          setResult(r);
          toast.success("บันทึกเข้ากรอบแกนกลางแล้ว (ฉบับร่าง — ยังไม่ยืนยัน)");
          await onChanged();
        } catch (err) {
          toast.error(errMsg(err));
        } finally {
          setBusy(false);
        }
      }}>
        <FormField label="รหัสกรอบ (A-Z 0-9)" htmlFor="fw-code"><Input id="fw-code" name="code" required pattern="[A-Za-z0-9_\-]{2,32}" placeholder="เช่น BEC2551" /></FormField>
        <FormField label="ชื่อกรอบหลักสูตร" htmlFor="fw-name"><Input id="fw-name" name="name" required placeholder="ตามหน้าปกเอกสาร" /></FormField>
        <FormField label="ฉบับ" htmlFor="fw-label"><Input id="fw-label" name="label" required placeholder="ตามหน้าปก เช่น ฉบับปรับปรุง" /></FormField>
        <FormField label="ปี พ.ศ. (ถ้ามี)" htmlFor="fw-year" hint={years.length ? `ปีที่พบในเอกสาร: ${years.join(", ")}` : undefined}><Input id="fw-year" name="year" inputMode="numeric" pattern="25[0-9]{2}" /></FormField>
        <div className="md:col-span-4"><Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} บันทึกรายการที่ยอมรับ</Button></div>
      </form>
      {result && (
        <p className="mt-2 text-sm">เพิ่มมาตรฐาน {result.standards_inserted} · เพิ่มตัวชี้วัด {result.indicators_inserted} · มีอยู่แล้ว (ตรงกัน) {result.already_same} · ค่าต่างไม่เขียนทับ {result.conflicts_not_overwritten} · ข้อมูลไม่ครบ ข้าม {result.invalid_skipped}</p>
      )}
    </div>
  );
}

function FrameworkVersions({ canManage, onChanged }: { canManage: boolean; onChanged: () => Promise<unknown> }) {
  const fv = useFrameworkVersionsWithCounts();
  const [busy, setBusy] = useState<string | null>(null);
  if (!fv.data?.length) return null;
  return (
    <DashSection id="framework" className="mt-4" title="กรอบหลักสูตรแกนกลางในระบบ" meta={`${fv.data.length} ฉบับ`}>
      <ul className="divide-y rounded-xl border text-sm">
        {fv.data.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 p-3">
            <span className="flex-1">{v.framework?.name_th} · {v.version_label} <span className="text-xs text-muted-foreground">({v.indicators[0]?.count ?? 0} ตัวชี้วัด)</span></span>
            <Badge variant={v.status === "published" ? "success" : "secondary"}>{v.status === "published" ? "ยืนยันแล้ว" : "ร่าง (ยังไม่ยืนยัน)"}</Badge>
            {v.status === "published" && <Badge variant={v.is_complete ? "success" : "warning"}>{v.is_complete ? "ชุดตัวชี้วัดครบ" : "ชุดตัวชี้วัดยังไม่ครบ"}</Badge>}
            {canManage && v.status === "draft" && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={async () => {
                const complete = window.confirm("ชุดตัวชี้วัดในฉบับนี้ครบตามเอกสารต้นฉบับทุกกลุ่มสาระแล้วหรือไม่?\nตกลง = ครบ · ยกเลิก = ยังไม่ครบ (ระบบจะไม่รายงาน % ความครอบคลุม)");
                if (!window.confirm("ยืนยันฉบับนี้? หลังยืนยันจะเพิ่ม/แก้ข้อมูลในฉบับนี้ไม่ได้")) return;
                setBusy(v.id);
                try { await confirmFramework(v.id, complete); toast.success("ยืนยันฉบับกรอบแกนกลางแล้ว"); await onChanged(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
              }}><ShieldCheck /> ยืนยันฉบับ</Button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">การผูกฉบับหลักสูตรสถานศึกษากับกรอบแกนกลางทำที่หน้า “ฉบับหลักสูตร” (ขั้นตอนเดิม)</p>
    </DashSection>
  );
}

function ComparisonSection() {
  const curricula = useCurricula();
  const versions = allVersions(curricula.data).filter((v) => v.status !== "retired");
  const [vid, setVid] = useState("");
  const versionId = vid || versions.find((v) => v.effective_year_be === TARGET_YEAR)?.id || versions[0]?.id;
  const review = useComplianceReview(versionId);
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const rows = review.data ?? [];
  const count = (s: Verdict) => rows.filter((r) => r.verdict === s).length;
  const allPass = rows.length > 0 && rows.every((r) => r.verdict === "pass");
  const shown = rows.filter((r) => filter === "all" || r.verdict === filter).sort((x, y) => VERDICT_ORDER.indexOf(x.verdict) - VERDICT_ORDER.indexOf(y.verdict));
  return (
    <DashSection id="compare" className="mt-4" title={`เปรียบเทียบหลักสูตรสถานศึกษา พ.ศ. ${TARGET_YEAR}`}
      meta={versions.length > 1 ? (
        <Select aria-label="ฉบับหลักสูตร" value={versionId ?? ""} onChange={(e) => setVid(e.target.value)} className="h-8 text-xs">
          {versions.map((v) => <option key={v.id} value={v.id}>{v.version_label}</option>)}
        </Select>
      ) : undefined}>
      {review.isPending ? <p className="text-sm text-muted-foreground">กำลังประเมิน…</p> : review.error ? <p role="alert" className="text-sm text-destructive">{errMsg(review.error)}</p> : (
        <>
          <p className={`mb-3 rounded-xl p-3 text-sm ${allPass ? "bg-success/10" : "bg-warning/10"}`} data-testid="compare-summary">
            {allPass ? "ทุกรายการผ่านตามเกณฑ์ที่ยืนยันแล้ว จากข้อมูลที่บันทึกแล้ว" : `ยังสรุปว่าหลักสูตรผ่านเกณฑ์ไม่ได้ — ไม่ผ่าน ${count("fail")} · รอตรวจข้อขัดแย้ง ${count("conflict_pending")} · ข้อมูลไม่พอ ${count("insufficient_data")} · ผ่าน ${count("pass")}`}
          </p>
          <div className="mb-3 flex flex-wrap gap-1" role="tablist">
            {(["all", ...VERDICT_ORDER] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                className={`rounded-full border px-3 py-1 text-sm ${filter === k ? "border-primary bg-primary font-medium text-primary-foreground" : "text-muted-foreground"}`}>
                {k === "all" ? `ทั้งหมด (${rows.length})` : `${VERDICT_LABELS[k]} (${count(k)})`}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {shown.map((r, i) => <ReviewItem key={i} r={r} />)}
            {!shown.length && <li className="text-sm text-muted-foreground">ไม่มีรายการ</li>}
          </ul>
        </>
      )}
    </DashSection>
  );
}

function ReviewItem({ r }: { r: ReviewRow }) {
  return (
    <li className="rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VERDICT_TONE[r.verdict]}>{VERDICT_LABELS[r.verdict]}</Badge>
        <span className="font-medium">{r.title_th}</span>
        {r.scope && <span className="text-xs text-muted-foreground">({r.scope})</span>}
      </div>
      <p className="mt-1">{r.reason}</p>
      <p className="text-xs text-muted-foreground">ที่ควรเป็น: {r.expected ?? "–"} · ที่พบ: {r.actual ?? "–"} · อ้างอิง: {r.source ? r.source.replace(/\s*((?:pdf|sheet|book|file):.*)$/, (_m, loc: string) => ` · ${formatLocator(loc)}`) : "–"}</p>
      {r.open_conflicts.length > 0 && (
        <p className="mt-1 text-xs">CF ที่ยังเปิดอยู่: {r.open_conflicts.slice(0, 20).join(", ")}{r.open_conflicts.length > 20 ? ` และอีก ${r.open_conflicts.length - 20}` : ""} — <Link className="text-primary underline-offset-4 hover:underline" to="/office/curriculum/conflicts">ไปที่ทะเบียนข้อขัดแย้ง</Link></p>
      )}
    </li>
  );
}
