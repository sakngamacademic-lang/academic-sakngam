import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, FileDown, Loader2, MessageSquare, Plus, Printer, Send, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { callRpc } from "@/features/master-data/api";
import { useMySubjects, useSyllabus } from "@/features/syllabus/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { requireSupabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";

/**
 * Phase 4 — แผนการจัดการเรียนรู้: สร้างจากหน่วย (ดึงรายวิชา/ตัวชี้วัด/ชั่วโมงอัตโนมัติ) · คัดลอกเป็นฉบับใหม่ · ส่งตรวจ → หัวหน้ากลุ่มสาระ → ผู้ดูแลหลักสูตร
 * ไม่บังคับรูปแบบการสอน · ส่งออก Word (.doc) / พิมพ์เป็น PDF จากเบราว์เซอร์
 */
type PlanStatus = "draft" | "submitted" | "returned" | "area_approved" | "approved";
const STATUS: Record<PlanStatus, string> = { draft: "ร่าง (ใช้งานได้)", submitted: "รอตรวจ", returned: "ส่งกลับแก้ไข", area_approved: "หัวหน้ากลุ่มสาระเห็นชอบ", approved: "อนุมัติแล้ว" };
const TONE: Record<PlanStatus, "secondary" | "warning" | "destructive" | "info" | "success"> = { draft: "secondary", submitted: "warning", returned: "destructive", area_approved: "info", approved: "success" };
const FIELDS: [string, string][] = [
  ["objective_k", "จุดประสงค์ด้านความรู้ (K)"], ["objective_p", "จุดประสงค์ด้านทักษะ/กระบวนการ (P)"], ["objective_a", "จุดประสงค์ด้านคุณลักษณะ (A)"],
  ["content", "สาระการเรียนรู้"], ["competencies", "สมรรถนะสำคัญของผู้เรียน"], ["characteristics", "คุณลักษณะอันพึงประสงค์"],
  ["intro", "กิจกรรมนำเข้าสู่บทเรียน"], ["activities", "กิจกรรมการเรียนรู้"], ["summary", "กิจกรรมสรุป"], ["media", "สื่อและแหล่งเรียนรู้"],
  ["tasks", "ภาระงาน/ชิ้นงาน"], ["tools", "เครื่องมือวัดผล"], ["criteria", "เกณฑ์การประเมิน"], ["post_teaching_note", "บันทึกหลังสอน"],
];
const MODELS = ["Active Learning", "5E", "การเรียนรู้แบบร่วมมือ", "โครงงาน (Project-based)", "ปัญหาเป็นฐาน (Problem-based)", "บรรยาย/สาธิต"];
const TA = "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm";
const planKey = ["lesson-plans"] as const;

interface PlanRow { id: string; title: string; plan_no: number | null; status: PlanStatus; subject_code: string; subject_name: string; teacher_name: string; updated_at: string; unit_title: string | null }
interface PlanData {
  plan: { id: string; title: string; plan_no: number | null; hours: number | null; teaching_model: string | null; content: Record<string, string>; status: PlanStatus; can_write: boolean; is_owner: boolean; teacher_name: string; copied_from_title: string | null };
  subject: { code: string; name_th: string; credits: number; learning_hours: number; grade_code: string | null; learning_area: string | null };
  unit: { seq: number; title: string; essence: string | null; objectives: string | null; hours: number | null } | null;
  targets: { code: string; statement_th: string; standard: string | null; standard_statement: string | null }[];
  reviews: { stage: string; decision: string; comment: string | null; at: string; reviewer: string | null }[];
  documents: { id: string; title: string }[];
}

/** ค่าเริ่มต้นของแผนจากหน่วยการเรียนรู้ (ไม่เขียนทับช่องที่มีข้อความแล้ว) */
function unitContent(u: { essence: string | null; objectives: string | null; tasks?: string | null; assessment_methods?: string | null }, current: Record<string, string> = {}) {
  const out: Record<string, string> = {};
  const put = (k: string, v: string | null | undefined) => { if (v?.trim() && !current[k]?.trim()) out[k] = v.trim(); };
  put("content", u.essence);
  put("objective_k", u.objectives);
  put("tasks", u.tasks);
  put("tools", u.assessment_methods);
  return out;
}

export function LessonPlanPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  return id ? <PlanEditor id={id} onBack={() => setParams({})} onOpen={(n) => setParams({ id: n })} /> : <PlanList onOpen={(n) => setParams({ id: n })} />;
}

function PlanList({ onOpen }: { onOpen: (id: string) => void }) {
  const { can } = useAuth();
  const reviewer = can("curriculum.edit");
  const [scope, setScope] = useState<"mine" | "review" | "all">(reviewer ? "review" : "mine");
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: [...planKey, scope, q], queryFn: async () => (await callRpc<PlanRow[]>("lesson_plan_list", { p_scope: scope, p_search: q.trim() || null })) ?? [] });
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader title="แผนการสอน" description="เลือกรายวิชาและหน่วยการเรียนรู้ — ระบบดึงรายวิชา ตัวชี้วัด ชั่วโมง สาระสำคัญ และจุดประสงค์ให้อัตโนมัติ" actions={<Button onClick={() => setCreating(true)}><Plus /> สร้างแผน</Button>} />
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div role="tablist" className="flex gap-1">
          {([["mine", "แผนของฉัน"], ...(reviewer ? [["review", "รอฉันตรวจ"]] : []), ["all", "ค้นหาทั้งหมดที่เห็นได้"]] as [typeof scope, string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={`h-9 rounded-full border px-3 text-sm ${scope === k ? "border-primary bg-primary font-medium text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
        <FormField label="ค้นหารายวิชา/ครู/ชื่อแผน" htmlFor="pq"><Input id="pq" value={q} onChange={(e) => setQ(e.target.value)} /></FormField>
      </div>
      {creating && <CreatePlan onClose={() => setCreating(false)} onCreated={onOpen} />}
      {list.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : list.error ? <p role="alert" className="text-sm text-destructive">{dbErrorMessage(list.error)}</p> : (
        <ul className="space-y-2">
          {(list.data ?? []).map((p) => (
            <li key={p.id}><button type="button" onClick={() => onOpen(p.id)} className="w-full rounded-xl border p-3 text-left text-sm hover:bg-accent">
              <span className="flex flex-wrap items-center gap-2"><Badge variant={TONE[p.status]}>{STATUS[p.status]}</Badge><b>{p.plan_no ? `แผนที่ ${p.plan_no} ` : ""}{p.title}</b></span>
              <span className="block text-xs text-muted-foreground"><code>{p.subject_code}</code> {p.subject_name}{p.unit_title ? ` · ${p.unit_title}` : ""} · {p.teacher_name} · แก้ไขล่าสุด {new Date(p.updated_at).toLocaleDateString("th-TH")}</span>
            </button></li>
          ))}
          {!list.data?.length && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">ยังไม่มีแผนในมุมมองนี้</li>}
        </ul>
      )}
    </>
  );
}

function CreatePlan({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const subjects = useMySubjects();
  const [sid, setSid] = useState("");
  const only = subjects.data?.length === 1 ? subjects.data[0]!.subject_id : "";
  if (!sid && only) setSid(only);
  const subj = subjects.data?.find((s) => s.subject_id === sid);
  const syl = useSyllabus(subj?.syllabus_id ?? null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="mb-4 grid gap-2 rounded-xl border p-3 sm:grid-cols-3" onSubmit={async (e) => {
      e.preventDefault();
      if (busy) return;
      const f = new FormData(e.currentTarget);
      setBusy(true);
      try {
        const unitId = String(f.get("unit") || "") || null;
        const newId = await callRpc<string>("lesson_plan_create", { p_subject_id: sid, p_unit_id: unitId, p_title: String(f.get("title") ?? "") });
        const u = syl.data?.units.find((x) => x.id === unitId);
        const filled = u ? unitContent(u) : {};
        if (Object.keys(filled).length) {
          // เติมเนื้อหาจากหน่วยการเรียนรู้ให้อัตโนมัติ (ครูแก้ต่อได้) — ไม่ต้องกรอกซ้ำ
          const r = await requireSupabase().from("lesson_plans").update({ content: filled }).eq("id", newId);
          if (r.error) toast.error(dbErrorMessage(r.error));
        }
        onCreated(newId);
      } catch (err) { toast.error(dbErrorMessage(err)); } finally { setBusy(false); }
    }}>
      <FormField label="รายวิชา" htmlFor="ps"><Select id="ps" value={sid} onChange={(e) => setSid(e.target.value)} required>
        <option value="">เลือกรายวิชา</option>{(subjects.data ?? []).map((s) => <option key={s.subject_id} value={s.subject_id}>{s.code} {s.name_th}</option>)}
      </Select></FormField>
      <FormField label="หน่วยการเรียนรู้" htmlFor="pu" hint={subj && !subj.syllabus_id ? "รายวิชานี้ยังไม่มีโครงสร้างรายวิชา — สร้างแผนโดยไม่ผูกหน่วยได้" : undefined}>
        <Select id="pu" name="unit" disabled={!syl.data?.units.length}><option value="">ไม่ระบุ</option>{(syl.data?.units ?? []).map((u) => <option key={u.id} value={u.id}>หน่วยที่ {u.seq} {u.title}</option>)}</Select>
      </FormField>
      <FormField label="ชื่อแผน (เว้นว่าง = ชื่อหน่วย)" htmlFor="pt" hint="ระบบดึงรายวิชา ชั่วโมง ตัวชี้วัด สาระสำคัญ จุดประสงค์ และภาระงานจากหน่วยให้อัตโนมัติ"><Input id="pt" name="title" maxLength={300} /></FormField>
      <div className="flex gap-2 sm:col-span-3"><Button type="submit" size="sm" disabled={busy || !sid}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} สร้าง</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>ยกเลิก</Button></div>
    </form>
  );
}

function PlanEditor({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const data = useQuery({ queryKey: [...planKey, "one", id], queryFn: () => callRpc<PlanData>("lesson_plan_get", { p_plan_id: id }) });
  const myDocs = useQuery({ queryKey: [...planKey, "docs"], queryFn: async () => {
    const { data: d, error } = await requireSupabase().from("documents").select("id, title").eq("kind", "teacher_document").order("updated_at", { ascending: false }).limit(50);
    if (error) throw error;
    return d as { id: string; title: string }[];
  } });
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await qc.invalidateQueries({ queryKey: planKey }); } catch (e) { toast.error(dbErrorMessage(e)); } finally { setBusy(false); }
  };
  if (data.isPending) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (data.error || !data.data) return <p role="alert" className="text-sm text-destructive">{dbErrorMessage(data.error)}</p>;
  const d = data.data;
  const p = d.plan;
  const w = p.can_write;
  const save = (patch: Record<string, unknown>) => run(async () => { const r = await requireSupabase().from("lesson_plans").update(patch).eq("id", id); if (r.error) throw r.error; });
  const act = (action: string, comment?: string) => run(() => callRpc("lesson_plan_transition", { p_plan_id: id, p_action: action, p_comment: comment ?? null }), "บันทึกแล้ว");

  return (
    <div className="space-y-4 pb-16" id="plan-print">
      <Button size="sm" variant="ghost" onClick={onBack} className="print:hidden"><ArrowLeft /> กลับ</Button>
      <header className="rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold">{p.plan_no ? `แผนที่ ${p.plan_no} ` : ""}{p.title}</h1><Badge variant={TONE[p.status]}>{STATUS[p.status]}</Badge></div>
        <p className="text-sm text-muted-foreground"><code>{d.subject.code}</code> {d.subject.name_th} · {d.subject.learning_area} · {d.subject.grade_code ?? "–"} · {d.subject.credits} หน่วยกิต · ผู้สอน {p.teacher_name}</p>
        {d.unit && <p className="text-sm">หน่วยที่ {d.unit.seq} {d.unit.title} · {p.hours ?? d.unit.hours ?? "–"} ชั่วโมง</p>}
        {p.copied_from_title && <p className="text-xs text-muted-foreground">คัดลอกจาก: {p.copied_from_title}</p>}
      </header>
      {w && <p className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm print:hidden">ช่องต่าง ๆ บันทึกอัตโนมัติเมื่อพิมพ์เสร็จ · ฉบับร่างใช้งานและดาวน์โหลด Word/PDF ได้ทันที ไม่ต้องส่งตรวจ</p>}
      <section className="rounded-xl border p-3 text-sm" aria-label="ข้อมูลจากหน่วยการเรียนรู้">
        <p className="font-medium">มาตรฐานและตัวชี้วัด (ดึงจากโครงสร้างรายวิชา)</p>
        {d.targets.length ? <ul className="list-disc pl-5">{d.targets.map((t) => <li key={t.code}><code className="text-xs">{t.code}</code> {t.statement_th}</li>)}</ul> : <p className="text-xs text-muted-foreground">ยังไม่มี — เลือกตัวชี้วัดให้หน่วยที่หน้า “คำอธิบายรายวิชา” ขั้นที่ 3 แล้วระบบจะแสดงที่นี่อัตโนมัติ</p>}
        {d.unit?.essence && <p className="mt-2"><b>สาระสำคัญ:</b> {d.unit.essence}</p>}
      </section>
      <section key={Object.keys(p.content).sort().join()} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2" aria-label="รายละเอียดแผน">
        <FormField label="ชื่อแผน" htmlFor="tt"><Input id="tt" defaultValue={p.title} disabled={!w} onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && save({ title: e.target.value.trim() })} /></FormField>
        <FormField label="รูปแบบการสอน (ไม่บังคับ)" htmlFor="tm"><Input id="tm" list="models" defaultValue={p.teaching_model ?? ""} disabled={!w} onBlur={(e) => e.target.value !== (p.teaching_model ?? "") && save({ teaching_model: e.target.value.trim() || null })} /></FormField>
        <datalist id="models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist>
        {FIELDS.map(([k, l]) => (
          <div key={k} className="sm:col-span-2">
            <label htmlFor={`f-${k}`} className="text-sm font-medium">{l}</label>
            <textarea id={`f-${k}`} className={TA} defaultValue={p.content[k] ?? ""} disabled={k === "post_teaching_note" ? !(p.is_owner) : !w} maxLength={20000}
              onBlur={(e) => { if (e.target.value !== (p.content[k] ?? "")) void save({ content: { ...p.content, [k]: e.target.value } }); }} />
          </div>
        ))}
      </section>
      <section className="rounded-xl border p-3 text-sm print:hidden" aria-label="เอกสารแนบ">
        <p className="font-medium">เอกสารแนบ (จากคลังเอกสารของฉัน)</p>
        <ul className="list-disc pl-5">{d.documents.map((x) => <li key={x.id}>{x.title}</li>)}{!d.documents.length && <li className="list-none text-xs text-muted-foreground">ไม่มี</li>}</ul>
        {w && <Select aria-label="แนบเอกสาร" className="mt-1" value="" onChange={(e) => e.target.value && run(async () => { const r = await requireSupabase().from("lesson_plan_documents").insert({ plan_id: id, document_id: e.target.value }); if (r.error) throw r.error; }, "แนบแล้ว")}>
          <option value="">+ แนบเอกสาร PDF/DOCX ที่อัปโหลดไว้</option>{(myDocs.data ?? []).filter((x) => !d.documents.some((y) => y.id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </Select>}
      </section>
      <section className="rounded-xl border p-3 text-sm" aria-label="ประวัติการตรวจ">
        <p className="font-medium">ความเห็นและประวัติการตรวจ</p>
        <ol className="space-y-1">{d.reviews.map((r, i) => <li key={i} className="text-xs"><b>{r.stage === "area" ? "หัวหน้ากลุ่มสาระ" : r.stage === "academic" ? "ฝ่ายวิชาการ" : "ความเห็น"}</b> · {r.decision === "approve" ? "เห็นชอบ/อนุมัติ" : r.decision === "return" ? "ส่งกลับแก้ไข" : "แสดงความเห็น"} · {r.reviewer ?? "–"} · {new Date(r.at).toLocaleString("th-TH")}{r.comment ? ` — ${r.comment}` : ""}</li>)}
          {!d.reviews.length && <li className="text-xs text-muted-foreground">ยังไม่มี</li>}</ol>
      </section>
      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-xl border bg-card p-2 shadow-sm print:hidden">
        {w && d.unit && Object.keys(unitContent(d.unit, p.content)).length > 0 && <Button size="sm" disabled={busy} onClick={() => save({ content: { ...p.content, ...unitContent(d.unit!, p.content) } })}><Copy /> เติมข้อมูลจากหน่วยการเรียนรู้</Button>}
        {w && <Button size="sm" variant="outline" disabled={busy} onClick={() => window.confirm("ส่งแผนนี้ให้หัวหน้ากลุ่มสาระตรวจเป็นเอกสารทางการ? ระหว่างตรวจจะแก้ไขไม่ได้") && act("submit")}><Send /> ส่งตรวจ (ถ้าโรงเรียนกำหนด)</Button>}
        {!p.is_owner && can("curriculum.edit") && p.status === "submitted" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act("area_approve", window.prompt("ความเห็น (ถ้ามี)") ?? undefined)}><Check /> เห็นชอบ</Button>}
        {!p.is_owner && can("curriculum.manage") && ["area_approved", "submitted"].includes(p.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => window.confirm("อนุมัติแผนนี้?") && act("approve")}><Check /> อนุมัติ</Button>}
        {!p.is_owner && can("curriculum.edit") && ["submitted", "area_approved"].includes(p.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const n = window.prompt("ระบุจุดที่ต้องแก้ไข"); if (n?.trim()) void act("return", n.trim()); }}><Undo2 /> ส่งกลับแก้ไข</Button>}
        {!p.is_owner && can("curriculum.edit") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const n = window.prompt("ความเห็น"); if (n?.trim()) void act("comment", n.trim()); }}><MessageSquare /> แสดงความเห็น</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => onOpen(await callRpc<string>("lesson_plan_copy", { p_plan_id: id })), "คัดลอกเป็นร่างใหม่แล้ว")}><Copy /> คัดลอกเป็นฉบับใหม่</Button>
        <Button size="sm" variant="ghost" onClick={() => exportWord(d)}><FileDown /> Word</Button>
        <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer /> พิมพ์/PDF</Button>
      </div>
    </div>
  );
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** ส่งออก Word: HTML ที่ Word เปิดได้ (.doc) — สถานะไม่ใช่อนุมัติ = มีเครื่องหมาย “ร่าง” */
export function exportWord(d: PlanData) {
  const draft = d.plan.status !== "approved";
  const body = `<h1>${esc(d.plan.title)}</h1>${draft ? `<p style="color:#b00"><b>ร่าง — ยังไม่ผ่านการอนุมัติ</b></p>` : ""}
    <p>รายวิชา ${esc(d.subject.code)} ${esc(d.subject.name_th)} · ${esc(d.subject.learning_area)} · ${esc(d.subject.grade_code)} · ผู้สอน ${esc(d.plan.teacher_name)}</p>
    ${d.unit ? `<p>หน่วยที่ ${d.unit.seq} ${esc(d.unit.title)} · ${esc(d.plan.hours ?? d.unit.hours)} ชั่วโมง</p>` : ""}
    <h2>มาตรฐานและตัวชี้วัด</h2><ul>${d.targets.map((t) => `<li>${esc(t.code)} ${esc(t.statement_th)}</li>`).join("")}</ul>
    ${d.plan.teaching_model ? `<p>รูปแบบการสอน: ${esc(d.plan.teaching_model)}</p>` : ""}
    ${FIELDS.map(([k, l]) => (d.plan.content[k] ? `<h2>${esc(l)}</h2><p style="white-space:pre-wrap">${esc(d.plan.content[k])}</p>` : "")).join("")}`;
  const html = `<html><head><meta charset="utf-8"><title>${esc(d.plan.title)}</title><style>body{font-family:'TH SarabunPSK',Tahoma,sans-serif;font-size:16pt}h1{font-size:20pt}h2{font-size:17pt}</style></head><body>${body}</body></html>`;
  const url = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/msword" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${d.subject.code}-${d.plan.title}.doc`.replace(/[\\/:*?"<>|]/g, "_") });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
