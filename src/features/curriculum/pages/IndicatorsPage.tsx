import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { PageHeader, TableToolbar } from "@/components/shared";
import { DashSection, KpiCard, LiveBadge } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { curriculumKey, rpc, useCoverage, useFrameworkVersions, useIndicators, usePendingMappings } from "../api";
import { CurriculumNav, EmptyState, Notice, Pager, SourceRef, useSelectedVersion, VersionPicker , VersionStatusNotice } from "../components";

const COVERAGE_FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "verified", label: "มีความสัมพันธ์ที่ยืนยันแล้ว" },
  { value: "pending_review", label: "รอตรวจ" },
  { value: "unmapped", label: "ยังไม่มี Mapping" },
  { value: "evidence", label: "หลักฐานไม่ครบ" },
  { value: "duplicate", label: "อาจซ้ำซ้อน" },
];

/** C2: กรอบแกนกลาง → หลักสูตรสถานศึกษา → รายวิชา · Coverage / Gap เบื้องต้น */
export function IndicatorsPage() {
  const [tab, setTab] = useState<"gap" | "review" | "framework">("gap");
  return (
    <>
      <PageHeader title="ตัวชี้วัด & Curriculum Mapping" description="Mapping บอกความสัมพันธ์ที่ตรวจแล้ว — ไม่ได้หมายความว่าเรียนหรือสอนครบ" />
      <CurriculumNav />
      <div role="tablist" aria-label="มุมมอง" className="mb-4 flex flex-wrap gap-1">
        {([["gap", "Coverage / Gap"], ["review", "ตรวจ Mapping"], ["framework", "กรอบหลักสูตรแกนกลาง"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("h-9 rounded-full border px-3 text-sm", tab === k ? "border-primary/60 bg-primary/15" : "text-muted-foreground hover:text-foreground")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "gap" && <GapReport />}
      {tab === "review" && <MappingReview />}
      {tab === "framework" && <FrameworkBrowser />}
    </>
  );
}

function GapReport() {
  const sel = useSelectedVersion();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const q = useCoverage(sel.selected?.id, status, page);
  const d = q.data;
  const complete = d?.rows[0]?.framework_complete ?? false;
  const total = (d?.verified ?? 0) + (d?.pending ?? 0) + (d?.unmapped ?? 0);
  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <VersionPicker value={sel.selected?.id ?? ""} onChange={sel.select} versions={sel.versions} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="กรองสถานะ" className="sm:w-64">
          {COVERAGE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
      </div>
      <VersionStatusNotice status={sel.selected?.status} />
      {!sel.selected?.framework_version_id ? (
        <EmptyState title="หลักสูตรฉบับนี้ยังไม่ระบุกรอบหลักสูตรแกนกลาง">ระบุกรอบแกนกลางในหน้า “ฉบับหลักสูตร” เมื่อมีข้อมูลอ้างอิงที่ยืนยันแล้ว</EmptyState>
      ) : total === 0 && !q.isPending ? (
        <EmptyState title="ยังไม่มีตัวชี้วัดในชุดข้อมูลอ้างอิง">ต้องนำเข้ามาตรฐาน/ตัวชี้วัดจากเอกสารต้นทางที่ยืนยันแล้ว — ระบบไม่สร้างข้อมูลอ้างอิงเอง</EmptyState>
      ) : (
        <>
          {!complete && (
            <Notice tone="warning">
              ชุดข้อมูลอ้างอิง (Reference Dataset) ของกรอบแกนกลางยังไม่ครบ — ตัวเลขด้านล่างเป็น <b>รายงานเบื้องต้น</b> ไม่แสดงเปอร์เซ็นต์ความครอบคลุม
            </Notice>
          )}
          <section aria-label="สรุป Coverage" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label="ตัวชี้วัดในชุดอ้างอิง" value={total} loading={q.isPending} />
            <KpiCard label="Mapping ยืนยันแล้ว" tone="ok" value={d?.verified ?? 0} loading={q.isPending}
              hint={complete && total ? `${Math.round(((d?.verified ?? 0) / total) * 100)}% ของชุดอ้างอิง` : undefined} />
            <KpiCard label="รอตรวจ" tone="accent" value={d?.pending ?? 0} loading={q.isPending} />
            <KpiCard label="ยังไม่มี Mapping" tone="alert" value={d?.unmapped ?? 0} loading={q.isPending} />
          </section>
          <DashSection id="coverage" title={<span className="flex items-center gap-2">รายการตัวชี้วัด <LiveBadge /></span>}>
            {q.error && <p role="alert" className="text-sm text-destructive">{dbErrorMessage(q.error)}</p>}
            <ul className="divide-y text-sm">
              {d?.rows.map((r) => (
                <li key={r.indicator_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><code className="text-xs">{r.full_code}</code> <span className="text-xs text-muted-foreground">{r.area_code} · {r.grade_code}</span></span>
                  <span className="flex flex-wrap gap-1">
                    <Badge variant={r.coverage_status === "verified" ? "success" : r.coverage_status === "pending_review" ? "warning" : "outline"}>
                      {r.coverage_status === "verified" ? `ยืนยันแล้ว ${r.verified_count}` : r.coverage_status === "pending_review" ? "รอตรวจ" : "ยังไม่มี Mapping"}
                    </Badge>
                    {r.evidence_incomplete && <Badge variant="warning">หลักฐานไม่ครบ</Badge>}
                    {r.possible_duplicate && <Badge variant="info">อาจซ้ำซ้อน</Badge>}
                  </span>
                </li>
              ))}
            </ul>
            <Pager page={page} total={d?.total ?? 0} onPage={setPage} />
          </DashSection>
        </>
      )}
    </>
  );
}

function MappingReview() {
  const sel = useSelectedVersion();
  const { can } = useAuth();
  const q = usePendingMappings(sel.selected?.id);
  const qc = useQueryClient();
  const editable = can("curriculum.edit") && sel.selected?.status === "draft";
  const review = async (id: string, status: "verified" | "rejected") => {
    try {
      await rpc("curriculum_mapping_review", { p_id: id, p_status: status, p_note: null });
      toast.success(status === "verified" ? "ยืนยัน mapping แล้ว" : "ปฏิเสธ mapping แล้ว");
      await qc.invalidateQueries({ queryKey: curriculumKey });
    } catch (e) {
      toast.error(dbErrorMessage(e));
    }
  };
  return (
    <>
      <div className="mb-4"><VersionPicker value={sel.selected?.id ?? ""} onChange={sel.select} versions={sel.versions} /></div>
      {!editable && <Notice>ตรวจ mapping ได้เฉพาะฉบับร่าง และผู้มีสิทธิ์แก้ไขหลักสูตรของกลุ่มสาระนั้น</Notice>}
      <DashSection id="pending" title="Mapping รอตรวจ" meta={`${q.data?.length ?? 0} รายการ`}>
        {!q.data?.length ? <p className="text-sm text-muted-foreground">ไม่มีรายการรอตรวจ</p> : (
          <ul className="divide-y text-sm">
            {q.data.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p><code className="text-xs">{m.subject?.code}</code> {m.subject?.name_th} → <code className="text-xs">{m.indicator?.full_code}</code></p>
                  <p className="text-xs text-muted-foreground">{m.indicator?.statement_th}</p>
                  <SourceRef locator={m.source_locator} />
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" onClick={() => review(m.id, "verified")}><Check /> ยืนยัน</Button>
                    <Button size="sm" variant="outline" onClick={() => review(m.id, "rejected")}><X /> ปฏิเสธ</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DashSection>
    </>
  );
}

function FrameworkBrowser() {
  const fw = useFrameworkVersions();
  const [fwId, setFwId] = useState("");
  const id = fwId || fw.data?.[0]?.id;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = useIndicators(id, search, page);
  const current = fw.data?.find((f) => f.id === id);
  if (fw.isPending) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (!fw.data?.length) {
    return (
      <EmptyState title="ยังไม่มีข้อมูลกรอบหลักสูตรแกนกลางในระบบ">
        ข้อมูลอ้างอิงระดับชาติ (มาตรฐาน/ตัวชี้วัด) นำเข้าได้เฉพาะผ่าน migration/seed ที่ตรวจจากเอกสารต้นทางแล้ว (D1) — ระบบไม่สร้างข้อมูลเอง
      </EmptyState>
    );
  }
  return (
    <>
      <TableToolbar search={search} onSearch={(v) => { setSearch(v); setPage(0); }} placeholder="ค้นหารหัสหรือข้อความตัวชี้วัด">
        <Select value={id} onChange={(e) => { setFwId(e.target.value); setPage(0); }} aria-label="กรอบหลักสูตรแกนกลาง" className="sm:w-72">
          {fw.data.map((f) => <option key={f.id} value={f.id}>{f.framework?.name_th} {f.version_label}</option>)}
        </Select>
      </TableToolbar>
      {current && !current.is_complete && <Notice tone="warning">ชุดข้อมูลอ้างอิงนี้ยังไม่ครบ</Notice>}
      <DashSection id="indicators" title="ตัวชี้วัด" meta={`${q.data?.total ?? 0} รายการ`}>
        <ul className="divide-y text-sm">
          {q.data?.rows.map((i) => (
            <li key={i.id} className="py-2">
              <p><code className="text-xs">{i.full_code}</code> <Badge variant="outline">{i.indicator_kind === "grade" ? "ชั้นปี" : "ช่วงชั้น"}</Badge></p>
              <p className="text-muted-foreground">{i.statement_th}</p>
              <p className="text-xs text-muted-foreground">อ้างอิง: {i.source_citation}</p>
            </li>
          ))}
        </ul>
        <Pager page={page} total={q.data?.total ?? 0} onPage={setPage} />
      </DashSection>
    </>
  );
}
