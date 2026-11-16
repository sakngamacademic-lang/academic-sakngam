import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, DatabaseZap, Download, Sparkles, Undo2 } from "lucide-react";
import { ConfirmDialog, PageHeader } from "@/components/shared";
import { DashSection, KpiCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLearningAreas } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { requireSupabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { curriculumKey, rpc, useBatchReports, useBatches } from "../api";
import { isProgramNameConfirmed, programName, programNameByCode } from "../program-labels";
import { OutcomesAllowlist } from "../AllowlistApprove";
import { CurriculumNav, EmptyState, Notice, SourcePdfLink, useSelectedVersion, VersionPicker } from "../components";
import { downloadCsv } from "../export";

const CATEGORY_LABELS: Record<string, string> = { regular: "รายวิชาปกติ", is: "IS", dual_study: "ทวิศึกษา", specific: "วิชาเฉพาะ" };
const TYPE_LABELS: Record<string, string> = { basic: "พื้นฐาน", additional: "เพิ่มเติม" };
const KIND_LABELS: Record<string, string> = { added: "เพิ่ม", cancelled: "ยกเลิก", changed: "เปลี่ยนแปลง", same: "เหมือนเดิม" };
const FIELD_LABELS: Record<string, string> = { name_th: "ชื่อ", credits: "หน่วยกิต", learning_hours: "ชั่วโมง", learning_area: "กลุ่มสาระ", subject_type: "ประเภท", subject_category: "หมวด", offerings: "การจัดวิชา" };

interface Subj { id: string; code: string; name_th: string; subject_type: string; subject_category: string; is_active: boolean; change_note: string | null; source_locator: string; source_document_id: string; learning_area_id: string | null; education_stage: string | null }
interface Prop { id: string; subject_id: string; proposed: { subject_category: string }; confidence: number; rule: string; evidence: { programs?: string[]; source_text_mentions_dual_study?: boolean }; status: string }
interface Cmp { code: string; education_stage: string | null; name_a: string | null; name_b: string | null; change_kind: string; changed_fields: string[] | null; locator_a: string | null; locator_b: string | null; change_note: string | null }

function useRegistry(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "registry", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const sb = requireSupabase();
      const [s, p, o, pr] = await Promise.all([
        sb.from("subjects").select("id, code, name_th, subject_type, subject_category, is_active, change_note, source_locator, source_document_id, learning_area_id, education_stage").eq("curriculum_version_id", versionId!).order("code").limit(2000),
        sb.from("study_programs").select("id, code, name_th, stage").eq("curriculum_version_id", versionId!).order("code"),
        sb.from("subject_offerings").select("study_program_id, is_active").eq("curriculum_version_id", versionId!).limit(10000),
        sb.from("curriculum_match_proposals").select("id, subject_id, proposed, confidence, rule, evidence, status").eq("curriculum_version_id", versionId!).eq("status", "pending").order("confidence", { ascending: false }),
      ]);
      for (const r of [s, p, o, pr]) if (r.error) throw r.error;
      return { subjects: s.data as Subj[], programs: p.data as { id: string; code: string; name_th: string; stage: string }[], offerings: o.data as { study_program_id: string | null; is_active: boolean }[], proposals: pr.data as Prop[] };
    },
  });
}

/** ทะเบียนรายวิชากลาง — รายวิชา (ทะเบียน) แยกจากการจัดวิชาในแผน · หลายปี/หลายฉบับ · AI เสนอ มนุษย์ตัดสิน */
export function RegistryPage() {
  const sel = useSelectedVersion();
  const { can } = useAuth();
  const areas = useLearningAreas();
  const qc = useQueryClient();
  const v = sel.selected;
  const reg = useRegistry(v?.id);
  const [tab, setTab] = useState<"subjects" | "programs" | "proposals" | "compare">("subjects");
  const [area, setArea] = useState("");
  const [cat, setCat] = useState("");
  const [confirmBuild, setConfirmBuild] = useState(false);
  const [confirmOutcomes, setConfirmOutcomes] = useState(false);
  const [baseId, setBaseId] = useState("");
  const batches = useBatches();
  const [srcPick, setSrcPick] = useState("");
  const [withWarnings, setWithWarnings] = useState(false);
  const reports = useBatchReports();
  const withEvidence = sel.versions.filter((x) => batches.data?.some((b) => b.curriculum_version_id === x.id));
  const srcId = srcPick || (withEvidence.some((x) => x.id === v?.id) ? v?.id : withEvidence[0]?.id) || v?.id || "";
  const ev = (kind: string) => {
    const rs = (reports.data ?? []).filter((r) => r.kind === kind && batches.data?.find((b) => b.id === r.batch_id)?.curriculum_version_id === srcId);
    const sum = (k: "total" | "pass" | "warning" | "conflict" | "error" | "approved") => rs.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    return { total: sum("total"), pass: sum("pass"), warning: sum("warning"), conflict: sum("conflict"), error: sum("error"), approved: sum("approved") };
  };
  const canEdit = can("curriculum.manage") && v?.status === "draft";
  const refresh = () => qc.invalidateQueries({ queryKey: curriculumKey });
  const areaName = useMemo(() => new Map(areas.data?.map((a) => [a.id, a.name_th])), [areas.data]);
  const act = async (fn: string, args: Record<string, unknown>, ok: (r: unknown) => string) => {
    try { toast.success(ok(await rpc(fn, args))); await refresh(); } catch (e) { toast.error(dbErrorMessage(e)); }
  };
  const subjects = reg.data?.subjects ?? [];
  const active = subjects.filter((s) => s.is_active);
  const shown = active.filter((s) => (!area || (area === "is" ? s.subject_category === "is" : s.learning_area_id === area)) && (!cat || s.subject_category === cat));
  const byArea = useMemo(() => areas.data?.map((a) => ({ a, n: active.filter((s) => s.learning_area_id === a.id).length })) ?? [], [areas.data, active]);
  const cmp = useQuery({
    queryKey: [...curriculumKey, "compare", baseId, v?.id],
    enabled: !!baseId && !!v,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc("curriculum_compare_versions", { p_a: baseId, p_b: v!.id });
      if (error) throw error;
      return data as Cmp[];
    },
  });
  const nameOf = (id: string) => subjects.find((s) => s.id === id);

  if (!sel.versions.length && !sel.loading) return (<><PageHeader title="ทะเบียนรายวิชากลาง" description="" /><CurriculumNav /><EmptyState title="ยังไม่มีหลักสูตร">สร้างหลักสูตรและฉบับที่หน้า “ฉบับหลักสูตร” ก่อน</EmptyState></>);

  return (
    <>
      <PageHeader title="ทะเบียนรายวิชากลาง" description="ทะเบียนรายวิชา (subjects) แยกจากการจัดวิชาตามแผน/ชั้น/ภาคเรียน (subject_offerings) · ใช้ต่อเนื่องหลายปี — ข้อมูลอ้างหน้า PDF และหลักฐานนำเข้าเดิม ไม่ถูกแก้" />
      <CurriculumNav />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <VersionPicker value={v?.id ?? ""} onChange={sel.select} versions={sel.versions} />
        {canEdit && withEvidence.length > 0 && (
          <Select value={srcId} onChange={(e) => setSrcPick(e.target.value)} aria-label="ฉบับที่เป็นแหล่งหลักฐานนำเข้า" className="sm:w-64">
            {withEvidence.map((x) => <option key={x.id} value={x.id}>หลักฐานจาก: {x.version_label}</option>)}
          </Select>
        )}
        {canEdit && (
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={withWarnings} onChange={(e) => setWithWarnings(e.target.checked)} />
            รวมรายวิชาที่มีคำเตือน (ตรวจเทียบ PDF แล้ว)</label>
        )}
        {canEdit && <Button size="sm" onClick={() => setConfirmBuild(true)}><DatabaseZap /> สร้างทะเบียนจากหลักฐานนำเข้า</Button>}
        {canEdit && <Button size="sm" variant="outline" onClick={() => setConfirmOutcomes(true)}>สร้างผลการเรียนรู้เข้าทะเบียน</Button>}
        {canEdit && v && <OutcomesAllowlist versionId={v.id} sourceVersionId={srcId || v.id} onDone={() => void refresh()} />}
        {can("curriculum.manage") && v && <Button size="sm" variant="outline" onClick={() => { const l = window.prompt("ชื่อฉบับใหม่ (เช่น พุทธศักราช 2570)"); if (l?.trim()) void act("curriculum_version_clone", { p_source_id: v.id, p_version_label: l.trim() }, () => "คัดลอกเป็นฉบับร่างใหม่แล้ว — เปิดฉบับใหม่แล้วแก้เฉพาะรายการที่เปลี่ยน"); }}><Copy /> คัดลอกเป็นปีถัดไป</Button>}
      </div>
      {v && v.status !== "draft" && <Notice>ฉบับนี้ไม่ใช่แบบร่าง — แก้ไขไม่ได้ (ต้องคัดลอกเป็นฉบับใหม่) การจัดการทะเบียน (ร่าง) แยกจากการประกาศใช้อย่างเป็นทางการ — ส่งตรวจ/อนุมัติ/ใช้งานฉบับเป็นขั้นตอนแยกที่หน้า “ฉบับหลักสูตร” โดยผู้ดูแลหลักสูตร</Notice>}
      <section aria-label="สรุปทะเบียน" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="รายวิชาในทะเบียน" value={active.length} loading={reg.isPending} />
        <KpiCard label="แผนการเรียน" value={reg.data?.programs.length ?? 0} loading={reg.isPending} />
        <KpiCard label="การจัดวิชา" value={reg.data?.offerings.filter((o) => o.is_active).length ?? 0} loading={reg.isPending} />
        <KpiCard label="IS / ทวิศึกษา" value={`${active.filter((s) => s.subject_category === "is").length} / ${active.filter((s) => s.subject_category === "dual_study").length}`} loading={reg.isPending} />
        <KpiCard label="ยกเลิกแล้ว" value={subjects.length - active.length} tone="alert" loading={reg.isPending} />
      </section>
      {reg.data && v && (() => {
        const sj = ev("subjects"), of = ev("subject_offerings"), builtOff = reg.data.offerings.filter((o) => o.is_active).length;
        const items: { ok: boolean; label: string; detail: string; link?: { to: string; text: string } }[] = [
          { ok: v.status === "draft", label: "ฉบับเป็นแบบร่าง (แก้ไขได้)", detail: v.status === "draft" ? "พร้อม" : "ต้องคัดลอกเป็นฉบับใหม่ หรือให้หัวหน้าส่งกลับเป็นแบบร่าง" },
          { ok: active.length > 0 && reg.data.programs.length > 0, label: "มีแผนการเรียนและรายวิชาในทะเบียน", detail: `${reg.data.programs.length} แผน · ${active.length} รายวิชา` },
          { ok: sj.warning === 0, label: "รายวิชาที่มีคำเตือน (ยังไม่อยู่ในทะเบียน)", detail: sj.warning ? `${sj.warning} วิชา — ตรวจเทียบ PDF แล้วเลือก “รวมรายวิชาที่มีคำเตือน” ตอนสร้างทะเบียน` : "ไม่มี" },
          { ok: sj.conflict === 0, label: "รายวิชาที่ผูกกับข้อขัดแย้งระหว่างเอกสาร", detail: sj.conflict ? `${sj.conflict} วิชา — ฝ่ายวิชาการต้องตัดสินที่หน้าข้อขัดแย้งก่อน (ระบบไม่ตัดสินแทน) แล้วสร้างทะเบียนซ้ำ` : "ไม่มี", link: sj.conflict ? { to: "/office/curriculum/conflicts", text: "ไปหน้าข้อขัดแย้ง" } : undefined },
          { ok: sj.error === 0, label: "รายวิชาที่ข้อมูลผิดพลาด", detail: sj.error ? `${sj.error} วิชา — แก้หรือข้ามที่หน้า “ตรวจหลักสูตร (หน้าเดียว)”` : "ไม่มี", link: sj.error ? { to: "/office/curriculum/workbench", text: "ไปหน้าตรวจ" } : undefined },
          { ok: of.total === 0 || builtOff >= of.total, label: "การจัดวิชาตามแผน/ชั้น/ภาคเรียน", detail: `เข้าทะเบียน ${builtOff} จาก ${of.total} รายการ${builtOff < of.total ? " — ส่วนที่เหลือรอรายวิชาข้างต้นเข้าทะเบียนก่อน" : ""}` },
          { ok: (reg.data.proposals.length ?? 0) === 0, label: "ข้อเสนอจัดหมวดวิชา (ทวิศึกษา) ที่รอตัดสิน", detail: reg.data.proposals.length ? `${reg.data.proposals.length} รายการ — ดูแท็บข้อเสนอ` : "ไม่มี" },
        ];
        const usable = items[0]!.ok && items[1]!.ok; // ใช้ทะเบียนส่วนที่ตรวจแล้วได้
        const complete = usable && items.every((i) => i.ok); // ครบทุกรายการ → พร้อมให้หัวหน้าอนุมัติฉบับ
        const subjTotal = active.length + sj.warning + sj.conflict + sj.error;
        const level = complete ? { label: "หลักสูตรครบถ้วน พร้อมอนุมัติ", variant: "success" as const } : usable ? { label: "พร้อมใช้งานบางส่วน", variant: "warning" as const } : { label: "ยังไม่พร้อมใช้งาน", variant: "destructive" as const };
        return (
          <section aria-label="ความพร้อมใช้งานของทะเบียน" className="mb-4 rounded-2xl border p-4" data-testid="registry-readiness">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">ความพร้อมใช้งานของทะเบียน <Badge variant={level.variant}>{level.label}</Badge></h2>
            <p className="mb-2 text-xs text-muted-foreground" data-testid="readiness-level">{complete ? "ครบทุกรายการ — ผู้ดูแลหลักสูตรส่งตรวจและอนุมัติฉบับ (ประกาศใช้) ได้ที่หน้า “ฉบับหลักสูตร”" : usable ? `ใช้ทะเบียนส่วนที่ตรวจแล้วได้ (รายวิชา ${active.length}/${subjTotal} · จัดวิชา ${builtOff}/${of.total}) — ยังไม่ควรขออนุมัติฉบับจนกว่ารายการ • ด้านล่างจะครบ` : "ต้องมีแผนและรายวิชาในทะเบียนก่อน"}</p>
            <ul className="space-y-1 text-sm">
              {items.map((i) => (
                <li key={i.label} className="flex flex-wrap items-start gap-2"><span aria-hidden="true">{i.ok ? "✔" : "•"}</span>
                  <span className="font-medium">{i.label}</span><span className="text-muted-foreground">{i.detail}</span>
                  {i.link && <Link to={i.link.to} className="underline">{i.link.text}</Link>}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">รายการที่ยังไม่เข้าทะเบียนยังคงเป็นหลักฐานนำเข้าตามเดิม (ไม่ถูกลบหรือแก้) และไม่ขัดขวางการใช้ทะเบียนส่วนที่ตรวจแล้ว</p>
          </section>
        );
      })()}
      {reg.data && subjects.length === 0 && <Notice tone="warning">ทะเบียนฉบับนี้ยังว่าง — กด “สร้างทะเบียนจากหลักฐานนำเข้า” (ระบบเรียงลำดับแผน → รายวิชา → การจัดวิชา → กิจกรรมให้ และข้ามแถวผิดพลาด/ข้อขัดแย้ง)</Notice>}

      <div className="mb-3 flex flex-wrap gap-1" role="tablist">
        {([["subjects", "รายวิชา"], ["programs", "แผน & การจัดวิชา"], ["proposals", `ข้อเสนอ (${reg.data?.proposals.length ?? 0})`], ["compare", "เปรียบเทียบปี"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-full border px-3 py-1 text-sm", tab === k ? "border-primary/60 bg-primary/15" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>

      {tab === "subjects" && (
        <DashSection id="subjects" title="รายวิชา" meta={`${shown.length} รายวิชา`}>
          <div className="mb-3 flex flex-wrap gap-2">
            <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="กรองกลุ่มสาระ" className="sm:w-60">
              <option value="">ทุกกลุ่มสาระ (8 กลุ่ม + IS)</option>
              {byArea.map(({ a, n }) => <option key={a.id} value={a.id}>{a.name_th} ({n})</option>)}
              <option value="is">IS (ไม่สังกัดกลุ่มสาระ)</option>
            </Select>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="กรองหมวด" className="sm:w-48">
              <option value="">ทุกหมวด</option>{Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </div>
          <ul className="space-y-1">
            {shown.slice(0, 300).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" data-testid="registry-subject">
                <code className="text-xs">{s.code}</code><span className="font-medium">{s.name_th}</span>
                <Badge variant="outline">{TYPE_LABELS[s.subject_type]}</Badge>
                {s.subject_category !== "regular" && <Badge variant="info">{CATEGORY_LABELS[s.subject_category]}{s.education_stage ? ` ${s.education_stage === "lower_secondary" ? "ม.ต้น" : "ม.ปลาย"}` : ""}</Badge>}
                <span className="text-xs text-muted-foreground">{s.learning_area_id ? areaName.get(s.learning_area_id) : "ไม่สังกัดกลุ่มสาระ"}</span>
                <span className="ml-auto text-xs"><SourcePdfLink docId={s.source_document_id} locator={s.source_locator} /> {s.source_locator.replace(/;.*/, "")}</span>
                {canEdit && <Button size="sm" variant="ghost" aria-label={`ยกเลิก ${s.code}`} onClick={() => { const r = window.prompt("เหตุผลที่ยกเลิกรายวิชานี้ (อย่างน้อย 10 ตัวอักษร)"); if (r) void act("curriculum_subject_set_active", { p_subject_id: s.id, p_active: false, p_reason: r }, () => "ยกเลิกรายวิชาแล้ว (เก็บประวัติ)"); }}><Ban /> ยกเลิก</Button>}
              </li>
            ))}
          </ul>
          {shown.length > 300 && <p className="mt-2 text-xs text-muted-foreground">แสดง 300 จาก {shown.length} รายการ — ใช้ตัวกรองเพื่อจำกัด</p>}
          {subjects.some((s) => !s.is_active) && (
            <details className="mt-3 text-sm"><summary>รายวิชาที่ยกเลิก ({subjects.filter((s) => !s.is_active).length})</summary>
              <ul className="mt-2 space-y-1">{subjects.filter((s) => !s.is_active).map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-muted-foreground"><code className="text-xs">{s.code}</code> {s.name_th} — {s.change_note}
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => { const r = window.prompt("เหตุผลที่คืนรายวิชา (อย่างน้อย 10 ตัวอักษร)"); if (r) void act("curriculum_subject_set_active", { p_subject_id: s.id, p_active: true, p_reason: r }, () => "คืนรายวิชาแล้ว"); }}><Undo2 /> คืน</Button>}</li>))}</ul></details>
          )}
        </DashSection>
      )}

      {tab === "programs" && (
        <DashSection id="programs" title="แผนการเรียน & การจัดวิชา" meta={`${reg.data?.programs.length ?? 0} แผน`}>
          <ul className="space-y-1 text-sm">
            {reg.data?.programs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"><span className="font-medium">{programName(p.name_th)}</span>
                <Badge variant="outline">{p.stage === "lower_secondary" ? "ม.ต้น" : "ม.ปลาย"}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">จัดวิชา {reg.data!.offerings.filter((o) => o.study_program_id === p.id && o.is_active).length} รายการ</span></li>
            ))}
          </ul>
          {reg.data?.programs.some((p) => !isProgramNameConfirmed(p.name_th)) && <Notice tone="warning">มีแผนการเรียนที่ชื่อยังไม่ชัดเจน — แสดงเป็น “รอยืนยันชื่อแผนการเรียน” ฝ่ายวิชาการโปรดตรวจที่หน้า “แผนการเรียน” (ระบบไม่เดาชื่อ)</Notice>}
          {!reg.data?.programs.length && <p className="text-sm text-muted-foreground">ยังไม่มีแผนการเรียนในทะเบียน</p>}
        </DashSection>
      )}

      {tab === "proposals" && (
        <DashSection id="proposals" title="ข้อเสนอการจัดหมวดวิชา" meta="AI/กฎเสนอ — ฝ่ายวิชาการตัดสิน">
          <p className="mb-3 text-xs text-muted-foreground">ระบบเสนอจากหลักฐาน (วิชาที่จัดเฉพาะแผนทวิศึกษา + ข้อความต้นฉบับ) พร้อมระดับความมั่นใจ — ไม่กำหนดกลุ่มสาระและไม่แก้รหัสวิชา · ความมั่นใจต่ำ/ไม่ชัดเจนต้องให้คนตัดสินเอง</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {canEdit && <Button size="sm" variant="outline" onClick={() => void act("curriculum_registry_propose", { p_version_id: v!.id }, (n) => `สร้างข้อเสนอใหม่ ${String(n)} รายการ`)}><Sparkles /> หาข้อเสนอจากทะเบียน</Button>}
            {canEdit && <Button size="sm" disabled={!reg.data?.proposals.some((p) => p.confidence >= 0.9)} onClick={() => void act("curriculum_proposals_decide", { p_ids: reg.data!.proposals.filter((p) => p.confidence >= 0.9).map((p) => p.id), p_accept: true }, (n) => `รับข้อเสนอ ${String(n)} รายการ`)}>รับทั้งหมดที่ความมั่นใจ ≥ 90%</Button>}
          </div>
          <ul className="space-y-1 text-sm">
            {reg.data?.proposals.map((p) => {
              const s = nameOf(p.subject_id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" data-testid="proposal">
                  <code className="text-xs">{s?.code}</code> {s?.name_th} → <Badge variant="info">{CATEGORY_LABELS[p.proposed.subject_category]}</Badge>
                  <Badge variant={p.confidence >= 0.9 ? "success" : "warning"}>มั่นใจ {Math.round(p.confidence * 100)}%</Badge>
                  <span className="text-xs text-muted-foreground">จัดในแผน {p.evidence.programs?.map((c) => programNameByCode(c, reg.data?.programs)).join(", ")}{p.evidence.source_text_mentions_dual_study ? " · ต้นฉบับระบุทวิศึกษา" : " · ไม่มีข้อความยืนยัน"}</span>
                  {canEdit && <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => void act("curriculum_proposals_decide", { p_ids: [p.id], p_accept: true }, () => "รับข้อเสนอแล้ว")}>รับ</Button>
                    <Button size="sm" variant="ghost" onClick={() => { const r = window.prompt("เหตุผลที่ปฏิเสธ (อย่างน้อย 10 ตัวอักษร)"); if (r) void act("curriculum_proposals_decide", { p_ids: [p.id], p_accept: false, p_note: r }, () => "ปฏิเสธข้อเสนอแล้ว"); }}>ปฏิเสธ</Button></span>}
                </li>
              );
            })}
          </ul>
          {!reg.data?.proposals.length && <p className="text-sm text-muted-foreground">ไม่มีข้อเสนอที่รอตัดสิน</p>}
        </DashSection>
      )}

      {tab === "compare" && (
        <DashSection id="compare" title="เปรียบเทียบรายวิชาระหว่างปี/ฉบับ" meta={v ? `เทียบกับ: ${v.version_label}` : ""}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={baseId} onChange={(e) => setBaseId(e.target.value)} aria-label="ฉบับฐานเปรียบเทียบ" className="sm:w-80">
              <option value="">เลือกฉบับต้นทาง (ปีเก่า)</option>
              {sel.versions.filter((x) => x.id !== v?.id).map((x) => <option key={x.id} value={x.id}>{x.version_label}</option>)}
            </Select>
            {cmp.data && <Button size="sm" variant="outline" onClick={() => downloadCsv("เปรียบเทียบรายวิชา.csv", cmp.data!.filter((c) => c.change_kind !== "same").map((c) => ({ รหัส: c.code, ผล: KIND_LABELS[c.change_kind] ?? c.change_kind, "ชื่อเดิม": c.name_a, "ชื่อใหม่": c.name_b, "ที่เปลี่ยน": (c.changed_fields ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", "), "หน้า PDF เดิม": c.locator_a, "หน้า PDF ใหม่": c.locator_b, เหตุผล: c.change_note })))}><Download /> ส่งออก CSV</Button>}
          </div>
          {cmp.error && <p role="alert" className="text-sm text-destructive">{dbErrorMessage(cmp.error)}</p>}
          {cmp.data && (
            <>
              <p className="mb-2 text-sm">เพิ่ม {cmp.data.filter((c) => c.change_kind === "added").length} · ยกเลิก {cmp.data.filter((c) => c.change_kind === "cancelled").length} · เปลี่ยนแปลง {cmp.data.filter((c) => c.change_kind === "changed").length} · เหมือนเดิม {cmp.data.filter((c) => c.change_kind === "same").length}</p>
              <ul className="space-y-1 text-sm">
                {cmp.data.filter((c) => c.change_kind !== "same").map((c) => (
                  <li key={`${c.code}-${c.education_stage}`} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                    <Badge variant={c.change_kind === "cancelled" ? "destructive" : c.change_kind === "added" ? "success" : "warning"}>{KIND_LABELS[c.change_kind]}</Badge>
                    <code className="text-xs">{c.code}</code> {c.name_b ?? c.name_a}
                    {c.changed_fields?.length ? <span className="text-xs text-muted-foreground">({c.changed_fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")})</span> : null}
                    {c.change_note && <span className="text-xs text-muted-foreground">— {c.change_note}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!baseId && <p className="text-sm text-muted-foreground">เลือกฉบับต้นทางเพื่อดูว่าฉบับนี้เพิ่ม ยกเลิก หรือเปลี่ยนรายวิชาใดบ้าง (อ้างหน้า PDF ทั้งสองฉบับ)</p>}
        </DashSection>
      )}

      <ConfirmDialog open={confirmBuild} onOpenChange={setConfirmBuild} title="สร้างทะเบียนจากหลักฐานนำเข้า?"
        description="ระบบสร้างแผน รายวิชา การจัดวิชา และกิจกรรมตามลำดับ dependency จากแถวที่ผ่านการตรวจ (ไม่มี error/ข้อขัดแย้ง/คำเตือน) พร้อมเก็บหน้า PDF — หลักฐานนำเข้า 2,832 แถวไม่ถูกแก้หรือเปลี่ยนสถานะ · ฉบับยังเป็นแบบร่างจนกว่าจะประกาศใช้ (ขั้นตอนแยก)"
        confirmLabel="สร้างทะเบียน" onConfirm={() => act("curriculum_registry_build", { p_version_id: v!.id, p_include_warnings: withWarnings, ...(srcId && srcId !== v!.id ? { p_source_version_id: srcId } : {}) }, (r) => { const o = r as Record<string, { created: number; skipped: number }>; return `สร้างแล้ว: แผน ${o.study_programs?.created} · รายวิชา ${o.subjects?.created} · จัดวิชา ${o.subject_offerings?.created} · กิจกรรม ${o.learning_activities?.created} (ข้าม ${Object.values(o).reduce((a, x) => a + x.skipped, 0)} แถวที่ยังไม่ผ่าน)`; })} />
      <ConfirmDialog open={confirmOutcomes} onOpenChange={setConfirmOutcomes} title="สร้างผลการเรียนรู้เข้าทะเบียน?"
        description="ผูกผลการเรียนรู้จากหลักฐานนำเข้ากับรายวิชาที่อยู่ในทะเบียนตามรหัส พร้อมหน้า PDF — ข้ามรายวิชาที่ยังมีข้อขัดแย้งเปิดอยู่ ไม่สร้างรายวิชาหรือตัวชี้วัดขึ้นเอง และรันซ้ำได้โดยไม่ซ้ำ (เฉพาะผู้ดูแลหลักสูตร)"
        confirmLabel="สร้างผลการเรียนรู้" onConfirm={() => act("curriculum_registry_build_outcomes", { p_version_id: v!.id, p_source_version_id: srcId || v!.id }, (r) => { const o = r as Record<string, number>; return `สร้างผลการเรียนรู้ ${o.built} · ข้าม (ไม่มีรายวิชา ${o.skipped_no_subject} · ติดเงื่อนไข ${o.skipped_blocked} · มีแล้ว ${o.skipped_existing})`; })} />
    </>
  );
}
