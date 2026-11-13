import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared";
import { DashSection, LiveBadge } from "@/components/dashboard";
import { Select } from "@/components/ui/form-controls";
import { useGradeLevels } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { usePrograms, useStructure, type StructureRow } from "../api";
import { CurriculumNav, EmptyState, formatLocator, useSelectedVersion, VersionPicker } from "../components";

/** โครงสร้างรายวิชา: หลักสูตร → ฉบับ → แผน → ชั้น → ภาค */
export function StructurePage() {
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
      <PageHeader title="โครงสร้างรายวิชา" description="แสดงตามข้อมูลที่ผ่านการตรวจแล้ว · ยอดรวมคำนวณจากรายการที่แสดง" />
      <CurriculumNav />
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
