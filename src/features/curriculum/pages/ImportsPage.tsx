import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus, ScanText } from "lucide-react";
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
      <PageHeader title="แหล่งข้อมูล & นำเข้า" description="อัปโหลด → อ่านไฟล์ → ตรวจ → ตรวจรายแถว → อนุมัติ (คนละคน) → บันทึก · ไฟล์ต้นฉบับเก็บแบบ private"
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
            { key: "rel", header: "ความน่าเชื่อถือ", cell: (d) => <Badge variant={d.reliability === "A" ? "success" : d.reliability === "D" ? "destructive" : "secondary"}>{d.reliability}</Badge> },
            { key: "content", header: "เนื้อหา", cell: (d) => (d.content_status === "has_content" ? (d.file_id ? "มีไฟล์" : "ยังไม่แนบไฟล์") : <Badge variant="warning">{d.content_status}</Badge>) },
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

function SourceDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="ลงทะเบียนเอกสารต้นทาง" description="ไฟล์เก็บใน storage แบบ private · ระบบคำนวณ SHA-256 ให้ · ไม่มีการเปิดเป็น public" className="max-w-2xl">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => ((f.get(k) as string) ?? "").trim() || null;
          const file = f.get("file") as File | null;
          setBusy(true);
          try {
            let fileId: string | null = null;
            let sha: string | null = null;
            if (file && file.size > 0) {
              const r = await edgeFunctionStorage.upload(file, { curriculumSource: true });
              fileId = r.fileId;
              sha = r.sha256;
            }
            await insertRow("source_documents", {
              register_code: v("code"), title: v("title"), doc_type: v("type"), reliability: v("reliability"), content_status: v("content") ?? "has_content",
              page_count: v("pages") ? Number(v("pages")) : null, page_offset: v("offset") ? Number(v("offset")) : null,
              declared_curriculum_ref: v("declared"), notes: v("notes"), file_id: fileId, sha256: sha,
            });
            toast.success("ลงทะเบียนเอกสารแล้ว");
            await onDone();
            onClose();
          } catch (err) {
            toast.error(err instanceof StorageError ? err.message : dbErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="รหัสทะเบียน" htmlFor="s-code" hint="เช่น SRC-01, SRC-03-SC"><Input id="s-code" name="code" required pattern="SRC-[0-9]{2}(-[A-Z0-9]{1,8})?" /></FormField>
            <FormField label="ประเภท" htmlFor="s-type"><Select id="s-type" name="type">{Object.entries(DOC_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
          </div>
          <FormField label="ชื่อเอกสาร" htmlFor="s-title"><Input id="s-title" name="title" required /></FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="ความน่าเชื่อถือ" htmlFor="s-rel"><Select id="s-rel" name="reliability"><option value="A">A — ประกาศ/เล่มที่อนุมัติ</option><option value="B">B — ทางการประกอบ</option><option value="C">C — ไฟล์ทำงาน</option><option value="D">D — ไม่ทราบ/ว่าง</option></Select></FormField>
            <FormField label="จำนวนหน้า PDF" htmlFor="s-pages"><Input id="s-pages" name="pages" inputMode="numeric" /></FormField>
            <FormField label="หน้า PDF − หน้าเล่ม" htmlFor="s-offset"><Input id="s-offset" name="offset" inputMode="numeric" /></FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ฉบับที่เอกสารระบุเอง" htmlFor="s-decl"><Input id="s-decl" name="declared" /></FormField>
            <FormField label="สถานะเนื้อหา" htmlFor="s-content"><Select id="s-content" name="content"><option value="has_content">มีเนื้อหา</option><option value="empty">ว่าง</option><option value="variant">ต่างฉบับ</option></Select></FormField>
          </div>
          <FormField label="ไฟล์ (PDF / .xlsx ≤ 100 MB)" htmlFor="s-file"><input id="s-file" name="file" type="file" accept=".pdf,.xlsx,.xls" className="block w-full rounded-md border border-input bg-background px-2 py-2 text-sm" /></FormField>
          <FormField label="หมายเหตุ" htmlFor="s-notes"><Input id="s-notes" name="notes" /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button><Button type="submit" disabled={busy}>{busy ? "กำลังอัปโหลด…" : "บันทึก"}</Button></div>
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
