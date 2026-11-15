import { useMemo, useRef, useState } from "react";
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
import { curriculumKey, rpc, useConflicts, useSourceDocuments } from "../api";
import { CurriculumNav, EmptyState, Notice, SourcePdfLink, useSelectedVersion } from "../components";
import { groupConflicts, TIER_LABELS, type DecisionGroup, type Tier } from "../conflict-groups";

const NOTE_MIN = 10;
const MISSING = [
  { code: "ว22120", why: "แถวนำเข้าเก่า (รอตรวจ) จากการอ่าน “ว 221201 / ว 221202” ผิดเป็น ว22120 — ข้อขัดแย้งนี้อยู่ใน CF-84 แล้ว", plan: "ไม่ลงทะเบียน CF ใหม่ (กันซ้ำ) — ตัดสิน CF-84 ก่อน แล้วให้ผู้ดูแลหลักสูตรข้ามแถวเก่าในหน้านำเข้า" },
  { code: "ง30213", why: "คำอธิบายรายวิชา หน้า 378 กับ 388 สะกดชื่อต่างกัน (หน่วยกิต/ชั่วโมงเท่ากัน 2.0/80)", plan: "ลงทะเบียน CF-88 หมวดรหัสซ้ำ พร้อมหน้า PDF ทั้งสอง" },
  { code: "ง33274", why: "คำอธิบายรายวิชา หน้า 279 (มีเลขลำดับ 1) กับ 375 (ไม่มีเลขลำดับ) ชื่อต่างกัน (1.0/40)", plan: "ลงทะเบียน CF-89 หมวดรหัสซ้ำ" },
  { code: "จ31201", why: "คำอธิบายรายวิชา หน้า 470 (ภาษาจีนและวัฒนธรรม1) กับ 471 (…2) ใช้รหัสเดียวกัน (1.0/40)", plan: "ลงทะเบียน CF-90 หมวดรหัสซ้ำ" },
  { code: "พ20211", why: "คำอธิบายรายวิชา หน้า 223 (ศิลปะป้องกันตัว 1) กับ 224 (…2) ใช้รหัสเดียวกัน (1.0/40)", plan: "ลงทะเบียน CF-91 หมวดรหัสซ้ำ" },
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
  const [option, setOption] = useState(-1); // ไม่เลือกให้ล่วงหน้า — ผู้ดูแลต้องเลือกเอง
  const [note, setNote] = useState("");
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set()); // บันทึกสำเร็จแล้วในรอบนี้ — ไม่ส่งซ้ำ
  const [failed, setFailed] = useState<Map<string, string>>(new Map());
  const running = useRef(false);
  const chosen = g.items.filter((i) => !skip.has(i.conflict.id) && !done.has(i.conflict.id));
  const valid = canResolve && option >= 0 && chosen.length > 0 && note.trim().length >= NOTE_MIN;
  const apply = async () => {
    if (running.current || option < 0) return;
    running.current = true;
    const label = g.options[option]?.label ?? "";
    const ok = new Set(done);
    const bad = new Map<string, string>();
    try {
      for (const i of chosen) {
        // ระบุหลักฐานของรายการนั้นลงในมติ เพื่อให้ Audit Log อ่านได้ว่าตัดสินบนค่าใด
        const evidence = i.evidence.map((e) => `${e.source} หน้า ${e.page}: ${e.text}`).join(" | ");
        const text = `[มติกลุ่ม: ${g.title}] ${label} — ${note.trim()} (หลักฐาน: ${evidence})`.slice(0, 1900);
        try {
          await rpc("source_conflict_resolve", { p_id: i.conflict.id, p_resolution: text });
          ok.add(i.conflict.id);
        } catch (e) {
          bad.set(i.conflict.id, dbErrorMessage(e));
        }
      }
    } finally {
      running.current = false;
      setDone(ok);
      setFailed(bad);
      if (bad.size === 0) { setNote(""); setOption(-1); }
      await qc.invalidateQueries({ queryKey: curriculumKey });
    }
    if (bad.size === 0) toast.success(`บันทึกมติสำเร็จ ${chosen.length} รายการ`);
    else toast.error(`สำเร็จ ${chosen.length - bad.size} · ล้มเหลว ${bad.size} รายการ — ดูรายละเอียดในการ์ดกลุ่ม`);
  };
  return (
    <section className="rounded-lg border bg-card p-4" aria-label={g.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{g.title}</h3>
        <div className="flex gap-1">
          <Badge variant={g.readiness === "gap" ? "warning" : "success"}>{g.readiness === "gap" ? "ขาดหลักฐานบางส่วน" : "พร้อมให้ตัดสิน"}</Badge>
          <Badge variant="outline">{g.items.length} รายการ</Badge>
        </div>
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
              {i.gap && <p className="mt-1 pl-6 text-xs text-warning">ขาดหลักฐาน: {i.gap}</p>}
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
          {failed.size > 0 && (
            <Notice tone="warning">
              บันทึกไม่สำเร็จ {failed.size} รายการ (ที่สำเร็จแล้วไม่ถูกส่งซ้ำ):
              <ul className="list-disc pl-5">{g.items.filter((i) => failed.has(i.conflict.id)).map((i) => <li key={i.conflict.id}>{i.conflict.conflict_code} {i.title}: {failed.get(i.conflict.id)}</li>)}</ul>
            </Notice>
          )}
          {option < 0 && <p className="text-xs text-muted-foreground">เลือกทางเลือกก่อนจึงจะบันทึกได้</p>}
          <Button size="sm" disabled={!valid} onClick={() => setConfirm(true)}>{failed.size > 0 ? `ลองใหม่เฉพาะ ${chosen.length} รายการที่ยังค้าง` : `บันทึกมติให้ ${chosen.length} รายการ`}</Button>
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="ยืนยันการตัดสินข้อขัดแย้งเป็นกลุ่ม"
            description={`ปิดข้อขัดแย้ง ${chosen.length} รายการในกลุ่ม “${g.title}” ด้วยมติ: ${g.options[option]?.label ?? ""} — บันทึกแยกทีละรายการ พร้อมหลักฐานของแต่ละรายการ และมี Audit Log ทุกรายการ`}
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
  const docs = useSourceDocuments();
  const noFile = (docs.data?.length ?? 0) > 0 && docs.data!.every((d) => !d.file_id);
  const all = q.data ?? [];
  const resolved = all.filter((c) => c.status === "resolved").length;
  return (
    <div className="space-y-4">
      <PageHeader title="สรุปการตัดสินใจข้อขัดแย้ง" description="จัดกลุ่มตามประเด็นเพื่อตัดสินทีละกลุ่ม พร้อมหลักฐานจาก PDF และผลกระทบ" />
      <CurriculumNav />
      <Notice tone="info">ระบบแค่จัดกลุ่มและเสนอทางเลือก — ไม่ตัดสินแทน ไม่เปลี่ยนสถานะ และไม่แก้ข้อมูลหลักสูตรจนกว่าผู้ดูแลหลักสูตรจะกดยืนยันมติของแต่ละกลุ่ม</Notice>
      {noFile && <Notice tone="warning">ยังไม่มีไฟล์ PDF ต้นฉบับอัปโหลดในระบบ ปุ่มเปิด PDF จึงไม่แสดง — ใช้เลขหน้าที่ระบุในหลักฐานเปิดดูจากไฟล์ต้นฉบับของโรงเรียนแทน</Notice>}
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard label="ตัดสินแล้ว" value={`${resolved}/${all.length}`} />
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
        <h2 className="text-lg font-semibold">รายวิชา 5 รายการที่มีแถวนำเข้าติดเครื่องหมายขัดแย้งแต่ยังไม่มี CF</h2>
        <Notice tone="warning">ปิดจากหน้านี้ไม่ได้ ต้องลงทะเบียนรายการข้อขัดแย้งก่อน (SQL เตรียมไว้แล้ว ตรวจรายการซ้ำก่อนเพิ่ม) — การเขียนข้อมูลบน Hosted ต้องขออนุมัติแยกต่างหาก ยังไม่ดำเนินการ</Notice>
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
