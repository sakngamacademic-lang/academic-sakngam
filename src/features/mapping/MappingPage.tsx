import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, BookOpen, CheckCircle2, CircleDashed, CircleHelp, ClipboardList, Eye, FileDown, FileSpreadsheet, GitCompareArrows, Layers,
  Loader2, Printer, Search, ShieldCheck, XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Select } from "@/components/ui/form-controls";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DonutChart } from "@/components/charts/charts";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCurricula, allVersions, VERSION_STATUS_LABELS } from "@/features/curriculum/api";
import { formatLocator, SourcePdfLink } from "@/features/curriculum/components";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { decideMapping, loadDecisions, loadHistory, loadReference, loadSchool, mappingKey, useReferenceOptions, useVersionSubjects, type ReferenceOption, type UnitMeta } from "./api";
import { compareMapping, contentTerms, RESULT_LABEL, type CompareOutput, type MatchResult, type Pair, type RefIndicator, type SchoolSubject } from "./match";
import { exportExcel, exportPdf, type ReportContext } from "./export";

const TONE: Record<MatchResult, { cls: string; icon: typeof CheckCircle2 }> = {
  covered: { cls: "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)] border-[var(--tone-green-fg)]/30", icon: CheckCircle2 },
  partial: { cls: "bg-[var(--tone-orange-bg)] text-[var(--tone-orange-fg)] border-[var(--tone-orange-fg)]/30", icon: CircleDashed },
  needs_review: { cls: "bg-[var(--tone-blue-bg)] text-[var(--tone-blue-fg)] border-[var(--tone-blue-fg)]/30", icon: CircleHelp },
  not_found: { cls: "bg-[var(--tone-pink-bg)] text-[var(--tone-pink-fg)] border-[var(--tone-pink-fg)]/30", icon: XCircle },
  insufficient: { cls: "bg-muted text-muted-foreground border-border", icon: AlertTriangle },
};
export function ResultBadge({ r }: { r: MatchResult }) {
  const T = TONE[r];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", T.cls)}><T.icon className="size-3.5" aria-hidden="true" />{RESULT_LABEL[r]}</span>;
}
const LEVEL_LABEL = { 0: "ยืนยันโดยฝ่ายวิชาการ", 1: "ระดับ 1 · รหัสตรง", 2: "ระดับ 2 · หลักฐานจากเนื้อหา", 3: "ระดับ 3 · ระบบเสนอ" } as const;
const VERIFY_LABEL = { verified: "ยืนยันแล้ว", rejected: "ปฏิเสธแล้ว", unverified: "ยังไม่ยืนยัน" } as const;
const GRADE_ORDER = (g: string) => (g.startsWith("ป") ? 0 : 10) + Number(g.replace(/\D/g, "") || 0);

interface RunParams { v: string; ref: string; area: string; grade: string; subject: string }
interface RunResult {
  out: CompareOutput; ref: ReferenceOption; indicators: RefIndicator[]; subjects: SchoolSubject[]; unitMeta: Map<string, UnitMeta>; duplicates: number; notes: string[];
  standards: string[]; mappingRows: Awaited<ReturnType<typeof loadDecisions>>["rows"];
}

export function MappingPage() {
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const curricula = useCurricula();
  const versions = allVersions(curricula.data);
  const refs = useReferenceOptions();
  const sel: RunParams = {
    v: params.get("v") ?? versions.find((x) => x.status === "active")?.id ?? versions.find((x) => x.status !== "retired")?.id ?? versions[0]?.id ?? "",
    ref: params.get("ref") ?? refs.data?.find((r) => r.official)?.value ?? refs.data?.[0]?.value ?? "",
    area: params.get("area") ?? "", grade: params.get("grade") ?? "", subject: params.get("subject") ?? "",
  };
  const set = (k: keyof RunParams, val: string) => setParams((p) => {
    p.set(k, val);
    if (k === "v") { p.delete("area"); p.delete("grade"); p.delete("subject"); }
    if (k === "area") { p.delete("grade"); p.delete("subject"); }
    if (k === "grade") p.delete("subject");
    p.delete("run");
    return p;
  }, { replace: true });
  const subjects = useVersionSubjects(sel.v || null);
  const areas = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subjects.data ?? []) if (s.learning_area_id && s.area_name && s.area_name !== "IS") m.set(s.learning_area_id, s.area_name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [subjects.data]);
  const grades = useMemo(() => [...new Set((subjects.data ?? []).filter((s) => !sel.area || s.learning_area_id === sel.area).map((s) => s.grade).filter((g): g is string => !!g))].sort((a, b) => GRADE_ORDER(a) - GRADE_ORDER(b)), [subjects.data, sel.area]);
  const subjectOpts = (subjects.data ?? []).filter((s) => (!sel.area || s.learning_area_id === sel.area) && (!sel.grade || s.grade === sel.grade));
  const ready = !!sel.v && !!sel.ref && !!sel.area && !!sel.grade;
  const running = params.get("run") === "1";
  const version = versions.find((x) => x.id === sel.v);
  const ref = refs.data?.find((r) => r.value === sel.ref);
  const scope = subjectOpts.filter((s) => !sel.subject || s.id === sel.subject);

  const result = useQuery({
    queryKey: [...mappingKey, "run", sel],
    enabled: running && ready && !!ref && !subjects.isPending,
    queryFn: async (): Promise<RunResult> => {
      const refData = await loadReference(ref!);
      const codeById = new Map(refData.indicators.filter((i) => i.id).map((i) => [i.id!, i.code]));
      const codeOf = (id: string) => codeById.get(id) ?? null;
      const ids = scope.map((s) => s.id);
      const [school, dec] = await Promise.all([loadSchool(ids, codeOf), loadDecisions(sel.v, ids, codeOf)]);
      const areaCodes = new Set(school.subjects.map((s) => s.areaCode).filter(Boolean));
      const indicators = refData.indicators.filter((i) => areaCodes.has(i.areaCode) && school.subjects.some((s) => gradeOk(s.grade, i.grade)));
      const out = compareMapping({ subjects: school.subjects, indicators, decisions: dec.decisions });
      return { out, ref: ref!, indicators, subjects: school.subjects, unitMeta: school.unitMeta, duplicates: refData.duplicates, notes: school.notes,
        standards: [...new Set(indicators.map((i) => i.standardCode))].sort(), mappingRows: dec.rows };
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader icon={GitCompareArrows} title="เปรียบเทียบหลักสูตร (Mapping)"
        description="เทียบหน่วยการเรียนรู้และคำอธิบายรายวิชาของโรงเรียนกับมาตรฐานและตัวชี้วัดหลักสูตรแกนกลาง — เลือกข้อมูลแล้วกด “เปรียบเทียบหลักสูตร” ได้ทันที" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section aria-labelledby="setup-h" className="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
          <h2 id="setup-h" className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary" aria-hidden="true" /> ตั้งค่าการเปรียบเทียบ</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (ready) setParams((p) => { p.set("v", sel.v); p.set("ref", sel.ref); p.set("run", "1"); return p; }); }}>
            <div className="sm:col-span-2"><FormField label="1. หลักสูตรสถานศึกษา (โรงเรียน)" htmlFor="mv">
              <Select id="mv" value={sel.v} onChange={(e) => set("v", e.target.value)}>
                {!versions.length && <option value="">{curricula.isPending ? "กำลังโหลด…" : "ยังไม่มีหลักสูตร"}</option>}
                {versions.map((v) => <option key={v.id} value={v.id}>{v.curriculum_name} · {v.version_label} ({VERSION_STATUS_LABELS[v.status]})</option>)}
              </Select></FormField></div>
            <div className="sm:col-span-2"><FormField label="2. หลักสูตรแกนกลางที่ใช้อ้างอิง" htmlFor="mr" hint={ref && !ref.official ? "ผลอ่านจากเอกสารที่ยังไม่ผ่านการรับรอง — ใช้ดูผลเบื้องต้นได้ แต่ยังยืนยันการจับคู่ไม่ได้" : undefined}>
              <Select id="mr" value={sel.ref} onChange={(e) => set("ref", e.target.value)}>
                {!refs.data?.length && <option value="">{refs.isPending ? "กำลังโหลด…" : "ยังไม่มีฐานหลักสูตรแกนกลาง"}</option>}
                {refs.data?.some((r) => r.official) && <optgroup label="ฐานที่รับรองแล้ว">{refs.data.filter((r) => r.official).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</optgroup>}
                {refs.data?.some((r) => !r.official) && <optgroup label="ผลอ่านเอกสาร (ยังไม่รับรอง)">{refs.data.filter((r) => !r.official).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</optgroup>}
              </Select></FormField></div>
            <FormField label="3. กลุ่มสาระการเรียนรู้" htmlFor="ma">
              <Select id="ma" value={sel.area} onChange={(e) => set("area", e.target.value)} disabled={!areas.length}>
                <option value="">{subjects.isPending ? "กำลังโหลด…" : "เลือกกลุ่มสาระ"}</option>{areas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </Select></FormField>
            <FormField label="4. ระดับชั้น" htmlFor="mg">
              <Select id="mg" value={sel.grade} onChange={(e) => set("grade", e.target.value)} disabled={!sel.area}>
                <option value="">เลือกระดับชั้น</option>{grades.map((g) => <option key={g} value={g}>{gradeName(g)}</option>)}
              </Select></FormField>
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <FormField label="5. รายวิชา" htmlFor="ms">
                <Select id="ms" value={sel.subject} onChange={(e) => set("subject", e.target.value)} disabled={!sel.grade}>
                  <option value="">ทุกรายวิชาในชั้นนี้ ({subjectOpts.length})</option>
                  {subjectOpts.map((s) => <option key={s.id} value={s.id}>{s.name_th} ({s.code})</option>)}
                </Select></FormField>
              <Button type="submit" size="lg" className="h-11 w-full sm:w-auto" disabled={!ready || result.isFetching}>
                {result.isFetching ? <Loader2 className="animate-spin" /> : <Search />} เปรียบเทียบหลักสูตร
              </Button>
            </div>
            {!ready && <p className="text-xs text-muted-foreground sm:col-span-2">เลือกหลักสูตร ฐานอ้างอิง กลุ่มสาระ และระดับชั้น — ไม่ต้องตั้งค่าที่หน้าอื่นก่อน</p>}
          </form>
        </section>
        <SummaryCard result={result.data} loading={result.isFetching} scopeLabel={scopeLabel(sel, areas, subjectOpts)} started={running && ready} />
      </div>

      {running && ready && (result.isPending || result.isFetching) && !result.data && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> กำลังอ่านข้อมูลหลักสูตรและเปรียบเทียบ…</p>}
      {result.error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">เปรียบเทียบไม่สำเร็จ: {dbErrorMessage(result.error)}</p>}
      {result.data && version && (
        <Results data={result.data} versionId={sel.v}
          versionInfo={{ label: `${version.curriculum_name} ${version.version_label}`, status: version.status, frameworkId: version.framework_version_id }}
          scope={scopeLabel(sel, areas, subjectOpts)} canEdit={can("curriculum.edit")} />
      )}
    </div>
  );
}

const gradeOk = (sg: string | null, ig: string) => {
  if (!sg) return false;
  const a = /^([มป])\.(\d)$/.exec(sg), b = /^([มป])\.(\d)(?:-(\d))?$/.exec(ig);
  return !!a && !!b && a[1] === b[1] && Number(a[2]) >= Number(b[2]) && Number(a[2]) <= Number(b[3] ?? b[2]);
};
const gradeName = (g: string) => (g.startsWith("ม") ? `มัธยมศึกษาปีที่ ${g.slice(2)}` : g.startsWith("ป") ? `ประถมศึกษาปีที่ ${g.slice(2)}` : g);
function scopeLabel(sel: RunParams, areas: [string, string][], subs: { id: string; name_th: string; code: string }[]) {
  const a = areas.find(([id]) => id === sel.area)?.[1] ?? "";
  const s = subs.find((x) => x.id === sel.subject);
  return [a, sel.grade, s ? `${s.name_th} (${s.code})` : sel.grade ? "ทุกรายวิชา" : ""].filter(Boolean).join(" · ");
}

// ------------------------------------------------------------------ สรุป
function SummaryCard({ result, loading, scopeLabel, started }: { result?: RunResult; loading: boolean; scopeLabel: string; started: boolean }) {
  const c = result?.out.counts;
  const total = result?.indicators.length ?? 0;
  const pctOk = !!result && result.ref.official && result.ref.complete && total > 0;
  const rows: [MatchResult, string][] = [["covered", "ครอบคลุม (ยืนยันแล้ว)"], ["partial", "ครอบคลุมบางส่วน"], ["needs_review", "ต้องตรวจเพิ่มเติม"], ["not_found", "ไม่พบความครอบคลุม"], ["insufficient", "ข้อมูลไม่เพียงพอ"]];
  return (
    <section aria-labelledby="sum-h" className="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <h2 id="sum-h" className="mb-3 flex items-center gap-2 font-semibold"><ClipboardList className="size-5 text-primary" aria-hidden="true" /> สรุปผล Mapping{scopeLabel && result ? ` : ${scopeLabel}` : ""}</h2>
      {!result ? (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {loading ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> กำลังเปรียบเทียบ…</span>
            : started ? "ยังไม่มีผล" : "ผลสรุปจะแสดงที่นี่หลังกด “เปรียบเทียบหลักสูตร” — ทุกตัวเลขคำนวณจากข้อมูลจริงในระบบ"}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:items-center">
          {pctOk ? (
            <div className="mx-auto w-40 sm:w-full">
              <DonutChart values={[c!.covered, c!.partial, c!.needs_review, c!.not_found, c!.insufficient]} colors={["var(--success)", "var(--gold)", "var(--info)", "var(--destructive)", "var(--line-strong)"]}
                total={`${Math.round((c!.covered / total) * 100)}%`} center="ครอบคลุม (ยืนยันแล้ว)" label={`ครอบคลุม ${c!.covered} จาก ${total} ตัวชี้วัด`} />
            </div>
          ) : (
            <div role="note" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-semibold">ยังคำนวณความครอบคลุมทั้งหมดไม่ได้</p>
              <p className="mt-1 text-xs text-muted-foreground">{!result.ref.official ? "ฐานตัวชี้วัดอ้างอิงยังไม่ผ่านการรับรอง" : "ยังไม่ยืนยันว่าฐานตัวชี้วัดครบ"} — แสดงเฉพาะจำนวนที่ตรวจได้</p>
            </div>
          )}
          <dl className="grid gap-1.5 text-sm">
            <div className="flex justify-between gap-2 border-b pb-1.5"><dt className="text-muted-foreground">มาตรฐานที่เกี่ยวข้อง</dt><dd className="font-semibold tabular-nums">{result.standards.length} มาตรฐาน</dd></div>
            <div className="flex justify-between gap-2 border-b pb-1.5"><dt className="text-muted-foreground">ตัวชี้วัดในขอบเขต</dt><dd className="font-semibold tabular-nums">{total} ตัวชี้วัด</dd></div>
            {rows.map(([k, l]) => <div key={k} className="flex items-center justify-between gap-2"><dt><ResultBadge r={k} /><span className="sr-only">{l}</span></dt><dd className="tabular-nums">{c![k]} ตัวชี้วัด{pctOk ? ` (${Math.round((c![k] / total) * 100)}%)` : ""}</dd></div>)}
          </dl>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ ผลลัพธ์
type View = "a" | "b" | "sum" | "export";
interface VersionInfo { label: string; status: string; frameworkId: string | null }
function Results({ data, versionId, versionInfo, scope, canEdit }: { data: RunResult; versionId: string; versionInfo: VersionInfo; scope: string; canEdit: boolean }) {
  const [view, setView] = useState<View>("a");
  const [status, setStatus] = useState<"" | MatchResult>("");
  const [subj, setSubj] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [open, setOpen] = useState<{ pair: Pair | null; indicator: RefIndicator; subjectId: string | null; unitId: string | null } | null>(null);
  const { out, subjects, indicators } = data;
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const indByKey = new Map(indicators.map((i) => [i.key, i]));
  const gaps = dataGaps(data, versionInfo, versionId);

  const aRows = useMemo(() => subjects.filter((s) => !subj || s.id === subj).flatMap((s) => s.units.map((u) => {
    const ps = out.pairs.filter((p) => p.subjectId === s.id && p.unitId === u.id && (!status || p.result === status) && (!gapsOnly || p.result !== "covered"));
    return { s, u, ps };
  })).filter((r) => r.ps.length || (!status && !gapsOnly) || (status === "insufficient" && !r.u.parts.length)), [subjects, out.pairs, subj, status, gapsOnly]);
  const bRows = out.indicatorRows.filter((r) => (!status || r.result === status) && (!gapsOnly || r.result !== "covered") && (!subj || r.pairs.some((p) => p.subjectId === subj) || !r.best));
  const ctx: ReportContext = { schoolCurriculum: versionInfo.label, reference: data.ref.label, referenceOfficial: data.ref.official, scope, generatedAt: new Date() };
  const unverified = !data.ref.official || out.pairs.some((p) => p.verification === "unverified");

  return (
    <section aria-label="ผลการเปรียบเทียบ" className="space-y-4">
      {gaps.length > 0 && (
        <div role="note" className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warning" aria-hidden="true" /> ข้อมูลที่ยังขาด — ผลที่เห็นเป็นผลเท่าที่มีข้อมูล</p>
          <ul className="space-y-1.5">{gaps.map((g, i) => <li key={i} className="flex flex-wrap items-baseline gap-x-2"><span>• {g.text}</span>{g.to && <Link className="text-primary underline-offset-2 hover:underline" to={g.to}>{g.action} →</Link>}</li>)}</ul>
        </div>
      )}
      {unverified && <p className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm font-medium">ผลเปรียบเทียบเบื้องต้น — ยังไม่รับรอง</p>}

      <div role="tablist" aria-label="มุมมองผล" className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
        {([["a", "จากหลักสูตรโรงเรียน → แกนกลาง", GitCompareArrows], ["b", "จากหลักสูตรแกนกลาง → โรงเรียน", ArrowRight], ["sum", "สรุปความครอบคลุม", Layers], ["export", "รายงาน/ส่งออก", FileDown]] as const).map(([k, l, I]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium shadow-card transition-colors", view === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40")}>
            <I className="size-4 shrink-0" aria-hidden="true" /><span className="text-left">{l}</span>
          </button>
        ))}
      </div>

      {(view === "a" || view === "b") && (
        <div className="grid gap-2 rounded-2xl border bg-card p-3 shadow-card sm:grid-cols-[repeat(3,minmax(0,1fr))] sm:items-end">
          <FormField label="สถานะ Mapping" htmlFor="fs"><Select id="fs" value={status} onChange={(e) => setStatus(e.target.value as MatchResult | "")}>
            <option value="">ทั้งหมด</option>{(Object.keys(RESULT_LABEL) as MatchResult[]).map((k) => <option key={k} value={k}>{RESULT_LABEL[k]}</option>)}</Select></FormField>
          <FormField label="รายวิชา" htmlFor="fsub"><Select id="fsub" value={subj} onChange={(e) => setSubj(e.target.value)}>
            <option value="">ทุกรายวิชาในผล</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</Select></FormField>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"><input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} className="size-4" /> เฉพาะรายการที่ยังไม่ครอบคลุม</label>
        </div>
      )}

      {view === "a" && <ViewA rows={aRows} indByKey={indByKey} unitMeta={data.unitMeta} onOpen={(pair, sId, uId) => setOpen({ pair, indicator: indByKey.get(pair.indicatorKey)!, subjectId: sId, unitId: uId })} />}
      {view === "b" && <ViewB rows={bRows} subjectById={subjectById} onOpen={(ind, pair) => setOpen({ pair, indicator: ind, subjectId: pair?.subjectId ?? null, unitId: pair?.unitId ?? null })} />}
      {view === "sum" && <CoverageByStandard data={data} />}
      {view === "export" && (
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <p className="font-semibold">ส่งออกผล Mapping</p>
          <p className="mt-1 text-sm text-muted-foreground">รายงานมีชื่อหลักสูตรทั้งสองฝ่าย ฉบับอ้างอิง ขอบเขต รายวิชา หน่วยการเรียนรู้ รหัสและข้อความตัวชี้วัด ผลเทียบ เหตุผล หลักฐาน และสถานะการยืนยัน{unverified ? " · มีคำว่า “ผลเปรียบเทียบเบื้องต้น — ยังไม่รับรอง” กำกับ" : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => exportExcel(ctx, data.out, subjects, indicators, data.unitMeta)}><FileSpreadsheet /> ดาวน์โหลด Excel</Button>
            <Button variant="outline" onClick={() => exportPdf(ctx, data.out, subjects, indicators, data.unitMeta)}><Printer /> พิมพ์ / บันทึกเป็น PDF</Button>
          </div>
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-[min(44rem,100vw)] max-w-[100vw] overflow-y-auto bg-background p-0">
          {open && <Detail ctx={open} data={data} subjectById={subjectById} versionId={versionId} versionInfo={versionInfo} canEdit={canEdit} onDone={() => setOpen(null)} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function dataGaps(data: RunResult, v: VersionInfo, versionId: string): { text: string; to?: string; action?: string }[] {
  const g: { text: string; to?: string; action?: string }[] = [];
  if (!data.ref.official) g.push({ text: "ฐานมาตรฐานและตัวชี้วัดที่เลือกเป็นผลอ่านอัตโนมัติ ยังไม่ผ่านการตรวจรับรองของฝ่ายวิชาการ", to: "/office/curriculum/analysis", action: "ตรวจและรับรองผลอ่าน" });
  else if (!data.ref.complete) g.push({ text: "ยังไม่ยืนยันว่าฐานตัวชี้วัดครบทุกข้อ จึงคำนวณร้อยละความครอบคลุมไม่ได้", to: "/office/curriculum/analysis", action: "ยืนยันความครบของฐาน" });
  if (!data.indicators.length) g.push({ text: "ฐานอ้างอิงยังไม่มีตัวชี้วัดของกลุ่มสาระ/ระดับชั้นที่เลือก", to: "/office/curriculum/imports", action: "นำเข้าเอกสารหลักสูตรแกนกลาง" });
  else g.push({ text: `ฐานอ้างอิงที่มีสำหรับขอบเขตนี้: มาตรฐาน ${data.standards.join(", ")} (${data.indicators.length} ตัวชี้วัด) — มาตรฐานอื่นยังไม่อยู่ในฐาน` });
  if (data.duplicates) g.push({ text: `พบตัวชี้วัดซ้ำในเอกสารอ้างอิง ${data.duplicates} รายการ — ระบบใช้รายการแรกและรวมเป็นข้อเดียว` });
  const noUnits = data.subjects.filter((s) => !s.hasUnits);
  if (noUnits.length) g.push({ text: `${noUnits.length} จาก ${data.subjects.length} รายวิชายังไม่มีหน่วยการเรียนรู้ — ตรวจได้จากคำอธิบายรายวิชาเท่านั้น`, to: "/office/curriculum/syllabi", action: "เพิ่มหน่วยการเรียนรู้" });
  const noText = data.subjects.filter((s) => !s.units.some((u) => u.parts.length));
  if (noText.length) g.push({ text: `${noText.length} รายวิชาไม่มีทั้งคำอธิบายรายวิชาและผลการเรียนรู้ (${noText.slice(0, 5).map((s) => s.code).join(", ")}${noText.length > 5 ? " …" : ""}) — ข้อมูลไม่เพียงพอ`, to: `/office/curriculum/registry?v=${versionId}`, action: "ดูทะเบียนรายวิชา" });
  if (data.out.unknownCodes.length) g.push({ text: `โรงเรียนระบุรหัสตัวชี้วัดที่ไม่พบในฐานอ้างอิง ${new Set(data.out.unknownCodes.map((u) => u.code)).size} รหัส` });
  if (data.ref.official && v.frameworkId !== data.ref.id) g.push({ text: "หลักสูตรสถานศึกษาฉบับนี้ยังไม่ได้ผูกกับฐานแกนกลางฉบับที่เลือก จึงยังบันทึกการยืนยันไม่ได้", to: "/office/curriculum/versions", action: "ตั้งค่าฉบับหลักสูตร" });
  for (const n of data.notes) g.push({ text: n });
  return g;
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-lg border border-primary/25 bg-accent px-1.5 py-0.5 font-mono text-xs text-primary">{children}</span>;
}

function ViewA({ rows, indByKey, unitMeta, onOpen }: {
  rows: { s: SchoolSubject; u: SchoolSubject["units"][number]; ps: Pair[] }[]; indByKey: Map<string, RefIndicator>; unitMeta: Map<string, UnitMeta>; onOpen: (p: Pair, s: string, u: string) => void;
}) {
  if (!rows.length) return <Empty>ไม่มีรายการตามตัวกรอง</Empty>;
  const scopeText = (u: SchoolSubject["units"][number]) => {
    const m = unitMeta.get(u.id);
    const t = m?.essence ?? u.parts.find((p) => p.field !== "title")?.text ?? "";
    return t.replace(/\s+/g, " ").slice(0, 140) + (t.length > 140 ? "…" : "");
  };
  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <h3 className="border-b px-4 py-3 font-semibold">ผล Mapping รายหน่วยการเรียนรู้</h3>
      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr><th className="w-[24%] px-3 py-2">หน่วยการเรียนรู้ (ของโรงเรียน)</th><th className="w-[28%] px-3 py-2">สาระสำคัญ / ขอบเขตเนื้อหา</th><th className="w-[22%] px-3 py-2">มาตรฐานและตัวชี้วัด (แกนกลาง)</th><th className="w-[16%] px-3 py-2">ผลเทียบ</th><th className="w-[10%] px-3 py-2"><span className="sr-only">รายละเอียด</span></th></tr>
          </thead>
          <tbody>
            {rows.flatMap(({ s, u, ps }) => (ps.length ? ps : [null]).map((p, i) => (
              <tr key={`${u.id}-${p?.indicatorKey ?? "none"}`} className="border-t align-top even:bg-muted/25 hover:bg-accent/60">
                {i === 0 && <td rowSpan={Math.max(ps.length, 1)} className="px-3 py-2.5">
                  <p className="font-medium">{u.kind === "unit" ? u.title : `${s.name} — คำอธิบายรายวิชา`}</p>
                  <p className="text-xs text-muted-foreground">{s.code} · {s.grade}{unitMeta.get(u.id)?.hours != null ? ` · ${unitMeta.get(u.id)!.hours} ชั่วโมง` : ""}{u.kind === "description" && !s.hasUnits ? " · ยังไม่มีหน่วย" : ""}</p>
                </td>}
                {i === 0 && <td rowSpan={Math.max(ps.length, 1)} className="px-3 py-2.5 text-muted-foreground">{scopeText(u) || <i>ไม่มีข้อความ</i>}</td>}
                <td className="px-3 py-2.5">{p ? <span className="flex flex-wrap gap-1"><Chip>{indByKey.get(p.indicatorKey)?.standardCode}</Chip><Chip>{indByKey.get(p.indicatorKey)?.code.replace(/^.*?(?=[มป]\.)/, "")}</Chip></span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5">{p ? <><ResultBadge r={p.result} /><p className="mt-1 text-[11px] text-muted-foreground">{LEVEL_LABEL[p.level]}</p></> : <ResultBadge r={u.parts.length ? "not_found" : "insufficient"} />}</td>
                <td className="px-3 py-2.5 text-right">{p && <Button size="sm" variant="outline" onClick={() => onOpen(p, s.id, u.id)}><Eye /> ดู</Button>}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y md:hidden">
        {rows.map(({ s, u, ps }) => (
          <li key={u.id} className="space-y-2 p-3">
            <div><p className="font-medium">{u.kind === "unit" ? u.title : `${s.name} — คำอธิบายรายวิชา`}</p><p className="text-xs text-muted-foreground">{s.code} · {s.grade}{unitMeta.get(u.id)?.hours != null ? ` · ${unitMeta.get(u.id)!.hours} ชม.` : ""}</p></div>
            <p className="text-xs text-muted-foreground">{scopeText(u)}</p>
            {ps.length ? ps.map((p) => (
              <button key={p.indicatorKey} type="button" onClick={() => onOpen(p, s.id, u.id)} className="flex w-full items-center justify-between gap-2 rounded-xl border p-2 text-left hover:bg-accent">
                <span className="flex min-w-0 flex-wrap gap-1"><Chip>{indByKey.get(p.indicatorKey)?.code}</Chip></span><ResultBadge r={p.result} />
              </button>
            )) : <ResultBadge r={u.parts.length ? "not_found" : "insufficient"} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ViewB({ rows, subjectById, onOpen }: { rows: CompareOutput["indicatorRows"]; subjectById: Map<string, SchoolSubject>; onOpen: (i: RefIndicator, p: Pair | null) => void }) {
  if (!rows.length) return <Empty>ไม่มีตัวชี้วัดตามตัวกรอง</Empty>;
  const unitName = (p: Pair) => { const s = subjectById.get(p.subjectId); const u = s?.units.find((x) => x.id === p.unitId); return `${s?.code ?? ""} ${u?.kind === "unit" ? u.title : "คำอธิบายรายวิชา"}`; };
  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <h3 className="border-b px-4 py-3 font-semibold">มาตรฐานและตัวชี้วัดแกนกลาง → หน่วยที่รองรับ</h3>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.indicator.key}>
            <button type="button" onClick={() => onOpen(r.indicator, r.best)} className="grid w-full gap-2 p-3 text-left text-sm hover:bg-accent/60 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-start">
              <span className="min-w-0"><span className="flex flex-wrap items-center gap-1"><Chip>{r.indicator.code}</Chip><span className="text-xs text-muted-foreground">{r.indicator.grade}</span></span>
                <span className="mt-1 block">{r.indicator.statement}</span></span>
              <span className="min-w-0 text-xs text-muted-foreground">{r.pairs.length ? <>รองรับโดย: {[...new Set(r.pairs.map(unitName))].slice(0, 3).join(" · ")}{r.pairs.length > 3 ? ` และอีก ${r.pairs.length - 3}` : ""}</> : r.note}</span>
              <ResultBadge r={r.result} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoverageByStandard({ data }: { data: RunResult }) {
  const by = new Map<string, Record<MatchResult, number>>();
  for (const r of data.out.indicatorRows) {
    const k = r.indicator.standardCode || "ไม่ระบุมาตรฐาน";
    const c = by.get(k) ?? { covered: 0, partial: 0, needs_review: 0, not_found: 0, insufficient: 0 };
    c[r.result]++;
    by.set(k, c);
  }
  if (!by.size) return <Empty>ยังไม่มีตัวชี้วัดในขอบเขต</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[...by].sort().map(([k, c]) => {
        const total = Object.values(c).reduce((a, b) => a + b, 0);
        return (
          <div key={k} className="rounded-2xl border bg-card p-4 shadow-card">
            <p className="flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-primary" aria-hidden="true" /> มาตรฐาน {k}</p>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{data.indicators.find((i) => i.standardCode === k)?.standardText ?? ""}</p>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {(["covered", "partial", "needs_review", "not_found", "insufficient"] as MatchResult[]).map((r) => <span key={r} style={{ width: `${(c[r] / total) * 100}%` }} className={cn(TONE[r].cls, "border-0")} />)}
            </div>
            <ul className="mt-2 space-y-1 text-sm">{(Object.keys(c) as MatchResult[]).filter((r) => c[r]).map((r) => <li key={r} className="flex justify-between"><ResultBadge r={r} /><span className="tabular-nums">{c[r]} / {total}</span></li>)}</ul>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

// ------------------------------------------------------------------ รายละเอียด + ยืนยัน
function Detail({ ctx, data, subjectById, versionId, versionInfo, canEdit, onDone }: {
  ctx: { pair: Pair | null; indicator: RefIndicator; subjectId: string | null; unitId: string | null }; data: RunResult; subjectById: Map<string, SchoolSubject>;
  versionId: string; versionInfo: VersionInfo; canEdit: boolean; onDone: () => void;
}) {
  const qc = useQueryClient();
  const { pair, indicator: ind } = ctx;
  const s = ctx.subjectId ? subjectById.get(ctx.subjectId) : null;
  const u = s?.units.find((x) => x.id === ctx.unitId) ?? null;
  const meta = u ? data.unitMeta.get(u.id) : undefined;
  const missing = contentTerms(ind.statement).filter((t) => !(pair?.matched ?? []).some((m) => m.includes(t)));
  const [note, setNote] = useState(pair?.decision?.note ?? "");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const history = useQuery({ queryKey: [...mappingKey, "history", pair?.decision?.mappingId], enabled: !!pair?.decision?.mappingId, queryFn: () => loadHistory(pair!.decision!.mappingId) });
  const blocked = !canEdit ? "เฉพาะผู้ดูแลหลักสูตรหรือหัวหน้ากลุ่มสาระที่ได้รับมอบหมาย"
    : !data.ref.official ? "ฐานตัวชี้วัดนี้ยังไม่ผ่านการรับรอง — รับรองผลอ่านก่อน จึงยืนยันการจับคู่ได้"
    : versionInfo.frameworkId !== data.ref.id ? "หลักสูตรสถานศึกษาฉบับนี้ยังไม่ผูกกับฐานแกนกลางฉบับที่เลือก"
    : !s?.sourceDocId ? "รายวิชานี้ไม่มีเอกสารต้นทางสำหรับอ้างอิง" : null;
  const decide = async (status: "verified" | "rejected", indicatorId?: string) => {
    if (!s || busy) return;
    if (status === "rejected" && !note.trim()) { toast.error("กรุณาระบุเหตุผลที่ปฏิเสธ"); return; }
    setBusy(true);
    try {
      const target = indicatorId ?? ind.id!;
      const existing = indicatorId ? data.mappingRows.find((r) => r.subject_id === s.id && r.indicator_id === indicatorId)?.id ?? null : pair?.decision?.mappingId ?? data.mappingRows.find((r) => r.subject_id === s.id && r.indicator_id === ind.id)?.id ?? null;
      await decideMapping({ versionId, subjectId: s.id, indicatorId: target, mappingId: existing, status, note: note.trim() || null, sourceDocId: s.sourceDocId!, locator: s.locator ?? "pdf:1" });
      toast.success(status === "verified" ? "บันทึกการยืนยันแล้ว (ไม่เปลี่ยนสถานะหลักสูตร)" : "บันทึกการปฏิเสธแล้ว");
      await qc.invalidateQueries({ queryKey: mappingKey });
      onDone();
    } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4 p-4 pb-10 sm:p-6">
      <div className="pr-8">
        <SheetTitle className="text-lg font-semibold">รายละเอียดการ Mapping</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">{u ? (u.kind === "unit" ? `หน่วย: ${u.title}` : `${s?.name} — คำอธิบายรายวิชา`) : "ยังไม่พบหน่วยที่รองรับ"}</SheetDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2">{pair ? <><ResultBadge r={pair.result} /><Badge variant="outline">{LEVEL_LABEL[pair.level]}</Badge><Badge variant={pair.verification === "verified" ? "success" : pair.verification === "rejected" ? "destructive" : "secondary"}>{VERIFY_LABEL[pair.verification]}</Badge></> : <ResultBadge r={data.out.indicatorRows.find((r) => r.indicator.key === ind.key)?.result ?? "not_found"} />}</div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Side title="ฝั่งหลักสูตรโรงเรียน">
          {s ? <>
            <Field k="รายวิชา" v={`${s.name} (${s.code}) · ${s.grade ?? "–"}`} />
            <Field k="หน่วยการเรียนรู้" v={u?.kind === "unit" ? `${meta?.seq ? `หน่วยที่ ${meta.seq} ` : ""}${u.title}` : "ยังไม่มีหน่วย — ใช้คำอธิบายรายวิชา"} />
            {meta?.hours != null && <Field k="ชั่วโมงเรียน" v={`${meta.hours} ชั่วโมง`} />}
            {meta?.essence && <Field k="สาระสำคัญ" v={meta.essence} />}
            {meta?.objectives && <Field k="จุดประสงค์" v={meta.objectives} />}
            {pair?.schoolSnippet && <Field k={`ข้อความต้นฉบับ (${pair.schoolField})`} v={<mark className="bg-[var(--gold-soft)] text-foreground">{pair.schoolSnippet}</mark>} />}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">อ้างอิง: {formatLocator(u?.locator ?? s.locator)} <SourcePdfLink docId={u?.sourceDocId ?? s.sourceDocId} locator={u?.locator ?? s.locator} /></div>
          </> : <p className="text-sm text-muted-foreground">ไม่พบหน่วย/คำอธิบายที่ระบุรหัสหรือมีเนื้อหาสอดคล้อง</p>}
        </Side>
        <Side title="ฝั่งหลักสูตรแกนกลาง">
          <Field k="ฉบับหลักสูตร" v={data.ref.label} />
          <Field k="มาตรฐาน" v={`${ind.standardCode}${ind.standardText ? ` ${ind.standardText}` : ""}`} />
          <Field k="ตัวชี้วัด" v={<><Chip>{ind.code}</Chip> <span>{ind.statement}</span></>} />
          <Field k="ระดับชั้น" v={ind.grade} />
          {!data.ref.official && <p className="rounded-lg bg-warning/10 p-2 text-xs">ข้อความนี้มาจากการอ่านเอกสารอัตโนมัติ ยังไม่ผ่านการตรวจรับรอง{ind.flags.includes("TEXT_REPAIRED") ? " · มีการซ่อมอักขระไทย ควรเทียบกับภาพต้นฉบับ" : ""}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">อ้างอิง: {formatLocator(ind.locator)} <SourcePdfLink docId={ind.sourceDocId} locator={ind.locator} /></div>
        </Side>
      </div>

      <Side title="ผล Mapping">
        {pair ? <ul className="list-disc space-y-1 pl-5 text-sm">{pair.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="text-sm">ไม่พบหลักฐานในข้อมูลที่ตรวจ</p>}
        {pair && pair.matched.length > 0 && <Field k="สิ่งที่ตรงกัน" v={pair.matched.slice(0, 12).join(" · ")} />}
        {missing.length > 0 && <Field k="สิ่งที่ยังขาด (คำสำคัญของตัวชี้วัดที่ไม่พบ)" v={missing.join(" · ")} />}
        <Field k="ข้อเสนอแนะ" v={suggestion(pair, missing, u?.kind === "unit")} />
        {pair?.decision && <Field k="การยืนยัน" v={`${VERIFY_LABEL[pair.verification]}${pair.decision.at ? ` · ${new Date(pair.decision.at).toLocaleString("th-TH")}` : ""}${pair.decision.note ? ` · ${pair.decision.note}` : ""}`} />}
      </Side>

      <Side title="ยืนยันโดยฝ่ายวิชาการ">
        <p className="text-xs text-muted-foreground">การยืนยันเป็นการตรวจการจับคู่รายข้อ ไม่ใช่การอนุมัติหลักสูตรทั้งฉบับ และไม่เปลี่ยนสถานะหลักสูตรสถานศึกษา</p>
        {blocked ? <p className="rounded-lg bg-muted p-2 text-sm">{blocked}</p> : s && ind.id ? (
          <div className="space-y-2">
            <label htmlFor="dn" className="text-sm font-medium">เหตุผล (จำเป็นเมื่อปฏิเสธ)</label>
            <textarea id="dn" className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => decide("verified")}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} ยืนยันการจับคู่</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("rejected")}><XCircle /> ปฏิเสธข้อเสนอ</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <FormField label="แก้ไขการจับคู่: เลือกตัวชี้วัดที่ถูกต้อง" htmlFor="alt"><Select id="alt" value={alt} onChange={(e) => setAlt(e.target.value)}>
                <option value="">เลือกตัวชี้วัด</option>{data.indicators.filter((i) => i.id && i.key !== ind.key).map((i) => <option key={i.key} value={i.id!}>{i.code} {i.statement.slice(0, 50)}</option>)}</Select></FormField>
              <Button size="sm" variant="outline" disabled={busy || !alt} onClick={async () => { await decide("verified", alt); }}>บันทึกตัวชี้วัดที่ถูกต้อง</Button>
            </div>
          </div>
        ) : null}
        {pair?.decision?.mappingId && (
          <div className="text-sm">
            <p className="font-medium">ประวัติการเปลี่ยนแปลง</p>
            {history.isPending ? <p className="text-xs text-muted-foreground">กำลังโหลด…</p> : history.data === null ? <p className="text-xs text-muted-foreground">ประวัติละเอียดดูได้เฉพาะผู้มีสิทธิ์อ่านบันทึกการตรวจสอบ</p> : (
              <ol className="mt-1 space-y-1 text-xs">{(history.data ?? []).map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("th-TH")} · {h.action === "INSERT" ? "สร้างการจับคู่" : "ปรับสถานะ"}{h.status ? ` → ${h.status === "verified" ? "ยืนยัน" : h.status === "rejected" ? "ปฏิเสธ" : "รอตรวจ"}` : ""}{h.note ? ` · ${h.note}` : ""}</li>)}</ol>
            )}
          </div>
        )}
      </Side>
    </div>
  );
}

function suggestion(p: Pair | null, missing: string[], isUnit: boolean) {
  if (!p) return "เพิ่มหน่วยการเรียนรู้หรือเนื้อหาที่สอดคล้องกับตัวชี้วัดนี้ แล้วระบุรหัสตัวชี้วัดในโครงสร้างรายวิชา";
  if (p.verification === "verified") return "ยืนยันแล้ว — ตรวจซ้ำเมื่อมีการแก้หน่วยการเรียนรู้";
  if (p.origin === "suggested") return `ตรวจกับต้นฉบับ หากสอดคล้องจริงให้ระบุรหัสตัวชี้วัดใน${isUnit ? "หน่วยนี้" : "หน่วยการเรียนรู้ของรายวิชา"} แล้วยืนยัน`;
  if (p.result === "partial" && missing.length) return `เพิ่มเนื้อหา/กิจกรรมเกี่ยวกับ: ${missing.slice(0, 5).join(", ")}`;
  if (p.result === "needs_review") return "ตรวจรหัสและฉบับหลักสูตรที่อ้างอิงกับ PDF ต้นฉบับ แล้วยืนยันหรือแก้ไขการจับคู่";
  return "—";
}
function Side({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2 rounded-2xl border bg-card p-3 shadow-card"><h3 className="text-sm font-semibold text-primary">{title}</h3>{children}</section>;
}
function Field({ k, v }: { k: string; v: ReactNode }) {
  return <div className="text-sm"><p className="text-xs font-medium text-muted-foreground">{k}</p><div className="whitespace-pre-wrap break-words">{v}</div></div>;
}
