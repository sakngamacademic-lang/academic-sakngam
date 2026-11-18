import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, MapPin, ScanSearch, Sparkles, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { loadReference, useReferenceOptions } from "@/features/mapping/api";
import { normCode } from "@/features/mapping/match";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatLocator, SourcePdfLink } from "../components";
import { catKey, importLocalContent, setCategory, sha256Hex, useLocalContent, type CategoryData } from "./api";
import { classify, STAGE_LABEL, stageOf } from "./classify";
import { analyzeLocal, checkCode, CODE_CHECK_LABEL, readLocalCsv, type CodeCheck, type LocalItem, type LocalLink } from "./local-match";

/**
 * “วิเคราะห์หลักสูตรจากเอกสาร” — ปุ่มเดียว: ใช้รายวิชา 2569 + ตารางสาระท้องถิ่น + ฐานตัวชี้วัดที่มี
 * ผลเป็นข้อเสนอ: รายการมั่นใจสูงให้ตรวจแบบกลุ่ม (ผู้ดูแลกดยืนยันเอง) · ไม่แก้รหัสวิชา ชั่วโมง หน่วยกิต หรือรหัสตัวชี้วัด
 */
type Tab = "overview" | "linked" | "review";
interface Result {
  items: LocalItem[]; links: LocalLink[]; unmatched: string[]; ambiguous: string[]; noSubject: string[];
  checks: Map<string, CodeCheck>; refLabel: string; refOfficial: boolean;
}

export function LocalAnalysis({ versionId, data }: { versionId: string; data: CategoryData }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const admin = can("curriculum.manage");
  const stored = useLocalContent(versionId);
  const refs = useReferenceOptions();
  const [session, setSession] = useState<{ name: string; sha: string; items: LocalItem[] } | null>(null);
  const [run, setRun] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const items = session?.items ?? stored.data?.items ?? [];
  const ref = refs.data?.find((r) => r.official) ?? refs.data?.find((r) => !r.official) ?? null;
  const result = useQuery({
    queryKey: [...catKey, "local-run", versionId, run, session?.sha ?? stored.data?.batch?.id, ref?.value],
    enabled: run > 0 && items.length > 0,
    queryFn: async (): Promise<Result> => {
      const refData = ref ? await loadReference(ref) : { indicators: [] };
      const codes = new Set(refData.indicators.map((i) => i.key));
      const standards = new Set(refData.indicators.map((i) => normCode(i.standardCode)));
      const checks = new Map(items.map((i) => [i.key, checkCode(i, { codes, standards })]));
      const r = analyzeLocal(items, data.subjects.map((s) => ({ id: s.id, code: s.code, name: s.name_th, grade: s.grade, description: s.description_th, outcomes: s.outcomes ?? [],
        locator: s.source_locator, sourceDocId: s.source_document_id })));
      return { items, ...r, checks, refLabel: ref?.label ?? "ไม่มีฐานตัวชี้วัดในระบบ", refOfficial: !!ref?.official };
    },
  });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const buf = await f.arrayBuffer();
    const { items: parsed, errors } = readLocalCsv(new TextDecoder("utf-8").decode(buf));
    if (errors.length || !parsed.length) { toast.error(errors[0] ?? "ไม่พบข้อมูลในไฟล์"); return; }
    setSession({ name: f.name, sha: await sha256Hex(buf), items: parsed });
    setRun((n) => n + 1);
  };
  const save = async () => {
    if (!session) return;
    try {
      await importLocalContent({ versionId, fileName: session.name, sha256: session.sha, sourceLabel: session.items[0]?.source ?? null, items: session.items });
      toast.success(`บันทึกตารางสาระท้องถิ่น ${session.items.length} แถวลงระบบแล้ว (ข้อความตามต้นฉบับ)`);
      setSession(null);
      await qc.invalidateQueries({ queryKey: catKey });
    } catch (e) { toast.error(dbErrorMessage(e)); }
  };

  const hasSource = items.length > 0;
  return (
    <section aria-labelledby="la-h" className="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h3 id="la-h" className="flex items-center gap-2 text-lg font-semibold"><ScanSearch className="size-5 text-primary" aria-hidden="true" /> วิเคราะห์หลักสูตรจากเอกสาร</h3>
          <p className="text-sm text-muted-foreground">ระบบอ่านรายวิชา 2569 (ชื่อ คำอธิบาย ผลการเรียนรู้ ระดับชั้น) และตารางสาระท้องถิ่น แล้วเสนอการเชื่อมโยงพร้อมหลักฐาน — ไม่แก้ข้อมูลหลักสูตร</p>
        </div>
        <Button size="lg" className="w-full sm:w-auto" disabled={!hasSource || result.isFetching} onClick={() => setRun((n) => n + 1)}>
          {result.isFetching ? <Loader2 className="animate-spin" /> : <ScanSearch />} วิเคราะห์หลักสูตรจากเอกสาร
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-3 text-sm">
        <span className="font-medium">ตารางสาระท้องถิ่น:</span>
        {session ? <span>{session.name} · {session.items.length} แถว <Badge variant="warning">ยังไม่บันทึกลงระบบ (ใช้วิเคราะห์ชั่วคราว)</Badge></span>
          : stored.data?.batch ? <span>{stored.data.batch.file_name} · {stored.data.batch.row_count} แถว · นำเข้า {new Date(stored.data.batch.created_at).toLocaleDateString("th-TH")}</span>
          : <span className="text-muted-foreground">{stored.isPending ? "กำลังตรวจ…" : "ยังไม่มี — นำเข้าไฟล์ CSV ที่จัดเตรียมไว้"}</span>}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
          <FileUp className="size-4" aria-hidden="true" /> เลือกไฟล์ CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="เลือกไฟล์ตารางสาระท้องถิ่น CSV" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {session && admin && stored.data?.installed && <Button size="sm" variant="outline" onClick={save}><Upload /> บันทึกลงระบบ</Button>}
        {session && stored.data && !stored.data.installed && <span className="w-full text-xs text-muted-foreground">การบันทึกตารางลงระบบรอติดตั้ง migration 20261205000100 — วิเคราะห์ได้ตามปกติ แต่ต้องเลือกไฟล์ใหม่ทุกครั้ง</span>}
      </div>

      {!hasSource && <Next>ขั้นต่อไป: กด “เลือกไฟล์ CSV” ตารางสาระท้องถิ่นที่จัดเตรียมไว้ แล้วระบบจะวิเคราะห์ให้ทันที</Next>}
      {result.error && <p role="alert" className="mt-3 text-sm text-destructive">{dbErrorMessage(result.error)}</p>}
      {result.data && (
        <>
          <div role="tablist" aria-label="ผลการวิเคราะห์" className="mt-4 grid gap-2 sm:grid-cols-3">
            {([["overview", "ภาพรวมหลักสูตรและจุดเด่น"], ["linked", "รายวิชาที่เชื่อมโยงท้องถิ่น"], ["review", "ต้องให้ฝ่ายวิชาการตรวจเพิ่มเติม"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("min-h-11 rounded-xl border px-3 text-sm font-medium shadow-card", tab === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40")}>{l}</button>
            ))}
          </div>
          {tab === "overview" && <Overview r={result.data} data={data} />}
          {tab === "linked" && <Linked r={result.data} data={data} versionId={versionId} admin={admin && data.installed} />}
          {tab === "review" && <Review r={result.data} data={data} />}
        </>
      )}
    </section>
  );
}

/** แสดงรหัสตามต้นฉบับบนบรรทัดเดียว (ข้อมูลที่เก็บไม่ถูกแก้) */
const showCode = (raw: string) => raw.replace(/\s+/g, " ").trim();

function Next({ children }: { children: ReactNode }) {
  return <p className="mt-3 flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm"><Sparkles className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />{children}</p>;
}
function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <div className="rounded-xl border bg-background p-3"><p className="text-2xl font-bold tabular-nums text-primary">{typeof value === "number" ? value.toLocaleString("th-TH") : value}</p><p className="text-sm">{label}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}

function Overview({ r, data }: { r: Result; data: CategoryData }) {
  const cands = useMemo(() => classify(data), [data]);
  const hi = r.links.filter((l) => l.confidence === "high");
  const areas = new Set(r.items.map((i) => i.parsed?.area).filter(Boolean));
  const voc = data.programs.filter((p) => /ทวิศึกษา|อาชีพ/.test(p.name_th));
  const lowerCareer = cands.filter((c) => c.category === "vocational" && c.targetType === "subject" && c.stage === "lower" && c.strength === "content");
  const cc = (k: CodeCheck) => [...r.checks.values()].filter((x) => x === k).length;
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="แผนการเรียน" value={data.programs.length} hint={voc.length ? `ทวิศึกษา/สายอาชีพ ${voc.length} แผน` : undefined} />
        <Stat label="รายวิชาในหลักสูตร" value={data.subjects.length} />
        <Stat label="สาระท้องถิ่นในตาราง" value={r.items.length} hint={`${areas.size} กลุ่มสาระ`} />
        <Stat label="รายวิชาที่พบการเชื่อมโยงท้องถิ่น (มั่นใจสูง)" value={new Set(hi.map((l) => l.subjectId)).size} hint="ยังเป็นข้อเสนอ รอตรวจแบบกลุ่ม" />
      </div>
      <div className="rounded-xl border p-3 text-sm">
        <p className="font-semibold">จุดเด่นจากข้อมูลจริง</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {voc.length > 0 && <li>มีแผนการเรียนทวิศึกษา {voc.length} แผน: {voc.map((p) => p.name_th.replace(/^แผนการเรียน/, "")).join(", ")}</li>}
          {lowerCareer.length > 0 && <li>รายวิชาเพิ่มเติม ม.ต้น ที่มีองค์ประกอบสมรรถนะอาชีพ {lowerCareer.length} วิชา ({lowerCareer.map((c) => c.label.split(" ")[0]).join(", ")}) — รอยืนยัน</li>}
          <li>ตารางสาระท้องถิ่น {r.items.length} รายการ ใน {areas.size} กลุ่มสาระ เชื่อมกับรายวิชาได้แบบมั่นใจสูง {new Set(hi.map((l) => l.itemKey)).size} รายการ</li>
          <li>กิจกรรมพัฒนาผู้เรียน {data.activities.length} รายการตามโครงสร้างเวลาเรียน</li>
        </ul>
      </div>
      <div className="rounded-xl border p-3 text-sm">
        <p className="font-semibold">ตรวจรหัสตัวชี้วัดในตารางสาระท้องถิ่น</p>
        <p className="text-xs text-muted-foreground">ฐานที่ใช้ตรวจ: {r.refLabel}{r.refOfficial ? "" : " — ผลอ่านอัตโนมัติ ยังไม่รับรอง"}</p>
        <ul className="mt-1 grid gap-1 sm:grid-cols-2">{(Object.keys(CODE_CHECK_LABEL) as CodeCheck[]).map((k) => <li key={k} className="flex justify-between gap-2"><span>{CODE_CHECK_LABEL[k]}</span><b className="tabular-nums">{cc(k)}</b></li>)}</ul>
      </div>
      <Next>ขั้นต่อไป: ไปที่ “รายวิชาที่เชื่อมโยงท้องถิ่น” ตรวจกลุ่มที่มั่นใจสูงแล้วกดยืนยันครั้งเดียว · รายการที่ระบบไม่แน่ใจอยู่ใน “ต้องให้ฝ่ายวิชาการตรวจเพิ่มเติม”</Next>
    </div>
  );
}

function Linked({ r, data, versionId, admin }: { r: Result; data: CategoryData; versionId: string; admin: boolean }) {
  const qc = useQueryClient();
  const itemOf = new Map(r.items.map((i) => [i.key, i]));
  const confirmed = new Set(data.links.filter((l) => l.category === "local" && l.status === "confirmed" && l.target_type === "subject").map((l) => l.target_id));
  const bySubject = new Map<string, LocalLink[]>();
  for (const l of r.links) (bySubject.get(l.subjectId) ?? bySubject.set(l.subjectId, []).get(l.subjectId)!).push(l);
  const subjects = data.subjects.filter((s) => bySubject.has(s.id)).sort((a, b) => a.code.localeCompare(b.code, "th"));
  const high = subjects.filter((s) => bySubject.get(s.id)!.some((l) => l.confidence === "high"));
  const [pick, setPick] = useState<Set<string>>(() => new Set(high.filter((s) => !confirmed.has(s.id)).map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const [showMedium, setShowMedium] = useState(false);
  const confirmGroup = async () => {
    const list = high.filter((s) => pick.has(s.id) && !confirmed.has(s.id));
    if (!list.length || !window.confirm(`ยืนยันว่า ${list.length} รายวิชาที่เลือกเชื่อมโยงสาระท้องถิ่นตามหลักฐานที่แสดง?\nเป็นการยืนยันโดยผู้ดูแลหลักสูตร (ไม่แก้ข้อมูลรายวิชา)`)) return;
    setBusy(true);
    let n = 0;
    try {
      for (const s of list) {
        const ls = bySubject.get(s.id)!.filter((l) => l.confidence === "high");
        const reason = `ตรวจแบบกลุ่มจากตารางสาระท้องถิ่น: ${ls.map((l) => { const it = itemOf.get(l.itemKey)!; return `ตาราง ${it.table} แถว ${it.row} (${it.codeRaw.replace(/\s+/g, " ")})`; }).join("; ")} · สาระแกนกลางสอดคล้องกับ${ls[0]!.field ?? "ข้อมูลรายวิชา"}`;
        await setCategory({ versionId, category: "local", targetType: "subject", targetId: s.id, status: "confirmed", reason: reason.slice(0, 1990), docId: s.source_document_id, locator: s.source_locator });
        n++;
      }
      toast.success(`ยืนยันแล้ว ${n} รายวิชา`);
    } catch (e) { toast.error(`ยืนยันได้ ${n} วิชา: ${dbErrorMessage(e)}`); } finally { setBusy(false); await qc.invalidateQueries({ queryKey: catKey }); }
  };
  const shown = showMedium ? subjects : high;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-accent/60 p-3 text-sm">
        <span className="min-w-0 flex-1"><b>กลุ่มมั่นใจสูง {high.length} รายวิชา</b> — สาระแกนกลางของตัวชี้วัดตรงกับเนื้อหารายวิชา ระดับชั้นและกลุ่มสาระตรงกัน · ยังไม่ถือว่ารับรองจนกว่าผู้ดูแลยืนยัน</span>
        {admin ? <Button size="sm" disabled={busy || !pick.size} onClick={confirmGroup}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} ยืนยันกลุ่มที่เลือก ({[...pick].filter((id) => !confirmed.has(id)).length})</Button>
          : <span className="text-xs text-muted-foreground">{data.installed ? "ยืนยันได้เฉพาะผู้ดูแลหลักสูตร" : "ระบบบันทึกผลตรวจยังไม่ได้ติดตั้ง"}</span>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showMedium} onChange={(e) => setShowMedium(e.target.checked)} /> แสดงรายวิชาที่มั่นใจปานกลางด้วย ({subjects.length - high.length})</label>
      <ul className="space-y-2">
        {shown.map((s) => {
          const ls = bySubject.get(s.id)!.filter((l) => showMedium || l.confidence === "high");
          const isHigh = high.includes(s);
          return (
            <li key={s.id} className="rounded-xl border bg-background p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {admin && isHigh && !confirmed.has(s.id) && <input type="checkbox" aria-label={`เลือก ${s.code}`} checked={pick.has(s.id)} onChange={(e) => { const n = new Set(pick); if (e.target.checked) n.add(s.id); else n.delete(s.id); setPick(n); }} />}
                <b>{s.code} {s.name_th}</b><span className="text-xs text-muted-foreground">{s.grade} · {stageOf(s.grade) ? STAGE_LABEL[stageOf(s.grade)!] : ""}</span>
                {confirmed.has(s.id) ? <Badge variant="success">ผู้ดูแลยืนยันแล้ว</Badge> : <Badge variant={isHigh ? "info" : "secondary"}>{isHigh ? "มั่นใจสูง · รอตรวจ" : "มั่นใจปานกลาง · ต้องตรวจ"}</Badge>}
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">{formatLocator(s.source_locator)} <SourcePdfLink docId={s.source_document_id} locator={s.source_locator} /></span>
              </div>
              <ul className="mt-2 space-y-1.5">{ls.map((l) => {
                const it = itemOf.get(l.itemKey)!;
                return (
                  <li key={l.itemKey} className="rounded-lg bg-muted/40 p-2 text-xs">
                    <p><code title="รหัสตามต้นฉบับ">{showCode(it.codeRaw)}</code> · ตาราง {it.table} แถว {it.row} · <span className="text-muted-foreground">{CODE_CHECK_LABEL[r.checks.get(it.key)!]}</span></p>
                    <p className="mt-0.5"><b>แกนกลาง:</b> {it.coreText}</p>
                    <p><MapPin className="mr-0.5 inline size-3" aria-hidden="true" /><b>ท้องถิ่น:</b> {it.localText}</p>
                    {l.snippet && <p className="mt-0.5"><b>หลักฐานในรายวิชา ({l.field}):</b> <mark className="bg-[var(--gold-soft)]">{l.snippet}</mark></p>}
                    <p className="text-muted-foreground">คำที่ตรง: {l.matched.slice(0, 6).join(", ")} · ความสอดคล้อง {Math.round(l.score * 100)}%</p>
                  </li>
                );
              })}</ul>
            </li>
          );
        })}
        {!shown.length && <li className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">ไม่พบรายวิชาที่เชื่อมโยงได้แบบมั่นใจสูง</li>}
      </ul>
    </div>
  );
}

function Review({ r, data }: { r: Result; data: CategoryData }) {
  const itemOf = new Map(r.items.map((i) => [i.key, i]));
  const cands = useMemo(() => classify(data), [data]);
  const kw = cands.filter((c) => c.category === "local" && c.targetType === "subject" && c.strength === "keyword" && c.status === "proposed");
  const groups: { title: string; hint: string; keys: string[] }[] = [
    { title: "ยังหารายวิชาที่สอดคล้องไม่ได้", hint: "เนื้อหาสาระแกนกลางไม่ตรงกับคำอธิบาย/ผลการเรียนรู้ของรายวิชาในชั้นนั้น", keys: r.unmatched.filter((k) => itemOf.get(k)?.parsed) },
    { title: "ไม่มีรายวิชาในกลุ่มสาระ/ชั้นตามรหัส", hint: "ตรวจว่ารหัสชั้นถูกต้อง หรือสาระนี้อยู่ในกิจกรรม/รายวิชาอื่น", keys: r.noSubject },
    { title: "สอดคล้องกับหลายรายวิชาใกล้เคียงกัน", hint: "ให้ฝ่ายวิชาการเลือกว่ารายวิชาใดรับผิดชอบ", keys: r.ambiguous },
    { title: "รูปแบบรหัสไม่ชัดเจน", hint: "แสดงตามต้นฉบับ ระบบไม่แก้หรือเดารหัส", keys: [...r.checks].filter(([, v]) => v === "unclear").map(([k]) => k) },
    { title: "ไม่พบในฉบับปรับปรุง (อาจเป็นรหัสเดิม)", hint: "เทียบกับมาตรฐานฉบับที่ใช้บังคับก่อนใช้ในเอกสารทางการ", keys: [...r.checks].filter(([, v]) => v === "not_in_revised").map(([k]) => k) },
  ];
  return (
    <div className="mt-4 space-y-3">
      <Next>รายการด้านล่างระบบยังสรุปไม่ได้ — เปิดเล่มหลักสูตร/ตารางต้นฉบับตรวจ แล้วบันทึกข้อสังเกตที่หน้า “ตรวจสอบภายใน” ถ้าพบข้อผิดพลาด</Next>
      {groups.map((g) => (
        <details key={g.title} className="rounded-xl border bg-background p-3 text-sm" open={g.keys.length > 0 && g.keys.length <= 10}>
          <summary className="cursor-pointer font-semibold"><AlertTriangle className="mr-1 inline size-4 text-warning" aria-hidden="true" />{g.title} ({g.keys.length})</summary>
          <p className="text-xs text-muted-foreground">{g.hint}</p>
          <ul className="mt-2 space-y-1">{g.keys.slice(0, 200).map((k) => { const it = itemOf.get(k)!; return <li key={k} className="rounded-lg bg-muted/40 p-2 text-xs"><code title="รหัสตามต้นฉบับ">{showCode(it.codeRaw)}</code> · ตาราง {it.table} แถว {it.row} — {it.coreText} <span className="text-muted-foreground">/ {it.localText}</span></li>; })}</ul>
        </details>
      ))}
      <details className="rounded-xl border bg-background p-3 text-sm">
        <summary className="cursor-pointer font-semibold">รายวิชาที่พบเพียงคำว่า “ท้องถิ่น/ชุมชน” ({kw.length})</summary>
        <p className="text-xs text-muted-foreground">คำสำคัญอย่างเดียวไม่ใช่หลักฐาน — ตรวจเนื้อหาก่อนจัดเป็นหลักสูตรท้องถิ่น</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">{kw.map((c) => <li key={c.targetId} className="text-xs">{c.label}</li>)}</ul>
      </details>
    </div>
  );
}
