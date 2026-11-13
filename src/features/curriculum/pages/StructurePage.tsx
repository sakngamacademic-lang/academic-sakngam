import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared";
import { DashSection, LiveBadge } from "@/components/dashboard";
import { Select } from "@/components/ui/form-controls";
import { useGradeLevels } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { usePrograms, useReviewQueue, useStagedStructure, useStructure, type StagedStructureRow, type StructureRow } from "../api";
import { CurriculumNav, EmptyState, formatLocator, Notice, useSelectedVersion, VersionPicker , VersionStatusNotice } from "../components";
import { cn } from "@/lib/utils";

/** โครงสร้างรายวิชา: หลักสูตร → ฉบับ → แผน → ชั้น → ภาค */
export function StructurePage() {
  const [view, setView] = useState<"verified" | "staged">("verified");
  return (
    <>
      <PageHeader title="โครงสร้างรายวิชา" description="ข้อมูลที่ยืนยันแล้วแยกจากข้อมูลรอตรวจเสมอ · ยอดรวมคำนวณจากรายการที่แสดง" />
      <CurriculumNav />
      <div role="tablist" aria-label="ชุดข้อมูล" className="mb-4 flex flex-wrap gap-1">
        {([["verified", "ข้อมูลที่ยืนยันแล้ว"], ["staged", "ข้อมูลรอตรวจ (ยังไม่ยืนยัน)"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={cn("h-9 rounded-full border px-3 text-sm", view === k ? "border-primary/60 bg-primary/15" : "text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>
      {view === "verified" ? <VerifiedStructure /> : <StagedStructure />}
    </>
  );
}

function VerifiedStructure() {
  const sel = useSelectedVersion();
  const programs = usePrograms(sel.selected?.id);
  const grades = useGradeLevels();
  const [program, setProgram] = useState("");
  const [grade, setGrade] = useState("");
  const [term, setTerm] = useState("");
  const gradeId = grade || grades.data?.find((g) => g.is_active)?.id || "";
  const q = useStructure(sel.selected?.id, program, gradeId, term);
  const basic = q.data?.offerings.filter((o) => o.subject?.subject_type === "basic") ?? [];
  const additional = q.data?.offerings.filter((o) => o.subject?.subject_type === "additional") ?? [];
  const acts = q.data?.activities ?? [];
  const sum = (rows: StructureRow[], k: "credits" | "learning_hours") => rows.reduce((n, r) => n + Number(r.subject?.[k] ?? 0), 0);
  const gradeName = useMemo(() => grades.data?.find((g) => g.id === gradeId)?.name_th, [grades.data, gradeId]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <VersionPicker value={sel.selected?.id ?? ""} onChange={sel.select} versions={sel.versions} />
        <Select value={program} onChange={(e) => setProgram(e.target.value)} aria-label="แผนการเรียน" className="sm:w-56">
          <option value="">ทุกแผน (รายการร่วม)</option>{programs.data?.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}
        </Select>
        <Select value={gradeId} onChange={(e) => setGrade(e.target.value)} aria-label="ระดับชั้น" className="sm:w-32">
          {grades.data?.filter((g) => g.is_active).map((g) => <option key={g.id} value={g.id}>{g.name_th}</option>)}
        </Select>
        <Select value={term} onChange={(e) => setTerm(e.target.value)} aria-label="ภาคเรียน" className="sm:w-36">
          <option value="">ทั้งปี</option><option value="1">ภาคเรียนที่ 1</option><option value="2">ภาคเรียนที่ 2</option>
        </Select>
      </div>
      <VersionStatusNotice status={sel.selected?.status} />
      {!sel.loading && !sel.versions.length ? <EmptyState title="ยังไม่มีหลักสูตร" /> : q.error ? (
        <p role="alert" className="text-sm text-destructive">{dbErrorMessage(q.error)}</p>
      ) : q.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : !basic.length && !additional.length && !acts.length ? (
        <EmptyState title={`ยังไม่มีโครงสร้างรายวิชาของ ${gradeName ?? "ชั้นนี้"}`}>ข้อมูลโครงสร้างต้องนำเข้าจากเอกสารต้นทางและผ่านการตรวจก่อน</EmptyState>
      ) : (
        <div className="space-y-4">
          <SubjectTable id="basic" title="รายวิชาพื้นฐาน" rows={basic} sum={sum} />
          <SubjectTable id="additional" title="รายวิชาเพิ่มเติม" rows={additional} sum={sum} />
          <DashSection id="activities" title={<span className="flex items-center gap-2">กิจกรรมพัฒนาผู้เรียน <LiveBadge /></span>}>
            {acts.length === 0 ? <p className="text-sm text-muted-foreground">ไม่มีรายการ</p> : (
              <table className="w-full text-sm">
                <caption className="sr-only">กิจกรรมพัฒนาผู้เรียน</caption>
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">กิจกรรม</th><th className="py-2">ประเภท</th><th className="py-2 text-right">ชั่วโมง</th><th className="py-2 max-sm:hidden">ที่มา</th></tr></thead>
                <tbody>
                  {acts.map((a) => <tr key={a.id} className="border-b last:border-0"><td className="py-2">{a.name_th}</td><td className="py-2 text-muted-foreground">{a.activity_type}</td><td className="py-2 text-right tabular-nums">{a.activity_hours}</td><td className="py-2 text-xs text-muted-foreground max-sm:hidden">{formatLocator(a.source_locator)}</td></tr>)}
                </tbody>
                <tfoot><tr className="font-semibold"><td className="pt-2" colSpan={2}>รวมชั่วโมงกิจกรรม</td><td className="pt-2 text-right tabular-nums">{acts.reduce((n, a) => n + a.activity_hours, 0)}</td><td className="max-sm:hidden" /></tr></tfoot>
              </table>
            )}
          </DashSection>
        </div>
      )}
    </>
  );
}

function SubjectTable({ id, title, rows, sum }: { id: string; title: string; rows: StructureRow[]; sum: (r: StructureRow[], k: "credits" | "learning_hours") => number }) {
  return (
    <DashSection id={id} title={<span className="flex items-center gap-2">{title} <LiveBadge /></span>} meta={`${rows.length} รายวิชา`}>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">ไม่มีรายการ</p> : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="sr-only">{title}</caption>
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">รหัส</th><th className="py-2">รายวิชา</th><th className="py-2">ภาค</th><th className="py-2 text-right">หน่วยกิต</th><th className="py-2 text-right">ชั่วโมง</th><th className="py-2 max-sm:hidden">ที่มา</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="py-2"><code className="text-xs">{o.subject?.code}</code></td>
                  <td className="py-2">{o.subject?.name_th}{o.offering_kind === "elective" && <span className="ml-1 text-xs text-muted-foreground">(เลือก)</span>}</td>
                  <td className="py-2">{o.term_no ?? "ทั้งปี"}</td>
                  <td className="py-2 text-right tabular-nums">{Number(o.subject?.credits ?? 0).toFixed(1)}</td>
                  <td className="py-2 text-right tabular-nums">{o.subject?.learning_hours}</td>
                  <td className="py-2 text-xs text-muted-foreground max-sm:hidden">{formatLocator(o.source_locator)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="font-semibold"><td className="pt-2" colSpan={3}>รวม</td><td className="pt-2 text-right tabular-nums">{sum(rows, "credits").toFixed(1)}</td><td className="pt-2 text-right tabular-nums">{sum(rows, "learning_hours")}</td><td className="max-sm:hidden" /></tr></tfoot>
          </table>
        </div>
      )}
    </DashSection>
  );
}

const RES_LABEL = { committed: "บันทึกแล้ว", staged: "รอตรวจในชุดอื่น", staged_error: "มีแต่แถวผิดพลาด", missing: "ไม่พบ" } as const;

/** ยอดจาก "ข้อมูลรอตรวจ" ต่อชั้น × แผน × ภาค — ไม่ใช่หลักสูตรที่ใช้งานจริง และไม่ใช้รายงานผู้บริหาร */
function StagedStructure() {
  const sel = useSelectedVersion();
  const s = useStagedStructure(sel.selected?.id);
  const q = useReviewQueue(sel.selected?.id);
  const [grade, setGrade] = useState("M1");
  const rows = (s.data ?? []).filter((r) => r.grade_code === grade);
  const programs = [...new Set(rows.map((r) => r.program_code ?? "–"))];
  const cell = (p: string, term: number, type: StagedStructureRow["subject_type"]) => {
    const r = rows.find((x) => (x.program_code ?? "–") === p && x.term_no === term && x.subject_type === type);
    return r ? `${Number(r.credits).toFixed(1)} (${r.learning_hours})` : "–";
  };
  const grades = [...new Set((s.data ?? []).map((r) => r.grade_code))].sort();
  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <VersionPicker value={sel.selected?.id ?? ""} onChange={sel.select} versions={sel.versions} />
        <Select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="ระดับชั้น" className="sm:w-32">
          {grades.map((g) => <option key={g} value={g}>{g.replace("M", "ม.")}</option>)}
        </Select>
      </div>
      <Notice tone="warning">ข้อมูลรอตรวจจากชุดนำเข้า — <b>ยังไม่ผ่านการอนุมัติ</b> ใช้ตรวจความสอดคล้องเท่านั้น หน่วยกิต/ชั่วโมงมาจากแถวรายวิชาที่เสนอ (ไม่แก้ค่าให้ตรงหัวตาราง)</Notice>
      <DashSection id="queue" title="ความสัมพันธ์ข้ามชุดนำเข้า" meta={q.data ? `${q.data.counts.staged + q.data.counts.committed + q.data.counts.staged_error + q.data.counts.missing} การอ้างอิง` : undefined}>
        {q.error ? <p role="alert" className="text-sm text-destructive">{dbErrorMessage(q.error)}</p> : (
          <>
            <ul className="flex flex-wrap gap-3 text-sm">
              {(["committed", "staged", "staged_error", "missing"] as const).map((k) => (
                <li key={k} className="rounded-lg border px-3 py-2"><span className="text-muted-foreground">{RES_LABEL[k]}</span> <b className="tabular-nums">{q.data?.counts[k] ?? "…"}</b></li>
              ))}
            </ul>
            {q.data?.problems.length ? (
              <ul className="mt-3 divide-y text-sm">
                {q.data.problems.slice(0, 50).map((p) => (
                  <li key={`${p.row_id}-${p.ref_kind}`} className="py-1.5">แถว {p.row_no} ({p.kind}) อ้าง{p.ref_kind === "subject" ? "รายวิชา" : "แผน"} <code className="text-xs">{p.ref_code}</code> — {RES_LABEL[p.resolution]} · PDF หน้า {p.source_page}</li>
                ))}
              </ul>
            ) : q.data && <p className="mt-3 text-sm text-muted-foreground">ทุกการอ้างอิงพบรายการรอตรวจที่ไม่ผิดพลาด — บันทึกชุดแผนการเรียนและรายวิชาก่อน แล้วตรวจซ้ำชุดการจัดรายวิชา/กิจกรรม</p>}
          </>
        )}
      </DashSection>
      <DashSection id="staged-grade" className="mt-4" title={`ยอดต่อแผน · ${grade.replace("M", "ม.")}`} meta="หน่วยกิต (ชั่วโมง)">
        {s.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : !rows.length ? <p className="text-sm text-muted-foreground">ไม่มีข้อมูลรอตรวจของชั้นนี้</p> : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">ยอดหน่วยกิตและชั่วโมงจากข้อมูลรอตรวจ</caption>
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">แผน</th><th className="py-2 text-right">พื้นฐาน ภ.1</th><th className="py-2 text-right">พื้นฐาน ภ.2</th><th className="py-2 text-right">เพิ่มเติม ภ.1</th><th className="py-2 text-right">เพิ่มเติม ภ.2</th><th className="py-2 text-right">จับคู่ไม่ได้</th></tr></thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p} className="border-b last:border-0">
                    <td className="py-2"><code className="text-xs">{p}</code></td>
                    <td className="py-2 text-right tabular-nums">{cell(p, 1, "basic")}</td><td className="py-2 text-right tabular-nums">{cell(p, 2, "basic")}</td>
                    <td className="py-2 text-right tabular-nums">{cell(p, 1, "additional")}</td><td className="py-2 text-right tabular-nums">{cell(p, 2, "additional")}</td>
                    <td className="py-2 text-right tabular-nums">{rows.filter((r) => (r.program_code ?? "–") === p).reduce((n, r) => n + r.unresolved, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashSection>
    </>
  );
}
