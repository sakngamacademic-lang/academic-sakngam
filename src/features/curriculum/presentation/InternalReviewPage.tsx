import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, FileCheck2, Loader2, MonitorPlay, Plus, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { callRpc } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { allVersions, AUTHORITY_LABELS, COMPLIANCE_LABELS, CONFLICT_CATEGORY_LABELS, curriculumKey, useCompliance, useConflicts, useCurricula, useSourceDocuments, type SourceConflict } from "../api";
import { CurriculumNav, formatLocator, SourcePdfLink, VersionPicker } from "../components";
import { addObservation, confirmDocument, HIGHLIGHT_LABEL, presKey, revokeConfirmation, saveHighlight, setHighlightStatus, usePresentationExtras } from "./api";
import { curriculumStatus, REVIEW_LABEL, SCHOOL_LABEL } from "./status";

/**
 * ตรวจสอบภายใน (ฝ่ายวิชาการ) — ใช้ทะเบียนข้อขัดแย้งเดิม (CF) และกฎโครงสร้างเดิม
 * ข้อสงสัย (เปิด) แยกจากประเด็นที่ยืนยันแล้ว (รอตัดสิน) · ข้อเสนอแก้ไขบันทึกเป็นข้อความ ไม่เขียนทับต้นฉบับ · ไม่ปิด CF อัตโนมัติ
 */
const GROUPS: { key: SourceConflict["status"]; title: string; hint: string }[] = [
  { key: "open", title: "ข้อสงสัย (รอคัดกรอง)", hint: "ยังไม่ยืนยันว่าเป็นข้อผิดพลาด" },
  { key: "needs_decision", title: "ประเด็นที่ยืนยันแล้ว — รอตัดสิน", hint: "ยืนยันว่าต้นฉบับมีความไม่สอดคล้อง ต้องให้ผู้มีอำนาจตัดสิน" },
  { key: "resolved", title: "พิจารณาแล้ว", hint: "มีผลการพิจารณาบันทึกไว้" },
];

export function InternalReviewPage() {
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const admin = can("curriculum.manage");
  const curricula = useCurricula();
  const versions = allVersions(curricula.data);
  const live = versions.filter((v) => v.status !== "retired");
  const v = versions.find((x) => x.id === params.get("v")) ?? live.find((x) => x.status === "active") ?? live[0];
  const extras = usePresentationExtras(v?.id ?? null);
  const compliance = useCompliance(v?.id);
  const conflicts = useConflicts();
  const docs = useSourceDocuments();
  const [group, setGroup] = useState<SourceConflict["status"]>("needs_decision");
  const st = extras.data && docs.data && conflicts.data
    ? curriculumStatus({ confirmations: extras.data.confirmations, documents: docs.data, conflicts: conflicts.data, compliance: compliance.data ?? [], verifiedRules: extras.data.verifiedRules })
    : null;
  return (
    <>
      <PageHeader icon={ClipboardCheck} title="ตรวจสอบภายใน" description="สำหรับฝ่ายวิชาการ — ติดตามข้อสังเกต ข้อขัดแย้ง (CF) กฎโครงสร้าง และการยืนยันเอกสาร โดยไม่แก้ต้นฉบับ"
        actions={v && <Button asChild variant="outline"><Link to={`/office/curriculum/present?v=${v.id}`}><MonitorPlay /> นำเสนอหลักสูตร</Link></Button>} />
      <CurriculumNav />
      {versions.length > 1 && v && <div className="mb-3"><VersionPicker value={v.id} onChange={(id) => setParams({ v: id })} versions={versions} /></div>}
      {!extras.data?.installed && extras.data && (
        <p role="note" className="mb-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">ส่วนบันทึกการยืนยันของโรงเรียนและวิสัยทัศน์/จุดเน้นยังไม่ได้ติดตั้ง (รออนุมัติ migration <code>20261204000100</code>) — ส่วนข้อสังเกต/CF และกฎโครงสร้างใช้งานได้ตามเดิม</p>
      )}
      {st && (
        <section aria-label="สถานะ" className="mb-5 grid gap-3 md:grid-cols-2">
          <StatusCard title="การยืนยันของโรงเรียน" value={SCHOOL_LABEL[st.school]} tone={st.school === "confirmed" ? "ok" : st.school === "file_changed" ? "warn" : "muted"} />
          <StatusCard title="การตรวจความสอดคล้องตามเกณฑ์" value={REVIEW_LABEL[st.review]} tone={st.review === "passed" ? "ok" : st.review === "issues" ? "warn" : "info"}>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{st.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </StatusCard>
        </section>
      )}

      <Block icon={FileCheck2} title="เอกสารที่โรงเรียนยืนยัน">
        {v && extras.data && <Confirmations versionId={v.id} admin={admin && extras.data.installed} />}
      </Block>

      <Block icon={ShieldCheck} title={`ข้อสังเกตและข้อขัดแย้ง (CF) — ทั้งหมด ${conflicts.data?.length ?? 0} รายการ`}>
        <div role="tablist" className="mb-3 grid gap-2 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" role="tab" aria-selected={group === g.key} onClick={() => setGroup(g.key)}
              className={cn("rounded-xl border px-3 py-2 text-left shadow-card", group === g.key ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
              <span className="block text-sm font-semibold">{g.title} ({conflicts.data?.filter((c) => c.status === g.key).length ?? 0})</span>
              <span className={cn("block text-xs", group === g.key ? "text-primary-foreground/85" : "text-muted-foreground")}>{g.hint}</span>
            </button>
          ))}
        </div>
        {admin && <ObservationForm existing={conflicts.data ?? []} />}
        {conflicts.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : (
          <ul className="space-y-2">{(conflicts.data ?? []).filter((c) => c.status === group).map((c) => <Observation key={c.id} c={c} admin={admin} docs={docs.data ?? []} />)}
            {!conflicts.data?.some((c) => c.status === group) && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">ไม่มีรายการในกลุ่มนี้</li>}</ul>
        )}
      </Block>

      <Block icon={ClipboardCheck} title="เกณฑ์อ้างอิงและผลตรวจโครงสร้าง">
        {!compliance.data?.length ? <p className="text-sm text-muted-foreground">ยังไม่มีผลตรวจ</p> : (
          <ul className="divide-y text-sm">{compliance.data.map((r) => (
            <li key={`${r.rule_code}-${r.scope}`} className="flex flex-wrap items-start gap-2 py-2">
              <Badge variant={r.status === "pass" ? "success" : r.status === "fail" ? "destructive" : "warning"}>{COMPLIANCE_LABELS[r.status]}</Badge>
              <span className="min-w-0 flex-1"><b>{r.rule_code}</b> {r.title_th}<span className="block text-xs text-muted-foreground">เกณฑ์: {r.expected ?? "–"} · ข้อมูลจริง: {r.actual ?? "–"} · ที่มา: {r.source}</span></span>
            </li>
          ))}</ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">กฎที่ยืนยันกับต้นฉบับแล้ว {extras.data?.verifiedRules ?? 0} ข้อ — กฎสถานะร่างยังใช้สรุปว่า “ผ่านเกณฑ์” ไม่ได้</p>
      </Block>

      <Block icon={Sparkles} title="วิสัยทัศน์และจุดเน้น (สำหรับโหมดนำเสนอ)">
        {v && extras.data && <Highlights versionId={v.id} admin={admin && extras.data.installed} />}
      </Block>
    </>
  );
}

function Observation({ c, admin, docs }: { c: SourceConflict; admin: boolean; docs: { id: string; register_code: string }[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const code = (id: string | null) => docs.find((d) => d.id === id)?.register_code ?? "";
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); await qc.invalidateQueries({ queryKey: curriculumKey }); } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <li className="rounded-xl border bg-card p-3 text-sm shadow-card">
      <div className="flex flex-wrap items-center gap-2"><code className="font-semibold">{c.conflict_code}</code><Badge variant="outline">{CONFLICT_CATEGORY_LABELS[c.category]}</Badge>
        {c.impact === "blocking" && <Badge variant="destructive">กระทบการใช้งาน</Badge>}{c.subject_ref && <span className="text-xs text-muted-foreground">{c.subject_ref}</span>}</div>
      <p className="mt-1">{c.description}</p>
      {(c.value_a || c.value_b) && <dl className="mt-1 grid gap-1 text-xs sm:grid-cols-2"><div className="rounded-lg bg-muted/40 p-2"><dt className="font-medium">ในต้นฉบับ</dt><dd>{c.value_a ?? "–"}</dd></div><div className="rounded-lg bg-muted/40 p-2"><dt className="font-medium">เทียบกับ/เกณฑ์อ้างอิง</dt><dd>{c.value_b ?? "–"}</dd></div></dl>}
      {c.recommendation && <p className="mt-1 text-xs"><b>ข้อเสนอแก้ไข (ไม่เขียนทับต้นฉบับ):</b> {c.recommendation}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">ตำแหน่ง: {code(c.doc_a_id)} {formatLocator(c.locator_a)} <SourcePdfLink docId={c.doc_a_id} locator={c.locator_a} />
        {c.locator_b && <>· {code(c.doc_b_id ?? c.doc_a_id)} {formatLocator(c.locator_b)} <SourcePdfLink docId={c.doc_b_id ?? c.doc_a_id} locator={c.locator_b} /></>} · ผู้มีอำนาจตัดสิน: {AUTHORITY_LABELS[c.decision_authority]}</p>
      {c.resolution && <p className="mt-1 rounded-lg bg-[var(--tone-green-bg)] p-2 text-xs"><b>ผลการพิจารณา:</b> {c.resolution}</p>}
      {admin && c.status !== "resolved" && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.status === "open" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => callRpc("source_conflict_set_status", { p_id: c.id, p_status: "needs_decision" }), "ยืนยันว่าเป็นประเด็นแล้ว")}><CheckCircle2 /> ยืนยันว่าเป็นประเด็น</Button>
            : <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => callRpc("source_conflict_set_status", { p_id: c.id, p_status: "open" }), "ย้อนกลับเป็นข้อสงสัยแล้ว")}><Undo2 /> กลับเป็นข้อสงสัย</Button>}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { const r = window.prompt("ผลการพิจารณา (บันทึกไว้ ไม่แก้ข้อมูลต้นฉบับ)"); if (r?.trim()) void act(() => callRpc("source_conflict_resolve", { p_id: c.id, p_resolution: r.trim() }), "บันทึกผลการพิจารณาแล้ว"); }}><ClipboardCheck /> บันทึกผลการพิจารณา</Button>
        </div>
      )}
    </li>
  );
}

function ObservationForm({ existing }: { existing: SourceConflict[] }) {
  const qc = useQueryClient();
  const docs = useSourceDocuments();
  const [open, setOpen] = useState(false);
  const next = `CF-${String(Math.max(0, ...existing.map((c) => Number(c.conflict_code.replace(/\D/g, "")) || 0)) + 1).padStart(2, "0")}`;
  const [f, setF] = useState({ doc: "", kind: "pdf", page: "", sheet: "", cell: "", subject: "", category: "other", description: "", valueA: "", valueB: "", recommendation: "", impact: "warning" });
  const [busy, setBusy] = useState(false);
  const doc = docs.data?.find((d) => d.id === f.doc);
  const locator = f.kind === "pdf" ? (f.page ? `pdf:${f.page}` : "") : f.sheet && /^[A-Z]{1,3}[0-9]+(:[A-Z]{1,3}[0-9]+)?$/.test(f.cell) ? `sheet:${f.sheet.trim()}!${f.cell}` : "";
  if (!open) return <Button size="sm" variant="outline" className="mb-3" onClick={() => setOpen(true)}><Plus /> เพิ่มข้อสังเกต</Button>;
  const save = async () => {
    if (!f.doc || !locator || !f.description.trim()) { toast.error("ระบุเอกสาร ตำแหน่ง (หน้า หรือ ชีต+เซลล์) และรายละเอียด"); return; }
    setBusy(true);
    try {
      await addObservation({ code: next, docA: f.doc, docB: null, locatorA: locator, locatorB: null, subject: f.subject.trim() || null, description: f.description.trim(), category: f.category,
        valueA: f.valueA.trim() || null, valueB: f.valueB.trim() || null, recommendation: f.recommendation.trim() || null, impact: f.impact as "warning" | "blocking" });
      toast.success(`บันทึก ${next} เป็นข้อสงสัยแล้ว — ต้นฉบับไม่ถูกแก้`);
      await qc.invalidateQueries({ queryKey: curriculumKey });
      setOpen(false);
    } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mb-3 grid gap-2 rounded-xl border bg-background p-3 text-sm sm:grid-cols-2">
      <p className="sm:col-span-2 font-medium">ข้อสังเกตใหม่ {next} <span className="font-normal text-muted-foreground">(บันทึกเป็น “ข้อสงสัย” — ไม่แก้ชั่วโมง หน่วยกิต รหัสวิชา หรือแผนการเรียน)</span></p>
      <FormField label="เอกสาร" htmlFor="ob-doc"><Select id="ob-doc" value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value, kind: docs.data?.find((d) => d.id === e.target.value)?.doc_type === "structure_workbook" ? "sheet" : "pdf" })}>
        <option value="">เลือกเอกสาร</option>{(docs.data ?? []).filter((d) => !d.parent_id).map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}</Select></FormField>
      <FormField label="ชนิดตำแหน่ง" htmlFor="ob-kind"><Select id="ob-kind" value={f.kind} onChange={set("kind")}><option value="pdf">หน้า PDF</option><option value="sheet">ชีตและเซลล์ Excel</option></Select></FormField>
      {f.kind === "pdf" ? <FormField label="เลขหน้า PDF" htmlFor="ob-page"><Input id="ob-page" inputMode="numeric" value={f.page} onChange={(e) => setF({ ...f, page: e.target.value.replace(/\D/g, "") })} /></FormField> : <>
        <FormField label="ชื่อชีต" htmlFor="ob-sheet"><Input id="ob-sheet" value={f.sheet} onChange={set("sheet")} placeholder="เช่น 21" /></FormField>
        <FormField label="เซลล์/ช่วง" htmlFor="ob-cell" hint="เช่น D12 หรือ D12:F12"><Input id="ob-cell" value={f.cell} onChange={(e) => setF({ ...f, cell: e.target.value.toUpperCase().replace(/\s/g, "") })} /></FormField></>}
      <FormField label="ประเภท" htmlFor="ob-cat"><Select id="ob-cat" value={f.category} onChange={set("category")}>{Object.entries(CONFLICT_CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
      <FormField label="รายวิชา/แผนที่เกี่ยวข้อง" htmlFor="ob-sub"><Input id="ob-sub" value={f.subject} onChange={set("subject")} placeholder="เช่น ง21262 หรือ แผน DVE-ACC" /></FormField>
      <div className="sm:col-span-2"><FormField label="รายละเอียดข้อสังเกต" htmlFor="ob-desc"><Input id="ob-desc" value={f.description} onChange={set("description")} /></FormField></div>
      <FormField label="ค่าในต้นฉบับ" htmlFor="ob-a"><Input id="ob-a" value={f.valueA} onChange={set("valueA")} /></FormField>
      <FormField label="เทียบกับ/เกณฑ์อ้างอิง" htmlFor="ob-b"><Input id="ob-b" value={f.valueB} onChange={set("valueB")} /></FormField>
      <div className="sm:col-span-2"><FormField label="ข้อเสนอแก้ไข (ไม่เขียนทับต้นฉบับ)" htmlFor="ob-rec"><Input id="ob-rec" value={f.recommendation} onChange={set("recommendation")} /></FormField></div>
      <FormField label="ผลกระทบ" htmlFor="ob-imp"><Select id="ob-imp" value={f.impact} onChange={set("impact")}><option value="warning">ควรตรวจ</option><option value="blocking">กระทบการใช้งาน</option></Select></FormField>
      <p className="self-end text-xs text-muted-foreground">ตำแหน่ง: {locator ? formatLocator(locator) : "ยังไม่ครบ"}{doc ? ` · ${doc.register_code}` : ""}</p>
      <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={busy} onClick={save}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} บันทึกข้อสังเกต</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button></div>
    </div>
  );
}

function Confirmations({ versionId, admin }: { versionId: string; admin: boolean }) {
  const qc = useQueryClient();
  const extras = usePresentationExtras(versionId);
  const docs = useSourceDocuments();
  const [f, setF] = useState({ doc: "", scope: "structure", role: "", date: "", evDoc: "", evPage: "", note: "" });
  const [busy, setBusy] = useState(false);
  const name = (id: string | null) => { const d = docs.data?.find((x) => x.id === id); return d ? `${d.register_code} ${d.title}` : "–"; };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); await qc.invalidateQueries({ queryKey: presKey }); } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  const list = extras.data?.confirmations ?? [];
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">บันทึกว่าโรงเรียนยืนยันเอกสารใด (เช่น โครงสร้าง2569.xlsx) — ผูกกับค่า SHA-256 ของไฟล์ ณ วันที่ยืนยัน · การยืนยันนี้ไม่ใช่ผลตรวจความสอดคล้องตามเกณฑ์</p>
      <ul className="space-y-2">{list.map((c) => {
        const d = docs.data?.find((x) => x.id === c.source_document_id);
        const changed = d && d.sha256 !== c.document_sha256;
        return (
          <li key={c.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2"><b>{name(c.source_document_id)}</b><Badge variant={c.status === "active" ? (changed ? "warning" : "success") : "outline"}>{c.status === "revoked" ? "เพิกถอนแล้ว" : changed ? "ไฟล์เปลี่ยนหลังยืนยัน" : "โรงเรียนยืนยันแล้ว"}</Badge></div>
            <p className="text-xs text-muted-foreground">{c.scope === "structure" ? "โครงสร้างหลักสูตร" : c.scope === "curriculum_book" ? "เล่มหลักสูตร" : "อื่น ๆ"} · ยืนยันโดย {c.confirmed_by_role} · {new Date(c.confirmed_on).toLocaleDateString("th-TH", { dateStyle: "long" })}
              {c.evidence_document_id && <> · หลักฐาน {name(c.evidence_document_id)} {formatLocator(c.evidence_locator)}</>} · SHA-256 {c.document_sha256.slice(0, 12)}…{c.note ? ` · ${c.note}` : ""}{c.revoked_reason ? ` · เหตุผลเพิกถอน: ${c.revoked_reason}` : ""}</p>
            {admin && c.status === "active" && <Button size="sm" variant="ghost" className="mt-1" disabled={busy} onClick={() => { const r = window.prompt("เหตุผลที่เพิกถอนการยืนยัน"); if (r?.trim()) void run(() => revokeConfirmation(c.id, r.trim()), "เพิกถอนแล้ว"); }}><Undo2 /> เพิกถอน</Button>}
          </li>
        );
      })}{!list.length && <li className="rounded-xl border border-dashed p-4 text-center text-muted-foreground">ยังไม่มีบันทึกการยืนยันของโรงเรียน</li>}</ul>
      {admin && (
        <div className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-2">
          <p className="font-medium sm:col-span-2">บันทึกการยืนยันของโรงเรียน</p>
          <FormField label="เอกสารที่โรงเรียนยืนยัน (ต้องมีไฟล์ในระบบ)" htmlFor="cf-doc"><Select id="cf-doc" value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })}>
            <option value="">เลือกเอกสาร</option>{(docs.data ?? []).filter((d) => !d.parent_id && d.sha256).map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}</Select></FormField>
          <FormField label="ขอบเขต" htmlFor="cf-scope"><Select id="cf-scope" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value="structure">โครงสร้างหลักสูตร</option><option value="curriculum_book">เล่มหลักสูตร</option><option value="other">อื่น ๆ</option></Select></FormField>
          <FormField label="ผู้ยืนยัน (ตำแหน่ง/คณะ)" htmlFor="cf-role"><Input id="cf-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="เช่น ผู้อำนวยการโรงเรียน / คณะกรรมการสถานศึกษา" /></FormField>
          <FormField label="วันที่ยืนยัน" htmlFor="cf-date"><Input id="cf-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></FormField>
          <FormField label="หลักฐานการยืนยัน (ไม่บังคับ)" htmlFor="cf-ev"><Select id="cf-ev" value={f.evDoc} onChange={(e) => setF({ ...f, evDoc: e.target.value })}><option value="">–</option>{(docs.data ?? []).filter((d) => !d.parent_id).map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}</Select></FormField>
          <FormField label="หน้า PDF ของหลักฐาน" htmlFor="cf-evp"><Input id="cf-evp" inputMode="numeric" value={f.evPage} onChange={(e) => setF({ ...f, evPage: e.target.value.replace(/\D/g, "") })} /></FormField>
          <div className="sm:col-span-2"><FormField label="หมายเหตุ" htmlFor="cf-note"><Input id="cf-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></FormField></div>
          <div className="sm:col-span-2"><Button size="sm" disabled={busy || !f.doc || !f.role.trim() || !f.date} onClick={() => run(() => confirmDocument({ versionId, documentId: f.doc, scope: f.scope, role: f.role.trim(), date: f.date,
            evidenceDocId: f.evDoc || null, evidenceLocator: f.evDoc && f.evPage ? `pdf:${f.evPage}` : null, note: f.note }), "บันทึกการยืนยันของโรงเรียนแล้ว")}><FileCheck2 /> บันทึกการยืนยัน</Button></div>
        </div>
      )}
    </div>
  );
}

function Highlights({ versionId, admin }: { versionId: string; admin: boolean }) {
  const qc = useQueryClient();
  const extras = usePresentationExtras(versionId);
  const docs = useSourceDocuments();
  const [f, setF] = useState({ kind: "vision", seq: "1", text: "", doc: "", page: "" });
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); await qc.invalidateQueries({ queryKey: presKey }); } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  const list = extras.data?.highlights ?? [];
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">คัดลอกข้อความจากเล่มหลักสูตรตามจริงพร้อมเลขหน้า — โหมดนำเสนอแสดงเฉพาะรายการที่ยืนยันแล้ว</p>
      <ul className="space-y-2">{list.map((h) => (
        <li key={h.id} className="rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2"><b>{HIGHLIGHT_LABEL[h.kind]} {h.seq}</b><Badge variant={h.status === "confirmed" ? "success" : "secondary"}>{h.status === "confirmed" ? "ยืนยันแล้ว" : "ร่าง"}</Badge>
            <span className="text-xs text-muted-foreground">{formatLocator(h.source_locator)}</span><SourcePdfLink docId={h.source_document_id} locator={h.source_locator} /></div>
          <p className="mt-1 whitespace-pre-wrap">{h.text_th}</p>
          {admin && <Button size="sm" variant="ghost" className="mt-1" disabled={busy} onClick={() => run(() => setHighlightStatus(h.id, h.status === "confirmed" ? "draft" : "confirmed"), "ปรับสถานะแล้ว")}>{h.status === "confirmed" ? "เปลี่ยนเป็นร่าง" : "ยืนยัน (ตรวจกับเล่มแล้ว)"}</Button>}
        </li>
      ))}{!list.length && <li className="rounded-xl border border-dashed p-4 text-center text-muted-foreground">ยังไม่มีรายการ</li>}</ul>
      {admin && (
        <div className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-4">
          <FormField label="หัวข้อ" htmlFor="hl-kind"><Select id="hl-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(HIGHLIGHT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
          <FormField label="ลำดับ" htmlFor="hl-seq"><Input id="hl-seq" inputMode="numeric" value={f.seq} onChange={(e) => setF({ ...f, seq: e.target.value.replace(/\D/g, "") })} /></FormField>
          <FormField label="เอกสาร" htmlFor="hl-doc"><Select id="hl-doc" value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })}><option value="">เลือก</option>{(docs.data ?? []).filter((d) => !d.parent_id).map((d) => <option key={d.id} value={d.id}>{d.register_code}</option>)}</Select></FormField>
          <FormField label="หน้า PDF" htmlFor="hl-page"><Input id="hl-page" inputMode="numeric" value={f.page} onChange={(e) => setF({ ...f, page: e.target.value.replace(/\D/g, "") })} /></FormField>
          <div className="sm:col-span-4"><FormField label="ข้อความตามเล่มหลักสูตร" htmlFor="hl-text"><textarea id="hl-text" className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={f.text} maxLength={4000} onChange={(e) => setF({ ...f, text: e.target.value })} /></FormField></div>
          <div className="sm:col-span-4"><Button size="sm" disabled={busy || !f.text.trim() || !f.doc || !f.page} onClick={() => run(() => saveHighlight({ id: null, versionId, kind: f.kind, seq: Number(f.seq) || 1, text: f.text.trim(), documentId: f.doc, locator: `pdf:${f.page}` }), "บันทึกเป็นร่างแล้ว")}><Plus /> บันทึกเป็นร่าง</Button></div>
        </div>
      )}
    </div>
  );
}

function StatusCard({ title, value, tone, children }: { title: string; value: string; tone: "ok" | "warn" | "info" | "muted"; children?: ReactNode }) {
  const cls = { ok: "border-[var(--tone-green-fg)]/30 bg-[var(--tone-green-bg)]", warn: "border-[var(--tone-orange-fg)]/30 bg-[var(--tone-orange-bg)]", info: "border-[var(--tone-blue-fg)]/30 bg-[var(--tone-blue-bg)]", muted: "bg-muted" }[tone];
  return <div className={cn("rounded-2xl border p-4", cls)}><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="text-lg font-semibold">{value}</p>{children}</div>;
}
function Block({ icon: I, title, children }: { icon: typeof ClipboardCheck; title: string; children: ReactNode }) {
  return <section className="mb-5 rounded-2xl border bg-card p-4 shadow-card sm:p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold"><I className="size-5 text-primary" aria-hidden="true" />{title}</h2>{children}</section>;
}
