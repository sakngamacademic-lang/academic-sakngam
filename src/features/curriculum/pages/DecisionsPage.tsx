import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { KpiCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { requireSupabase } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { curriculumKey, rpc, useConflicts } from "../api";
import { CurriculumNav, EmptyState, Notice, SourcePdfLink, useSelectedVersion } from "../components";
import { groupConflicts, TIER_LABELS, type DecisionGroup, type Tier } from "../conflict-groups";

const NOTE_MIN = 10;
const MISSING = [
  { code: "ว22120", why: "แถวเก่าจากการอ่านรหัส “ว 221201” ผิด — ผูกกับข้อขัดแย้งเรื่องรูปแบบรหัส ว221201/ว21201", plan: "ตัดสินกลุ่ม “รหัส ว221201/ว221202” ก่อน แล้วให้ฝ่ายวิชาการลงทะเบียนข้อขัดแย้งแยกสำหรับแถวนี้" },
  { code: "ง30213", why: "ตรวจพบความขัดแย้งในทะเบียน แต่ยังไม่มีรายการ CF — ชั่วโมงไม่ตรงเกณฑ์ (กรณีปิดได้ด้วยหลักฐาน)", plan: "ลงทะเบียนข้อขัดแย้งใหม่พร้อมหลักฐาน PDF แล้วจัดเข้ากลุ่มที่เกี่ยวข้อง" },
  { code: "ง33274", why: "ตรวจพบความขัดแย้งในทะเบียน แต่ยังไม่มีรายการ CF (กรณีปิดได้ด้วยหลักฐาน)", plan: "ลงทะเบียนข้อขัดแย้งใหม่พร้อมหลักฐาน PDF" },
  { code: "จ31201", why: "ตรวจพบความขัดแย้งในทะเบียน แต่ยังไม่มีรายการ CF (ข้อผิดพลาดในต้นฉบับ)", plan: "ลงทะเบียนข้อขัดแย้งใหม่พร้อมหลักฐาน PDF" },
  { code: "พ20211", why: "ตรวจพบความขัดแย้งในทะเบียน แต่ยังไม่มีรายการ CF (ข้อผิดพลาดในต้นฉบับ)", plan: "ลงทะเบียนข้อขัดแย้งใหม่พร้อมหลักฐาน PDF" },
];

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

function GroupCard({ g, canResolve }: { g: DecisionGroup; canResolve: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [option, setOption] = useState(0);
  const [note, setNote] = useState("");
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const chosen = g.items.filter((i) => !skip.has(i.conflict.id));
  const valid = canResolve && chosen.length > 0 && note.trim().length >= NOTE_MIN;
  const apply = async () => {
    const text = `[มติกลุ่ม: ${g.title}] ${g.options[option]?.label ?? ""} — ${note.trim()}`;
    let done = 0;
    try {
      for (const i of chosen) {
        await rpc("source_conflict_resolve", { p_id: i.conflict.id, p_resolution: text });
        done++;
      }
      toast.success(`บันทึกมติแล้ว ${done} รายการ`);
      setNote("");
    } catch (e) {
      toast.error(`บันทึกได้ ${done}/${chosen.length} รายการ — ${dbErrorMessage(e)}`);
    } finally {
      await qc.invalidateQueries({ queryKey: curriculumKey });
    }
  };
  return (
    <section className="rounded-lg border bg-card p-4" aria-label={g.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{g.title}</h3>
        <Badge variant="outline">{g.items.length} รายการ</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{g.summary}</p>
      <Button size="sm" variant="ghost" className="mt-2 px-2" onClick={() => setOpen(!open)}>{open ? "ซ่อนหลักฐานรายข้อ" : "ดูหลักฐานและผลกระทบรายข้อ"}</Button>
      {open && (
        <ul className="mt-2 space-y-3">
          {g.items.map((i) => (
            <li key={i.conflict.id} className="rounded-md border p-3 text-sm">
              <label className="flex items-start gap-2 font-medium">
                <input type="checkbox" className="mt-1" checked={!skip.has(i.conflict.id)} disabled={!canResolve}
                  onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(i.conflict.id); else n.add(i.conflict.id); return n; })} />
                <span>{i.title}</span>
              </label>
              <ul className="mt-1 space-y-1 pl-6">
                {i.evidence.map((e, k) => (
                  <li key={k} className="flex flex-wrap items-center gap-1 text-muted-foreground">
                    <span>{e.source} หน้า {e.page}: {e.text}</span>
                    <SourcePdfLink docId={i.conflict.doc_a_id} locator={`pdf:${e.page}`} />
                  </li>
                ))}
                {i.impact && <li className="text-foreground">ผลกระทบ: {i.impact}</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {canResolve ? (
        <div className="mt-3 space-y-2 border-t pt-3">
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">ทางเลือกของผู้ดูแลหลักสูตร (ระบบไม่เลือกให้)</legend>
            {g.options.map((o, k) => (
              <label key={k} className="flex items-start gap-2 text-sm">
                <input type="radio" name={`opt-${g.id}`} className="mt-1" checked={option === k} onChange={() => setOption(k)} />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} aria-label={`เหตุผลของกลุ่ม ${g.title}`}
            className="w-full rounded-md border bg-background p-2 text-sm" placeholder={`ระบุเหตุผลและเอกสารอ้างอิง (อย่างน้อย ${NOTE_MIN} ตัวอักษร)`} />
          <Button size="sm" disabled={!valid} onClick={() => setConfirm(true)}>บันทึกมติให้ {chosen.length} รายการ</Button>
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="ยืนยันการตัดสินข้อขัดแย้งเป็นกลุ่ม"
            description={`ปิดข้อขัดแย้ง ${chosen.length} รายการในกลุ่ม “${g.title}” ด้วยมติ: ${g.options[option]?.label ?? ""} — บันทึก Audit Log ทุกรายการ`}
            confirmLabel="ยืนยันมติ" onConfirm={apply} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">การตัดสินทำได้เฉพาะผู้ดูแลหลักสูตร</p>
      )}
    </section>
  );
}

/** สรุปการตัดสินใจข้อขัดแย้งเป็นกลุ่ม — จัดกลุ่มตามประเด็น แสดงหลักฐาน PDF และผลกระทบ · ระบบไม่ตัดสินแทน */
export function DecisionsPage() {
  const q = useConflicts();
  const { can } = useAuth();
  const sel = useSelectedVersion();
  const names = useSubjectNames(sel.selected?.id);
  const groups = useMemo(() => groupConflicts(q.data ?? [], (c) => names.data?.get(c)), [q.data, names.data]);
  const byTier = (t: Tier) => groups.filter((g) => g.tier === t);
  const count = (t: Tier) => byTier(t).reduce((s, g) => s + g.items.length, 0);
  const canResolve = can("curriculum.approve");
  return (
    <div className="space-y-4">
      <PageHeader title="สรุปการตัดสินใจข้อขัดแย้ง" description="จัดกลุ่มตามประเด็นเพื่อตัดสินทีละกลุ่ม พร้อมหลักฐานจาก PDF และผลกระทบ" />
      <CurriculumNav />
      <Notice tone="info">ระบบแค่จัดกลุ่มและเสนอทางเลือก — ไม่ตัดสินแทน ไม่เปลี่ยนสถานะ และไม่แก้ข้อมูลหลักสูตรจนกว่าผู้ดูแลหลักสูตรจะกดยืนยันมติของแต่ละกลุ่ม</Notice>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="ปิดได้ด้วยหลักฐาน" value={count("evidence")} />
        <KpiCard label="ข้อผิดพลาดในต้นฉบับ" value={count("source_error")} />
        <KpiCard label="ต้องตัดสิน" value={count("decide")} />
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : groups.length === 0 ? (
        <EmptyState title="ไม่มีข้อขัดแย้งที่ค้างตัดสิน" />
      ) : (
        (["evidence", "source_error", "decide"] as Tier[]).map((t) => byTier(t).length > 0 && (
          <div key={t} className="space-y-3">
            <h2 className="text-lg font-semibold">{TIER_LABELS[t]} <span className="text-sm font-normal text-muted-foreground">({count(t)} รายการ)</span></h2>
            {byTier(t).map((g) => <GroupCard key={g.id} g={g} canResolve={canResolve} />)}
          </div>
        ))
      )}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">รายวิชาที่ทะเบียนมีเครื่องหมายขัดแย้งแต่ยังไม่มีรายการข้อขัดแย้ง (5 รายวิชา)</h2>
        <Notice tone="warning">ปิดจากหน้านี้ไม่ได้ ต้องลงทะเบียนรายการข้อขัดแย้งก่อน — การเขียนข้อมูลบน Hosted ต้องขออนุมัติแยกต่างหาก (ยังไม่ดำเนินการ)</Notice>
        <ul className="space-y-2">
          {MISSING.map((m) => (
            <li key={m.code} className="rounded-md border p-3 text-sm">
              <div className="font-medium">{m.code} {names.data?.get(m.code) ?? ""}</div>
              <div className="text-muted-foreground">{m.why}</div>
              <div>แผนแก้ไขที่ปลอดภัย: {m.plan}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
