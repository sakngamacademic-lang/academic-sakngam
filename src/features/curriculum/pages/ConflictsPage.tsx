import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { DataTable, PageHeader, TableToolbar } from "@/components/shared";
import { KpiCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import {
  AUTHORITY_LABELS,
  CONFLICT_CATEGORY_LABELS,
  CONFLICT_STATUS_LABELS,
  curriculumKey,
  PAGE_SIZE,
  rpc,
  useConflicts,
  useSourceDocuments,
  type ConflictCategory,
  type ConflictStatus,
  type SourceConflict,
} from "../api";
import { CurriculumNav, formatLocator, Notice, Pager, SourcePdfLink } from "../components";
import { downloadCsv } from "../export";

const STATUS_VARIANT = { open: "outline", needs_decision: "warning", resolved: "success" } as const;
type SortKey = "code" | "category" | "updated";

/** ทะเบียนข้อขัดแย้ง — ค่า A/B, ความแตกต่าง, ผลกระทบ, ข้อเสนอ, ผู้มีอำนาจตัดสิน · AI/เจ้าหน้าที่ปิดไม่ได้ */
export function ConflictsPage() {
  const q = useConflicts();
  const docs = useSourceDocuments();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | ConflictStatus>("");
  const [category, setCategory] = useState<"" | ConflictCategory>("");
  const [sort, setSort] = useState<SortKey>("code");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = (q.data ?? []).filter((c) =>
      (!status || c.status === status) && (!category || c.category === category) &&
      (!s || [c.conflict_code, c.subject_ref, c.description, c.value_a, c.value_b].some((x) => x?.toLowerCase().includes(s))));
    const cmp: Record<SortKey, (a: SourceConflict, b: SourceConflict) => number> = {
      code: (a, b) => a.conflict_code.localeCompare(b.conflict_code, "en", { numeric: true }),
      category: (a, b) => a.category.localeCompare(b.category) || a.conflict_code.localeCompare(b.conflict_code, "en", { numeric: true }),
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
    };
    return list.sort(cmp[sort]);
  }, [q.data, search, status, category, sort]);
  const count = (st: ConflictStatus) => q.data?.filter((c) => c.status === st).length ?? 0;
  const docCode = new Map(docs.data?.map((d) => [d.id, d.register_code]));
  const current = q.data?.find((c) => c.id === openId) ?? null;
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  return (
    <>
      <PageHeader title="ทะเบียนข้อขัดแย้ง" description="ข้อมูลที่ขัดกันระหว่างแหล่งในเล่มหลักสูตร — ระบบไม่แก้ค่าต้นฉบับ และปิดได้เฉพาะการตัดสินของหัวหน้าฝ่ายวิชาการ" />
      <CurriculumNav />
      <section aria-label="สรุปสถานะ" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="ทั้งหมด" value={q.data?.length ?? 0} loading={q.isPending} />
        <KpiCard label="รอตัดสินใจ" tone="accent" value={count("needs_decision")} loading={q.isPending} />
        <KpiCard label="เปิด (ยังไม่คัดกรอง)" value={count("open")} loading={q.isPending} />
        <KpiCard label="ตัดสินแล้ว" tone="ok" value={count("resolved")} loading={q.isPending} />
      </section>
      <TableToolbar search={search} onSearch={reset(setSearch)} placeholder="ค้นหารหัส CF / รหัสวิชา / ข้อความ">
        <Select aria-label="กรองสถานะ" className="sm:w-40" value={status} onChange={(e) => reset(setStatus)(e.target.value as ConflictStatus)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(CONFLICT_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select aria-label="กรองหมวด" className="sm:w-48" value={category} onChange={(e) => reset(setCategory)(e.target.value as ConflictCategory)}>
          <option value="">ทุกหมวด</option>
          {Object.entries(CONFLICT_CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select aria-label="เรียงตาม" className="sm:w-40" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="code">เรียงตามรหัส</option>
          <option value="category">เรียงตามหมวด</option>
          <option value="updated">แก้ไขล่าสุด</option>
        </Select>
        <Button variant="outline" size="sm" className="h-10" disabled={!rows.length}
          onClick={() => downloadCsv(`conflict-register-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((c) => ({
            conflict_id: c.conflict_code, category: CONFLICT_CATEGORY_LABELS[c.category], subject: c.subject_ref ?? "", issue: c.description,
            source: `${docCode.get(c.doc_a_id) ?? ""} ${formatLocator(c.locator_a)}${c.locator_b ? ` / ${formatLocator(c.locator_b)}` : ""}`,
            value_a: c.value_a ?? "", value_b: c.value_b ?? "", difference: c.difference ?? "", impact: c.impact_note ?? "",
            recommendation: c.recommendation ?? "", decision_authority: AUTHORITY_LABELS[c.decision_authority], status: CONFLICT_STATUS_LABELS[c.status],
            resolution: c.resolution ?? "",
          })))}>
          <Download /> CSV
        </Button>
      </TableToolbar>
      <DataTable
        caption="ทะเบียนข้อขัดแย้ง"
        loading={q.isPending}
        error={q.error ? dbErrorMessage(q.error) : null}
        rows={rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
        rowKey={(c) => c.id}
        emptyText="ไม่พบข้อขัดแย้งตามเงื่อนไข"
        columns={[
          { key: "code", header: "รหัส", cell: (c) => <code className="text-xs whitespace-nowrap">{c.conflict_code}</code> },
          { key: "issue", header: "ประเด็น", cell: (c) => <span className="line-clamp-2">{c.description}</span> },
          { key: "cat", header: "หมวด", cell: (c) => CONFLICT_CATEGORY_LABELS[c.category], hideOnMobile: true },
          { key: "src", header: "หน้า", cell: (c) => <span className="text-xs text-muted-foreground">{formatLocator(c.locator_a)}{c.locator_b ? ` ↔ ${formatLocator(c.locator_b)}` : ""}</span>, hideOnMobile: true },
          { key: "status", header: "สถานะ", cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{CONFLICT_STATUS_LABELS[c.status]}</Badge> },
        ]}
        actions={(c) => <Button size="sm" variant="outline" onClick={() => setOpenId(c.id)}>รายละเอียด</Button>}
      />
      <Pager page={page} total={rows.length} onPage={setPage} />
      <ConflictDrawer conflict={current} onClose={() => setOpenId(null)} canTriage={can("curriculum.manage")} canResolve={can("curriculum.approve")} docCode={docCode} />
    </>
  );
}

function ConflictDrawer({ conflict: c, onClose, canTriage, canResolve, docCode }: {
  conflict: SourceConflict | null; onClose: () => void; canTriage: boolean; canResolve: boolean; docCode: Map<string, string>;
}) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      setResolution("");
      await qc.invalidateQueries({ queryKey: curriculumKey });
    } catch (e) {
      toast.error(dbErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) =>
    children ? <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm whitespace-pre-wrap">{children}</dd></div> : null;
  return (
    <Sheet open={Boolean(c)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[32rem] max-w-[100vw] overflow-y-auto border-l bg-background p-5">
        {c && (
          <>
            <SheetTitle className="flex flex-wrap items-center gap-2 pr-8 text-base font-semibold">
              <code>{c.conflict_code}</code> <Badge variant={STATUS_VARIANT[c.status]}>{CONFLICT_STATUS_LABELS[c.status]}</Badge>
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">{c.description}</SheetDescription>
            <dl className="mt-4 space-y-3">
              <Row label="หมวด">{CONFLICT_CATEGORY_LABELS[c.category]}{c.subject_ref ? ` · ${c.subject_ref}` : ""}</Row>
              <div>
                <dt className="text-xs text-muted-foreground">เอกสารและหน้า</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-1 text-sm">
                  {docCode.get(c.doc_a_id)} {formatLocator(c.locator_a)} <SourcePdfLink docId={c.doc_a_id} locator={c.locator_a} />
                  {c.locator_b && <>· {formatLocator(c.locator_b)} <SourcePdfLink docId={c.doc_b_id ?? c.doc_a_id} locator={c.locator_b} /></>}
                </dd>
              </div>
              <Row label="ค่า A">{c.value_a}</Row>
              <Row label="ค่า B">{c.value_b}</Row>
              <Row label="ความแตกต่าง">{c.difference}</Row>
              <Row label="ผลกระทบ">{c.impact_note}</Row>
              <Row label="ข้อเสนอแนะ (ผลวิเคราะห์ — ไม่ใช่การตัดสิน)">{c.recommendation}</Row>
              <Row label="ผู้มีอำนาจตัดสินใจ">{AUTHORITY_LABELS[c.decision_authority]}</Row>
              <Row label="ผลการตัดสิน">{c.resolution}</Row>
            </dl>
            {c.status !== "resolved" && (
              <div className="mt-5 space-y-3 border-t pt-4">
                {c.decision_authority !== "academic_head" && (
                  <Notice tone="warning">ประเด็นนี้ต้องใช้มติของ{AUTHORITY_LABELS[c.decision_authority]} — บันทึกผลมติในช่องผลการตัดสิน</Notice>
                )}
                {canTriage && (
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => run(() => rpc("source_conflict_set_status", { p_id: c.id, p_status: c.status === "open" ? "needs_decision" : "open" }), "ปรับสถานะคัดกรองแล้ว")}>
                    {c.status === "open" ? "ส่งให้ตัดสินใจ" : "ย้อนกลับเป็นเปิด"}
                  </Button>
                )}
                {canResolve ? (
                  <form className="space-y-2" onSubmit={(e) => {
                    e.preventDefault();
                    void run(() => rpc("source_conflict_resolve", { p_id: c.id, p_resolution: resolution }), "บันทึกผลการตัดสินแล้ว");
                  }}>
                    <label htmlFor="cf-resolution" className="text-sm font-medium">ผลการตัดสินและเหตุผล</label>
                    <textarea id="cf-resolution" required value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3}
                      className="w-full rounded-md border bg-card p-2 text-sm" placeholder="ระบุค่าที่ใช้ เอกสารอ้างอิง และเหตุผล" />
                    <Button size="sm" type="submit" disabled={busy || !resolution.trim()}>บันทึกผลการตัดสิน</Button>
                  </form>
                ) : (
                  <p className="text-xs text-muted-foreground">การตัดสินทำได้เฉพาะหัวหน้าฝ่ายวิชาการ</p>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
