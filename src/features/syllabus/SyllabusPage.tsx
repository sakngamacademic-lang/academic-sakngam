import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileDown, Loader2, Plus, Save, Send, Trash2, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { schoolGrade } from "@/features/mapping/match";
import {
  addTarget, deleteUnit, exportSyllabusWord, openSyllabus, removeTarget, saveUnit, setUnitTarget, SYLLABUS_STATUS, SYLLABUS_TONE, syllabusKey, transitionSyllabus,
  updateSyllabus, useCompetencies, useIndicatorSearch, useMySubjects, useSuggestedIndicators, useSyllabus, useSyllabusCheck, type SyllabusData, type SyllabusStatus, type Unit,
} from "./api";

const TA = "min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm";
type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
const STEPS = ["เลือกรายวิชา", "คำอธิบายรายวิชา", "หน่วยการเรียนรู้และตัวชี้วัด", "บันทึกและดาวน์โหลด"] as const;

/**
 * จัดทำรายวิชา 4 ขั้น: เลือกรายวิชา → คำอธิบายรายวิชา → หน่วยการเรียนรู้ (+ตัวชี้วัดจากฐานกลาง) → บันทึก/ดาวน์โหลด
 * ร่างใช้งาน แก้ไข และดาวน์โหลดได้ทันที — การส่งตรวจไม่บังคับ (สิทธิ์ทั้งหมดตรวจที่ฐานข้อมูลเดิม)
 */
export function SyllabusPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const step = Math.min(4, Math.max(2, Number(params.get("step") ?? 2)));
  return id
    ? <SyllabusEditor id={id} step={step} onStep={(n) => setParams({ id, step: String(n) })} onBack={() => setParams({})} />
    : <SubjectList onOpen={(sid) => setParams({ id: sid, step: "2" })} />;
}

function Stepper({ step, onStep }: { step: number; onStep?: (n: number) => void }) {
  return (
    <ol aria-label="ขั้นตอน" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map((l, i) => {
        const n = i + 1, done = n < step, cur = n === step;
        const body = <><span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", done ? "bg-success text-white" : cur ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{done ? <Check className="size-3.5" /> : n}</span><span className="text-left text-sm">{l}</span></>;
        const cls = cn("flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 py-1.5", cur ? "border-primary bg-accent font-semibold" : "bg-card");
        return <li key={l} aria-current={cur ? "step" : undefined}>{onStep && n > 1 && !cur ? <button type="button" className={cls} onClick={() => onStep(n)}>{body}</button> : <div className={cls}>{body}</div>}</li>;
      })}
    </ol>
  );
}

function SubjectList({ onOpen }: { onOpen: (syllabusId: string) => void }) {
  const subjects = useMySubjects();
  const { roles } = useAuth();
  const isTeacherOnly = roles.length > 0 && roles.every((r) => r === "teacher");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (subjects.data ?? []).filter((s) => (!q.trim() || `${s.code} ${s.name_th}`.includes(q.trim()))
    && (!status || (status === "none" ? !s.syllabus_status : s.syllabus_status === status)));
  return (
    <>
      <PageHeader title="จัดทำคำอธิบายรายวิชา" description="เลือกรายวิชา → เขียนคำอธิบาย → เพิ่มหน่วยการเรียนรู้และเลือกตัวชี้วัด → บันทึก/ดาวน์โหลด · ข้อมูลรายวิชาดึงจากทะเบียน ไม่ต้องพิมพ์ซ้ำ" />
      <Stepper step={1} />
      <p className="mb-3 text-sm text-muted-foreground">{isTeacherOnly ? "แสดงเฉพาะรายวิชาที่คุณมีสิทธิ์จัดทำ: รายวิชาในกลุ่มสาระของคุณ หรือรายวิชาที่ได้รับมอบหมายให้สอน" : "แสดงรายวิชาทั้งหมดที่บัญชีนี้อ่านได้"}</p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex">
        <FormField label="ค้นหารายวิชา" htmlFor="sq"><Input id="sq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="รหัสหรือชื่อวิชา" /></FormField>
        <FormField label="สถานะ" htmlFor="ss">
          <Select id="ss" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ทั้งหมด</option><option value="none">ยังไม่เริ่ม</option>
            {Object.entries(SYLLABUS_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </FormField>
      </div>
      {subjects.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : subjects.error ? <p role="alert" className="text-sm text-destructive">{dbErrorMessage(subjects.error)}</p> : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.subject_id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm shadow-card">
              <div className="min-w-48 flex-1">
                <p className="font-medium"><code>{s.code}</code> {s.name_th}</p>
                <p className="text-xs text-muted-foreground">{s.learning_area} · {schoolGrade(s.grade_code) ?? "–"} · {s.subject_type === "basic" ? "พื้นฐาน" : "เพิ่มเติม"} · {s.credits} หน่วยกิต · {s.learning_hours} ชม.</p>
              </div>
              {s.syllabus_status ? <Badge variant={SYLLABUS_TONE[s.syllabus_status]}>{SYLLABUS_STATUS[s.syllabus_status]}</Badge> : <Badge variant="outline">ยังไม่เริ่ม</Badge>}
              <Button size="sm" disabled={busy !== null} onClick={async () => {
                setBusy(s.subject_id);
                try { onOpen(await openSyllabus(s.subject_id)); } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(null); }
              }}>{busy === s.subject_id ? <Loader2 className="animate-spin" /> : <ArrowRight />}{s.syllabus_status ? "เปิดทำต่อ" : "เริ่มจัดทำ"}</Button>
            </li>
          ))}
          {!rows.length && (
            <li className="rounded-xl border border-dashed bg-card p-6 text-sm">
              {subjects.data?.length ? <p className="text-center text-muted-foreground">ไม่พบรายวิชาตามคำค้น</p> : (
                <div className="mx-auto max-w-xl space-y-2">
                  <p className="font-medium">ยังไม่มีรายวิชาที่คุณรับผิดชอบในระบบ</p>
                  <p className="text-muted-foreground">ระบบไม่เดาว่าครูสอนวิชาใด — ให้ฝ่ายวิชาการตั้งค่าอย่างใดอย่างหนึ่ง:</p>
                  <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                    <li>กำหนด <b>กลุ่มสาระการเรียนรู้</b> ของครูที่เมนู เครื่องมือฝ่ายวิชาการ → ครูและบุคลากร (ครูจะเห็นรายวิชาในกลุ่มสาระนั้น)</li>
                    <li>หรือมอบหมายครูให้สอน <b>กลุ่มเรียน</b> ของรายวิชา (ข้อมูลภาระสอน)</li>
                  </ol>
                  <p className="text-muted-foreground">และบัญชีผู้ใช้ต้องผูกกับทะเบียนครูแล้ว</p>
                </div>
              )}
            </li>
          )}
        </ul>
      )}
    </>
  );
}

function SyllabusEditor({ id, step, onStep, onBack }: { id: string; step: number; onStep: (n: number) => void; onBack: () => void }) {
  const qc = useQueryClient();
  const data = useSyllabus(id);
  const [busy, setBusy] = useState(false);
  const run: Run = async (fn, okMsg) => {
    if (busy) return false;
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); await qc.invalidateQueries({ queryKey: syllabusKey }); return true; }
    catch (e) { toast.error(dbErrorMessage(e)); return false; } finally { setBusy(false); }
  };
  if (data.isPending) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (data.error || !data.data) return <p role="alert" className="text-sm text-destructive">{dbErrorMessage(data.error)}</p>;
  const { syllabus: c, subject: s } = data.data;
  const w = c.can_write;
  return (
    <div className="space-y-4 pb-10">
      <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft /> เลือกรายวิชาอื่น</Button>
      <Stepper step={step} onStep={onStep} />
      <header className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold"><code>{s.code}</code> {s.name_th}</h1>
          <Badge variant={SYLLABUS_TONE[c.status]}>{SYLLABUS_STATUS[c.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{s.learning_area} · {schoolGrade(s.grade_code) ?? "–"} · {s.subject_type === "basic" ? "รายวิชาพื้นฐาน" : "รายวิชาเพิ่มเติม"} · {s.credits} หน่วยกิต · {s.learning_hours} ชั่วโมง · ข้อมูลจากทะเบียน (แก้ที่นี่ไม่ได้)</p>
        {c.return_note && <p className="mt-2 rounded-md bg-destructive/10 p-2 text-sm">จุดที่ต้องแก้: {c.return_note}</p>}
        {!w && c.status !== "approved" && <p className="mt-2 text-xs text-muted-foreground">อยู่ระหว่างตรวจ — แก้ไขได้เมื่อถูกส่งกลับ (ดาวน์โหลดได้ตามปกติ)</p>}
      </header>
      {step === 2 && <DescriptionStep data={data.data} disabled={!w} run={run} busy={busy} onNext={() => onStep(3)} />}
      {step === 3 && <UnitsStep data={data.data} disabled={!w} run={run} syllabusId={id} onNext={() => onStep(4)} />}
      {step === 4 && <FinishStep data={data.data} id={id} run={run} busy={busy} />}
    </div>
  );
}

// ------------------------------------------------------------------ ขั้น 2
function DescriptionStep({ data, disabled, run, busy, onNext }: { data: SyllabusData; disabled: boolean; run: Run; busy: boolean; onNext: () => void }) {
  const c = data.syllabus;
  const init = { essence: c.essence ?? "", learning_process: c.learning_process ?? "", expected_skills: c.expected_skills ?? "", assessment_note: c.assessment_note ?? "" };
  const [f, setF] = useState(init);
  const dirty = (Object.keys(f) as (keyof typeof f)[]).filter((k) => f[k] !== init[k]);
  const save = async (next: boolean) => {
    if (!disabled && dirty.length) {
      const patch = Object.fromEntries(dirty.map((k) => [k, f[k].trim() || null]));
      if (!(await run(() => updateSyllabus(c.id, patch), "บันทึกคำอธิบายรายวิชาแล้ว"))) return;
    }
    if (next) onNext();
  };
  const fields: [keyof typeof f, string, string][] = [
    ["essence", "สาระสำคัญ / คำอธิบายรายวิชา", "สิ่งที่นักเรียนจะได้เรียนในรายวิชานี้"],
    ["learning_process", "วิธีจัดการเรียนรู้", "เช่น ทดลอง โครงงาน อภิปรายกลุ่ม"],
    ["expected_skills", "ความรู้และทักษะที่คาดหวัง", "นักเรียนจะรู้และทำอะไรได้"],
    ["assessment_note", "การวัดและประเมินผล", "เช่น ชิ้นงาน แบบทดสอบ สัดส่วนคะแนน"],
  ];
  return (
    <section aria-label="คำอธิบายรายวิชา" className="space-y-3 rounded-2xl border bg-card p-4 shadow-card">
      {data.subject.description_th && (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p className="font-medium">คำอธิบายรายวิชาในทะเบียนหลักสูตร</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{data.subject.description_th}</p>
          {!disabled && !f.essence.trim() && <Button size="sm" variant="outline" className="mt-2" onClick={() => setF({ ...f, essence: data.subject.description_th!.replace(/\s*\n\s*/g, "") })}>ใช้ข้อความนี้เป็นจุดเริ่มต้น</Button>}
        </div>
      )}
      {fields.map(([k, l, hint]) => (
        <div key={k}>
          <label htmlFor={`f-${k}`} className="text-sm font-medium">{l}</label>
          <p className="text-xs text-muted-foreground">{hint}</p>
          <textarea id={`f-${k}`} className={TA} value={f[k]} disabled={disabled} maxLength={8000} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      <CompetencyPicker data={data} disabled={disabled} onSave={(ids) => run(() => updateSyllabus(c.id, { competency_ids: ids }))} />
      <div className="sticky bottom-2 flex flex-wrap gap-2 rounded-xl border bg-card p-2 shadow-sm">
        {!disabled && <Button variant="outline" disabled={busy || !dirty.length} onClick={() => save(false)}><Save /> บันทึก</Button>}
        <Button disabled={busy} onClick={() => save(true)}>{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}{!disabled && dirty.length ? "บันทึกและไปขั้นถัดไป" : "ขั้นถัดไป"}</Button>
      </div>
    </section>
  );
}

function CompetencyPicker({ data, disabled, onSave }: { data: SyllabusData; disabled: boolean; onSave: (ids: string[]) => Promise<unknown> }) {
  const list = useCompetencies(data.subject.framework_version_id);
  if (!data.subject.framework_version_id || !list.data?.length) return null;
  const sel = new Set(data.syllabus.competency_ids);
  return (
    <fieldset>
      <legend className="text-sm font-medium">คุณลักษณะและสมรรถนะที่เกี่ยวข้อง (ไม่บังคับ)</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {list.data.map((c) => (
          <label key={c.id} className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
            <input type="checkbox" disabled={disabled} checked={sel.has(c.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(c.id); else n.delete(c.id); void onSave([...n]); }} />
            {c.code}. {c.name_th}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ------------------------------------------------------------------ ขั้น 3
interface Choice { key: string; label: string; add: { indicator_id?: string; learning_outcome_id?: string } }
function useChoices(data: SyllabusData, q: string): { choices: Choice[]; frameworkReady: boolean } {
  const fw = data.subject.framework_version_id;
  const suggested = useSuggestedIndicators(fw, data.subject.code, data.subject.grade_code);
  const found = useIndicatorSearch(fw, q);
  const used = new Set(data.targets.map((t) => t.indicator_id ?? t.learning_outcome_id));
  const fromFw = (q.trim() ? found.data : suggested.data) ?? [];
  return {
    frameworkReady: !!fw,
    choices: [
      ...fromFw.filter((i) => !used.has(i.id)).map((i) => ({ key: i.id, label: `${i.full_code} ${i.statement_th}`, add: { indicator_id: i.id } })),
      ...data.outcomes.filter((o) => !used.has(o.id) && (!q.trim() || `${o.code} ${o.statement_th}`.includes(q.trim())))
        .map((o) => ({ key: o.id, label: `ผลการเรียนรู้ ${o.code}: ${o.statement_th}`, add: { learning_outcome_id: o.id } })),
    ],
  };
}

function UnitsStep({ data, disabled, run, syllabusId, onNext }: { data: SyllabusData; disabled: boolean; run: Run; syllabusId: string; onNext: () => void }) {
  const [q, setQ] = useState("");
  const { choices, frameworkReady } = useChoices(data, q);
  const sumHours = data.units.reduce((x, u) => x + Number(u.hours ?? 0), 0);
  return (
    <div className="space-y-4">
      {!frameworkReady && (
        <p role="note" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          ฐานมาตรฐานและตัวชี้วัดแกนกลางของหลักสูตรนี้ยังไม่พร้อมใช้ (ฝ่ายวิชาการยังไม่รับรองและผูกฉบับ) — ตอนนี้เลือกได้เฉพาะผลการเรียนรู้จากทะเบียนรายวิชา
          <span className="block text-xs text-muted-foreground">เพิ่มหน่วยการเรียนรู้ได้ตามปกติ แล้วค่อยกลับมาเลือกตัวชี้วัดเมื่อฐานพร้อม</span>
        </p>
      )}
      <section aria-label="ตัวชี้วัดของรายวิชา" className="space-y-2 rounded-2xl border bg-card p-4 shadow-card">
        <p className="font-medium">ตัวชี้วัด / ผลการเรียนรู้ของรายวิชา ({data.targets.length})</p>
        <ul className="space-y-1 text-sm">
          {data.targets.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded-lg bg-muted/30 p-2">
              <span className="flex-1"><code className="text-xs">{t.code}</code> {t.statement_th}</span>
              {!disabled && <Button size="icon" variant="ghost" aria-label={`นำ ${t.code} ออก`} onClick={() => run(() => removeTarget(t.id))}><Trash2 /></Button>}
            </li>
          ))}
          {!data.targets.length && <li className="text-xs text-muted-foreground">ยังไม่ได้เลือก — เลือกจากรายการด้านล่าง หรือเลือกในแต่ละหน่วย</li>}
        </ul>
        {!disabled && (
          <>
            <FormField label="ค้นหาตัวชี้วัด (รหัสหรือข้อความ)" htmlFor="iq"><Input id="iq" value={q} onChange={(e) => setQ(e.target.value)} placeholder={frameworkReady ? "เว้นว่าง = แสดงตัวชี้วัดแนะนำของชั้นนี้" : "ค้นหาผลการเรียนรู้"} /></FormField>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {choices.slice(0, 60).map((ch) => (
                <li key={ch.key}><button type="button" className="w-full rounded-lg border p-2 text-left hover:bg-accent" onClick={() => run(() => addTarget(data.syllabus.id, ch.add), "เพิ่มแล้ว")}>
                  <Plus className="mr-1 inline size-3" />{ch.label}</button></li>
              ))}
              {!choices.length && <li className="text-xs text-muted-foreground">ไม่มีรายการให้เลือก</li>}
            </ul>
          </>
        )}
      </section>

      <section id="units" aria-label="หน่วยการเรียนรู้" className="space-y-2 rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">หน่วยการเรียนรู้ ({data.units.length})</p>
          <span className={cn("text-sm", sumHours === data.subject.learning_hours ? "text-success" : "text-warning")}>ชั่วโมงรวม {sumHours} / {data.subject.learning_hours}</span>
        </div>
        {data.units.map((u) => <UnitCard key={u.id} unit={u} data={data} disabled={disabled} run={run} syllabusId={syllabusId} />)}
        {!disabled && <UnitCard key="new" data={data} disabled={false} run={run} syllabusId={syllabusId} />}
      </section>
      <div className="sticky bottom-2 flex gap-2 rounded-xl border bg-card p-2 shadow-sm"><Button onClick={onNext}><ArrowRight /> ขั้นถัดไป: บันทึกและดาวน์โหลด</Button></div>
    </div>
  );
}

function UnitCard({ unit, data, disabled, run, syllabusId }: { unit?: Unit; data: SyllabusData; disabled: boolean; run: Run; syllabusId: string }) {
  const [open, setOpen] = useState(false);
  const { choices } = useChoices(data, "");
  const nextSeq = (data.units.at(-1)?.seq ?? 0) + 1;
  if (!unit && !open) return <Button variant="outline" onClick={() => setOpen(true)}><Plus /> เพิ่มหน่วยการเรียนรู้</Button>;
  const k = unit?.id ?? "n";
  const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Number(v));
  return (
    <details className="rounded-xl border p-3 text-sm" open={!unit || open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer font-medium">{unit ? `หน่วยที่ ${unit.seq} ${unit.title}` : "หน่วยใหม่"} {unit && <span className="text-xs font-normal text-muted-foreground">· {unit.hours ?? "–"} ชม. · {unit.target_ids.length} ตัวชี้วัด</span>}</summary>
      <form className="mt-2 grid gap-2 sm:grid-cols-4" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (x: string) => String(f.get(x) ?? "").trim() || null;
        const ok = await run(() => saveUnit(syllabusId, { id: unit?.id, seq: Number(f.get("seq")) || nextSeq, title: g("title") ?? "", essence: g("essence"), objectives: g("objectives"),
          hours: num(f.get("hours")), max_score: num(f.get("max_score")), tasks: g("tasks"), assessment_methods: g("assessment") }), "บันทึกหน่วยแล้ว");
        if (ok && !unit) setOpen(false);
      }}>
        <FormField label="หน่วยที่" htmlFor={`seq-${k}`}><Input id={`seq-${k}`} name="seq" type="number" min={1} defaultValue={unit?.seq ?? nextSeq} disabled={disabled} /></FormField>
        <div className="sm:col-span-3"><FormField label="ชื่อหน่วย" htmlFor={`ti-${k}`}><Input id={`ti-${k}`} name="title" required maxLength={300} defaultValue={unit?.title} disabled={disabled} /></FormField></div>
        <FormField label="จำนวนชั่วโมง" htmlFor={`h-${k}`}><Input id={`h-${k}`} name="hours" type="number" min={0} step="0.5" defaultValue={unit?.hours ?? ""} disabled={disabled} /></FormField>
        <FormField label="คะแนนเต็ม" htmlFor={`sc-${k}`}><Input id={`sc-${k}`} name="max_score" type="number" min={0} step="0.5" defaultValue={unit?.max_score ?? ""} disabled={disabled} /></FormField>
        {([["essence", "สาระสำคัญ / เนื้อหา", unit?.essence], ["objectives", "จุดประสงค์การเรียนรู้", unit?.objectives], ["tasks", "ภาระงาน/ชิ้นงาน", unit?.tasks], ["assessment", "วิธีประเมินผล", unit?.assessment_methods]] as const).map(([n, l, v]) => (
          <div key={n} className="sm:col-span-4"><label className="text-sm font-medium" htmlFor={`${n}-${k}`}>{l}</label>
            <textarea id={`${n}-${k}`} name={n} className={cn(TA, "min-h-16")} defaultValue={v ?? ""} disabled={disabled} maxLength={8000} /></div>
        ))}
        {!disabled && <div className="flex gap-2 sm:col-span-4"><Button type="submit" size="sm"><Save /> บันทึกหน่วย</Button>
          {unit && <Button type="button" size="sm" variant="ghost" onClick={() => window.confirm(`ลบหน่วยที่ ${unit.seq}?`) && run(() => deleteUnit(unit.id), "ลบแล้ว")}><Trash2 /> ลบหน่วย</Button>}</div>}
      </form>
      {unit && (
        <fieldset className="mt-3 border-t pt-2">
          <legend className="text-xs font-medium text-muted-foreground">ตัวชี้วัดของหน่วยนี้</legend>
          {data.targets.map((t) => (
            <label key={t.id} className="mr-2 mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
              <input type="checkbox" disabled={disabled} checked={unit.target_ids.includes(t.id)} onChange={(e) => run(() => setUnitTarget(unit.id, t.id, e.target.checked))} /> {t.code}
            </label>
          ))}
          {!disabled && choices.length > 0 && (
            <Select aria-label="เพิ่มตัวชี้วัดให้หน่วยนี้" className="mt-2" value="" onChange={(e) => {
              const ch = choices.find((x) => x.key === e.target.value);
              if (ch) void run(async () => { const t = await addTarget(data.syllabus.id, ch.add); await setUnitTarget(unit.id, (t as { id: string }).id, true); }, "เพิ่มตัวชี้วัดให้หน่วยแล้ว");
            }}>
              <option value="">+ เพิ่มตัวชี้วัด/ผลการเรียนรู้ให้หน่วยนี้</option>
              {choices.slice(0, 100).map((ch) => <option key={ch.key} value={ch.key}>{ch.label.slice(0, 90)}</option>)}
            </Select>
          )}
        </fieldset>
      )}
    </details>
  );
}

// ------------------------------------------------------------------ ขั้น 4
function FinishStep({ data, id, run, busy }: { data: SyllabusData; id: string; run: Run; busy: boolean }) {
  const { can } = useAuth();
  const check = useSyllabusCheck(id);
  const c = data.syllabus;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-5 text-success" aria-hidden="true" /> บันทึกเรียบร้อย — ฉบับร่างใช้งาน แก้ไข และดาวน์โหลดได้ทันที</p>
        <p className="mt-1 text-sm text-muted-foreground">ไม่จำเป็นต้องส่งตรวจ เว้นแต่โรงเรียนกำหนดให้ใช้เป็นเอกสารทางการ</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => exportSyllabusWord(data)}><FileDown /> ดาวน์โหลด Word</Button>
          <Button variant="outline" asChild><Link to={`../lesson-plans`} relative="path">ไปสร้างแผนการสอน</Link></Button>
        </div>
      </section>
      <section aria-label="ตรวจความครบถ้วน" className="rounded-2xl border bg-card p-4 text-sm shadow-card">
        <p className="font-medium">ตรวจความครบถ้วน (คำแนะนำ ไม่บังคับ)</p>
        <ul className="mt-1 space-y-1">
          {(check.data ?? []).map((r, i) => (
            <li key={i} className="flex gap-2">
              <Badge variant={r.status === "ok" ? "success" : r.status === "warning" ? "warning" : r.status === "info" ? "info" : "secondary"}>
                {r.status === "ok" ? "ครบ" : r.status === "warning" ? "ควรแก้" : r.status === "info" ? "ข้อมูล" : "ยังไม่มีข้อมูล"}
              </Badge>
              <span>{r.message_th}</span>
            </li>
          ))}
          {check.isPending && <li className="text-muted-foreground">กำลังตรวจ…</li>}
        </ul>
      </section>
      <Section title="เอกสารทางการ (ถ้าโรงเรียนกำหนด)">
        <div className="flex flex-wrap gap-2">
          {c.can_write && <Button size="sm" variant="outline" disabled={busy} onClick={() => window.confirm("ส่งให้หัวหน้ากลุ่มสาระ/ฝ่ายวิชาการตรวจ? ระหว่างตรวจจะแก้ไขไม่ได้") && run(() => transitionSyllabus(id, "submit"), "ส่งตรวจแล้ว")}><Send /> ส่งตรวจเป็นเอกสารทางการ</Button>}
          {can("curriculum.edit") && ["submitted", "reviewed"].includes(c.status) && (
            <>
              {c.status === "submitted" && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => transitionSyllabus(id, "review"), "บันทึกว่าเห็นชอบแล้ว")}><Check /> เห็นชอบ (หัวหน้ากลุ่มสาระ)</Button>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const n = window.prompt("ระบุจุดที่ต้องแก้ไข"); if (n?.trim()) void run(() => transitionSyllabus(id, "return", n.trim()), "ส่งกลับแก้ไขแล้ว"); }}><Undo2 /> ส่งกลับแก้ไข</Button>
            </>
          )}
          {can("curriculum.manage") && ["submitted", "reviewed"].includes(c.status) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => window.confirm("อนุมัติคำอธิบายรายวิชานี้เป็นเอกสารทางการ?") && run(() => transitionSyllabus(id, "approve"), "อนุมัติแล้ว")}><Check /> อนุมัติ (ผู้ดูแลหลักสูตร)</Button>
          )}
          {!c.can_write && !["submitted", "reviewed"].includes(c.status) && <p className="text-xs text-muted-foreground">สถานะ: {SYLLABUS_STATUS[c.status]}</p>}
        </div>
      </Section>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-card"><p className="font-medium">{title}</p>{children}</section>;
}

export type { SyllabusStatus };
