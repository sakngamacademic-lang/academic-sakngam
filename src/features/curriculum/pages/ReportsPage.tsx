import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Printer } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLearningAreas } from "@/features/master-data/api";
import { requireSupabase } from "@/lib/supabase";
import { downloadXlsx, type Cell, type Sheet } from "@/lib/xlsx-lite";
import {
  AUTHORITY_LABELS, COMPLIANCE_LABELS, CONFLICT_CATEGORY_LABELS, CONFLICT_STATUS_LABELS, curriculumKey, useCompliance, useConflicts, useMappingCounts,
  useSourceDocuments, useStagedStructure, useStructureSummary, VERSION_STATUS_LABELS, type ComplianceRow,
} from "../api";
import { CurriculumNav, formatLocator, Notice, useSelectedVersion, VersionPicker } from "../components";

type Row = { grade: string; program: string; type: string; subjects: number; credits: number; hours: number };
interface SubjectLite { learning_area: string | null; subject_type: string; category: string }

/** รายวิชาของฉบับ: ยืนยันแล้ว = ตาราง subjects · ร่าง = แถวรอตรวจที่ไม่ผิดพลาด (แยกชัดเจน) */
function useSubjectsLite(versionId: string | undefined, draft: boolean) {
  const areas = useLearningAreas();
  return useQuery({
    queryKey: [...curriculumKey, "report-subjects", versionId, draft],
    enabled: Boolean(versionId) && Boolean(areas.data),
    queryFn: async (): Promise<SubjectLite[]> => {
      const sb = requireSupabase();
      if (!draft) {
        const { data, error } = await sb.from("subjects").select("learning_area_id, subject_type, subject_category").eq("curriculum_version_id", versionId!).limit(5000);
        if (error) throw error;
        const code = new Map(areas.data?.map((a) => [a.id, a.code]));
        return (data ?? []).map((s) => ({ learning_area: s.learning_area_id ? code.get(s.learning_area_id) ?? null : null, subject_type: s.subject_type, category: s.subject_category }));
      }
      const { data, error } = await sb.from("import_rows").select("normalized, status, batch:import_batches!inner(kind, curriculum_version_id)")
        .eq("batch.kind", "subjects").eq("batch.curriculum_version_id", versionId!).not("status", "in", "(error,skipped)").limit(5000);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const n = r.normalized as Record<string, string>;
        return { learning_area: n.learning_area_code ?? null, subject_type: n.subject_type ?? "–", category: n.subject_category ?? "regular" };
      });
    },
  });
}

/** รายงานหลักสูตรสำหรับผู้บริหาร — ข้อเท็จจริงจากฐานข้อมูล · ผลคำนวณจากเกณฑ์ · ข้อเสนอแนะ แยกกันทุกส่วน */
export function ReportsPage() {
  const sel = useSelectedVersion();
  const { access } = useAuth();
  const id = sel.selected?.id;
  const [draft, setDraft] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const verified = useStructureSummary(id);
  const staged = useStagedStructure(draft ? id : undefined);
  const subjects = useSubjectsLite(id, draft);
  const compliance = useCompliance(id);
  const conflicts = useConflicts();
  const mapping = useMappingCounts(id);
  const docs = useSourceDocuments();
  const areas = useLearningAreas();
  const generated = useMemo(() => new Date(), []);

  const rows: Row[] = useMemo(() => draft
    ? (staged.data ?? []).filter((r) => r.subject_type !== "unresolved").map((r) => ({ grade: r.grade_code, program: r.program_code ?? "ทุกแผน", type: r.subject_type, subjects: r.subjects, credits: Number(r.credits), hours: r.learning_hours }))
    : (verified.data ?? []).map((r) => ({ grade: r.grade_code, program: r.program_code ?? "ทุกแผน", type: r.subject_type, subjects: r.subjects, credits: Number(r.credits), hours: r.learning_hours })),
  [draft, staged.data, verified.data]);
  const grades = [...new Set(rows.map((r) => r.grade))].sort();
  const programs = [...new Set(rows.map((r) => r.program))].sort();
  const agg = (f: (r: Row) => boolean) => rows.filter(f).reduce((a, r) => ({ s: a.s + r.subjects, c: a.c + r.credits, h: a.h + r.hours }), { s: 0, c: 0, h: 0 });
  const src = docs.data?.find((d) => d.id === sel.selected?.announcement_source_id);
  const open = conflicts.data?.filter((c) => c.status !== "resolved") ?? [];
  const compCount = (s: ComplianceRow["status"]) => compliance.data?.filter((r) => r.status === s).length ?? 0;
  const areaName = new Map(areas.data?.map((a) => [a.code, a.name_th]));
  const dist = useMemo(() => {
    const m = new Map<string, { basic: number; additional: number }>();
    for (const s of subjects.data ?? []) {
      const k = s.category === "is" ? "IS" : s.learning_area ?? "ไม่ระบุ";
      const v = m.get(k) ?? { basic: 0, additional: 0 };
      if (s.subject_type === "basic") v.basic++; else v.additional++;
      m.set(k, v);
    }
    return [...m.entries()].sort();
  }, [subjects.data]);

  const structureRows: Cell[][] = grades.flatMap((g) => programs.map((p) => {
    const b = agg((r) => r.grade === g && r.program === p && r.type === "basic"), a = agg((r) => r.grade === g && r.program === p && r.type === "additional");
    return b.s + a.s ? [g, p, b.s, b.c, b.h, a.s, a.c, a.h, b.c + a.c, b.h + a.h] : null;
  })).filter(Boolean) as Cell[][];
  const recommendations = buildRecommendations({ compliance: compliance.data ?? [], open: open.length, byCat: open, committed: (verified.data?.length ?? 0) > 0 });
  const label = draft ? "ร่าง — ข้อมูลรอตรวจ ยังไม่อนุมัติ" : "ข้อมูลที่บันทึกแล้ว";

  const exportXlsx = () => {
    const meta: Cell[][] = [["รายงานหลักสูตรสถานศึกษา"], ["ฉบับ", `${sel.selected?.curriculum_name ?? ""} · ${sel.selected?.version_label ?? ""}`],
      ["สถานะการอนุมัติ", sel.selected ? VERSION_STATUS_LABELS[sel.selected.status] : ""], ["ชุดข้อมูล", label], ["แหล่งอ้างอิง", `${src?.register_code ?? "–"} ${formatLocator(sel.selected?.announcement_locator)}`],
      ["วันจัดทำ", generated.toLocaleString("th-TH")], ["ผู้จัดทำ", access?.display_name ?? ""], ["ผู้ตรวจสอบ", reviewer]];
    const sheets: Sheet[] = [
      { name: "ข้อมูลรายงาน", rows: meta },
      { name: "1-2 โครงสร้าง หน่วยกิต ชั่วโมง", rows: [["ชั้น", "แผน", "พื้นฐาน (วิชา)", "พื้นฐาน (นก.)", "พื้นฐาน (ชม.)", "เพิ่มเติม (วิชา)", "เพิ่มเติม (นก.)", "เพิ่มเติม (ชม.)", "รวม นก.", "รวม ชม."], ...structureRows] },
      { name: "4 การกระจายรายวิชา", rows: [["กลุ่มสาระ", "พื้นฐาน", "เพิ่มเติม"], ...dist.map(([k, v]) => [areaName.get(k) ?? k, v.basic, v.additional])] },
      { name: "5 ผลตรวจตามเกณฑ์", rows: [["รหัส", "เวอร์ชัน", "เกณฑ์", "ขอบเขต", "ผล", "คาดหวัง", "จริง", "แหล่งอ้างอิง", "หมายเหตุ"], ...(compliance.data ?? []).map((r) => [r.rule_code, r.rule_version, r.title_th, r.scope, COMPLIANCE_LABELS[r.status], r.expected, r.actual, r.source, r.detail])] },
      { name: "6 ข้อขัดแย้ง", rows: [["รหัส", "หมวด", "ประเด็น", "หน้า", "ค่า A", "ค่า B", "ผู้มีอำนาจ", "สถานะ"], ...(conflicts.data ?? []).map((c) => [c.conflict_code, CONFLICT_CATEGORY_LABELS[c.category], c.description, `${formatLocator(c.locator_a)}${c.locator_b ? ` / ${formatLocator(c.locator_b)}` : ""}`, c.value_a, c.value_b, AUTHORITY_LABELS[c.decision_authority], CONFLICT_STATUS_LABELS[c.status]])] },
      { name: "7 ข้อเสนอแนะ", rows: [["ที่มา", "ข้อเสนอแนะ"], ...recommendations.map((r) => ["สร้างจากผลตรวจ (ร่าง — ต้องพิจารณาโดยฝ่ายวิชาการ)", r])] },
    ];
    downloadXlsx(`curriculum-report-${draft ? "draft-" : ""}${generated.toISOString().slice(0, 10)}.xlsx`, sheets);
  };

  return (
    <>
      <PageHeader title="รายงานหลักสูตร" description="สำหรับฝ่ายวิชาการนำเสนอผู้อำนวยการ — แยกข้อเท็จจริง ผลคำนวณจากเกณฑ์ และข้อเสนอแนะ" />
      <CurriculumNav />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <VersionPicker value={id ?? ""} onChange={sel.select} versions={sel.versions} />
        <Input aria-label="ชื่อผู้ตรวจสอบรายงาน" placeholder="ผู้ตรวจสอบ (พิมพ์ลงรายงาน)" value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="lg:w-64" />
        <Checkbox label="รวมข้อมูลรอตรวจ (ร่าง)" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
        <div className="flex gap-2 lg:ml-auto">
          <Button variant="outline" onClick={exportXlsx} disabled={!sel.selected}><FileSpreadsheet /> Excel</Button>
          <Button onClick={() => window.print()} disabled={!sel.selected}><Printer /> PDF / พิมพ์</Button>
        </div>
      </div>
      <article id="print-report" className="space-y-4">
        <section className="rounded-2xl border p-4 text-sm">
          <h2 className="text-lg font-semibold">รายงานหลักสูตรสถานศึกษา {sel.selected ? `· ${sel.selected.curriculum_name} ${sel.selected.version_label}` : ""}</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div><dt className="inline text-muted-foreground">สถานะการอนุมัติ: </dt><dd className="inline">{sel.selected ? VERSION_STATUS_LABELS[sel.selected.status] : "–"}</dd></div>
            <div><dt className="inline text-muted-foreground">ชุดข้อมูล: </dt><dd className="inline"><Badge variant={draft ? "warning" : "success"}>{label}</Badge></dd></div>
            <div><dt className="inline text-muted-foreground">แหล่งอ้างอิง: </dt><dd className="inline">{src?.register_code ?? "–"} {formatLocator(sel.selected?.announcement_locator)}</dd></div>
            <div><dt className="inline text-muted-foreground">วันจัดทำ: </dt><dd className="inline">{generated.toLocaleString("th-TH")}</dd></div>
            <div><dt className="inline text-muted-foreground">ผู้จัดทำ: </dt><dd className="inline">{access?.display_name ?? "–"}</dd></div>
            <div><dt className="inline text-muted-foreground">ผู้ตรวจสอบ: </dt><dd className="inline">{reviewer || "……………………"}</dd></div>
          </dl>
          {(sel.selected?.status !== "approved" && sel.selected?.status !== "active") && (
            <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">หลักสูตรฉบับนี้ <b>ยังไม่ผ่านการอนุมัติ</b> — รายงานนี้ไม่ใช่ข้อมูลหลักสูตรที่ใช้งานจริง</p>
          )}
        </section>

        <ReportSection n="1–2" title="โครงสร้างหลักสูตร · หน่วยกิตและชั่วโมงเรียน" kind="fact" note={draft ? "จากแถวรอตรวจ (ยังไม่อนุมัติ) — ค่าเป็นไปตามแถวรายวิชาที่เสนอ" : undefined}>
          {!structureRows.length ? <Empty draft={draft} /> : (
            <Table head={["ชั้น", "แผน", "พื้นฐาน วิชา", "นก.", "ชม.", "เพิ่มเติม วิชา", "นก.", "ชม.", "รวม นก.", "รวม ชม."]}
              rows={structureRows.map((r) => r.map((c, i) => (i === 0 ? String(c).replace("M", "ม.") : typeof c === "number" && [3, 6, 8].includes(i) ? c.toFixed(1) : c)))} />
          )}
        </ReportSection>

        <ReportSection n="3" title="เปรียบเทียบแผนการเรียน (รวมทุกชั้นของแผน)" kind="fact">
          {!programs.length ? <Empty draft={draft} /> : (
            <Table head={["แผน", "รายวิชา", "หน่วยกิต", "ชั่วโมง", "ชั้นที่มีข้อมูล"]}
              rows={programs.map((p) => { const t = agg((r) => r.program === p); return [p, t.s, t.c.toFixed(1), t.h, [...new Set(rows.filter((r) => r.program === p).map((r) => r.grade.replace("M", "ม.")))].join(", ")]; })} />
          )}
        </ReportSection>

        <ReportSection n="4" title="การกระจายรายวิชาตามกลุ่มสาระ" kind="fact">
          {!dist.length ? <Empty draft={draft} /> : <Table head={["กลุ่มสาระ", "พื้นฐาน", "เพิ่มเติม"]} rows={dist.map(([k, v]) => [areaName.get(k) ?? (k === "IS" ? "IS (ไม่สังกัดกลุ่มสาระ)" : k), v.basic, v.additional])} />}
        </ReportSection>

        <ReportSection n="5" title="ผลตรวจตามเกณฑ์ และความครอบคลุมตัวชี้วัด" kind="rule" note="คำนวณจากข้อมูลที่บันทึกแล้วเท่านั้น (ไม่ใช้ข้อมูลร่าง) · เกณฑ์ที่ยังไม่ยืนยัน = ข้อมูลไม่พอ">
          <p className="mb-2 text-sm">ผ่าน {compCount("pass")} · เตือน {compCount("warning")} · ไม่ผ่าน {compCount("fail")} · ข้อมูลไม่พอ {compCount("insufficient_data")} · Mapping ยืนยันแล้ว {mapping.data?.verified ?? 0} / รอตรวจ {mapping.data?.pending ?? 0}</p>
          <Table head={["รหัส", "เกณฑ์", "ผล", "คาดหวัง", "จริง", "แหล่ง"]} rows={(compliance.data ?? []).slice(0, 60).map((r) => [`${r.rule_code} v${r.rule_version}`, r.title_th, COMPLIANCE_LABELS[r.status], r.expected, r.actual, r.source])} />
        </ReportSection>

        <ReportSection n="6" title="ข้อขัดแย้งของหลักสูตร" kind="fact">
          <Table head={["หมวด", "ยังไม่ตัดสิน", "ตัดสินแล้ว"]} rows={Object.keys(CONFLICT_CATEGORY_LABELS).map((k) => {
            const all = conflicts.data?.filter((c) => c.category === k) ?? [];
            return all.length ? [CONFLICT_CATEGORY_LABELS[k as keyof typeof CONFLICT_CATEGORY_LABELS], all.filter((c) => c.status !== "resolved").length, all.filter((c) => c.status === "resolved").length] : null;
          }).filter(Boolean) as Cell[][]} />
        </ReportSection>

        <ReportSection n="7" title="ข้อเสนอแนะการพัฒนาหลักสูตร" kind="suggestion" note="สร้างอัตโนมัติจากผลตรวจ — เป็นร่างให้ฝ่ายวิชาการพิจารณา ไม่ใช่มติหรือการอนุมัติ">
          <ol className="list-decimal space-y-1 pl-5 text-sm">{recommendations.map((r) => <li key={r}>{r}</li>)}</ol>
        </ReportSection>
      </article>
    </>
  );
}

const KIND = { fact: ["ข้อเท็จจริงจากฐานข้อมูล", "success"], rule: ["ผลคำนวณจากเกณฑ์", "info"], suggestion: ["ข้อเสนอแนะ (ร่าง)", "warning"] } as const;
function ReportSection({ n, title, kind, note, children }: { n: string; title: string; kind: keyof typeof KIND; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border p-4">
      <h3 className="flex flex-wrap items-center gap-2 font-semibold">{n}. {title} <Badge variant={KIND[kind][1]}>{KIND[kind][0]}</Badge></h3>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
function Table({ head, rows }: { head: string[]; rows: Cell[][] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[32rem] text-sm">
        <thead><tr className="border-b text-left text-xs text-muted-foreground">{head.map((h, i) => <th key={i} className="py-2 pr-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className={typeof c === "number" || /^\d+(\.\d)?$/.test(String(c)) ? "py-1.5 pr-2 tabular-nums" : "py-1.5 pr-2"}>{c ?? "–"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const Empty = ({ draft }: { draft: boolean }) => (
  <Notice>{draft ? "ไม่มีข้อมูลรอตรวจในฉบับนี้" : "ยังไม่มีข้อมูลที่ผ่านการอนุมัติและบันทึก — เลือก “รวมข้อมูลรอตรวจ (ร่าง)” เพื่อดูภาพรวมจากงานตรวจ (ไม่ใช่ข้อมูลจริง)"}</Notice>
);

/** ข้อเสนอแนะจากผลตรวจ (กำหนดตายตัว ไม่มีการเดา) — ทุกข้ออ้างตัวเลขจากฐานข้อมูล */
function buildRecommendations({ compliance, open, byCat, committed }: { compliance: ComplianceRow[]; open: number; byCat: { category: string }[]; committed: boolean }) {
  const out: string[] = [];
  if (!committed) out.push("ยังไม่มีข้อมูลหลักสูตรที่ผ่านการอนุมัติ — ดำเนินการตรวจและอนุมัติชุดแผนการเรียนและรายวิชาตามลำดับในหน้า “ตรวจรายแถว” ก่อนใช้รายงานนี้อ้างอิง");
  if (open) {
    const top = Object.entries(byCat.reduce<Record<string, number>>((m, c) => ({ ...m, [c.category]: (m[c.category] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
    out.push(`มีข้อขัดแย้งที่ยังไม่ตัดสิน ${open} รายการ (มากที่สุด: ${top.map(([k, n]) => `${CONFLICT_CATEGORY_LABELS[k as keyof typeof CONFLICT_CATEGORY_LABELS] ?? k} ${n}`).join(", ")}) — ควรตัดสินก่อนอนุมัติหลักสูตร และแก้ไขในเล่มหลักสูตรฉบับถัดไป`);
  }
  const unverified = compliance.filter((r) => r.detail?.includes("ยังไม่ได้รับการยืนยัน")).length;
  if (unverified) out.push(`เกณฑ์จากเอกสาร ${unverified} ข้อยังไม่ได้รับการยืนยัน — หัวหน้าฝ่ายวิชาการควรตรวจเทียบกับต้นฉบับแล้วยืนยัน เพื่อให้ระบบประเมินได้`);
  if (compliance.some((r) => r.rule_code === "SYS-FRAMEWORK" && r.status === "insufficient_data")) out.push("ยังไม่มีชุดตัวชี้วัดหลักสูตรแกนกลางที่ยืนยัน — ต้องได้เอกสารทางการ (มาตรฐานและตัวชี้วัดฉบับที่ใช้) ก่อนจึงจะรายงานความครอบคลุมได้");
  const warn = compliance.filter((r) => r.status === "warning" || r.status === "fail").length;
  if (warn) out.push(`มีผลตรวจที่ไม่ตรงเกณฑ์ ${warn} รายการ — ตรวจสอบรายละเอียดในหัวข้อ 5`);
  return out;
}
