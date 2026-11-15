import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Database, Plus, RefreshCw, RotateCcw, SkipForward, X } from "lucide-react";
import { ConfirmDialog, PageHeader } from "@/components/shared";
import { DashSection, KpiCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  BATCH_KIND_LABELS,
  BATCH_STATUS_LABELS,
  curriculumKey,
  fetchCleanRowIds,
  NORMALIZED_FIELDS,
  ROW_STATUS_LABELS,
  rpc,
  useBatches,
  useBatchRows,
  useErrorSummary,
  type ImportBatch,
  type ImportRow,
} from "../api";
import { CurriculumNav, EmptyState, Notice, Pager, SourcePdfLink } from "../components";

const SEVERITY = { error: "destructive", warning: "warning", info: "info" } as const;

/** ตรวจรายแถว: Raw | Normalized | Issues | ตำแหน่งต้นฉบับ · อนุมัติ/ข้าม/แก้ ผ่าน RPC จริง */
export function ReviewPage() {
  const { can, access } = useAuth();
  const [params, setParams] = useSearchParams();
  const batches = useBatches();
  const batchId = params.get("batch") ?? batches.data?.find((b) => b.status === "needs_review")?.id ?? batches.data?.[0]?.id;
  const batch = batches.data?.find((b) => b.id === batchId);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const rows = useBatchRows(batch?.id, status, page);
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: curriculumKey });

  const batchAction = async (fn: string, args: Record<string, unknown>, ok: string) => {
    try {
      await rpc(fn, args);
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(dbErrorMessage(e));
    }
  };

  const c = batch?.counts ?? {};
  const done = (c.approved ?? 0) + (c.skipped ?? 0) + (c.committed ?? 0);
  const pct = c.total ? Math.round((done / c.total) * 100) : 0;
  const reviewing = batch?.status === "needs_review";
  const canWork = can("curriculum.edit") && reviewing;
  const isCreator = batch?.created_by === access?.user_id;

  return (
    <>
      <PageHeader title="ตรวจข้อมูลนำเข้ารายแถว" description="ข้อมูลยังไม่เข้าตารางหลักจนกว่าหัวหน้าฝ่ายวิชาการคนที่ไม่ใช่ผู้สร้างชุดจะอนุมัติ และกดบันทึก" />
      <CurriculumNav />
      {!batches.data?.length ? (
        <EmptyState title="ยังไม่มีชุดนำเข้า">สร้างชุดนำเข้าในหน้า “แหล่งข้อมูล & นำเข้า”</EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={batch?.id ?? ""} onChange={(e) => { setParams({ batch: e.target.value }); setPage(0); }} aria-label="ชุดนำเข้า" className="sm:w-96">
              {batches.data.map((b) => <option key={b.id} value={b.id}>{BATCH_KIND_LABELS[b.kind]} · {BATCH_STATUS_LABELS[b.status]} · {b.created_at.slice(0, 10)}</option>)}
            </Select>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="กรองสถานะแถว" className="sm:w-48">
              <option value="">ทุกสถานะ</option>{Object.entries(ROW_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </div>

          {batch && (
            <>
              <section aria-label="ความคืบหน้า" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <KpiCard label="แถวทั้งหมด" value={c.total ?? 0} />
                <KpiCard label="ต้องตรวจ / คำเตือน" tone="accent" value={(c.needs_review ?? 0) + (c.warning ?? 0) + (c.valid ?? 0)} />
                <KpiCard label="ผิดพลาด" tone="alert" value={c.error ?? 0} />
                <KpiCard label="อนุมัติ / ข้าม" tone="ok" value={done} hint={`${pct}%`} />
              </section>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="ความคืบหน้าการตรวจ">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <ErrorSummaryPanel batchId={batch.id} />
              <BatchActions batch={batch} isCreator={isCreator} canApprove={can("curriculum.approve")} canWork={can("curriculum.edit")}
                onAction={batchAction} onAdd={() => setAdding(true)} />
              <DashSection id="rows" title="แถวข้อมูล" meta={`${rows.data?.total ?? 0} แถว`}>
                {rows.error && <p role="alert" className="text-sm text-destructive">{dbErrorMessage(rows.error)}</p>}
                {rows.data?.rows.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีแถว{status ? "ในสถานะนี้" : " — กด “อ่านไฟล์” หรือเพิ่มแถวด้วยมือ"}</p>}
                <ul className="space-y-3">
                  {rows.data?.rows.map((r) => <RowCard key={`${r.id}-${r.status}`} row={r} kind={batch.kind} editable={canWork} onDone={refresh} sourceDocId={batch.source_document_id} />)}
                </ul>
                <Pager page={page} total={rows.data?.total ?? 0} onPage={setPage} />
              </DashSection>
              <ManualRowDialog open={adding} onClose={() => setAdding(false)} batch={batch} onDone={refresh} />
            </>
          )}
        </>
      )}
    </>
  );
}

const CAUSE_LABELS = {
  dependency: "รอข้อมูลต้นทางถูกบันทึกก่อน (แก้ได้เมื่อชุดแผน/รายวิชาอนุมัติ+บันทึก แล้วกด “ตรวจซ้ำทั้งชุด”)",
  source_or_master_data: "ต้องให้ฝ่ายวิชาการตัดสินใจ (ต้นฉบับไม่ระบุ หรือข้อมูลพื้นฐานโรงเรียนยังไม่มี)",
  review_note: "หมายเหตุสำหรับผู้ตรวจ",
} as const;

function ErrorSummaryPanel({ batchId }: { batchId: string }) {
  const summary = useErrorSummary(batchId);
  const errors = (summary.data ?? []).filter((r) => r.severity === "error");
  if (!errors.length) return null;
  return (
    <DashSection id="error-summary" title="ข้อผิดพลาดแยกตามสาเหตุ" meta={`${errors.reduce((a, r) => a + Number(r.rows), 0)} รายการ`}>
      <ul className="space-y-1 text-sm" data-testid="error-summary">
        {errors.map((r) => (
          <li key={`${r.code}-${r.field}-${r.status}`} className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">{r.code}</Badge>
            <span className="tabular-nums">{Number(r.rows)} แถว</span>
            <span className="text-muted-foreground">{r.field ? `ช่อง ${r.field} · ` : ""}{CAUSE_LABELS[r.cause]}</span>
          </li>
        ))}
      </ul>
    </DashSection>
  );
}

function BatchActions({ batch, isCreator, canApprove, canWork, onAction, onAdd }: {
  batch: ImportBatch; isCreator: boolean; canApprove: boolean; canWork: boolean;
  onAction: (fn: string, args: Record<string, unknown>, ok: string) => Promise<void>; onAdd: () => void;
}) {
  const open = batch.counts?.total && (batch.counts.total ?? 0) > (batch.counts.approved ?? 0) + (batch.counts.skipped ?? 0);
  const [confirmClean, setConfirmClean] = useState<string[] | null>(null);
  const approveClean = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 500) {
      await onAction("curriculum_import_rows_approve_clean", { p_batch_id: batch.id, p_row_ids: ids.slice(i, i + 500) }, `อนุมัติแถวที่ไม่มีข้อสังเกตแล้ว (${Math.min(i + 500, ids.length)}/${ids.length})`);
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {canWork && batch.status === "needs_review" && (
        <Button size="sm" variant="outline" title="อนุมัติเฉพาะแถวที่ไม่มีข้อสังเกตระดับผิดพลาด/คำเตือน — ผู้ตรวจต้องยืนยันว่าเทียบต้นฉบับแล้ว"
          onClick={async () => { try { setConfirmClean(await fetchCleanRowIds(batch.id)); } catch (e) { toast.error(dbErrorMessage(e)); } }}><CheckCheck /> อนุมัติแถวที่ไม่มีข้อสังเกต</Button>
      )}
      <ConfirmDialog
        open={confirmClean !== null}
        onOpenChange={(o) => !o && setConfirmClean(null)}
        title={`อนุมัติ ${confirmClean?.length ?? 0} แถวที่ไม่มีข้อสังเกต?`}
        description="การกดนี้เป็นการตัดสินของคุณ (บันทึกชื่อผู้ตัดสิน) — โปรดตรวจเทียบต้นฉบับ/ที่มา (หน้า PDF) ก่อน แถวที่มีข้อผิดพลาดหรือคำเตือนจะไม่ถูกอนุมัติ และการอนุมัติ “ชุด” ยังต้องให้หัวหน้าฝ่ายวิชาการอีกคนทำ"
        confirmLabel="ยืนยัน อนุมัติแถว"
        onConfirm={() => approveClean(confirmClean ?? [])}
      />
      {canWork && ["uploaded", "failed", "needs_review"].includes(batch.status) && <Button size="sm" variant="outline" onClick={onAdd}><Plus /> เพิ่มแถวด้วยมือ</Button>}
      {canWork && batch.status === "needs_review" && (
        <Button size="sm" variant="outline" title="คำนวณข้อผิดพลาดใหม่ทุกแถวที่ยังไม่ได้ตัดสิน — ไม่อนุมัติและไม่แก้ค่าต้นฉบับ"
          onClick={() => onAction("curriculum_import_batch_revalidate", { p_batch_id: batch.id }, "ตรวจซ้ำทั้งชุดแล้ว (ไม่มีการอนุมัติอัตโนมัติ)")}><RefreshCw /> ตรวจซ้ำทั้งชุด</Button>
      )}
      {batch.status === "needs_review" && canApprove && (
        isCreator ? (
          <Button size="sm" disabled title="กติกา 2 คน: ผู้สร้างชุดอนุมัติเองไม่ได้"><Check /> อนุมัติชุด (ต้องเป็นหัวหน้าฯ อีกคน)</Button>
        ) : (
          <Button size="sm" disabled={!!open} title={open ? "ยังมีแถวที่ไม่ได้ตรวจ" : undefined}
            onClick={() => onAction("curriculum_import_batch_approve", { p_batch_id: batch.id }, "อนุมัติชุดนำเข้าแล้ว")}><Check /> อนุมัติชุด</Button>
        )
      )}
      {batch.status === "approved" && canApprove && (
        <Button size="sm" onClick={() => onAction("curriculum_import_batch_commit", { p_batch_id: batch.id }, "บันทึกเข้าข้อมูลหลักแล้ว")}><Database /> บันทึกเข้าข้อมูลหลัก</Button>
      )}
      {!["committed", "rejected"].includes(batch.status) && canWork && (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
          const reason = window.prompt("เหตุผลที่ปฏิเสธชุดนำเข้า");
          if (reason) void onAction("curriculum_import_batch_reject", { p_batch_id: batch.id, p_reason: reason }, "ปฏิเสธชุดนำเข้าแล้ว");
        }}><X /> ปฏิเสธชุด</Button>
      )}
      {batch.status === "committed" && <Notice>บันทึกเข้าข้อมูลหลักแล้ว — ทุกรายการอ้างกลับมาที่แถวนี้ได้</Notice>}
    </div>
  );
}

function RowCard({ row, kind, editable, onDone, sourceDocId }: { row: ImportRow; kind: string; editable: boolean; onDone: () => Promise<unknown>; sourceDocId: string }) {
  const [draft, setDraft] = useState<Record<string, string>>(row.normalized ?? {});
  const [busy, setBusy] = useState(false);
  const fields = NORMALIZED_FIELDS[kind] ?? [];
  const decided = ["approved", "skipped", "committed"].includes(row.status);
  const decide = async (decision: "approve" | "skip" | "revalidate") => {
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== "" && v != null));
      const s = await rpc<string>("curriculum_import_row_decide", { p_row_id: row.id, p_decision: decision, p_normalized: clean, p_note: null });
      toast.success(`แถว ${row.row_no}: ${ROW_STATUS_LABELS[s] ?? s}`);
      await onDone();
    } catch (e) {
      toast.error(dbErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const loc = row.source_page ? `PDF หน้า ${row.source_page}` : `Sheet ${row.source_sheet}!${row.source_cell_range}`;
  return (
    <li data-testid="import-row" className={cn("rounded-xl border p-3", row.status === "error" && "border-destructive/40")}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <b>แถว {row.row_no}</b>
        <Badge variant={row.status === "error" ? "destructive" : row.status === "approved" || row.status === "committed" ? "success" : row.status === "skipped" ? "outline" : "warning"}>{ROW_STATUS_LABELS[row.status]}</Badge>
        <span className="text-xs text-muted-foreground">{loc} · เสนอโดย {row.proposed_by === "ai" ? "AI" : row.proposed_by === "manual" ? "กรอกมือ" : "parser"}</span>
        {row.source_page && <SourcePdfLink docId={sourceDocId} locator={`pdf:${row.source_page}`} />}
      </div>
      {row.issues?.length > 0 && (
        <ul className="mb-2 space-y-1" aria-label="ปัญหาที่ตรวจพบ">
          {row.issues.map((i, k) => (
            <li key={k} className="flex items-start gap-2 text-xs"><Badge variant={SEVERITY[i.severity]}>{i.code}</Badge><span>{i.message_th}{i.field && <span className="text-muted-foreground"> ({i.field})</span>}</span></li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">ข้อมูลต้นฉบับ (raw)</p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-2 text-xs whitespace-pre-wrap">
            {typeof row.raw?.text === "string" ? row.raw.text || "(ไม่มีข้อความ)" : JSON.stringify(row.raw?.cells ?? row.raw, null, 1)}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">ค่าที่ตรวจแล้ว (normalized) — กรอกตามต้นฉบับ ห้ามเดา</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f} className="text-xs">
                <span className="text-muted-foreground">{f}</span>
                <input value={draft[f] ?? ""} disabled={!editable || decided} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                  className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70" aria-label={`แถว ${row.row_no} ${f}`} />
              </label>
            ))}
          </div>
        </div>
      </div>
      {editable && !decided && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => decide("approve")} disabled={busy}><Check /> อนุมัติแถว</Button>
          <Button size="sm" variant="outline" onClick={() => decide("revalidate")} disabled={busy}><RotateCcw /> บันทึกและตรวจซ้ำ</Button>
          <Button size="sm" variant="ghost" onClick={() => decide("skip")} disabled={busy}><SkipForward /> ข้าม</Button>
        </div>
      )}
    </li>
  );
}

function ManualRowDialog({ open, onClose, batch, onDone }: { open: boolean; onClose: () => void; batch: ImportBatch; onDone: () => Promise<unknown> }) {
  const fields = NORMALIZED_FIELDS[batch.kind] ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="เพิ่มแถวด้วยมือ" description="ต้องอ้างหน้า PDF หรือ Sheet/Cell ของต้นฉบับเสมอ" className="max-w-2xl">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => ((f.get(k) as string) ?? "").trim();
          const normalized = Object.fromEntries(fields.map((k) => [k, v(`n_${k}`)]).filter(([, x]) => x));
          try {
            await rpc("curriculum_import_add_row", {
              p_batch_id: batch.id, p_source_page: v("page") ? Number(v("page")) : null,
              p_source_sheet: v("sheet") || null, p_source_cell_range: v("cell") || null, p_normalized: normalized, p_note: v("note") || null,
            });
            toast.success("เพิ่มแถวแล้ว");
            await onDone();
            onClose();
          } catch (err) {
            toast.error(dbErrorMessage(err));
          }
        }}>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="หน้า PDF" htmlFor="m-page"><Input id="m-page" name="page" inputMode="numeric" /></FormField>
            <FormField label="หรือ Sheet" htmlFor="m-sheet"><Input id="m-sheet" name="sheet" /></FormField>
            <FormField label="Cell" htmlFor="m-cell"><Input id="m-cell" name="cell" placeholder="B5:H5" /></FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((k) => <FormField key={k} label={k} htmlFor={`m-${k}`}><Input id={`m-${k}`} name={`n_${k}`} /></FormField>)}
          </div>
          <FormField label="หมายเหตุ" htmlFor="m-note"><Input id="m-note" name="note" /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button><Button type="submit">เพิ่มแถว</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
