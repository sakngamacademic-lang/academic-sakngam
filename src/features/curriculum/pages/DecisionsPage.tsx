import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { KpiCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { requireSupabase } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { curriculumKey, rpc, useConflicts, useSourceDocuments } from "../api";
import { CurriculumNav, EmptyState, Notice, SourcePdfLink, useSelectedVersion } from "../components";
import { groupConflicts, TIER_LABELS, type DecisionGroup, type Tier } from "../conflict-groups";

const NOTE_MIN = 10;


function useSubjectNames(versionId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "decision-subject-names", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("subjects").select("code, name_th").eq("curriculum_version_id", versionId!).limit(2000);
      if (error) throw error;
      return new Map((data as { code: string; name_th: string }[]).map((s) => [s.code, s.name_th]));
    },
  });
}

type Item = DecisionGroup["items"][number];
const SAVE_NOTE = `ระบุเหตุผลร่วมของชุดนี้ (อย่างน้อย ${NOTE_MIN} ตัวอักษร) — ระบบแนบทางเลือกและหลักฐานของแต่ละรายการให้เอง`;

function AiBox({ item }: { item: Item }) {
  const ai = item.plain.ai;
  return (
    <div className={`rounded-md border p-2 text-sm ${ai.pick === null ? "border-warning/40 bg-warning/10" : "bg-muted/40"}`}>
      <div className="font-medium">
        {ai.pick === null ? "AI: ยังตัดสินไม่ได้" : `AI แนะนำ: ทางเลือกที่ ${ai.pick + 1}`} <span className="text-xs font-normal text-muted-foreground">(เป็นคำแนะนำ ไม่ใช่มติ)</span>
      </div>
      <p className="mt-0.5">{ai.reason.replace(/^ยังตัดสินไม่ได้ — /, "")}</p>
      {ai.pages.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          อ้างอิง PDF หน้า {ai.pages.join(", ")}
          {ai.pages.slice(0, 4).map((pg) => <SourcePdfLink key={pg} docId={item.conflict.doc_a_id} locator={`pdf:${pg}`} />)}
        </p>
      )}
    </div>
  );
}

interface CardProps {
  item: Item; choice: number; onChoose: (n: number) => void; canResolve: boolean; batch: boolean; included: boolean;
  onToggle: (v: boolean) => void; onSolo?: (item: Item, choice: number, note: string) => Promise<void>; failure?: string;
}
function ItemCard({ item, choice, onChoose, canResolve, batch, included, onToggle, onSolo, failure }: CardProps) {
  const [open, setOpen] = useState(false);
  const c = item.conflict;
  return (
    <li className="rounded-lg border bg-card p-3 text-sm" aria-label={item.title}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">{item.title}</div>
        {batch && choice >= 0 && (
          <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={included} onChange={(e) => onToggle(e.target.checked)} />รวมในชุดที่จะบันทึก</label>
        )}
      </div>
      <p className="mt-1"><span className="font-medium">ขัดแย้งตรงไหน: </span>{item.plain.problem}</p>
      <fieldset className="mt-2 space-y-1">
        <legend className="text-xs font-medium text-muted-foreground">ทางเลือก — ระบบไม่ได้เลือกให้ กดเลือกเอง</legend>
        {item.plain.options.map((o, k) => (
          <label key={k} className={`flex items-start gap-2 rounded-md border p-2 ${choice === k ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" name={`opt-${c.id}`} className="mt-1" disabled={!canResolve} checked={choice === k} onChange={() => onChoose(k)} />
            <span><span className="font-medium">ทางเลือกที่ {k + 1}: </span>{o.label}{o.detail && <span className="block text-xs text-muted-foreground">{o.detail}</span>}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-2"><AiBox item={item} /></div>
      {item.gap && <p className="mt-1 text-xs text-warning">ขาดหลักฐาน: {item.gap}</p>}
      {failure && <p className="mt-1 text-xs text-destructive">บันทึกไม่สำเร็จ: {failure}</p>}
      <Button size="sm" variant="ghost" className="mt-1 px-2" onClick={() => setOpen(!open)}>{open ? "ซ่อนค่าที่พบในเอกสาร" : "ดูค่าที่พบในเอกสาร (ค่า A / ค่า B)"}</Button>
      {open && (
        <div className="space-y-1 rounded-md bg-muted/40 p-2 text-xs">
          <p><span className="font-medium">ค่า A: </span>{c.value_a ?? "—"}</p>
          <p><span className="font-medium">ค่า B: </span>{c.value_b ?? "—"}</p>
          <ul className="mt-1 space-y-0.5">
            {item.evidence.map((e, k) => <li key={k} className="flex flex-wrap items-center gap-1">{e.source} หน้า {e.page}: {e.text}<SourcePdfLink docId={c.doc_a_id} locator={`pdf:${e.page}`} /></li>)}
          </ul>
        </div>
      )}
      {onSolo && canResolve && <SoloSave item={item} choice={choice} onSave={onSolo} />}
    </li>
  );
}

function SoloSave({ item, choice, onSave }: { item: Item; choice: number; onSave: (item: Item, choice: number, note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const valid = choice >= 0 && ack && note.trim().length >= NOTE_MIN;
  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      <p className="text-xs text-warning">หลักฐานรายการนี้ยังไม่ครบ จึงไม่รวมในการบันทึกเป็นชุด ต้องตัดสินและให้เหตุผลทีละรายการ</p>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />รับทราบว่าหลักฐานไม่ครบ และขอตัดสินด้วยดุลยพินิจของผู้ดูแลหลักสูตร</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} aria-label={`เหตุผลของ ${item.title}`} className="w-full rounded-md border bg-background p-2 text-sm" placeholder={`เหตุผล (อย่างน้อย ${NOTE_MIN} ตัวอักษร)`} />
      <Button size="sm" disabled={!valid} onClick={() => setConfirm(true)}>บันทึกมติรายการนี้</Button>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="ยืนยันมติรายการนี้"
        description={`${item.title} — ทางเลือกที่ ${choice + 1}: ${item.plain.options[choice]?.label ?? ""}`} confirmLabel="ยืนยันมติ" onConfirm={() => onSave(item, choice, note)} />
    </div>
  );
}

const resolutionText = (i: Item, k: number, note: string, gap: boolean) => {
  const ev = i.evidence.map((e) => `${e.source} หน้า ${e.page}: ${e.text}`).join(" | ");
  return `[มติผู้ดูแล] ทางเลือกที่ ${k + 1}: ${i.plain.options[k]?.label ?? ""} — ${note.trim()}${gap ? " [รับทราบว่าหลักฐานไม่ครบ]" : ""} (หลักฐาน: ${ev})`.slice(0, 1900);
};

/** สรุปการตัดสินข้อขัดแย้ง — อธิบายเป็นภาษาไทย ทางเลือกพร้อมตัวเลขจริง คำแนะนำ AI (ไม่ใช่มติ) · บันทึกเป็นชุดได้เฉพาะรายการที่ผู้ดูแลเลือกเอง */
export function DecisionsPage() {
  const qc = useQueryClient();
  const q = useConflicts();
  const { can } = useAuth();
  const sel = useSelectedVersion();
  const names = useSubjectNames(sel.selected?.id);
  const docs = useSourceDocuments();
  const canResolve = can("curriculum.approve");
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [off, setOff] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [filter, setFilter] = useState<"all" | "ai" | "undecided" | "gap">("all");
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => groupConflicts(q.data ?? [], (c) => names.data?.get(c)), [q.data, names.data]);
  const items = groups.flatMap((g) => g.items);
  const all = q.data ?? [];
  const resolved = all.filter((c) => c.status === "resolved").length;
  const noFile = (docs.data?.length ?? 0) > 0 && docs.data!.every((d) => !d.file_id);
  const nAi = items.filter((i) => i.plain.ai.pick !== null && i.readiness === "ready").length;
  const nGap = items.filter((i) => i.readiness === "gap").length;
  const nUnd = items.filter((i) => i.plain.ai.pick === null && i.readiness === "ready").length;
  const show = (i: Item) => filter === "all" || (filter === "ai" && i.plain.ai.pick !== null && i.readiness === "ready") || (filter === "undecided" && i.plain.ai.pick === null && i.readiness === "ready") || (filter === "gap" && i.readiness === "gap");
  const batch = items.filter((i) => i.readiness === "ready" && (choice[i.conflict.id] ?? -1) >= 0 && !off.has(i.conflict.id));
  const valid = canResolve && batch.length > 0 && note.trim().length >= NOTE_MIN;

  const save = async (list: { item: Item; k: number }[], text: (i: Item, k: number) => string) => {
    if (busy) return 0;
    setBusy(true);
    const bad: Record<string, string> = {};
    let ok = 0;
    try {
      for (const { item, k } of list) {
        try { await rpc("source_conflict_resolve", { p_id: item.conflict.id, p_resolution: text(item, k) }); ok++; }
        catch (e) { bad[item.conflict.id] = dbErrorMessage(e); }
      }
    } finally {
      setBusy(false);
      setFailed(bad);
      await qc.invalidateQueries({ queryKey: curriculumKey });
    }
    const nBad = Object.keys(bad).length;
    if (nBad === 0) toast.success(`บันทึกมติสำเร็จ ${ok} รายการ`); else toast.error(`สำเร็จ ${ok} · ล้มเหลว ${nBad} รายการ — ดูข้อความใต้รายการ`);
    return nBad;
  };
  const saveBatch = async () => { const bad = await save(batch.map((item) => ({ item, k: choice[item.conflict.id]! })), (i, k) => resolutionText(i, k, note, false)); if (bad === 0) setNote(""); };
  const pickAi = (g: DecisionGroup) => setChoice((c) => { const n = { ...c }; for (const i of g.items) if (i.readiness === "ready" && i.plain.ai.pick !== null) n[i.conflict.id] = i.plain.ai.pick; return n; });

  const filters: [typeof filter, string][] = [["all", `ทั้งหมด (${items.length})`], ["ai", `AI แนะนำแล้ว (${nAi})`], ["undecided", `AI ยังตัดสินไม่ได้ (${nUnd})`], ["gap", `หลักฐานไม่ครบ (${nGap})`]];
  return (
    <div className="space-y-4 pb-28">
      <PageHeader title="สรุปการตัดสินข้อขัดแย้ง" description="อ่านว่าเอกสารขัดกันตรงไหน เลือกทางเลือกด้วยตัวเอง แล้วบันทึกเป็นชุดด้วยเหตุผลเดียว" />
      <CurriculumNav />
      <Notice tone="info">ระบบอธิบายและแนะนำเท่านั้น ไม่เลือกคำตอบหรือบันทึกมติแทนคุณ — มติจะบันทึกเมื่อคุณเลือกทางเลือก ใส่เหตุผล และกดยืนยันเอง</Notice>
      {noFile && <Notice tone="warning">ยังไม่มีไฟล์ PDF ต้นฉบับในระบบ ปุ่มเปิด PDF จึงไม่แสดง — ใช้เลขหน้าที่ระบุเปิดดูจากไฟล์ต้นฉบับของโรงเรียน</Notice>}
      <Notice tone="warning">
        หลังปิดข้อขัดแย้ง: ระบบเปลี่ยนแค่สถานะของรายการ และทำให้แถวนำเข้าของรหัสวิชานั้นเปลี่ยนจาก “ขัดแย้ง” เป็น “เตือน” เพื่อให้ผู้ดูแลอนุมัติแถวได้ — ทางเลือกที่คุณเลือก <b>ยังไม่ถูกเขียนลงทะเบียนรายวิชาโดยอัตโนมัติ</b> (ทะเบียนจะใช้ค่าตามแถวนำเข้าเดิม) และวิชาที่มีหลายข้อขัดแย้งจะเปลี่ยนเป็น “เตือน” ตั้งแต่ปิดข้อแรก
      </Notice>
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard label="ตัดสินแล้ว" value={`${resolved}/${all.length}`} />
        <KpiCard label="รอตัดสิน" value={items.length} />
        <KpiCard label="AI แนะนำแล้ว" value={nAi} />
        <KpiCard label="หลักฐานไม่ครบ" value={nGap} />
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองรายการ">
        {filters.map(([k, l]) => <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{l}</Button>)}
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : groups.length === 0 ? (
        <EmptyState title="ไม่มีข้อขัดแย้งที่ค้างตัดสิน" />
      ) : (["evidence", "source_error", "decide"] as Tier[]).map((t) => {
        const gs = groups.filter((g) => g.tier === t && g.items.some(show));
        return gs.length > 0 && (
          <div key={t} className="space-y-3">
            <h2 className="text-lg font-semibold">{TIER_LABELS[t]}</h2>
            {gs.map((g) => (
              <section key={g.id} className="space-y-2" aria-label={g.title}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{g.title} <span className="text-xs font-normal text-muted-foreground">({g.items.filter(show).length} รายการ)</span></h3>
                  {canResolve && g.readiness === "ready" && g.items.some((i) => i.plain.ai.pick !== null) && (
                    <Button size="sm" variant="outline" onClick={() => pickAi(g)}>เลือกตามคำแนะนำของ AI ทั้งกลุ่ม (ผมกดเอง)</Button>
                  )}
                </div>
                <ul className="space-y-2">
                  {g.items.filter(show).map((i) => (
                    <ItemCard key={i.conflict.id} item={i} choice={choice[i.conflict.id] ?? -1} canResolve={canResolve}
                      batch={i.readiness === "ready"} included={!off.has(i.conflict.id)} failure={failed[i.conflict.id]}
                      onChoose={(n) => { setChoice((c) => ({ ...c, [i.conflict.id]: n })); setOff((o) => { const x = new Set(o); x.delete(i.conflict.id); return x; }); }}
                      onToggle={(v) => setOff((o) => { const x = new Set(o); if (v) x.delete(i.conflict.id); else x.add(i.conflict.id); return x; })}
                      onSolo={i.readiness === "gap" ? async (it, k, n) => { await save([{ item: it, k }], (a, b) => resolutionText(a, b, n, true)); } : undefined} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        );
      })}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">รายวิชาที่ยังไม่มีข้อขัดแย้งรองรับ</h2>
        <Notice tone="warning">ว22120 (แถวนำเข้าเก่าจากการอ่าน “ว 221201 / ว 221202” ผิด) ไม่มีข้อขัดแย้งตามรหัสนี้ — ปิดข้อขัดแย้งเรื่องรหัสวิชาวิทยาศาสตร์พลังสิบก่อน แล้วให้ผู้ดูแลข้ามแถวเก่าในหน้านำเข้า</Notice>
      </div>
      {canResolve && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card p-3 shadow-lg">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="batch-note" className="text-sm font-medium">เลือกไว้ {batch.length} รายการ <span className="font-normal text-muted-foreground">(ไม่รวมรายการที่หลักฐานไม่ครบ)</span></label>
              <textarea id="batch-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" placeholder={SAVE_NOTE} />
            </div>
            <Button disabled={!valid || busy} onClick={() => setConfirm(true)}>บันทึกมติ {batch.length} รายการ</Button>
          </div>
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`ยืนยันมติ ${batch.length} รายการ`}
            description={batch.slice(0, 12).map((i) => `${i.title} → ทางเลือกที่ ${(choice[i.conflict.id] ?? 0) + 1}`).join(" · ") + (batch.length > 12 ? ` · และอีก ${batch.length - 12} รายการ` : "")}
            confirmLabel="ยืนยันมติทั้งหมดที่เลือก" onConfirm={saveBatch} />
        </div>
      )}
    </div>
  );
}
