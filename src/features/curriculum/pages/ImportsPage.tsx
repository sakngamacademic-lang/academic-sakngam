import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileUp, Loader2, Plus, ScanText } from "lucide-react";
import { DataTable, PageHeader } from "@/components/shared";
import { DashSection, LiveBadge } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLearningAreas } from "@/features/master-data/api";
import { callFunction, edgeFunctionStorage, StorageError } from "@/lib/storage";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { requireSupabase } from "@/lib/supabase";
import {
  allVersions,
  BATCH_KIND_LABELS,
  BATCH_STATUS_LABELS,
  curriculumKey,
  DOC_TYPE_LABELS,
  insertRow,
  NORMALIZED_FIELDS,
  useBatches,
  useConflicts,
  useCurricula,
  useSourceDocuments,
  type ImportBatch,
  type SourceDocument,
} from "../api";
import { startAnalysis } from "../analysis-api";
import { fileErrorMessage, isPdfName, parsePdfPage, pdfPageUrl } from "../source-file";
import { CurriculumNav, EmptyState, formatLocator, Notice } from "../components";

/** แหล่งข้อมูล (Source Register) · ข้อขัดแย้ง · ชุดนำเข้า */
export function ImportsPage() {
  const { can } = useAuth();
  const canManage = can("curriculum.manage");
  const canEdit = can("curriculum.edit");
  const qc = useQueryClient();
  const sources = useSourceDocuments();
  const conflicts = useConflicts();
  const batches = useBatches();
  const curricula = useCurricula();
  const [dialog, setDialog] = useState<null | "source" | "conflict" | "batch">(null);
  const [parsing, setParsing] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: curriculumKey });
  const docCode = useMemo(() => new Map(sources.data?.map((d) => [d.id, d.register_code])), [sources.data]);
  const versionLabel = new Map(allVersions(curricula.data).map((v) => [v.id, v.version_label]));

  const parse = async (b: ImportBatch) => {
    setParsing(b.id);
    try {
      const r = await callFunction<{ rows: number; parser: string }>("curriculum-import-parse", { batchId: b.id });
      toast.success(`อ่านไฟล์แล้ว ${r.rows} แถว (${r.parser}) — ไปตรวจรายแถว`);
    } catch (e) {
      toast.error(e instanceof StorageError ? e.message : dbErrorMessage(e));
    } finally {
      setParsing(null);
      await refresh();
    }
  };
  return (
    <>
      <PageHeader title="แหล่งข้อมูล & นำเข้า" description="อัปโหลด → อ่านไฟล์ → ตรวจ → ตรวจรายแถว → อนุมัติโดยผู้ดูแลหลักสูตร → บันทึก · ไฟล์ต้นฉบับเก็บแบบ private"
        actions={canManage && <Button onClick={() => setDialog("source")}><FileUp /> ลงทะเบียนเอกสาร</Button>} />
      <CurriculumNav />

      <DashSection id="sources" title={<span className="flex items-center gap-2">ทะเบียนเอกสารต้นทาง <LiveBadge /></span>} meta={`${sources.data?.length ?? 0} รายการ`}>
        <DataTable<SourceDocument>
          caption="เอกสารต้นทาง"
          rows={sources.data}
          loading={sources.isPending}
          error={sources.error ? dbErrorMessage(sources.error) : null}
          emptyText="ยังไม่มีเอกสารต้นทาง — ลงทะเบียนพร้อมแนบไฟล์ PDF/Excel"
          rowKey={(d) => d.id}
          columns={[
            { key: "code", header: "รหัส", cell: (d) => <code className="text-xs">{d.register_code}</code>, className: "w-28" },
            { key: "title", header: "เอกสาร", cell: (d) => <span><span className="font-medium">{d.title}</span><span className="block text-xs text-muted-foreground">{DOC_TYPE_LABELS[d.doc_type]}{d.page_count ? ` · ${d.page_count} หน้า` : ""}{d.declared_curriculum_ref ? ` · ระบุ ${d.declared_curriculum_ref}` : ""}</span></span> },
            { key: "rel", header: "ความน่าเชื่อถือ", cell: (d) => d.reliability ? <Badge variant={d.reliability === "A" ? "success" : d.reliability === "D" ? "destructive" : "secondary"}>{d.reliability}</Badge> : <Badge variant="outline">รอตรวจสอบ</Badge> },
            { key: "content", header: "เนื้อหา", cell: (d) => (d.content_status === "has_content" ? (d.file_id ? "มีไฟล์" : "ยังไม่แนบไฟล์") : <Badge variant="warning">{d.content_status}</Badge>) },
            { key: "file", header: "ไฟล์", cell: (d) => (d.file_id ? <SourceFileActions doc={d} /> : <span className="text-xs text-muted-foreground">—</span>), className: "w-[19rem]" },
          ]}
        />
      </DashSection>

      <DashSection id="conflicts" className="mt-4" title="ข้อขัดแย้งระหว่างเอกสาร"
        meta={`${conflicts.data?.filter((c) => c.status !== "resolved").length ?? 0} ยังไม่ตัดสิน · ${conflicts.data?.length ?? 0} ทั้งหมด`}
        actions={canManage && <Button size="sm" variant="outline" onClick={() => setDialog("conflict")} disabled={!sources.data?.length}><Plus /> บันทึกข้อขัดแย้ง</Button>}>
        <p className="text-sm text-muted-foreground">
          ตรวจ คัดกรอง และตัดสินข้อขัดแย้งได้ที่ <Link className="text-primary underline-offset-4 hover:underline" to="/office/curriculum/conflicts">ทะเบียนข้อขัดแย้ง</Link>
        </p>
      </DashSection>

      <DashSection id="batches" className="mt-4" title={<span className="flex items-center gap-2">ชุดนำเข้า <LiveBadge /></span>}
        actions={canEdit && <Button size="sm" onClick={() => setDialog("batch")} disabled={!sources.data?.length}><Plus /> สร้างชุดนำเข้า</Button>}>
        {!batches.data?.length ? <EmptyState title="ยังไม่มีชุดนำเข้า">สร้างชุดนำเข้าจากเอกสารที่ลงทะเบียน แล้วกด “อ่านไฟล์”</EmptyState> : (
          <ul className="divide-y text-sm">
            {batches.data.map((b) => (
              <li key={b.id} data-testid="batch" className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{BATCH_KIND_LABELS[b.kind]} <Badge variant="secondary">{BATCH_STATUS_LABELS[b.status]}</Badge></p>
                  <p className="text-xs text-muted-foreground">
                    {docCode.get(b.source_document_id)} → {versionLabel.get(b.curriculum_version_id)} · แถว {b.counts?.total ?? 0} · อนุมัติ {b.counts?.approved ?? 0} · ผิดพลาด {b.counts?.error ?? 0}
                    {b.status_note && ` · ${b.status_note}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {(b.status === "uploaded" || b.status === "failed") && canEdit && (
                    <Button size="sm" onClick={() => parse(b)} disabled={parsing === b.id}><ScanText /> {parsing === b.id ? "กำลังอ่าน…" : "อ่านไฟล์"}</Button>
                  )}
                  <Button size="sm" variant="outline" asChild><Link to={`/office/curriculum/review?batch=${b.id}`}>ตรวจรายแถว</Link></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashSection>

      <SourceDialog open={dialog === "source"} onClose={() => setDialog(null)} onDone={refresh} />
      <ConflictDialog open={dialog === "conflict"} onClose={() => setDialog(null)} onDone={refresh} sources={sources.data ?? []} />
      <BatchDialog open={dialog === "batch"} onClose={() => setDialog(null)} onDone={refresh} sources={sources.data ?? []}
        versions={allVersions(curricula.data).filter((v) => v.status === "draft")} />
    </>
  );
}

const LAST_DOC_TYPE = "curriculum.lastDocType";
const readLastType = () => { try { return localStorage.getItem(LAST_DOC_TYPE) ?? "other"; } catch { return "other"; } };
const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 300);

/** ลงทะเบียนเอกสารต้นทางแบบง่าย: เลือกไฟล์ → อัปโหลด · รหัส SRC-NN สร้างที่ฐานข้อมูล · ช่องอื่นไม่บังคับ (ว่าง = รอตรวจสอบ) */
async function autoAnalyze(fileId: string) {
  try {
    const { data } = await requireSupabase().from("source_documents").select("id, register_code").eq("file_id", fileId).maybeSingle();
    if (!data) return;
    await startAnalysis(data.id, false);
    toast.success(`เริ่มวิเคราะห์ ${data.register_code} อัตโนมัติ — ดูผลที่เมนู “วิเคราะห์เอกสาร (อัตโนมัติ)”`);
  } catch (e) {
    toast.error(`ยังวิเคราะห์อัตโนมัติไม่ได้: ${e instanceof Error ? e.message : "ไม่ทราบสาเหตุ"} — สั่งวิเคราะห์ใหม่ได้ที่หน้าวิเคราะห์เอกสาร`);
  }
}

function SourceDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState(readLastType);
  const reset = () => { setFile(null); setTitle(""); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) { reset(); onClose(); } }}>
      <DialogContent title="ลงทะเบียนเอกสารต้นทาง" description="เลือกไฟล์แล้วกดอัปโหลด — ระบบตั้งรหัสทะเบียนให้อัตโนมัติ เก็บไฟล์แบบ private และคำนวณ SHA-256 ให้" className="max-w-2xl">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          const f = new FormData(e.currentTarget);
          const v = (k: string) => ((f.get(k) as string) ?? "").trim() || null;
          const num = (k: string) => (v(k) && Number.isFinite(Number(v(k))) ? Number(v(k)) : null);
          setBusy(true);
          try {
            const r = await edgeFunctionStorage.upload(file, { curriculumSource: true });
            await insertRow("source_documents", {
              // ไม่ส่งรหัส = ให้ฐานข้อมูลออกเลข SRC-NN ถัดไป (ไม่ซ้ำ)
              ...(v("code") ? { register_code: v("code") } : {}),
              title: title.trim() || titleFromFile(file.name), doc_type: docType,
              reliability: v("reliability"),
              content_status: v("content") ?? "has_content",
              page_count: num("pages"), page_offset: num("offset"), issued_year_be: num("year"),
              declared_curriculum_ref: v("declared"), notes: v("notes"), file_id: r.fileId, sha256: r.sha256,
            });
            try { localStorage.setItem(LAST_DOC_TYPE, docType); } catch { /* ไม่จำเป็น */ }
            toast.success("อัปโหลดและลงทะเบียนเอกสารแล้ว (รอตรวจสอบรายละเอียด)");
            // วิเคราะห์อัตโนมัติหลังอัปโหลด (เบื้องหลัง · ไม่ใช้ AI จนกว่าผู้ดูแลอนุญาตในหน้าวิเคราะห์) — ล้มเหลวก็ไม่กระทบการลงทะเบียน
            if (/\.(pdf|xlsx)$/i.test(file.name)) void autoAnalyze(r.fileId);
            await onDone();
            reset();
            onClose();
          } catch (err) {
            toast.error(err instanceof StorageError ? err.message : dbErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}>
          <FormField label="ไฟล์ (PDF / Excel ≤ 100 MB)" htmlFor="s-file">
            <input id="s-file" name="file" type="file" accept=".pdf,.xlsx,.xls" required className="block w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              onChange={(e) => { const x = e.target.files?.[0] ?? null; setFile(x); if (x) setTitle(titleFromFile(x.name)); }} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ชื่อเอกสาร" htmlFor="s-title" hint="ใช้ชื่อไฟล์ให้อัตโนมัติ แก้ไขได้"><Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} /></FormField>
            <FormField label="ประเภท" htmlFor="s-type" hint="จำค่าที่เลือกครั้งล่าสุด"><Select id="s-type" value={docType} onChange={(e) => setDocType(e.target.value)}>{Object.entries(DOC_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
          </div>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">รายละเอียดเพิ่มเติม (ไม่บังคับ — เว้นว่างได้ ระบบแสดง “รอตรวจสอบ”)</summary>
            <div className="mt-3 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="รหัสทะเบียน" htmlFor="s-code" hint="เว้นว่าง = ระบบสร้าง SRC-NN ให้"><Input id="s-code" name="code" placeholder="สร้างอัตโนมัติ" pattern="[Ss][Rr][Cc]-[0-9]{2,4}(-[A-Za-z0-9]{1,8})?" /></FormField>
                <FormField label="ความน่าเชื่อถือ" htmlFor="s-rel" hint="ผู้ตรวจเป็นผู้กำหนด"><Select id="s-rel" name="reliability" defaultValue=""><option value="">รอตรวจสอบ</option><option value="A">A — ประกาศ/เล่มที่อนุมัติ</option><option value="B">B — ทางการประกอบ</option><option value="C">C — ไฟล์ทำงาน</option><option value="D">D — ไม่ทราบ/ว่าง</option></Select></FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="จำนวนหน้า PDF" htmlFor="s-pages"><Input id="s-pages" name="pages" inputMode="numeric" placeholder="รอตรวจสอบ" /></FormField>
                <FormField label="หน้า PDF − หน้าเล่ม" htmlFor="s-offset"><Input id="s-offset" name="offset" inputMode="numeric" placeholder="รอตรวจสอบ" /></FormField>
                <FormField label="ปีเอกสาร (พ.ศ.)" htmlFor="s-year"><Input id="s-year" name="year" inputMode="numeric" placeholder="รอตรวจสอบ" /></FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="ฉบับที่เอกสารระบุเอง" htmlFor="s-decl"><Input id="s-decl" name="declared" /></FormField>
                <FormField label="สถานะเนื้อหา" htmlFor="s-content"><Select id="s-content" name="content" defaultValue="has_content"><option value="has_content">มีเนื้อหา</option><option value="empty">ว่าง</option><option value="variant">ต่างฉบับ</option></Select></FormField>
              </div>
              <FormField label="หมายเหตุ" htmlFor="s-notes"><Input id="s-notes" name="notes" /></FormField>
            </div>
          </details>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { reset(); onClose(); }}>ยกเลิก</Button><Button type="submit" disabled={busy || !file}>{busy ? "กำลังอัปโหลด…" : "อัปโหลด"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConflictDialog({ open, onClose, onDone, sources }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown>; sources: SourceDocument[] }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="บันทึกข้อขัดแย้งระหว่างเอกสาร">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => ((f.get(k) as string) ?? "").trim() || null;
          try {
            await insertRow("source_conflicts", { conflict_code: v("code"), doc_a_id: v("a"), doc_b_id: v("b"), description: v("desc"), impact: v("impact"), locator_a: v("la"), locator_b: v("lb") });
            toast.success("บันทึกข้อขัดแย้งแล้ว");
            await onDone();
            onClose();
          } catch (err) {
            toast.error(dbErrorMessage(err));
          }
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="รหัส" htmlFor="c-code" hint="เช่น CF-01"><Input id="c-code" name="code" required pattern="CF-[0-9]{2,4}" /></FormField>
            <FormField label="ผลกระทบ" htmlFor="c-impact"><Select id="c-impact" name="impact"><option value="warning">warning</option><option value="blocking">blocking — ห้ามอนุมัตินำเข้า</option></Select></FormField>
            <FormField label="เอกสาร A" htmlFor="c-a"><Select id="c-a" name="a">{sources.map((d) => <option key={d.id} value={d.id}>{d.register_code}</option>)}</Select></FormField>
            <FormField label="เอกสาร B (ถ้ามี)" htmlFor="c-b"><Select id="c-b" name="b"><option value="">—</option>{sources.map((d) => <option key={d.id} value={d.id}>{d.register_code}</option>)}</Select></FormField>
            <FormField label="ตำแหน่งใน A" htmlFor="c-la"><Input id="c-la" name="la" placeholder="pdf:4" /></FormField>
            <FormField label="ตำแหน่งใน B" htmlFor="c-lb"><Input id="c-lb" name="lb" placeholder="sheet:ม.6!B4" /></FormField>
          </div>
          <FormField label="รายละเอียด" htmlFor="c-desc"><Input id="c-desc" name="desc" required /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button><Button type="submit">บันทึก</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const MAPPING_TEMPLATE = (kind: string) =>
  JSON.stringify({ sheet: "ชื่อชีต", header_row: 3, first_row: 4, columns: Object.fromEntries((NORMALIZED_FIELDS[kind] ?? []).slice(0, 3).map((f, i) => [f, String.fromCharCode(65 + i)])) }, null, 2);

function BatchDialog({ open, onClose, onDone, sources, versions }: {
  open: boolean; onClose: () => void; onDone: () => Promise<unknown>; sources: SourceDocument[]; versions: ReturnType<typeof allVersions>;
}) {
  const areas = useLearningAreas();
  const usable = sources.filter((s) => s.content_status === "has_content" && s.file_id);
  const [kind, setKind] = useState("subjects");
  const [mapping, setMapping] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="สร้างชุดนำเข้า" description="Excel ต้องกำหนดการจับคู่คอลัมน์ · PDF ระบุช่วงหน้าได้ เช่น {&quot;pages&quot;: &quot;120-135&quot;}" className="max-w-2xl">
        {!versions.length || !usable.length ? (
          <Notice tone="warning">ต้องมีหลักสูตรฉบับร่าง และเอกสารต้นทางที่แนบไฟล์แล้ว</Notice>
        ) : (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const v = (k: string) => ((f.get(k) as string) ?? "").trim() || null;
            let column_mapping: unknown = null;
            try {
              column_mapping = mapping.trim() ? JSON.parse(mapping) : null;
            } catch {
              toast.error("การจับคู่คอลัมน์ต้องเป็น JSON ที่ถูกต้อง");
              return;
            }
            try {
              await insertRow("import_batches", { source_document_id: v("source"), curriculum_version_id: v("version"), kind, learning_area_id: v("area"), column_mapping });
              toast.success("สร้างชุดนำเข้าแล้ว — กด “อ่านไฟล์” เพื่อเริ่ม");
              await onDone();
              onClose();
            } catch (err) {
              toast.error(dbErrorMessage(err));
            }
          }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="เอกสารต้นทาง" htmlFor="b-src"><Select id="b-src" name="source">{usable.map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}</Select></FormField>
              <FormField label="หลักสูตรฉบับร่างเป้าหมาย" htmlFor="b-v"><Select id="b-v" name="version">{versions.map((x) => <option key={x.id} value={x.id}>{x.curriculum_name} · {x.version_label}</option>)}</Select></FormField>
              <FormField label="ชนิดข้อมูล" htmlFor="b-kind"><Select id="b-kind" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(BATCH_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
              <FormField label="ขอบเขตกลุ่มสาระ (หัวหน้ากลุ่มสาระต้องระบุ)" htmlFor="b-area"><Select id="b-area" name="area"><option value="">ทั้งโรงเรียน</option>{areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name_th}</option>)}</Select></FormField>
            </div>
            <FormField label="การจับคู่คอลัมน์ / ช่วงหน้า (JSON)" htmlFor="b-map" hint={`ช่องที่ใช้ได้: ${(NORMALIZED_FIELDS[kind] ?? []).join(", ")}`}>
              <textarea id="b-map" rows={6} value={mapping} onChange={(e) => setMapping(e.target.value)} placeholder={MAPPING_TEMPLATE(kind)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
            </FormField>
            <p className="text-xs text-muted-foreground">ตำแหน่งต้นฉบับทุกแถวจะถูกบันทึกอัตโนมัติ (Sheet!Cell หรือ {formatLocator("pdf:1")})</p>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button><Button type="submit">สร้าง</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * ปุ่มเปิด/ดาวน์โหลดไฟล์ต้นทาง — ขอ presigned URL (5 นาที) จาก storage-download-url ทุกครั้ง
 * (ฐานข้อมูลตรวจสิทธิ์ + บันทึก log; bucket ยังเป็น private) · เปิด PDF แบบ inline ตรงหน้าที่ระบุได้
 */
function SourceFileActions({ doc }: { doc: SourceDocument }) {
  const [page, setPage] = useState("");
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileId = doc.file_id!;

  const open = async () => {
    setError(null);
    const p = parsePdfPage(page, doc.page_count);
    if ("error" in p) return setError(p.error);
    // เปิดแท็บก่อน await เพื่อไม่ให้เบราว์เซอร์บล็อก pop-up แล้วค่อยใส่ URL
    const w = window.open("", "_blank");
    setBusy("open");
    try {
      if (!w) throw new Error("popup blocked");
      w.opener = null;
      w.document.title = `${doc.register_code} — กำลังเปิดเอกสาร…`;
      const r = await callFunction<{ url: string; fileName: string }>("storage-download-url", { fileId, inline: true });
      if (!isPdfName(r.fileName)) {
        w.close();
        setError("ไฟล์นี้ไม่ใช่ PDF — ใช้ปุ่มดาวน์โหลด");
        return;
      }
      w.location.replace(pdfPageUrl(r.url, p.page));
    } catch (e) {
      w?.close();
      setError(fileErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setError(null);
    setBusy("download");
    try {
      await edgeFunctionStorage.download(fileId);
    } catch (e) {
      setError(fileErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <Input aria-label={`เลขหน้าที่จะเปิด ${doc.register_code}`} inputMode="numeric" placeholder="หน้า" value={page}
          onChange={(e) => setPage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void open()}
          className="h-8 w-16 px-2 text-xs" title={doc.page_count ? `1–${doc.page_count}` : "เว้นว่าง = หน้าแรก"} />
        <Button size="sm" variant="outline" className="h-8" disabled={busy !== null} onClick={open} aria-label={`เปิด PDF ${doc.register_code}`}>
          {busy === "open" ? <Loader2 className="animate-spin" /> : <ExternalLink />} เปิด PDF
        </Button>
        <Button size="sm" variant="ghost" className="h-8" disabled={busy !== null} onClick={download} aria-label={`ดาวน์โหลด ${doc.register_code}`}>
          {busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} ดาวน์โหลด
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
