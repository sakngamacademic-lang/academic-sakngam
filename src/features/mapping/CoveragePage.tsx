import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BookOpenCheck, ChevronDown, Loader2, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Select } from "@/components/ui/form-controls";
import { allVersions, useCurricula, VERSION_STATUS_LABELS } from "@/features/curriculum/api";
import { CurriculumNav, formatLocator, SourcePdfLink } from "@/features/curriculum/components";
import { useLocalContent } from "@/features/curriculum/categories/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { cn } from "@/lib/utils";
import { loadDecisions, loadReference, loadSchool, mappingKey, useReferenceOptions, useVersionSubjects } from "./api";
import { compareMapping } from "./match";
import { coverage, COV_LABEL, localRef, type CovStatus, type IndicatorCoverage } from "./coverage";
import { referenceQa } from "./reference-qa";

/**
 * ความครอบคลุมมาตรฐานและตัวชี้วัด — ตรวจทั้งหลักสูตรโดยไม่ต้องกรอกมาตรฐานเอง
 * ฐานอ้างอิง: กรอบที่บันทึกแล้ว (ทางการ) หรือผลอ่านเอกสาร (ยังไม่รับรอง) · ร้อยละเฉพาะฐานที่ยืนยันว่าครบ
 */
const TONE: Record<CovStatus, string> = {
  code: "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]", content: "bg-[var(--tone-blue-bg)] text-[var(--tone-blue-fg)]",
  suggest: "bg-[var(--tone-orange-bg)] text-[var(--tone-orange-fg)]", none: "bg-muted text-muted-foreground",
};
const Chip = ({ s }: { s: CovStatus }) => <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE[s])}>{COV_LABEL[s]}</span>;
const AREA_NAME: Record<string, string> = { ท: "ภาษาไทย", ค: "คณิตศาสตร์", ว: "วิทยาศาสตร์และเทคโนโลยี", ส: "สังคมศึกษา ศาสนา และวัฒนธรรม", พ: "สุขศึกษาและพลศึกษา", ศ: "ศิลปะ", ง: "การงานอาชีพ", ต: "ภาษาต่างประเทศ" };

export function CoveragePage() {
  const [params, setParams] = useSearchParams();
  const curricula = useCurricula();
  const versions = allVersions(curricula.data);
  const live = versions.filter((v) => v.status !== "retired");
  const v = versions.find((x) => x.id === params.get("v")) ?? live.find((x) => x.status === "active") ?? live[0];
  const refs = useReferenceOptions();
  const ref = refs.data?.find((r) => r.value === params.get("ref")) ?? refs.data?.find((r) => r.official) ?? refs.data?.[0];
  const subjects = useVersionSubjects(v?.id ?? null);
  const local = useLocalContent(v?.id ?? null);
  const [run, setRun] = useState(false);
  const [area, setArea] = useState("");
  const result = useQuery({
    queryKey: [...mappingKey, "coverage", v?.id, ref?.value, local.data?.batch?.id],
    enabled: run && !!v && !!ref && !!subjects.data,
    queryFn: async () => {
      const r = await loadReference(ref!);
      const indicators = r.indicators.filter((i) => i.grade.startsWith("ม"));
      const qa = referenceQa(indicators.map((i) => ({ code: i.code, standard: i.standardCode, grade: i.grade, statement: i.statement, locator: i.locator })), [...r.standards.keys()]);
      const areas = new Set(indicators.map((i) => i.areaCode));
      const scope = subjects.data!.filter((s) => areas.has(s.code.trim()[0] ?? ""));
      const codeOf = new Map(r.indicators.filter((i) => i.id).map((i) => [i.id!, i.code]));
      const [school, dec] = await Promise.all([loadSchool(scope.map((s) => s.id), (id) => codeOf.get(id) ?? null), loadDecisions(v!.id, scope.map((s) => s.id), (id) => codeOf.get(id) ?? null)]);
      const out = compareMapping({ subjects: school.subjects, indicators, decisions: dec.decisions });
      const cov = coverage(indicators, out, (local.data?.items ?? []).map(localRef), ref!.official && ref!.complete);
      const schoolAreas = new Set(subjects.data!.map((s) => s.code.trim()[0]).filter((x): x is string => !!x && !!AREA_NAME[x]));
      return { ...cov, qa, areas: [...areas], missingAreas: [...schoolAreas].filter((a) => !areas.has(a)), subjects: new Map(school.subjects.map((s) => [s.id, s])), standards: r.standards };
    },
  });
  const areasList = result.data?.areas ?? [];
  const shownArea = area || areasList[0] || "";

  return (
    <>
      <PageHeader icon={BookOpenCheck} title="ความครอบคลุมมาตรฐานและตัวชี้วัด" description="ตรวจว่ารายวิชาและสาระท้องถิ่นของโรงเรียนครอบคลุมตัวชี้วัดแกนกลางข้อใด — ไม่ต้องกรอกมาตรฐานเอง ระบบไม่รับรองผลอัตโนมัติ" />
      <CurriculumNav />
      <section className="mb-4 grid gap-3 rounded-2xl border bg-card p-4 shadow-card sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <FormField label="หลักสูตรสถานศึกษา" htmlFor="cv-v"><Select id="cv-v" value={v?.id ?? ""} onChange={(e) => { setParams((p) => { p.set("v", e.target.value); return p; }); setRun(false); }}>
          {versions.map((x) => <option key={x.id} value={x.id}>{x.curriculum_name} · {x.version_label} ({VERSION_STATUS_LABELS[x.status]})</option>)}</Select></FormField>
        <FormField label="ฐานมาตรฐานและตัวชี้วัดอ้างอิง" htmlFor="cv-r"><Select id="cv-r" value={ref?.value ?? ""} onChange={(e) => { setParams((p) => { p.set("ref", e.target.value); return p; }); setRun(false); }}>
          {!refs.data?.length && <option value="">ยังไม่มีฐานอ้างอิง</option>}
          {refs.data?.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></FormField>
        <Button size="lg" className="w-full sm:w-auto" disabled={!v || !ref || result.isFetching} onClick={() => { setRun(true); void result.refetch(); }}>
          {result.isFetching ? <Loader2 className="animate-spin" /> : <Search />} ตรวจความครอบคลุม
        </Button>
      </section>
      {ref && !(ref.official && ref.complete) && (
        <p role="note" className="mb-4 flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span><b>ผลเบื้องต้น</b> — ฐานอ้างอิงนี้{ref.official ? "ยังไม่ยืนยันว่าครบ" : "เป็นผลอ่านเอกสารอัตโนมัติที่ยังไม่รับรอง"} จึงไม่แสดงร้อยละความครอบคลุมอย่างเป็นทางการ ·
          ขั้นต่อไป: ฝ่ายวิชาการตรวจรายการด้านล่างกับเอกสารต้นทาง แล้วบันทึก/ยืนยันกรอบแกนกลางที่ <Link to="/office/curriculum/analysis" className="text-primary underline">อ่านเอกสารอัตโนมัติ</Link></span></p>
      )}
      {!local.data?.batch && local.data?.installed && <p className="mb-4 text-xs text-muted-foreground">ยังไม่มีตารางสาระท้องถิ่นในระบบ — นำเข้าได้ที่หน้าภาพรวมหลักสูตร (ช่วยให้จับคู่ “ตรงกันตามรหัส” ได้มากขึ้น)</p>}
      {result.error && <p role="alert" className="text-sm text-destructive">{dbErrorMessage(result.error)}</p>}
      {result.isFetching && !result.data && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> กำลังตรวจทุกรายวิชาในกลุ่มสาระที่มีฐานอ้างอิง…</p>}
      {result.data && (
        <div className="space-y-4">
          <ReferencePanel qa={result.data.qa} missing={result.data.missingAreas} official={!!ref?.official} complete={!!ref?.complete} label={ref?.label ?? ""} />
          <section className="rounded-2xl border bg-card p-4 shadow-card">
            <h2 className="mb-3 font-semibold">สรุปรายกลุ่มสาระและระดับชั้น</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.cells.map((c) => (
                <button key={`${c.area}${c.grade}`} type="button" onClick={() => setArea(c.area)} className={cn("rounded-xl border p-3 text-left text-sm hover:border-primary/50", shownArea === c.area && "border-primary")}>
                  <p className="font-semibold">{AREA_NAME[c.area] ?? c.area} · {c.grade}</p>
                  <p className="text-xs text-muted-foreground">ตัวชี้วัด {c.total} ข้อ {c.percent != null ? `· ครอบคลุม ${c.percent}%` : "· ผลเบื้องต้น"}</p>
                  <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">{(["code", "content", "suggest"] as CovStatus[]).map((s) => <span key={s} className={TONE[s]} style={{ width: `${(c.counts[s] / c.total) * 100}%` }} />)}</div>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-xs">{(Object.keys(COV_LABEL) as CovStatus[]).map((s) => <span key={s}>{COV_LABEL[s]} {c.counts[s]}</span>)}</p>
                </button>
              ))}
            </div>
          </section>
          <AreaDetail rows={result.data.rows.filter((r) => r.indicator.areaCode === shownArea)} area={shownArea} subjects={result.data.subjects} standards={result.data.standards} versionId={v!.id} />
        </div>
      )}
      {!run && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">เลือกหลักสูตรและฐานอ้างอิง แล้วกด “ตรวจความครอบคลุม”</p>}
    </>
  );
}

function ReferencePanel({ qa, missing, official, complete, label }: { qa: ReturnType<typeof referenceQa>; missing: string[]; official: boolean; complete: boolean; label: string }) {
  const KIND: Record<string, string> = { low_count: "จำนวนน้อยผิดปกติ (อาจสกัดไม่ครบ)", gap: "เลขตัวชี้วัดขาดช่วง", variant: "รหัสเดียวข้อความต่างกัน", orphan_standard: "มาตรฐานที่ไม่พบตัวชี้วัด", no_standard: "ตัวชี้วัดที่ไม่พบมาตรฐาน", bad_code: "รูปแบบรหัสผิด" };
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-card">
      <h2 className="flex flex-wrap items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary" aria-hidden="true" /> ฐานอ้างอิงที่ใช้ตรวจ
        <Badge variant={official && complete ? "success" : official ? "info" : "warning"}>{official ? (complete ? "ทางการ · ยืนยันว่าครบ" : "ทางการ · ยังไม่ยืนยันว่าครบ") : "ยังไม่รับรอง"}</Badge></h2>
      <p className="text-sm text-muted-foreground">{label} · ตัวชี้วัด ม.1–ม.6 {qa.distinct} ข้อ</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium"><ChevronDown className="mr-1 inline size-4" />จำนวนตัวชี้วัดรายกลุ่มสาระ×ชั้น และผลตรวจคุณภาพฐาน ({qa.issues.length} ประเด็น)</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[22rem] text-xs"><thead className="text-left text-muted-foreground"><tr><th className="py-1">กลุ่มสาระ</th><th>ชั้น</th><th className="text-right">มาตรฐาน</th><th className="text-right">ตัวชี้วัด</th><th className="text-right">ประเด็น</th></tr></thead>
          <tbody>{qa.cells.map((c) => <tr key={c.area + c.grade} className="border-t"><td className="py-1">{AREA_NAME[c.area] ?? c.area}</td><td>{c.grade}</td><td className="text-right">{c.standards}</td><td className="text-right">{c.indicators}</td><td className={cn("text-right", c.issues && "font-semibold text-warning")}>{c.issues || "–"}</td></tr>)}</tbody></table></div>
        <ul className="mt-2 space-y-1">{qa.issues.map((i, n) => <li key={n} className="rounded-lg bg-warning/10 px-2 py-1 text-xs"><b>{KIND[i.kind]}</b> · {i.key} — {i.detail}{i.locators.length ? ` (${i.locators.map(formatLocator).join(", ")})` : ""}</li>)}</ul>
      </details>
      {missing.length > 0 && <p className="mt-2 rounded-lg bg-muted p-2 text-xs"><b>ยังไม่มีฐานตัวชี้วัดในระบบ:</b> {missing.map((a) => AREA_NAME[a]).join(", ")} — ต้องลงทะเบียนเอกสารแกนกลางทางการของกลุ่มสาระเหล่านี้ก่อน จึงจะตรวจความครอบคลุมได้</p>}
    </section>
  );
}

function AreaDetail({ rows, area, subjects, standards, versionId }: { rows: IndicatorCoverage[]; area: string; subjects: Map<string, { code: string; name: string; locator: string | null; sourceDocId: string | null }>; standards: Map<string, string>; versionId: string }) {
  const [filter, setFilter] = useState<"" | CovStatus>("");
  const byStd = useMemo(() => {
    const m = new Map<string, IndicatorCoverage[]>();
    for (const r of rows.filter((x) => !filter || x.status === filter)) (m.get(r.indicator.standardCode) ?? m.set(r.indicator.standardCode, []).get(r.indicator.standardCode)!).push(r);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "th", { numeric: true }));
  }, [rows, filter]);
  if (!area) return null;
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <h2 className="min-w-0 flex-1 font-semibold">{AREA_NAME[area] ?? area} — รายมาตรฐาน</h2>
        <Select aria-label="กรองสถานะ" className="w-full sm:w-56" value={filter} onChange={(e) => setFilter(e.target.value as CovStatus | "")}><option value="">ทุกสถานะ</option>{(Object.keys(COV_LABEL) as CovStatus[]).map((s) => <option key={s} value={s}>{COV_LABEL[s]}</option>)}</Select>
      </div>
      <div className="space-y-2">{byStd.map(([std, rs]) => (
        <details key={std} className="rounded-xl border p-3" open={byStd.length <= 3}>
          <summary className="cursor-pointer text-sm"><b>มาตรฐาน {std}</b> <span className="text-muted-foreground">· {rs.length} ตัวชี้วัด · ยังไม่พบ {rs.filter((r) => r.status === "none").length}</span>
            {standards.get(std) && <span className="block text-xs text-muted-foreground">{standards.get(std)}</span>}</summary>
          <ul className="mt-2 divide-y">{rs.sort((a, b) => a.indicator.key.localeCompare(b.indicator.key, "th", { numeric: true })).map((r) => (
            <li key={r.indicator.key} className="py-2 text-sm">
              <div className="flex flex-wrap items-start gap-2"><code className="text-xs">{r.indicator.code}</code><span className="min-w-0 flex-1">{r.indicator.statement}</span><Chip s={r.status} />{r.verified && <Badge variant="success">ฝ่ายวิชาการยืนยัน</Badge>}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">ต้นทาง: {formatLocator(r.indicator.locator)} <SourcePdfLink docId={r.indicator.sourceDocId} locator={r.indicator.locator} /></span>
                {r.local.map((l) => <span key={l.key}>ตารางสาระท้องถิ่น ตาราง {l.table} แถว {l.row}</span>)}
                {[...new Map(r.pairs.filter((p) => p.result !== "not_found").map((p) => [p.subjectId, p])).values()].slice(0, 4).map((p) => { const s = subjects.get(p.subjectId); return s ? <span key={p.subjectId} className="inline-flex items-center gap-1">{s.code} {s.name} ({p.origin === "declared" ? "ระบุรหัส" : `สอดคล้อง ${Math.round(p.score * 100)}%`}) <SourcePdfLink docId={s.sourceDocId} locator={s.locator} /></span> : null; })}
                {r.status !== "none" && <Link to={`/office/curriculum/mapping?v=${versionId}`} className="text-primary hover:underline">ตรวจ/ยืนยันในหน้า Mapping</Link>}
              </div>
            </li>
          ))}</ul>
        </details>
      ))}{!byStd.length && <p className="text-sm text-muted-foreground">ไม่มีรายการตามตัวกรอง</p>}</div>
    </section>
  );
}
