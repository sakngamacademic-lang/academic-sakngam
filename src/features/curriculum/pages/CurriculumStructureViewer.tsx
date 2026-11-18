import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileDown, Loader2, Printer, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { requireSupabase } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-errors";
import { cn } from "@/lib/utils";
import { allVersions, curriculumKey, useCurricula, useSubjectDetail, VERSION_STATUS_LABELS } from "../api";
import { formatLocator, SourcePdfLink } from "../components";

/**
 * โครงสร้างหลักสูตร (หน้าหลักแบบ “เปิดตารางเรียน”): ชั้น → แผนการเรียน → ภาคเรียน → รายวิชา
 * อ่านอย่างเดียวจากทะเบียนหลักสูตรเดิม (subject_offerings / learning_activities) — ไม่แก้รหัส ชั่วโมง หน่วยกิต หรือแผน
 * ห้องเรียนแสดงเฉพาะเมื่อผูกห้องกับแผนไว้จริง (classroom_programs) — ไม่เดาจากชื่อแผน
 */
const GRADES = ["M1", "M2", "M3", "M4", "M5", "M6"] as const;
const gradeName = (g: string) => `มัธยมศึกษาปีที่ ${g.replace(/\D/g, "")}`;
interface OfferingRow {
  id: string; term_no: number | null; study_program_id: string | null; sort_order: number; source_locator: string;
  subject: { id: string; code: string; name_th: string; subject_type: string; credits: number; learning_hours: number; learning_area: { name_th: string; sort_order: number } | null } | null;
}
interface ActRow { id: string; activity_type: string; name_th: string; term_no: number | null; activity_hours: number; study_program_id: string | null }
interface Program { id: string; code: string; name_th: string; stage: string | null }

function useGradeData(versionId: string | null, grade: string) {
  return useQuery({
    queryKey: [...curriculumKey, "viewer", versionId, grade], enabled: !!versionId,
    queryFn: async () => {
      const sb = requireSupabase();
      const g = await sb.from("grade_levels").select("id").eq("code", grade).maybeSingle();
      if (g.error) throw g.error;
      if (!g.data) return { offerings: [] as OfferingRow[], activities: [] as ActRow[], programs: [] as Program[], rooms: [] as { room: string; program: string }[] };
      const gid = (g.data as { id: string }).id;
      const [o, a, p, r] = await Promise.all([
        sb.from("subject_offerings").select("id, term_no, study_program_id, sort_order, source_locator, subject:subjects(id, code, name_th, subject_type, credits, learning_hours, learning_area:learning_areas(name_th, sort_order))")
          .eq("curriculum_version_id", versionId!).eq("grade_level_id", gid).order("sort_order"),
        sb.from("learning_activities").select("id, activity_type, name_th, term_no, activity_hours, study_program_id").eq("curriculum_version_id", versionId!).eq("grade_level_id", gid),
        sb.from("study_programs").select("id, code, name_th, stage").eq("curriculum_version_id", versionId!).order("code"),
        sb.from("classroom_programs").select("study_program_id, classroom:classrooms(room_no, grade_level_id)"),
      ]);
      if (o.error) throw o.error;
      if (a.error) throw a.error;
      if (p.error) throw p.error;
      const offerings = o.data as unknown as OfferingRow[];
      const used = new Set(offerings.map((x) => x.study_program_id).filter(Boolean));
      const rooms = ((r.data ?? []) as unknown as { study_program_id: string; classroom: { room_no: number; grade_level_id: string } | null }[])
        .filter((x) => x.classroom?.grade_level_id === gid).map((x) => ({ room: `${grade.replace(/\D/g, "")}/${x.classroom!.room_no}`, program: x.study_program_id }));
      return { offerings, activities: a.data as ActRow[], programs: (p.data as Program[]).filter((x) => used.has(x.id)), rooms };
    },
  });
}

export function CurriculumStructureViewer() {
  const [params, setParams] = useSearchParams();
  const office = useLocation().pathname.startsWith("/office");
  const curricula = useCurricula();
  const versions = allVersions(curricula.data);
  const live = versions.filter((v) => v.status !== "retired");
  const v = versions.find((x) => x.id === params.get("v")) ?? live.find((x) => x.status === "active") ?? live.find((x) => x.status === "approved") ?? live[0];
  const grade = GRADES.includes(params.get("g") as (typeof GRADES)[number]) ? params.get("g")! : "M1";
  const data = useGradeData(v?.id ?? null, grade);
  const plans = data.data?.programs ?? [];
  const plan = plans.find((p) => p.id === params.get("p")) ?? plans[0] ?? null;
  const term = params.get("t") === "2" ? 2 : params.get("t") === "all" ? 0 : 1;
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const set = (k: string, val: string) => setParams((p) => { p.set(k, val); if (k === "g") p.delete("p"); return p; }, { replace: true });

  const rows = useMemo(() => (data.data?.offerings ?? []).filter((o) => o.subject && (!o.study_program_id || o.study_program_id === plan?.id) && (!term || !o.term_no || o.term_no === term)), [data.data, plan, term]);
  const acts = useMemo(() => (data.data?.activities ?? []).filter((a) => (!a.study_program_id || a.study_program_id === plan?.id) && (!term || !a.term_no || a.term_no === term)), [data.data, plan, term]);
  const rooms = (data.data?.rooms ?? []).filter((r) => r.program === plan?.id).map((r) => r.room);
  const title = `${gradeName(grade)} · ${plan?.name_th ?? ""} · ${term ? `ภาคเรียนที่ ${term}` : "ทั้งปี"}`;

  return (
    <>
      <PageHeader icon={BookOpen} title={`โครงสร้างหลักสูตร ${v?.effective_year_be ?? ""}`.trim()} description="เลือกระดับชั้น แผนการเรียน และภาคเรียน เพื่อดูรายวิชาทั้งหมด — กดชื่อวิชาเพื่อดูคำอธิบายรายวิชา"
        actions={office ? <Button asChild variant="ghost" size="sm"><Link to="/office/curriculum/overview"><Settings2 /> ภาพรวมและเครื่องมือฝ่ายวิชาการ</Link></Button> : undefined} />
      {v && v.status !== "active" && v.status !== "approved" && (
        <p className="mb-3 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm">ข้อมูลจากทะเบียนหลักสูตร {v.version_label} ({VERSION_STATUS_LABELS[v.status]}) — ตามเอกสารต้นฉบับ ยังไม่ประกาศใช้อย่างเป็นทางการในระบบ</p>
      )}

      <nav aria-label="ระดับชั้น" className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={grade === g} onClick={() => set("g", g)}
            className={cn("h-12 rounded-xl border text-base font-semibold shadow-card", grade === g ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50")}>ม.{g.slice(1)}</button>
        ))}
      </nav>

      {data.isPending ? <p className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> กำลังโหลด…</p>
        : data.error ? <p role="alert" className="text-sm text-destructive">{dbErrorMessage(data.error)}</p>
        : !plans.length ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลรายวิชาของ{gradeName(grade)} หรือบัญชีนี้ยังไม่มีสิทธิ์ดูหลักสูตรฉบับร่าง (ครูจะเห็นเมื่อหลักสูตรประกาศใช้)</p>
        : (
          <>
            <section aria-label="แผนการเรียน" className="mb-3">
              <p className="mb-1.5 text-sm font-medium text-muted-foreground">แผนการเรียน ({plans.length})</p>
              <div className="flex flex-wrap gap-2">
                {plans.map((p) => (
                  <button key={p.id} type="button" aria-pressed={plan?.id === p.id} onClick={() => set("p", p.id)}
                    className={cn("min-h-11 rounded-full border px-4 text-sm shadow-card", plan?.id === p.id ? "border-primary bg-accent font-semibold text-primary" : "bg-card hover:border-primary/40")}>{p.name_th}</button>
                ))}
              </div>
            </section>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="ภาคเรียน" className="inline-flex rounded-xl border bg-card p-1 shadow-card">
                {([["1", "ภาคเรียนที่ 1"], ["2", "ภาคเรียนที่ 2"], ["all", "ทั้งปี"]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={(k === "all" ? 0 : Number(k)) === term} onClick={() => set("t", k)}
                    className={cn("h-9 rounded-lg px-3 text-sm", (k === "all" ? 0 : Number(k)) === term ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground")}>{l}</button>
                ))}
              </div>
              <span className="text-sm text-muted-foreground">{rooms.length ? `ห้อง ${rooms.join(", ")}` : "ยังไม่ได้ระบุห้องเรียนของแผนนี้ในระบบ"}</span>
              <span className="ml-auto flex gap-2 print:hidden">
                <Button size="sm" variant="outline" onClick={() => exportPlan("word", title, rows, acts)}><FileDown /> Word</Button>
                <Button size="sm" variant="outline" onClick={() => exportPlan("pdf", title, rows, acts)}><Printer /> พิมพ์/PDF</Button>
              </span>
            </div>
            <SubjectTable rows={rows} acts={acts} term={term} onOpen={setSubjectId} />
          </>
        )}

      <Sheet open={!!subjectId} onOpenChange={(o) => !o && setSubjectId(null)}>
        <SheetContent side="right" className="w-[min(36rem,100vw)] max-w-[100vw] overflow-y-auto bg-background p-0">{subjectId && <SubjectDetailView id={subjectId} />}</SheetContent>
      </Sheet>
    </>
  );
}

const sum = (rs: OfferingRow[], k: "credits" | "learning_hours") => rs.reduce((n, r) => n + Number(r.subject?.[k] ?? 0), 0);
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

function SubjectTable({ rows, acts, term, onOpen }: { rows: OfferingRow[]; acts: ActRow[]; term: number; onOpen: (id: string) => void }) {
  const basic = rows.filter((r) => r.subject!.subject_type === "basic");
  const extra = rows.filter((r) => r.subject!.subject_type !== "basic");
  const actHours = acts.reduce((n, a) => n + a.activity_hours, 0);
  const group = (rs: OfferingRow[]) => {
    const m = new Map<string, OfferingRow[]>();
    for (const r of rs) { const k = r.subject!.learning_area?.name_th ?? "อื่น ๆ"; (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return [...m].sort((a, b) => (a[1][0]!.subject!.learning_area?.sort_order ?? 99) - (b[1][0]!.subject!.learning_area?.sort_order ?? 99));
  };
  const Section = ({ title, rs }: { title: string; rs: OfferingRow[] }) => (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <h2 className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5 font-semibold"><span>{title}</span><span className="text-sm font-normal text-muted-foreground">{rs.length} วิชา · {fmt(sum(rs, "credits"))} หน่วยกิต · {fmt(sum(rs, "learning_hours"))} ชม.</span></h2>
      {group(rs).map(([area, items]) => (
        <div key={area}>
          <p className="border-b bg-[var(--gold-soft)]/40 px-4 py-1.5 text-sm font-medium">{area}</p>
          <ul>{items.map((r) => (
            <li key={r.id} className="border-b last:border-0">
              <button type="button" onClick={() => onOpen(r.subject!.id)} className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-accent/60 sm:grid-cols-[6rem_minmax(0,1fr)_5rem_5rem_4rem]">
                <code className="text-xs font-semibold text-primary">{r.subject!.code}</code>
                <span className="min-w-0">{r.subject!.name_th}{!term && r.term_no ? <span className="ml-1 text-xs text-muted-foreground">(ภาค {r.term_no})</span> : null}</span>
                <span className="text-right tabular-nums sm:hidden">{fmt(Number(r.subject!.credits))} นก.</span>
                <span className="hidden text-right tabular-nums sm:block">{fmt(Number(r.subject!.learning_hours))} ชม.</span>
                <span className="hidden text-right tabular-nums sm:block">{fmt(Number(r.subject!.credits))} นก.</span>
                <span className="hidden text-right text-xs text-muted-foreground sm:block">{r.subject!.subject_type === "basic" ? "พื้นฐาน" : "เพิ่มเติม"}</span>
              </button>
            </li>
          ))}</ul>
        </div>
      ))}
      {!rs.length && <p className="px-4 py-4 text-sm text-muted-foreground">ไม่มีรายวิชา</p>}
    </section>
  );
  return (
    <div className="space-y-4">
      <Section title="รายวิชาพื้นฐาน" rs={basic} />
      <Section title="รายวิชาเพิ่มเติม" rs={extra} />
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="mb-2 flex items-center justify-between font-semibold"><span>กิจกรรมพัฒนาผู้เรียน</span><span className="text-sm font-normal text-muted-foreground">{fmt(actHours)} ชม.</span></h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">{acts.map((a) => <li key={a.id} className="flex justify-between gap-2 rounded-lg bg-muted/30 px-3 py-1.5"><span>{a.name_th}</span><span className="tabular-nums text-muted-foreground">{fmt(a.activity_hours)} ชม.</span></li>)}
          {!acts.length && <li className="text-muted-foreground">ไม่มีข้อมูล</li>}</ul>
      </section>
      <section aria-label="ยอดรวม" className="grid grid-cols-2 gap-2 rounded-2xl border border-primary/20 bg-accent/50 p-4 text-sm sm:grid-cols-4">
        <Total label="หน่วยกิตพื้นฐาน" v={`${fmt(sum(basic, "credits"))}`} />
        <Total label="หน่วยกิตเพิ่มเติม" v={`${fmt(sum(extra, "credits"))}`} />
        <Total label="รวมหน่วยกิต" v={`${fmt(sum(rows, "credits"))}`} />
        <Total label="รวมเวลาเรียนทั้งสิ้น" v={`${fmt(sum(rows, "learning_hours") + actHours)} ชม.`} />
      </section>
    </div>
  );
}
const Total = ({ label, v }: { label: string; v: string }) => <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold tabular-nums text-primary">{v}</p></div>;

function SubjectDetailView({ id }: { id: string }) {
  const q = useSubjectDetail(id);
  const s = q.data;
  if (q.isPending) return <p className="p-6 text-muted-foreground">กำลังโหลด…</p>;
  if (!s) return <p className="p-6 text-destructive">{dbErrorMessage(q.error)}</p>;
  return (
    <div className="space-y-4 p-5 pb-10">
      <div className="pr-8"><SheetTitle className="text-lg font-semibold"><code className="text-primary">{s.code}</code> {s.name_th}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">{s.subject_type === "basic" ? "รายวิชาพื้นฐาน" : "รายวิชาเพิ่มเติม"} · {fmt(Number(s.credits))} หน่วยกิต · {fmt(Number(s.learning_hours))} ชั่วโมง</SheetDescription></div>
      <section><p className="text-sm font-semibold">คำอธิบายรายวิชา</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{s.description_th?.replace(/([฀-๿])\n(?=[฀-๿])/g, "$1") ?? "ยังไม่มีคำอธิบายรายวิชาในระบบ"}</p></section>
      <section><p className="text-sm font-semibold">ผลการเรียนรู้ / ตัวชี้วัด ({s.outcomes.length})</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{[...s.outcomes].sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true })).map((o) => <li key={o.id}>{o.statement_th}</li>)}</ol>
        {!s.outcomes.length && <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>}</section>
      <section className="rounded-xl bg-muted/40 p-3 text-sm"><p className="font-semibold">เอกสารอ้างอิง</p>
        <p className="mt-1 flex flex-wrap items-center gap-2">{s.source?.register_code} {s.source?.title} · {formatLocator(s.source_locator)} <SourcePdfLink docId={s.source_document_id} locator={s.source_locator} /></p></section>
    </div>
  );
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function exportPlan(kind: "word" | "pdf", title: string, rows: OfferingRow[], acts: ActRow[]) {
  const sec = (t: string, rs: OfferingRow[]) => `<h2>${t}</h2><table><tr><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>กลุ่มสาระ</th><th>ชั่วโมง</th><th>หน่วยกิต</th></tr>${rs.map((r) => `<tr><td>${esc(r.subject!.code)}</td><td>${esc(r.subject!.name_th)}</td><td>${esc(r.subject!.learning_area?.name_th)}</td><td class="n">${fmt(Number(r.subject!.learning_hours))}</td><td class="n">${fmt(Number(r.subject!.credits))}</td></tr>`).join("")}<tr><th colspan="3">รวม</th><th class="n">${fmt(sum(rs, "learning_hours"))}</th><th class="n">${fmt(sum(rs, "credits"))}</th></tr></table>`;
  const basic = rows.filter((r) => r.subject!.subject_type === "basic"), extra = rows.filter((r) => r.subject!.subject_type !== "basic");
  const actH = acts.reduce((n, a) => n + a.activity_hours, 0);
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}body{font-family:"TH SarabunPSK","IBM Plex Sans Thai",Tahoma,sans-serif;font-size:15pt;color:#17233b}h1{font-size:19pt;margin:0 0 6px}h2{font-size:16pt;margin:12px 0 4px;color:#173b78}table{width:100%;border-collapse:collapse;font-size:13pt}th,td{border:1px solid #94a3b8;padding:3px 6px;text-align:left}th{background:#eef2f8}.n{text-align:right}</style></head><body>
<h1>โครงสร้างหลักสูตร ${esc(title)}</h1>${sec("รายวิชาพื้นฐาน", basic)}${sec("รายวิชาเพิ่มเติม", extra)}
<h2>กิจกรรมพัฒนาผู้เรียน</h2><table>${acts.map((a) => `<tr><td>${esc(a.name_th)}</td><td class="n">${fmt(a.activity_hours)}</td></tr>`).join("")}<tr><th>รวม</th><th class="n">${fmt(actH)}</th></tr></table>
<p><b>รวมหน่วยกิต ${fmt(sum(rows, "credits"))} · รวมเวลาเรียนทั้งสิ้น ${fmt(sum(rows, "learning_hours") + actH)} ชั่วโมง</b></p><p style="font-size:11pt;color:#64748b">ข้อมูลจากทะเบียนหลักสูตรสถานศึกษา ณ ${esc(new Date().toLocaleDateString("th-TH", { dateStyle: "long" }))}</p></body></html>`;
  if (kind === "word") {
    const url = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/msword" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `โครงสร้าง-${title}.doc`.replace(/[\\/:*?"<>|·]/g, "_") });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open(); w.document.write(html.replace("</body>", "<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body>")); w.document.close();
}

