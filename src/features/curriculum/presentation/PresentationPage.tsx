import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, ChevronDown, ClipboardList, Download, ExternalLink, FileText, GraduationCap, Hammer, Landmark, Layers, Loader2, Map as MapIcon, Sparkles, Target, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callFunction } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { allVersions, useCompliance, useConflicts, useCurricula, useSourceDocuments, useStructureSummary, type SourceDocument } from "../api";
import { formatLocator, SourcePdfLink } from "../components";
import { useCategoryData } from "../categories/api";
import { classify, STAGE_LABEL, type Candidate } from "../categories/classify";
import { HIGHLIGHT_LABEL, usePresentationExtras } from "./api";
import { curriculumStatus, REVIEW_LABEL, SCHOOL_LABEL } from "./status";

/**
 * โหมดนำเสนอหลักสูตร (อ่านอย่างเดียว) — ใช้ข้อมูลชุดเดียวกับการตรวจสอบภายใน
 * แสดงเฉพาะข้อมูลจริง · รายการจัดหมวดแสดงเฉพาะที่ฝ่ายวิชาการยืนยันแล้ว · ไม่ประกาศผลระดับคุณภาพ
 * สถานะการตรวจจริงเปิดดูได้ที่ “รายละเอียด” — ไม่ซ่อนหรือแต่งผล
 */
const SECTIONS = [
  ["overview", "ภาพรวม"], ["vision", "วิสัยทัศน์และจุดเน้น"], ["structure", "โครงสร้างเวลาเรียน"], ["programs", "แผนการเรียน"], ["vocational", "สมรรถนะอาชีพ"],
  ["local", "ท้องถิ่นและภูมิปัญญา"], ["activities", "กิจกรรมพัฒนาผู้เรียน"], ["mapping", "มาตรฐานและตัวชี้วัด"], ["documents", "เอกสารอ้างอิง"],
] as const;

export function PresentationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const curricula = useCurricula();
  const versions = allVersions(curricula.data);
  const live = versions.filter((v) => v.status !== "retired");
  const v = versions.find((x) => x.id === params.get("v")) ?? live.find((x) => x.status === "active") ?? live[0];
  const cat = useCategoryData(v?.id ?? null);
  const extras = usePresentationExtras(v?.id ?? null);
  const summary = useStructureSummary(v?.id);
  const compliance = useCompliance(v?.id);
  const conflicts = useConflicts();
  const docs = useSourceDocuments();
  const cands = useMemo(() => (cat.data ? classify(cat.data) : []), [cat.data]);
  const loading = curricula.isPending || cat.isPending || extras.isPending || summary.isPending || docs.isPending;
  const close = () => navigate(`/office/curriculum/overview${v ? `?v=${v.id}` : ""}`);

  return (
    <div role="dialog" aria-modal="true" aria-label="นำเสนอหลักสูตร" className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--gold-soft)] text-[var(--navy-900)]"><GraduationCap className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{v ? `${v.curriculum_name}` : "หลักสูตรสถานศึกษา"}</p><p className="truncate text-xs text-muted-foreground">{v?.version_label} · โหมดนำเสนอ (อ่านอย่างเดียว)</p></div>
          <Button size="sm" variant="ghost" onClick={close}><X /> ปิด</Button>
        </div>
        <nav aria-label="ส่วนของการนำเสนอ" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm [scrollbar-width:none]">
          {SECTIONS.map(([id, l]) => <a key={id} href={`#p-${id}`} className="whitespace-nowrap rounded-full border px-3 py-1 hover:border-primary/50 hover:bg-accent">{l}</a>)}
        </nav>
      </header>
      {loading || !v ? <p className="flex items-center justify-center gap-2 p-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /> {v || curricula.isPending ? "กำลังเตรียมการนำเสนอ…" : "ยังไม่มีหลักสูตรในระบบ"}</p> : (
        <Body versionId={v.id} versionLabel={`${v.curriculum_name} ${v.version_label}`} year={v.effective_year_be} data={{ cat: cat.data!, extras: extras.data!, summary: summary.data ?? [], compliance: compliance.data ?? [], conflicts: conflicts.data ?? [], docs: docs.data ?? [], cands }} />
      )}
    </div>
  );
}

interface BodyData {
  cat: NonNullable<ReturnType<typeof useCategoryData>["data"]>; extras: NonNullable<ReturnType<typeof usePresentationExtras>["data"]>;
  summary: NonNullable<ReturnType<typeof useStructureSummary>["data"]>; compliance: NonNullable<ReturnType<typeof useCompliance>["data"]>;
  conflicts: NonNullable<ReturnType<typeof useConflicts>["data"]>; docs: SourceDocument[]; cands: Candidate[];
}
function Body({ versionId, versionLabel, year, data }: { versionId: string; versionLabel: string; year: number | null; data: BodyData }) {
  const { cat, extras, summary, compliance, conflicts, docs, cands } = data;
  const st = curriculumStatus({ confirmations: extras.confirmations, documents: docs, conflicts, compliance, verifiedRules: extras.verifiedRules });
  const confirmedIn = (c: string) => cands.filter((x) => x.category === c && x.status === "confirmed");
  const pendingIn = (c: string) => cands.filter((x) => x.category === c && x.status === "proposed").length;
  const subjectsBy = (s: "lower" | "upper") => cat.subjects.filter((x) => (x.grade ?? "").startsWith("ม") && (s === "lower" ? /[123]$/ : /[456]$/).test(x.grade ?? "")).length;
  const confirmedDocs = new Set(extras.confirmations.filter((c) => c.status === "active").map((c) => c.source_document_id));
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:py-10">
      <Section id="overview" icon={Landmark} title="ภาพรวมหลักสูตร">
        <div className="rounded-3xl border bg-[linear-gradient(135deg,#fff_0%,#eef4ff_60%,#fdf3dc_100%)] p-6 shadow-card sm:p-10">
          <p className="text-sm font-medium text-primary">หลักสูตรสถานศึกษา{year ? ` พุทธศักราช ${year}` : ""}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-4xl">{versionLabel}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone={st.school === "confirmed" ? "ok" : "muted"}>{SCHOOL_LABEL[st.school]}</Pill>
            <Pill tone={st.review === "passed" ? "ok" : st.review === "issues" ? "warn" : "info"}>{REVIEW_LABEL[st.review]}</Pill>
          </div>
          {(st.counts.confirmedIssues > 0 || st.counts.complianceFail > 0) && (
            <p role="note" className="mt-4 rounded-xl border border-[var(--tone-orange-fg)]/30 bg-[var(--tone-orange-bg)] px-3 py-2 text-sm">
              มีประเด็นที่ตรวจพบและยืนยันแล้ว {(st.counts.confirmedIssues + st.counts.complianceFail).toLocaleString("th-TH")} รายการ อยู่ระหว่างการพิจารณาแก้ไขโดยฝ่ายวิชาการ — ข้อมูลที่นำเสนอเป็นข้อมูลตามเอกสารต้นฉบับ ยังไม่ได้ปรับแก้
            </p>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="แผนการเรียน" value={cat.programs.length} />
            <Stat label="รายวิชา ม.ต้น" value={subjectsBy("lower")} />
            <Stat label="รายวิชา ม.ปลาย" value={subjectsBy("upper")} />
            <Stat label="กิจกรรมพัฒนาผู้เรียน" value={cat.activities.length} sub="รายการตามโครงสร้างเวลาเรียน" />
          </div>
          <Details label="รายละเอียดสถานะ">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>สถานะการยืนยันของโรงเรียนและผลการตรวจความสอดคล้องเป็นคนละเรื่อง — การยืนยันของโรงเรียนไม่ได้หมายความว่าผ่านเกณฑ์แกนกลาง</li>
              {st.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <Link to={`/office/curriculum/internal-review?v=${versionId}`} className="mt-2 inline-flex text-sm text-primary hover:underline">ดูรายการในหน้าตรวจสอบภายใน →</Link>
          </Details>
        </div>
      </Section>

      <Section id="vision" icon={Sparkles} title="วิสัยทัศน์และจุดเน้น">
        {extras.highlights.filter((h) => h.status === "confirmed").length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {(Object.keys(HIGHLIGHT_LABEL) as (keyof typeof HIGHLIGHT_LABEL)[]).map((k) => {
              const items = extras.highlights.filter((h) => h.kind === k && h.status === "confirmed");
              return items.length ? (
                <Card key={k} title={HIGHLIGHT_LABEL[k]}>
                  <ul className="space-y-2">{items.map((h) => <li key={h.id}><p className="whitespace-pre-wrap leading-relaxed">{h.text_th}</p><Src docId={h.source_document_id} locator={h.source_locator} /></li>)}</ul>
                </Card>
              ) : null;
            })}
          </div>
        ) : <Empty>ยังไม่ได้บันทึกวิสัยทัศน์และจุดเน้นจากเล่มหลักสูตร (ฝ่ายวิชาการบันทึกพร้อมเลขหน้าได้ที่หน้าตรวจสอบภายใน)</Empty>}
      </Section>

      <Section id="structure" icon={Layers} title="โครงสร้างเวลาเรียน">
        <StructureTables summary={summary} programs={cat.programs} activities={cat.activities} />
      </Section>

      <Section id="programs" icon={Users} title="แผนการเรียน">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cat.programs.map((p) => {
            const rows = summary.filter((r) => r.program_code === p.code);
            const credits = rows.reduce((a, r) => a + Number(r.credits), 0);
            return (
              <Card key={p.id} title={p.name_th} sub={`${p.code} · ${p.stage === "upper_secondary" ? "มัธยมศึกษาตอนปลาย" : p.stage === "lower_secondary" ? "มัธยมศึกษาตอนต้น" : ""}`}>
                <p className="text-sm">{rows.length ? `รายวิชา ${rows.reduce((a, r) => a + r.subjects, 0)} รายการ · ${credits.toLocaleString("th-TH")} หน่วยกิต` : "ยังไม่มีข้อมูลรายวิชาในแผนนี้"}</p>
                <Src docId={p.source_document_id} locator={p.source_locator} />
              </Card>
            );
          })}
          {!cat.programs.length && <Empty>ยังไม่มีแผนการเรียนในระบบ</Empty>}
        </div>
      </Section>

      <Section id="vocational" icon={Hammer} title="รายวิชาสมรรถนะอาชีพ">
        <CategoryShow items={confirmedIn("vocational")} pending={pendingIn("vocational")} programs={cat.programs.filter((p) => /ทวิศึกษา|อาชีพ/.test(p.name_th))} />
      </Section>
      <Section id="local" icon={MapIcon} title="หลักสูตรท้องถิ่นและภูมิปัญญา">
        <CategoryShow items={confirmedIn("local")} pending={pendingIn("local")} programs={[]} />
      </Section>

      <Section id="activities" icon={ClipboardList} title="กิจกรรมพัฒนาผู้เรียน">
        <ActivitiesTable activities={cat.activities} />
      </Section>

      <Section id="mapping" icon={Target} title="การเชื่อมโยงมาตรฐานและตัวชี้วัด">
        {extras.verifiedMappings ? (
          <Card title={`เชื่อมโยงที่ผ่านการยืนยันแล้ว ${extras.verifiedMappings.toLocaleString("th-TH")} รายการ`}>
            <Link to={`/office/curriculum/mapping?v=${versionId}`} className="text-sm text-primary hover:underline">เปิดตารางเปรียบเทียบหลักสูตร →</Link>
          </Card>
        ) : <Empty>ยังไม่มีการเชื่อมโยงมาตรฐานและตัวชี้วัดที่ผ่านการยืนยัน{extras.pendingMappings ? ` (รอตรวจ ${extras.pendingMappings} รายการ)` : ""} — <Link to={`/office/curriculum/mapping?v=${versionId}`} className="text-primary hover:underline">ดูผลเปรียบเทียบเบื้องต้น</Link></Empty>}
      </Section>

      <Section id="documents" icon={FileText} title="เอกสารหลักฐานอ้างอิง">
        <ul className="grid gap-3 md:grid-cols-2">
          {docs.filter((d) => !d.parent_id).map((d) => (
            <li key={d.id} className="rounded-2xl border bg-card p-4 shadow-card">
              <p className="font-medium">{d.register_code} {d.title}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {confirmedDocs.has(d.id) && <Pill tone="ok">โรงเรียนยืนยันเอกสารนี้</Pill>}
                <Pill tone="muted">{d.file_id ? "มีไฟล์ต้นฉบับในระบบ" : "ยังไม่มีไฟล์ในระบบ"}</Pill>
              </div>
              <DocActions doc={d} />
            </li>
          ))}
        </ul>
      </Section>
      <p className="pb-10 text-center text-xs text-muted-foreground">ข้อมูลจากฐานข้อมูลหลักสูตรของโรงเรียน ณ วันที่ {new Date().toLocaleDateString("th-TH", { dateStyle: "long" })} · เอกสารนี้ไม่ใช่การประกาศผลการประเมินระดับคุณภาพ</p>
    </main>
  );
}

function StructureTables({ summary, programs, activities }: { summary: BodyData["summary"]; programs: BodyData["cat"]["programs"]; activities: BodyData["cat"]["activities"] }) {
  const pname = new Map(programs.map((p) => [p.code, p.name_th]));
  const grades = [...new Set(summary.map((r) => r.grade_code))].sort();
  const stage = (g: string) => (/[123]$/.test(g) ? "lower" : "upper");
  if (!summary.length) return <Empty>ยังไม่มีข้อมูลโครงสร้างเวลาเรียน</Empty>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(["lower", "upper"] as const).map((s) => {
        const gs = grades.filter((g) => stage(g) === s);
        if (!gs.length) return null;
        const keys = [...new Set(summary.filter((r) => gs.includes(r.grade_code)).map((r) => `${r.grade_code}|${r.program_code ?? ""}`))];
        return (
          <Card key={s} title={`มัธยมศึกษา${s === "lower" ? "ตอนต้น" : "ตอนปลาย"}`}>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[22rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-1 py-1">ชั้น/แผน</th><th className="px-1 text-right">พื้นฐาน (ชม.)</th><th className="px-1 text-right">เพิ่มเติม (ชม.)</th><th className="px-1 text-right">กิจกรรม (ชม.)</th></tr></thead>
                <tbody>{keys.map((k) => {
                  const [g, p] = k.split("|");
                  const row = (t: "basic" | "additional") => summary.filter((r) => r.grade_code === g && (r.program_code ?? "") === p && r.subject_type === t).reduce((a, r) => a + Number(r.learning_hours), 0);
                  const act = activities.filter((a) => a.grade === `ม.${g!.replace(/\D/g, "")}` && (!p || programs.find((x) => x.id === a.study_program_id)?.code === p)).reduce((a, x) => a + x.activity_hours, 0);
                  return <tr key={k} className="border-t"><td className="px-1 py-1.5">{g!.replace(/^M/, "ม.")}{p ? <span className="block text-xs text-muted-foreground">{pname.get(p) ?? p}</span> : null}</td>
                    <td className="px-1 text-right tabular-nums">{row("basic").toLocaleString("th-TH")}</td><td className="px-1 text-right tabular-nums">{row("additional").toLocaleString("th-TH")}</td><td className="px-1 text-right tabular-nums">{act ? act.toLocaleString("th-TH") : "–"}</td></tr>;
                })}</tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">รวมจากรายวิชาในทะเบียนหลักสูตรตามระดับชั้นและแผนการเรียน</p>
          </Card>
        );
      })}
    </div>
  );
}

function ActivitiesTable({ activities }: { activities: BodyData["cat"]["activities"] }) {
  if (!activities.length) return <Empty>ยังไม่มีข้อมูลกิจกรรมพัฒนาผู้เรียน</Empty>;
  const types = [...new Set(activities.map((a) => a.activity_type))];
  const grades = [...new Set(activities.map((a) => a.grade ?? "–"))].sort();
  return (
    <Card title="ชั่วโมงกิจกรรมต่อปีตามโครงสร้างเวลาเรียน">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[24rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-1 py-1">กิจกรรม</th>{grades.map((g) => <th key={g} className="px-1 text-right">{g}</th>)}</tr></thead>
          <tbody>{types.map((t) => <tr key={t} className="border-t"><td className="px-1 py-1.5">{t}<span className="block text-xs text-muted-foreground">{[...new Set(activities.filter((a) => a.activity_type === t).map((a) => a.name_th))].join(", ")}</span></td>
            {grades.map((g) => { const h = activities.filter((a) => a.activity_type === t && (a.grade ?? "–") === g).map((a) => a.activity_hours); return <td key={g} className="px-1 text-right tabular-nums">{h.length ? Math.max(...h) : "–"}</td>; })}</tr>)}</tbody>
        </table>
      </div>
      <Src docId={activities[0]!.source_document_id} locator={activities[0]!.source_locator} />
    </Card>
  );
}

function CategoryShow({ items, pending, programs }: { items: Candidate[]; pending: number; programs: BodyData["cat"]["programs"] }) {
  return (
    <div className="space-y-3">
      {programs.length > 0 && (
        <Card title="แผนการเรียนในทะเบียนหลักสูตร">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">{programs.map((p) => <li key={p.id}>• {p.name_th} <span className="text-xs text-muted-foreground">({p.code})</span></li>)}</ul>
        </Card>
      )}
      {items.length ? (["lower", "upper", null] as const).map((s) => {
        const xs = items.filter((x) => x.stage === s);
        return xs.length ? (
          <Card key={s ?? "x"} title={`${s ? STAGE_LABEL[s] : "อื่น ๆ"} · ${xs.length} รายการที่ฝ่ายวิชาการยืนยันแล้ว`}>
            <ul className="grid gap-2 md:grid-cols-2">{xs.map((x) => <li key={x.targetId} className="rounded-xl border p-3 text-sm"><p className="font-medium">{x.label}</p><p className="text-xs text-muted-foreground">{x.stored?.reason}</p><Src docId={x.sourceDocId} locator={x.locator} /></li>)}</ul>
          </Card>
        ) : null;
      }) : <Empty>ยังไม่มีรายวิชาที่ฝ่ายวิชาการยืนยันในหมวดนี้{pending ? ` (อยู่ระหว่างการตรวจทบทวน ${pending} รายการ)` : ""}</Empty>}
    </div>
  );
}

function DocActions({ doc }: { doc: SourceDocument }) {
  const [busy, setBusy] = useState(false);
  if (!doc.file_id) return null;
  const go = async (inline: boolean) => {
    setBusy(true);
    try { const r = await callFunction<{ url: string }>("storage-download-url", { fileId: doc.file_id, inline }); window.open(r.url, "_blank", "noopener"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ"); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 flex gap-2">
      {doc.doc_type !== "structure_workbook" && <Button size="sm" variant="outline" disabled={busy} onClick={() => go(true)}>{busy ? <Loader2 className="animate-spin" /> : <ExternalLink />} เปิดดู</Button>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => go(false)}><Download /> ดาวน์โหลดต้นฉบับ</Button>
    </div>
  );
}

function Section({ id, icon: I, title, children }: { id: string; icon: typeof BookOpen; title: string; children: ReactNode }) {
  return (
    <section id={`p-${id}`} aria-labelledby={`h-${id}`} className="scroll-mt-28">
      <h2 id={`h-${id}`} className="mb-3 flex items-center gap-2 text-xl font-bold sm:text-2xl"><span className="grid size-9 place-items-center rounded-xl bg-accent text-primary"><I className="size-5" aria-hidden="true" /></span>{title}</h2>
      {children}
    </section>
  );
}
function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return <div className="rounded-2xl border bg-card p-4 shadow-card sm:p-5"><p className="font-semibold">{title}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}<div className="mt-2">{children}</div></div>;
}
function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return <div className="rounded-2xl bg-card/80 p-4 shadow-card"><p className="text-3xl font-bold tabular-nums text-primary">{value.toLocaleString("th-TH")}</p><p className="text-sm">{label}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>;
}
function Pill({ tone, children }: { tone: "ok" | "warn" | "info" | "muted"; children: ReactNode }) {
  const cls = { ok: "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]", warn: "bg-[var(--tone-orange-bg)] text-[var(--tone-orange-fg)]", info: "bg-[var(--tone-blue-bg)] text-[var(--tone-blue-fg)]", muted: "bg-muted text-muted-foreground" }[tone];
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", cls)}>{children}</span>;
}
function Src({ docId, locator }: { docId: string | null; locator: string | null }) {
  return <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">ที่มา: {formatLocator(locator)} <SourcePdfLink docId={docId} locator={locator} /></p>;
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
function Details({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-sm font-medium text-primary"><ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /> {label}</button>
      {open && <div className="mt-2 rounded-xl border bg-card p-3">{children}</div>}
    </div>
  );
}
