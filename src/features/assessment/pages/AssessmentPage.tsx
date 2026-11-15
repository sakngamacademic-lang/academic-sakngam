import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Send } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { DashSection, KpiCard, LiveBadge } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { Notice } from "@/features/curriculum/components";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import {
  addComponent, approveGrades, assessmentKey, ATT_LABELS, computeGrades, GRADE_STATUS_LABELS, KIND_LABELS, saveAttendance, saveScore, setSpecialGrade,
  submitGrades, useSectionData, useSections,
} from "../api";

type Tab = "scores" | "attendance" | "grades";
const TABS: { key: Tab; label: string }[] = [{ key: "scores", label: "คะแนน" }, { key: "attendance", label: "เวลาเรียน" }, { key: "grades", label: "ผลการเรียน" }];
const today = () => new Date().toISOString().slice(0, 10);

/** บันทึกคะแนน/เวลาเรียน/ผลการเรียน — ข้อมูลจริง · เกณฑ์ตัดเกรดมาจากนโยบายที่ยืนยันแล้วเท่านั้น (ไม่มีค่าฝังในโปรแกรม) */
export function AssessmentPage() {
  const sections = useSections();
  const [sectionId, setSectionId] = useState("");
  const [tab, setTab] = useState<Tab>("scores");
  const id = sectionId || sections.data?.[0]?.id;
  const data = useSectionData(id);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: assessmentKey });
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); await refresh(); } catch (e) { toast.error(dbErrorMessage(e)); }
  };
  const d = data.data;
  const locked = d?.locked ?? false;
  return (
    <>
      <PageHeader title="คะแนนและผลการเรียน" description="บันทึกคะแนน เวลาเรียน และผลการเรียนของกลุ่มเรียนที่รับผิดชอบ — ผลการเรียนต้องส่งและอนุมัติโดยหัวหน้าฝ่ายวิชาการ" />
      {sections.error && <p role="alert" className="mb-4 text-sm text-destructive">{dbErrorMessage(sections.error)}</p>}
      {!sections.isPending && !sections.data?.length ? (
        <Notice>ยังไม่มีกลุ่มเรียน — ฝ่ายวิชาการเปิดกลุ่มเรียนได้เมื่อหลักสูตรฉบับนั้นได้รับการอนุมัติแล้ว และลงทะเบียนนักเรียนในกลุ่ม</Notice>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Select aria-label="เลือกกลุ่มเรียน" value={id ?? ""} onChange={(e) => setSectionId(e.target.value)} className="sm:w-96">
              {sections.data?.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.term})</option>)}
            </Select>
            <div role="tablist" aria-label="หมวด" className="flex gap-1">
              {TABS.map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                  className={`h-10 rounded-full border px-4 text-sm ${tab === t.key ? "border-primary/60 bg-primary/15" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
          </div>
          {locked && <Notice>ผลการเรียนของกลุ่มนี้ได้รับการอนุมัติแล้ว — แก้ไขคะแนนและเวลาเรียนไม่ได้</Notice>}
          {data.error && <p role="alert" className="text-sm text-destructive">{dbErrorMessage(data.error)}</p>}
          {d && (
            <>
              <section aria-label="สรุป" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <KpiCard label="นักเรียน" value={d.students.length} />
                <KpiCard label="องค์ประกอบคะแนน" value={d.components.length} />
                <KpiCard label="งานค้าง (ยังไม่มีคะแนน)" tone="accent" value={d.progress.reduce((n, p) => n + Number(p.pending_work ?? 0), 0)} />
                <KpiCard label="ผลการเรียน" value={d.grades.length ? GRADE_STATUS_LABELS[d.grades[0]!.status] : "ยังไม่คำนวณ"} />
              </section>
              {tab === "scores" && <Scores sectionId={id!} d={d} locked={locked} run={run} />}
              {tab === "attendance" && <AttendanceTab sectionId={id!} d={d} locked={locked} run={run} />}
              {tab === "grades" && <GradesTab sectionId={id!} d={d} run={run} />}
            </>
          )}
        </>
      )}
    </>
  );
}

type D = NonNullable<ReturnType<typeof useSectionData>["data"]>;
type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
const name = (s: D["students"][number]) => `${s.prefix}${s.first_name} ${s.last_name}`;

function Scores({ sectionId, d, locked, run }: { sectionId: string; d: D; locked: boolean; run: Run }) {
  const [form, setForm] = useState({ name: "", kind: "formative", max: "" });
  const score = (c: string, s: string) => d.scores.find((x) => x.component_id === c && x.student_id === s);
  return (
    <DashSection id="scores" title={<span className="flex items-center gap-2">คะแนน <LiveBadge /></span>} meta="บันทึกเมื่อออกจากช่อง">
      {!locked && (
        <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_9rem_7rem_auto]" onSubmit={(e) => { e.preventDefault(); void run(async () => { await addComponent(sectionId, form.name, form.kind, Number(form.max)); setForm({ name: "", kind: "formative", max: "" }); }, "เพิ่มองค์ประกอบแล้ว"); }}>
          <Input aria-label="ชื่อองค์ประกอบ" placeholder="เช่น คะแนนเก็บ / สอบกลางภาค" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select aria-label="ชนิด" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Input aria-label="คะแนนเต็ม" type="number" min="0.01" step="0.01" required placeholder="คะแนนเต็ม" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} />
          <Button type="submit" disabled={!form.name.trim() || !(Number(form.max) > 0)}>เพิ่ม</Button>
        </form>
      )}
      {!d.components.length ? <p className="text-sm text-muted-foreground">ยังไม่มีองค์ประกอบคะแนน</p> : !d.students.length ? <p className="text-sm text-muted-foreground">ยังไม่มีนักเรียนลงทะเบียนในกลุ่มนี้</p> : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">ตารางคะแนน</caption>
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-2">นักเรียน</th>
              {d.components.map((c) => <th key={c.id} className="py-2 pr-2 text-right">{c.name}<br /><span className="font-normal">เต็ม {c.max_score}</span></th>)}</tr></thead>
            <tbody>{d.students.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-1.5 pr-2"><span className="text-xs text-muted-foreground">{s.student_code}</span> {name(s)}</td>
                {d.components.map((c) => {
                  const cur = score(c.id, s.id);
                  return (
                    <td key={c.id} className="py-1.5 pr-2 text-right">
                      <input aria-label={`${name(s)} ${c.name}`} type="number" min="0" max={c.max_score} step="0.01" disabled={locked} defaultValue={cur?.score ?? ""}
                        className="h-9 w-20 rounded-md border border-input bg-background px-2 text-right tabular-nums disabled:opacity-60"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v === "" && !cur) return;
                          if (v !== "" && (Number(v) < 0 || Number(v) > c.max_score)) { toast.error(`คะแนนต้องอยู่ระหว่าง 0 ถึง ${c.max_score}`); return; }
                          if (v === String(cur?.score ?? "")) return;
                          void run(() => saveScore(c.id, s.id, v === "" ? null : Number(v), v === "" ? "missing" : "recorded"));
                        }} />
                    </td>
                  );
                })}
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </DashSection>
  );
}

function AttendanceTab({ sectionId, d, locked, run }: { sectionId: string; d: D; locked: boolean; run: Run }) {
  const [date, setDate] = useState(today());
  const [period, setPeriod] = useState(1);
  const cur = (s: string) => d.attendance.find((a) => a.student_id === s && a.session_date === date && a.period_no === period)?.status ?? "";
  return (
    <DashSection id="attendance" title={<span className="flex items-center gap-2">เวลาเรียน <LiveBadge /></span>} meta="เลือกวันที่/คาบแล้วบันทึกรายคน">
      <div className="mb-4 flex flex-wrap gap-2">
        <FormField label="วันที่" htmlFor="att-date"><Input id="att-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
        <FormField label="คาบ" htmlFor="att-period"><Input id="att-period" type="number" min={1} max={12} value={period} onChange={(e) => setPeriod(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} className="w-24" /></FormField>
      </div>
      {!d.students.length ? <p className="text-sm text-muted-foreground">ยังไม่มีนักเรียนลงทะเบียนในกลุ่มนี้</p> : (
        <ul className="divide-y text-sm">{d.students.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 py-2">
            <span><span className="text-xs text-muted-foreground">{s.student_code}</span> {name(s)}
              <span className="ml-2 text-xs text-muted-foreground">มาเรียน {d.progress.find((p) => p.student_id === s.id)?.attendance_percent ?? "–"}%</span></span>
            <Select aria-label={`เวลาเรียน ${name(s)}`} value={cur(s.id)} disabled={locked} className="w-28"
              onChange={(e) => e.target.value && void run(() => saveAttendance(sectionId, s.id, date, period, e.target.value))}>
              <option value="">ยังไม่บันทึก</option>{Object.entries(ATT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </li>))}</ul>
      )}
    </DashSection>
  );
}

function GradesTab({ sectionId, d, run }: { sectionId: string; d: D; run: Run }) {
  const { roles } = useAuth();
  const isHead = roles.includes("academic_head");
  const status = d.grades[0]?.status;
  const [sp, setSp] = useState<{ student: string; grade: string; reason: string } | null>(null);
  return (
    <DashSection id="grades" title={<span className="flex items-center gap-2">ผลการเรียน <LiveBadge /></span>} meta={status ? GRADE_STATUS_LABELS[status] : "ยังไม่คำนวณ"}>
      {!d.policyVerified && (
        <Notice tone="warning">ยังไม่มีเกณฑ์การวัดผลที่ยืนยันสำหรับหลักสูตรฉบับนี้และปีการศึกษานี้ — ระบบจึงคำนวณเกรดไม่ได้ (insufficient_data) · ต้องมีระเบียบของโรงเรียนที่หัวหน้าฝ่ายวิชาการยืนยันก่อน</Notice>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {status !== "approved" && status !== "submitted" && (
          <Button variant="outline" disabled={!d.policyVerified} onClick={() => void run(async () => { const r = await computeGrades(sectionId); if (r.status === "insufficient_data") throw new Error(r.reason); }, "คำนวณผลแล้ว (ร่าง)")}>คำนวณผล</Button>
        )}
        {status === "draft" && <Button onClick={() => void run(() => submitGrades(sectionId), "ส่งผลการเรียนแล้ว")}><Send /> ส่งผลการเรียน</Button>}
        {status === "submitted" && isHead && <Button onClick={() => void run(() => approveGrades(sectionId), "อนุมัติผลการเรียนแล้ว")}><CheckCheck /> อนุมัติผล</Button>}
        {status === "submitted" && !isHead && <Badge variant="warning">รอหัวหน้าฝ่ายวิชาการอนุมัติ</Badge>}
      </div>
      {!d.grades.length ? <p className="text-sm text-muted-foreground">ยังไม่มีผลการเรียน</p> : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">ผลการเรียน</caption>
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">นักเรียน</th><th className="py-2 text-right">คะแนนรวม</th><th className="py-2 text-right">เวลาเรียน %</th><th className="py-2 text-right">ผล</th><th className="py-2" /></tr></thead>
            <tbody>{d.students.map((s) => { const g = d.grades.find((x) => x.student_id === s.id); return (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-1.5">{name(s)}</td>
                <td className="py-1.5 text-right tabular-nums">{g?.total_score ?? "–"}{g?.max_score ? ` / ${g.max_score}` : ""}</td>
                <td className="py-1.5 text-right tabular-nums">{g?.attendance_percent ?? "–"}</td>
                <td className="py-1.5 text-right font-medium">{g?.grade ?? "–"}{g?.special_reason && <span className="block text-xs font-normal text-muted-foreground">{g.special_reason}</span>}</td>
                <td className="py-1.5 text-right">{g?.status === "draft" && <Button size="sm" variant="ghost" onClick={() => setSp({ student: s.id, grade: "ร", reason: "" })}>ผลพิเศษ</Button>}</td>
              </tr>); })}</tbody>
          </table>
        </div>
      )}
      {sp && (
        <form className="mt-4 grid gap-2 rounded-xl border p-3 sm:grid-cols-[7rem_1fr_auto_auto]" onSubmit={(e) => { e.preventDefault(); void run(() => setSpecialGrade(sectionId, sp.student, sp.grade, sp.reason), "บันทึกผลพิเศษแล้ว").then(() => setSp(null)); }}>
          <Select aria-label="ผลพิเศษ" value={sp.grade} onChange={(e) => setSp({ ...sp, grade: e.target.value })}>{["ร", "มส", "ผ", "มผ"].map((g) => <option key={g}>{g}</option>)}</Select>
          <Input aria-label="เหตุผล" placeholder="เหตุผลตามระเบียบโรงเรียน" required value={sp.reason} onChange={(e) => setSp({ ...sp, reason: e.target.value })} />
          <Button type="submit" disabled={sp.reason.trim().length < 3}>บันทึก</Button><Button type="button" variant="outline" onClick={() => setSp(null)}>ยกเลิก</Button>
        </form>
      )}
    </DashSection>
  );
}
