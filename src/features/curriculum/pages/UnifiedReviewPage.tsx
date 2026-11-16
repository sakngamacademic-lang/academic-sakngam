import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCheck, CircleCheck, Lock, RefreshCw } from "lucide-react";
import { ConfirmDialog, PageHeader } from "@/components/shared";
import { DashSection, KpiCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAcademicYears, useGradeLevels, useLearningAreas } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { BATCH_KIND_LABELS, curriculumKey, fetchCleanRowIds, rpc, useBatches, useBatchReports, useClassifiedRows, type BatchReport, type RowClass } from "../api";
import { AllowlistApprove } from "../AllowlistApprove";
import { CurriculumNav, EmptyState, Notice, Pager, SourcePdfLink } from "../components";

/** ลำดับ dependency อัตโนมัติ: ข้อมูลโรงเรียน → แผน → รายวิชา → โครงสร้าง → กิจกรรม → ผลการเรียนรู้ */
const STEPS = ["study_programs", "subjects", "subject_offerings", "learning_activities", "learning_outcomes"] as const;
const DEPENDS: Record<string, readonly string[]> = {
  study_programs: [], subjects: [], subject_offerings: ["study_programs", "subjects"], learning_activities: ["study_programs"], learning_outcomes: ["subjects"],
};
const TABS: { cls: RowClass; label: string; hint: string }[] = [
  { cls: "pass", label: "ผ่านการตรวจ", hint: "อนุมัติเป็นกลุ่มได้" },
  { cls: "warning", label: "คำเตือน", hint: "ตรวจแยก อนุมัติเป็นกลุ่มพร้อมหมายเหตุ" },
  { cls: "conflict", label: "ข้อขัดแย้ง", hint: "ต้องให้ฝ่ายวิชาการตัดสินที่หน้าข้อขัดแย้ง — อนุมัติไม่ได้" },
  { cls: "error", label: "ผิดพลาด", hint: "อนุมัติไม่ได้ — แก้สาเหตุหรือข้าม" },
  { cls: "approved", label: "อนุมัติแล้ว", hint: "" },
];
const ERROR_LABELS: Record<string, string> = {
  V32: "ยังไม่มีแผนการเรียนในฉบับ", V33: "ยังไม่มีรายวิชาในฉบับ", V45: "ยังไม่มีรายวิชาในฉบับ", V40: "ข้อมูลกิจกรรมไม่ครบ (ต้นฉบับไม่ระบุ)", V13: "ไม่พบกลุ่มสาระของโรงเรียน",
};
const sum = (rs: BatchReport[], k: keyof BatchReport) => rs.reduce((a, r) => a + Number(r[k] ?? 0), 0);

export function UnifiedReviewPage() {
  const { can } = useAuth();
  const batches = useBatches();
  const reports = useBatchReports();
  const areas = useLearningAreas();
  const grades = useGradeLevels();
  const years = useAcademicYears();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: curriculumKey });
  const [sel, setSel] = useState<string>("");
  const [batchId, setBatchId] = useState("");

  const byKind = useMemo(() => {
    const m = new Map<string, BatchReport[]>();
    (reports.data ?? []).forEach((r) => m.set(r.kind, [...(m.get(r.kind) ?? []), r]));
    return m;
  }, [reports.data]);
  const foundationOk = (areas.data?.length ?? 0) > 0 && (grades.data?.length ?? 0) > 0;
  const doneKinds = new Set<string>(STEPS.filter((k) => byKind.get(k)?.length && byKind.get(k)!.every((r) => r.status === "committed")));
  const blockedBy = (k: string) => (DEPENDS[k] ?? []).filter((d) => byKind.get(d)?.length && !doneKinds.has(d));
  const firstOpen = STEPS.find((k) => byKind.get(k)?.length && !doneKinds.has(k) && !blockedBy(k).length) ?? STEPS.find((k) => byKind.get(k)?.length);
  const kind = sel || firstOpen || "";
  const kindReports = byKind.get(kind) ?? [];
  const report = kindReports.find((r) => r.batch_id === batchId) ?? kindReports[0];
  const batch = batches.data?.find((b) => b.id === report?.batch_id);
  const canWork = can("curriculum.edit") && batch?.status === "needs_review";
  const isHead = can("curriculum.approve");

  if (!batches.data?.length && !batches.isPending) return (<><PageHeader title="ตรวจหลักสูตร (หน้าเดียว)" description="" /><CurriculumNav /><EmptyState title="ยังไม่มีชุดนำเข้า">นำเข้าไฟล์หลักสูตรที่หน้า “แหล่งข้อมูล & นำเข้า” ก่อน</EmptyState></>);

  return (
    <>
      <PageHeader title="ตรวจหลักสูตร (หน้าเดียว)" description="ระบบเรียงลำดับ dependency ให้อัตโนมัติ — แถวผิดพลาดและข้อขัดแย้งอนุมัติไม่ได้ · ผู้ตรวจกดอนุมัติเอง · ผู้ดูแลหลักสูตร (หัวหน้าฝ่ายวิชาการ) อนุมัติชุดด้วยบัญชีเดียว — บันทึกผู้อนุมัติและหน้า PDF ทุกครั้ง" />
      <CurriculumNav />
      <ol className="mb-5 grid gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="ลำดับการตรวจ">
        <li className={cn("rounded-xl border p-3 text-sm", foundationOk ? "border-success/40" : "border-warning/50 bg-warning/10")}>
          <p className="font-medium">0. ข้อมูลโรงเรียน</p>
          <p className="text-xs text-muted-foreground">กลุ่มสาระ {areas.data?.length ?? 0} · ระดับชั้น {grades.data?.length ?? 0} · ปีการศึกษา {years.data?.length ?? 0}</p>
          {!foundationOk && <Link to="/office/learning-areas" className="text-xs underline">ตั้งค่าก่อน</Link>}
        </li>
        {STEPS.map((k, i) => {
          const rs = byKind.get(k) ?? [];
          const blocked = blockedBy(k);
          return (
            <li key={k}>
              <button type="button" onClick={() => { setSel(k); setBatchId(""); }} disabled={!rs.length}
                className={cn("w-full rounded-xl border p-3 text-left text-sm", kind === k && "border-primary/60 bg-primary/10", !rs.length && "opacity-50")}>
                <p className="flex items-center gap-1 font-medium">{i + 1}. {BATCH_KIND_LABELS[k]} {doneKinds.has(k) && <CircleCheck className="size-4 text-success" aria-label="บันทึกแล้ว" />}</p>
                <p className="text-xs text-muted-foreground">{rs.length ? `ผ่าน ${sum(rs, "pass")} · เตือน ${sum(rs, "warning")} · ขัดแย้ง ${sum(rs, "conflict")} · ผิดพลาด ${sum(rs, "error")}` : "ไม่มีชุดนำเข้า"}</p>
                {blocked.length > 0 && <p className="mt-1 flex items-center gap-1 text-xs text-warning"><Lock className="size-3" /> รอ {blocked.map((d) => BATCH_KIND_LABELS[d]).join(", ")} บันทึกก่อน</p>}
              </button>
            </li>
          );
        })}
      </ol>

      {report && batch && (
        <>
          {kindReports.length > 1 && (
            <Select value={report.batch_id} onChange={(e) => setBatchId(e.target.value)} aria-label="ชุดนำเข้า" className="mb-4 sm:w-96">
              {kindReports.map((r) => <option key={r.batch_id} value={r.batch_id}>{BATCH_KIND_LABELS[r.kind]} · {r.total} แถว · {r.status}</option>)}
            </Select>
          )}
          {blockedBy(kind).length > 0 && <Notice tone="warning">ชุดนี้ต้องรอ “{blockedBy(kind).map((d) => BATCH_KIND_LABELS[d]).join(", ")}” ถูกบันทึกก่อน แล้วกด “ตรวจซ้ำทั้งชุด” — error แบบรอ dependency จะหายเอง (ไม่อนุมัติให้)</Notice>}
          <section aria-label="สรุปชุด" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label="ผ่านการตรวจ" value={report.pass} tone="ok" />
            <KpiCard label="คำเตือน" value={report.warning} tone="accent" />
            <KpiCard label="ข้อขัดแย้ง" value={report.conflict} tone="alert" />
            <KpiCard label="ผิดพลาด" value={report.error} tone="alert" />
            <KpiCard label="อนุมัติแล้ว" value={report.approved + report.skipped + report.committed} tone="ok" />
          </section>
          <Workbench batch={batch} report={report} canWork={canWork} isHead={isHead} onDone={refresh} />
        </>
      )}
    </>
  );
}

function Workbench({ batch, report, canWork, isHead, onDone }: { batch: NonNullable<ReturnType<typeof useBatches>["data"]>[number]; report: BatchReport; canWork: boolean; isHead: boolean; onDone: () => void }) {
  const [cls, setCls] = useState<RowClass>("pass");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"warn" | "set" | "approve" | null>(null);
  const [confirmPass, setConfirmPass] = useState<string[] | null>(null);
  const rows = useClassifiedRows(batch.id, cls, page);
  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    try { await rpc(fn, args); toast.success(ok); setPicked(new Set()); onDone(); } catch (e) { toast.error(dbErrorMessage(e)); throw e; }
  };
  const pending = report.pass + report.warning;
  const ids = [...picked];
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = rows.data?.rows.map((r) => r.id) ?? [];
  const tab = TABS.find((t) => t.cls === cls)!;

  return (
    <DashSection id="workbench" title="รายการตรวจ" meta={`${rows.data?.total ?? 0} แถว`}>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.cls} type="button" role="tab" aria-selected={cls === t.cls} onClick={() => { setCls(t.cls); setPage(0); setPicked(new Set()); }}
            className={cn("rounded-full border px-3 py-1 text-sm", cls === t.cls ? "border-primary/60 bg-primary/15" : "text-muted-foreground")}>
            {t.label} ({report[t.cls as keyof BatchReport] as number})
          </button>
        ))}
      </div>
      {tab.hint && <p className="mb-2 text-xs text-muted-foreground">{tab.hint}</p>}
      {cls === "conflict" && <Notice tone="warning">ข้อขัดแย้งต้องให้ฝ่ายวิชาการตัดสินที่ <Link to="/office/curriculum/conflicts" className="underline">หน้าข้อขัดแย้ง</Link> — ระบบ/AI ไม่ตัดสินแทน เมื่อตัดสินแล้วกด “ตรวจซ้ำทั้งชุด”</Notice>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canWork && (
          <Button size="sm" variant="outline" onClick={() => act("curriculum_import_batch_revalidate", { p_batch_id: batch.id }, "ตรวจซ้ำทั้งชุดแล้ว (ไม่มีการอนุมัติอัตโนมัติ)")}><RefreshCw /> ตรวจซ้ำทั้งชุด</Button>
        )}
        {canWork && cls === "pass" && (
          <>
            <Button size="sm" disabled={!ids.length} onClick={() => setConfirmPass(ids)}><Check /> อนุมัติที่เลือก ({ids.length})</Button>
            <Button size="sm" variant="outline" onClick={async () => { try { setConfirmPass(await fetchCleanRowIds(batch.id)); } catch (e) { toast.error(dbErrorMessage(e)); } }}><CheckCheck /> อนุมัติทั้งหมดที่ผ่าน ({report.pass})</Button>
          </>
        )}
        {canWork && cls === "warning" && <Button size="sm" disabled={!ids.length} onClick={() => setBulk("warn")}><Check /> อนุมัติคำเตือนที่เลือก ({ids.length})</Button>}
        {canWork && isHead && cls === "warning" && <AllowlistApprove batchId={batch.id} onDone={onDone} />}
        {canWork && (cls === "pass" || cls === "warning" || cls === "error") && <Button size="sm" variant="outline" disabled={!ids.length} onClick={() => setBulk("set")}>แก้ค่าเป็นกลุ่ม ({ids.length})</Button>}
      </div>

      {rows.error && <p role="alert" className="text-sm text-destructive">{dbErrorMessage(rows.error)}</p>}
      {rows.data?.rows.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีแถวในกลุ่มนี้</p>}
      <ul className="space-y-2">
        {rows.data?.rows.map((r) => {
          const n = r.normalized as Record<string, string>;
          return (
            <li key={r.id} data-testid="unified-row" className="flex items-start gap-3 rounded-xl border p-3 text-sm">
              {canWork && ["pass", "warning", "error"].includes(cls) && <input type="checkbox" aria-label={`เลือกแถว ${r.row_no}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="mt-1" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">#{r.row_no} {batch.kind === "study_programs" ? "" : (n.code ?? n.subject_code ?? "")} {n.name_th ?? ""} {n.grade_code ? `· ${n.grade_code}` : ""}</p>
                {r.issues.filter((i) => i.severity !== "info").map((i, k) => (
                  <p key={k} className="flex items-start gap-1 text-xs"><AlertTriangle className={cn("mt-0.5 size-3 shrink-0", i.severity === "error" ? "text-destructive" : "text-warning")} />{ERROR_LABELS[i.code] ?? i.message_th}</p>
                ))}
                {r.decision_note && <p className="text-xs text-muted-foreground">หมายเหตุ: {r.decision_note}</p>}
              </div>
              <div className="shrink-0 text-right text-xs">
                <Badge variant={r.cls === "error" || r.cls === "conflict" ? "destructive" : r.cls === "warning" ? "warning" : "success"}>{TABS.find((t) => t.cls === r.cls)?.label ?? r.cls}</Badge>
                <div className="mt-1"><SourcePdfLink docId={batch.source_document_id} locator={r.source_page ? `pdf:${r.source_page}` : null} /> {r.source_page ? `หน้า ${r.source_page}` : ""}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {canWork && allOnPage.length > 0 && ["pass", "warning", "error"].includes(cls) && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPicked(new Set(picked.size === allOnPage.length ? [] : allOnPage))}>{picked.size === allOnPage.length ? "ยกเลิกการเลือก" : "เลือกทั้งหน้า"}</Button>
      )}
      <Pager page={page} total={rows.data?.total ?? 0} onPage={setPage} />

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
        {batch.status === "needs_review" && isHead && <Button size="sm" onClick={() => setBulk("approve")}>ตรวจสรุปและอนุมัติชุด…</Button>}
        {batch.status === "approved" && isHead && <Button size="sm" onClick={() => act("curriculum_import_batch_commit", { p_batch_id: batch.id }, "บันทึกเข้าข้อมูลหลักแล้ว (อ้างอิงหน้า PDF ทุกแถว)").then(() => undefined, () => undefined)}>บันทึกเข้าข้อมูลหลัก</Button>}
        {batch.status === "needs_review" && !isHead && <p className="text-xs text-muted-foreground">การอนุมัติชุดเป็นของผู้ดูแลหลักสูตร (หัวหน้าฝ่ายวิชาการ)</p>}
      </div>

      <ConfirmDialog open={confirmPass !== null} onOpenChange={(o) => !o && setConfirmPass(null)} title={`อนุมัติ ${confirmPass?.length ?? 0} แถวที่ผ่านการตรวจ?`}
        description="เป็นการตัดสินของคุณ (บันทึกชื่อผู้ตัดสิน) — โปรดเทียบกับต้นฉบับ/หน้า PDF แล้ว แถวที่มีข้อผิดพลาด คำเตือน หรือข้อขัดแย้งจะไม่ถูกอนุมัติ" confirmLabel="ยืนยัน อนุมัติ"
        onConfirm={async () => { const all = confirmPass ?? []; for (let i = 0; i < all.length; i += 500) await act("curriculum_import_rows_approve_clean", { p_batch_id: batch.id, p_row_ids: all.slice(i, i + 500) }, `อนุมัติแล้ว ${Math.min(i + 500, all.length)}/${all.length}`); }} />
      <NoteDialog open={bulk === "warn"} title={`อนุมัติคำเตือน ${ids.length} แถว`} onClose={() => setBulk(null)}
        onSubmit={(note) => act("curriculum_import_rows_approve_warnings", { p_batch_id: batch.id, p_row_ids: ids, p_note: note }, "อนุมัติคำเตือนแล้ว")} />
      <NoteDialog open={bulk === "set"} title={`แก้ค่าเป็นกลุ่ม ${ids.length} แถว (ไม่แก้ข้อมูลต้นฉบับ · แถวที่ยังผิดหลังแก้จะไม่ถูกเขียน)`} withField onClose={() => setBulk(null)}
        onSubmit={(note, field, value) => act("curriculum_import_rows_bulk_set", { p_batch_id: batch.id, p_row_ids: ids, p_field: field, p_value: value, p_note: note }, "แก้ค่าเป็นกลุ่มแล้ว (ยังไม่อนุมัติ)")} />
      <Dialog open={bulk === "approve"} onOpenChange={(o) => !o && setBulk(null)}>
        <DialogContent title="สรุปก่อนอนุมัติชุด">
          <ul className="space-y-1 text-sm" data-testid="approve-preview">
            <li>อนุมัติแล้ว (จะถูกบันทึก): <b>{report.approved}</b> แถว</li>
            <li>ผ่านแต่ยังไม่ตัดสิน: <b>{report.pass}</b> · คำเตือนที่ยังไม่ตัดสิน: <b>{report.warning}</b> {pending > 0 && <span className="text-destructive">— ต้องอนุมัติหรือข้ามก่อน</span>}</li>
            <li>ข้อขัดแย้ง (ไม่ถูกบันทึก): <b>{report.conflict}</b> · ผิดพลาด (ไม่ถูกบันทึก): <b>{report.error}</b></li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">หลังอนุมัติ ต้องกด “บันทึกเข้าข้อมูลหลัก” อีกครั้ง ระบบตรวจซ้ำทุกแถวก่อนเขียนพร้อมเก็บหน้า PDF ที่มา และบันทึก audit</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulk(null)}>ยกเลิก</Button>
            <Button disabled={pending > 0 || report.approved === 0} onClick={() => act("curriculum_import_batch_approve", { p_batch_id: batch.id }, "อนุมัติชุดแล้ว").then(() => setBulk(null), () => undefined)}>อนุมัติชุด</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashSection>
  );
}

function NoteDialog({ open, title, withField, onClose, onSubmit }: { open: boolean; title: string; withField?: boolean; onClose: () => void; onSubmit: (note: string, field: string, value: string) => Promise<unknown> }) {
  const [note, setNote] = useState("");
  const [field, setField] = useState("learning_area_code");
  const [value, setValue] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(note, field, value).then(() => { setNote(""); setValue(""); onClose(); }, () => undefined); }}>
          {withField && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="ช่อง" htmlFor="bs-field"><Select id="bs-field" value={field} onChange={(e) => setField(e.target.value)}>
                <option value="learning_area_code">รหัสกลุ่มสาระ</option><option value="subject_type">ประเภทรายวิชา (basic/additional)</option><option value="grade_code">รหัสระดับชั้น</option><option value="program_code">รหัสแผนการเรียน</option></Select></FormField>
              <FormField label="ค่าใหม่" htmlFor="bs-value"><Input id="bs-value" value={value} onChange={(e) => setValue(e.target.value)} /></FormField>
            </div>
          )}
          <FormField label="เหตุผล/หมายเหตุ (อย่างน้อย 10 ตัวอักษร — บันทึกใน audit)" htmlFor="bs-note"><Input id="bs-note" value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button><Button type="submit" disabled={note.trim().length < 10 || (withField && !value.trim())}>ยืนยัน</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
