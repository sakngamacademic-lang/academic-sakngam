import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import {
  addTarget, deleteUnit, openSyllabus, removeTarget, saveUnit, setUnitTarget, SYLLABUS_STATUS, SYLLABUS_TONE, syllabusKey, transitionSyllabus, updateSyllabus,
  useCompetencies, useIndicatorSearch, useMySubjects, useSyllabus, useSyllabusCheck, type SyllabusData, type SyllabusStatus, type Unit,
} from "./api";

const TA = "min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm";

/** คำอธิบายรายวิชาและโครงสร้างรายวิชา — ครูจัดทำ · หัวหน้ากลุ่มสาระตรวจ · ผู้ดูแลหลักสูตรอนุมัติ (สิทธิ์ตรวจที่ฐานข้อมูล) */
export function SyllabusPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  return id ? <SyllabusEditor id={id} onBack={() => setParams({})} /> : <SubjectList onOpen={(sid) => setParams({ id: sid })} />;
}

function SubjectList({ onOpen }: { onOpen: (syllabusId: string) => void }) {
  const subjects = useMySubjects();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (subjects.data ?? []).filter((s) => (!q.trim() || `${s.code} ${s.name_th}`.includes(q.trim()))
    && (!status || (status === "none" ? !s.syllabus_status : s.syllabus_status === status)));
  return (
    <>
      <PageHeader title="คำอธิบายรายวิชาและโครงสร้างรายวิชา" description="ข้อมูลรายวิชาดึงจากทะเบียนรายวิชากลาง — เลือกมาตรฐานและตัวชี้วัดจากฐานข้อมูล ไม่ต้องพิมพ์ซ้ำ" />
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
            <li key={s.subject_id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
              <div className="min-w-48 flex-1">
                <p className="font-medium"><code>{s.code}</code> {s.name_th}</p>
                <p className="text-xs text-muted-foreground">{s.learning_area} · {s.grade_code ?? "–"} · {s.subject_type === "basic" ? "พื้นฐาน" : "เพิ่มเติม"} · {s.credits} หน่วยกิต · {s.learning_hours} ชม. · {s.version_label}</p>
              </div>
              {s.syllabus_status ? <Badge variant={SYLLABUS_TONE[s.syllabus_status]}>{SYLLABUS_STATUS[s.syllabus_status]} (ฉบับ {s.syllabus_version})</Badge> : <Badge variant="outline">ยังไม่เริ่ม</Badge>}
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={async () => {
                setBusy(s.subject_id);
                try { onOpen(await openSyllabus(s.subject_id)); } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(null); }
              }}>{busy === s.subject_id ? <Loader2 className="animate-spin" /> : null}{s.syllabus_status ? "เปิด" : "เริ่มจัดทำ"}</Button>
            </li>
          ))}
          {!rows.length && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">ไม่พบรายวิชา — ครูจะเห็นรายวิชาในกลุ่มสาระของตนหรือรายวิชาที่ได้รับมอบหมายให้สอน</li>}
        </ul>
      )}
    </>
  );
}

function SyllabusEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const data = useSyllabus(id);
  const check = useSyllabusCheck(id);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: syllabusKey });
  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); await refresh(); } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  if (data.isPending) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (data.error || !data.data) return <p role="alert" className="text-sm text-destructive">{dbErrorMessage(data.error)}</p>;
  const { syllabus: c, subject: s } = data.data;
  const w = c.can_write;
  const sumHours = data.data.units.reduce((x, u) => x + Number(u.hours ?? 0), 0);
  const sumScore = data.data.units.reduce((x, u) => x + Number(u.max_score ?? 0), 0);

  return (
    <div className="space-y-4 pb-16">
      <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft /> กลับไปรายการรายวิชา</Button>
      <header className="rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold"><code>{s.code}</code> {s.name_th}</h1>
          <Badge variant={SYLLABUS_TONE[c.status]}>{SYLLABUS_STATUS[c.status]} · ฉบับ {c.version_no}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{s.name_en ?? ""} · {s.learning_area} · {s.grade_code ?? "–"} · {s.subject_type === "basic" ? "รายวิชาพื้นฐาน" : "รายวิชาเพิ่มเติม"} · {s.credits} หน่วยกิต · {s.learning_hours} ชั่วโมง · {s.version_label}</p>
        <p className="text-xs text-muted-foreground">ผู้จัดทำ: {c.owner_name ?? "–"} · ข้อมูลรายวิชามาจากทะเบียน (แก้ที่นี่ไม่ได้)</p>
        {c.return_note && <p className="mt-2 rounded-md bg-destructive/10 p-2 text-sm">จุดที่ต้องแก้: {c.return_note}</p>}
        {!w && c.status !== "approved" && <p className="mt-2 text-xs text-muted-foreground">อยู่ระหว่างตรวจ — แก้ไขได้เมื่อถูกส่งกลับหรือยังเป็นร่าง</p>}
      </header>

      {s.description_th && (
        <section className="rounded-xl border p-3 text-sm"><p className="font-medium">คำอธิบายรายวิชาในทะเบียน</p><p className="whitespace-pre-wrap">{s.description_th}</p></section>
      )}

      <section className="space-y-3 rounded-xl border p-3" aria-label="คำอธิบายรายวิชา">
        <p className="font-medium">คำอธิบายรายวิชา</p>
        <AutoText label="สาระสำคัญ" value={c.essence} disabled={!w} onSave={(v) => run(() => updateSyllabus(id, { essence: v }))} />
        <AutoText label="กระบวนการจัดการเรียนรู้" value={c.learning_process} disabled={!w} onSave={(v) => run(() => updateSyllabus(id, { learning_process: v }))} />
        <AutoText label="ความรู้และทักษะที่คาดหวัง" value={c.expected_skills} disabled={!w} onSave={(v) => run(() => updateSyllabus(id, { expected_skills: v }))} />
        <AutoText label="การวัดและประเมินผล" value={c.assessment_note} disabled={!w} onSave={(v) => run(() => updateSyllabus(id, { assessment_note: v }))} />
        <CompetencyPicker data={data.data} disabled={!w} onSave={(ids) => run(() => updateSyllabus(id, { competency_ids: ids }))} />
      </section>

      <TargetsSection data={data.data} disabled={!w} run={run} />

      <section id="units" className="space-y-2 rounded-xl border p-3" aria-label="โครงสร้างรายวิชา">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">โครงสร้างรายวิชา (หน่วยการเรียนรู้)</p>
          <span className={`text-sm ${sumHours === s.learning_hours ? "text-success" : "text-warning"}`}>ชั่วโมงรวม {sumHours}/{s.learning_hours} · คะแนนรวม {sumScore}</span>
        </div>
        {data.data.units.map((u) => <UnitCard key={u.id} unit={u} data={data.data!} disabled={!w} run={run} syllabusId={id} />)}
        {w && <UnitCard key="new" data={data.data} disabled={false} run={run} syllabusId={id} />}
      </section>

      <section aria-label="ผลการตรวจโครงสร้าง" className="rounded-xl border p-3 text-sm">
        <p className="font-medium">ตรวจความครบถ้วน</p>
        <ul className="mt-1 space-y-1">
          {(check.data ?? []).map((r, i) => (
            <li key={i} className="flex gap-2">
              <Badge variant={r.status === "ok" ? "success" : r.status === "warning" ? "warning" : r.status === "info" ? "info" : "secondary"}>
                {r.status === "ok" ? "ผ่าน" : r.status === "warning" ? "ควรแก้" : r.status === "info" ? "ข้อมูล" : "ข้อมูลไม่พอ"}
              </Badge>
              <a className="hover:underline" href={`#${r.target.startsWith("unit") ? "units" : r.target}`}>{r.message_th}</a>
            </li>
          ))}
        </ul>
      </section>

      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-xl border bg-card p-2 shadow-sm">
        {w && <Button size="sm" disabled={busy} onClick={() => window.confirm("ส่งตรวจคำอธิบายรายวิชานี้? ระหว่างตรวจจะแก้ไขไม่ได้") && run(() => transitionSyllabus(id, "submit"), "ส่งตรวจแล้ว")}><Send /> ส่งตรวจ</Button>}
        {can("curriculum.edit") && ["submitted", "reviewed"].includes(c.status) && (
          <>
            {c.status === "submitted" && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => transitionSyllabus(id, "review"), "บันทึกว่าเห็นชอบแล้ว")}><Check /> เห็นชอบ (หัวหน้ากลุ่มสาระ)</Button>}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const n = window.prompt("ระบุจุดที่ต้องแก้ไข"); if (n?.trim()) void run(() => transitionSyllabus(id, "return", n.trim()), "ส่งกลับแก้ไขแล้ว"); }}><Undo2 /> ส่งกลับแก้ไข</Button>
          </>
        )}
        {can("curriculum.manage") && ["submitted", "reviewed"].includes(c.status) && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => window.confirm("อนุมัติคำอธิบายรายวิชานี้?") && run(() => transitionSyllabus(id, "approve"), "อนุมัติแล้ว")}><Check /> อนุมัติ (ผู้ดูแลหลักสูตร)</Button>
        )}
      </div>
    </div>
  );
}

/** ช่องข้อความ บันทึกอัตโนมัติเมื่อออกจากช่อง (ไม่บันทึกถ้าไม่เปลี่ยน) */
function AutoText({ label, value, disabled, onSave }: { label: string; value: string | null; disabled: boolean; onSave: (v: string | null) => Promise<unknown> }) {
  const [v, setV] = useState(value ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const id = useMemo(() => `t-${label}`, [label]);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label} {saved === "saving" ? <span className="text-xs text-muted-foreground">กำลังบันทึก…</span> : saved === "saved" ? <span className="text-xs text-success">บันทึกแล้ว</span> : null}</label>
      <textarea id={id} className={TA} value={v} disabled={disabled} maxLength={8000} onChange={(e) => { setV(e.target.value); setSaved("idle"); }}
        onBlur={async () => { if (v === (value ?? "")) return; setSaved("saving"); await onSave(v.trim() || null); setSaved("saved"); }} />
    </div>
  );
}

function CompetencyPicker({ data, disabled, onSave }: { data: SyllabusData; disabled: boolean; onSave: (ids: string[]) => Promise<unknown> }) {
  const list = useCompetencies(data.subject.framework_version_id);
  if (!data.subject.framework_version_id) return <p className="text-xs text-muted-foreground">ฉบับหลักสูตรยังไม่ผูกกรอบแกนกลาง — ยังเลือกสมรรถนะ/คุณลักษณะจากฐานไม่ได้</p>;
  if (!list.data?.length) return <p className="text-xs text-muted-foreground">ยังไม่มีสมรรถนะ/คุณลักษณะในกรอบแกนกลางที่บันทึกแล้ว</p>;
  const sel = new Set(data.syllabus.competency_ids);
  return (
    <fieldset>
      <legend className="text-sm font-medium">คุณลักษณะและสมรรถนะที่เกี่ยวข้อง</legend>
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

function TargetsSection({ data, disabled, run }: { data: SyllabusData; disabled: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const found = useIndicatorSearch(data.subject.framework_version_id, q);
  const chosen = new Set(data.targets.map((t) => t.indicator_id ?? t.learning_outcome_id));
  return (
    <section id="targets" className="space-y-2 rounded-xl border p-3" aria-label="มาตรฐานและตัวชี้วัด">
      <p className="font-medium">มาตรฐาน ตัวชี้วัด และผลการเรียนรู้</p>
      <ul className="space-y-1 text-sm">
        {data.targets.map((t) => (
          <li key={t.id} className="flex items-start gap-2 rounded-lg bg-muted/30 p-2">
            <span className="flex-1"><code className="text-xs">{t.code}</code> {t.statement_th} {t.verified === false && <Badge variant="warning">กรอบยังไม่ยืนยัน</Badge>}</span>
            {!disabled && <Button size="icon" variant="ghost" aria-label={`นำ ${t.code} ออก`} onClick={() => run(() => removeTarget(t.id))}><Trash2 /></Button>}
          </li>
        ))}
        {!data.targets.length && <li className="text-xs text-muted-foreground">ยังไม่ได้เลือก</li>}
      </ul>
      {!disabled && (
        <>
          {data.outcomes.length > 0 && (
            <div className="text-sm">
              <p className="text-xs font-medium text-muted-foreground">ผลการเรียนรู้ของรายวิชา (จากทะเบียน)</p>
              {data.outcomes.filter((o) => !chosen.has(o.id)).map((o) => (
                <button key={o.id} type="button" className="mr-1 mt-1 rounded-full border px-2 py-1 text-xs hover:bg-accent" onClick={() => run(() => addTarget(data.syllabus.id, { learning_outcome_id: o.id }))}>+ {o.code} {o.statement_th.slice(0, 40)}</button>
              ))}
            </div>
          )}
          {data.subject.framework_version_id ? (
            <div>
              <FormField label="ค้นหาตัวชี้วัดจากฐานกรอบแกนกลาง" htmlFor="iq"><Input id="iq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เช่น ท 1.1 หรือ คำในตัวชี้วัด" /></FormField>
              <ul className="mt-1 space-y-1 text-sm">
                {(found.data ?? []).filter((i) => !chosen.has(i.id)).map((i) => (
                  <li key={i.id}><button type="button" className="w-full rounded-lg border p-2 text-left hover:bg-accent" onClick={() => run(() => addTarget(data.syllabus.id, { indicator_id: i.id }))}>
                    <Plus className="mr-1 inline size-3" /><code className="text-xs">{i.full_code}</code> {i.statement_th}</button></li>
                ))}
              </ul>
            </div>
          ) : <p className="text-xs text-muted-foreground">ฉบับหลักสูตรนี้ยังไม่ผูกกรอบแกนกลาง — ผู้ดูแลหลักสูตรผูกได้ที่หน้า “ฉบับหลักสูตร”</p>}
        </>
      )}
    </section>
  );
}

function UnitCard({ unit, data, disabled, run, syllabusId }: { unit?: Unit; data: SyllabusData; disabled: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; syllabusId: string }) {
  const [open, setOpen] = useState(!unit ? false : false);
  const nextSeq = (data.units.at(-1)?.seq ?? 0) + 1;
  if (!unit && !open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus /> เพิ่มหน่วยการเรียนรู้</Button>;
  const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Number(v));
  return (
    <details className="rounded-xl border p-3 text-sm" open={!unit || open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer font-medium">{unit ? `หน่วยที่ ${unit.seq} ${unit.title}` : "หน่วยใหม่"} {unit && <span className="text-xs text-muted-foreground">· {unit.hours ?? "–"} ชม. · {unit.max_score ?? "–"} คะแนน · {unit.target_ids.length} ตัวชี้วัด</span>}</summary>
      <form className="mt-2 grid gap-2 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (k: string) => String(f.get(k) ?? "").trim() || null;
        await run(() => saveUnit(syllabusId, { id: unit?.id, seq: Number(f.get("seq")) || nextSeq, title: g("title") ?? "", essence: g("essence"), objectives: g("objectives"),
          hours: num(f.get("hours")), max_score: num(f.get("max_score")), tasks: g("tasks"), assessment_methods: g("assessment") }), "บันทึกหน่วยแล้ว");
        if (!unit) setOpen(false);
      }}>
        <FormField label="ลำดับ" htmlFor={`seq-${unit?.id ?? "n"}`}><Input id={`seq-${unit?.id ?? "n"}`} name="seq" type="number" min={1} defaultValue={unit?.seq ?? nextSeq} disabled={disabled} /></FormField>
        <FormField label="ชื่อหน่วย" htmlFor={`ti-${unit?.id ?? "n"}`}><Input id={`ti-${unit?.id ?? "n"}`} name="title" required maxLength={300} defaultValue={unit?.title} disabled={disabled} /></FormField>
        <FormField label="จำนวนชั่วโมง" htmlFor={`h-${unit?.id ?? "n"}`}><Input id={`h-${unit?.id ?? "n"}`} name="hours" type="number" min={0} step="0.5" defaultValue={unit?.hours ?? ""} disabled={disabled} /></FormField>
        <FormField label="คะแนนเต็ม" htmlFor={`sc-${unit?.id ?? "n"}`}><Input id={`sc-${unit?.id ?? "n"}`} name="max_score" type="number" min={0} step="0.5" defaultValue={unit?.max_score ?? ""} disabled={disabled} /></FormField>
        {([["essence", "สาระสำคัญ", unit?.essence], ["objectives", "จุดประสงค์การเรียนรู้", unit?.objectives], ["tasks", "ภาระงาน/ชิ้นงาน", unit?.tasks], ["assessment", "วิธีประเมินผล", unit?.assessment_methods]] as const).map(([n, l, v]) => (
          <div key={n} className="sm:col-span-2"><label className="text-sm font-medium" htmlFor={`${n}-${unit?.id ?? "n"}`}>{l}</label>
            <textarea id={`${n}-${unit?.id ?? "n"}`} name={n} className={TA} defaultValue={v ?? ""} disabled={disabled} maxLength={8000} /></div>
        ))}
        {!disabled && <div className="flex gap-2 sm:col-span-2"><Button type="submit" size="sm">บันทึกหน่วย</Button>
          {unit && <Button type="button" size="sm" variant="ghost" onClick={() => window.confirm(`ลบหน่วยที่ ${unit.seq}?`) && run(() => deleteUnit(unit.id), "ลบแล้ว")}><Trash2 /> ลบหน่วย</Button>}</div>}
      </form>
      {unit && data.targets.length > 0 && (
        <fieldset className="mt-2">
          <legend className="text-xs font-medium text-muted-foreground">ตัวชี้วัด/ผลการเรียนรู้ในหน่วยนี้</legend>
          {data.targets.map((t) => (
            <label key={t.id} className="mr-2 mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
              <input type="checkbox" disabled={disabled} checked={unit.target_ids.includes(t.id)} onChange={(e) => run(() => setUnitTarget(unit.id, t.id, e.target.checked))} /> {t.code}
            </label>
          ))}
        </fieldset>
      )}
    </details>
  );
}

export type { SyllabusStatus };
