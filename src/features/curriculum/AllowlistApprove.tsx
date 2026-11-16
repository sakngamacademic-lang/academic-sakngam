import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { ConfirmDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { dbErrorMessage } from "@/lib/db-errors";
import { requireSupabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { allVersions, curriculumKey, rpc, useConflicts, useCurricula } from "./api";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HOURS_PER_CREDIT = 40;
const NOTE_MIN = 10;
const MAX_ROWS = 500;

interface RowLite { id: string; batch_id: string; status: string; row_no: number; source_page: number | null; normalized: Record<string, unknown>; issues: { code: string; severity: string }[] }
type Verdict = { id: string; code: string; name: string; page: number | null; ok: boolean; reasons: string[]; notes: string[] };

/**
 * อนุมัติแถวนำเข้าตามรายการรหัสแถวที่ผู้ดูแลวาง (Allowlist ระบุ ID) — ตรวจซ้ำทุกแถวสดจากฐานข้อมูลก่อนแสดงผล
 * ผู้ดูแลยืนยันครั้งเดียว · ฝั่งเซิร์ฟเวอร์ตรวจซ้ำตอนบันทึกจริง (สิทธิ์ academic_head, ชั้นแถว, CF ที่เปิด) แถวที่ไม่ผ่านจะถูกข้าม
 */
export function AllowlistApprove({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFail, setShowFail] = useState(false);
  const ids = useMemo(() => [...new Set((text.match(UUID) ?? []).map((x) => x.toLowerCase()))], [text]);
  const tooMany = ids.length > MAX_ROWS;
  const curricula = useCurricula();
  const conflicts = useConflicts();
  const draftIds = allVersions(curricula.data).filter((v) => v.status === "draft").map((v) => v.id);

  const rows = useQuery({
    queryKey: [...curriculumKey, "allowlist-rows", batchId, ids.join(",")],
    enabled: open && ids.length > 0 && !tooMany,
    queryFn: async () => {
      const sb = requireSupabase();
      const out: RowLite[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await sb.from("import_rows").select("id, batch_id, status, row_no, source_page, normalized, issues").in("id", ids.slice(i, i + 100));
        if (error) throw error;
        out.push(...(data as unknown as RowLite[]));
      }
      return out;
    },
  });
  const registry = useQuery({
    queryKey: [...curriculumKey, "allowlist-registry", draftIds.join(",")],
    enabled: open && draftIds.length > 0,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("subjects").select("code").in("curriculum_version_id", draftIds).limit(5000);
      if (error) throw error;
      return new Set((data as { code: string }[]).map((s) => s.code));
    },
  });

  const verdicts = useMemo<Verdict[] | null>(() => {
    if (!rows.data || !registry.data || !conflicts.data) return null;
    const byId = new Map(rows.data.map((r) => [r.id, r]));
    const openRef = new Set(conflicts.data.filter((c) => c.status !== "resolved" && c.subject_ref).map((c) => c.subject_ref as string));
    const resolvedRef = new Set(conflicts.data.filter((c) => c.status === "resolved" && c.subject_ref).map((c) => c.subject_ref as string));
    const seen = new Map<string, number>();
    for (const r of rows.data) { const c = String(r.normalized.code ?? ""); if (c) seen.set(c, (seen.get(c) ?? 0) + 1); }
    return ids.map((id): Verdict => {
      const r = byId.get(id);
      if (!r) return { id, code: "?", name: "", page: null, ok: false, reasons: ["ไม่พบแถวนี้ในฐานข้อมูล"], notes: [] };
      const code = String(r.normalized.code ?? "");
      const credits = Number(r.normalized.credits);
      const hours = Number(r.normalized.learning_hours);
      const reasons: string[] = [];
      const notes: string[] = [];
      if (r.batch_id !== batchId) reasons.push("ไม่ใช่แถวของชุดที่เลือก");
      if (r.status !== "needs_review") reasons.push(`สถานะเป็น ${r.status} (ต้องเป็นรอตรวจ)`);
      if (!code) reasons.push("ไม่มีรหัสวิชา");
      if (r.issues.some((i) => i.severity === "error")) reasons.push("มีข้อผิดพลาดที่ยังไม่แก้");
      if (r.issues.some((i) => i.code === "SOURCE_CONFLICT") && !resolvedRef.has(code)) reasons.push("มีข้อขัดแย้งระหว่างเอกสารที่ยังไม่ตัดสิน");
      if (openRef.has(code)) reasons.push("มีข้อขัดแย้ง (CF) ที่ยังเปิดอยู่ของรหัสนี้");
      if (registry.data.has(code)) reasons.push("รหัสนี้มีอยู่ในทะเบียนแล้ว (ซ้ำ)");
      if ((seen.get(code) ?? 0) > 1) reasons.push("รหัสซ้ำกันในรายการที่วาง");
      if (!Number.isFinite(credits) || !Number.isFinite(hours) || Math.abs(credits * HOURS_PER_CREDIT - hours) > 0.01) reasons.push("ชั่วโมงไม่ตรงเกณฑ์ 40 ชั่วโมง/หน่วยกิต");
      if (r.issues.some((i) => i.code === "NO_DESCRIPTION")) notes.push("ไม่มีคำอธิบายรายวิชา (ใช้ได้ระดับโครงสร้าง)");
      if (r.issues.some((i) => i.code === "DUPLICATE_DESCRIPTION")) notes.push("มีคำอธิบายหลายหน้า (ตรวจหน้า PDF)");
      return { id, code, name: String(r.normalized.name_th ?? ""), page: r.source_page, ok: reasons.length === 0, reasons, notes };
    });
  }, [rows.data, registry.data, conflicts.data, ids, batchId]);

  const pass = verdicts?.filter((v) => v.ok) ?? [];
  const fail = verdicts?.filter((v) => !v.ok) ?? [];
  const noDesc = pass.filter((v) => v.notes.some((n) => n.startsWith("ไม่มีคำอธิบาย"))).length;

  const apply = async () => {
    setBusy(true);
    let approved = 0; let skipped = 0;
    try {
      const list = pass.map((v) => v.id);
      for (let i = 0; i < list.length; i += MAX_ROWS) {
        const r = (await rpc<{ approved: number; skipped_not_warning: number }>("curriculum_import_rows_approve_warnings", { p_batch_id: batchId, p_row_ids: list.slice(i, i + MAX_ROWS), p_note: note.trim() }));
        approved += r.approved; skipped += r.skipped_not_warning;
      }
      toast.success(`อนุมัติแล้ว ${approved} แถว${skipped ? ` · เซิร์ฟเวอร์ข้าม ${skipped} แถว (ไม่ใช่สถานะคำเตือน/มีข้อขัดแย้ง)` : ""}`);
      setNote(""); setOpen(false);
      await qc.invalidateQueries({ queryKey: curriculumKey });
      onDone();
    } catch (e) {
      toast.error(`${dbErrorMessage(e)} (อนุมัติไปแล้ว ${approved} แถว)`);
      await qc.invalidateQueries({ queryKey: curriculumKey });
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><ListChecks /> อนุมัติตามรายการรหัสแถว…</Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent title="อนุมัติตามรายการรหัสแถว (ระบุ ID)">
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">วางรหัสแถว (UUID) จากรายการที่ฝ่ายวิชาการรับรองแล้ว ระบบตรวจซ้ำสดทุกแถว: สถานะ รหัสซ้ำ ชั่วโมง/หน่วยกิต ข้อขัดแย้งที่ยังเปิด — แถวที่ไม่ผ่านจะไม่ถูกอนุมัติ ระบบ/AI ไม่เลือกแถวให้</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="รายการรหัสแถว" className="w-full rounded-md border bg-background p-2 font-mono text-xs" placeholder="วางรหัสแถว คั่นด้วยบรรทัดหรือจุลภาค (สูงสุด 500 แถว)" />
            <p>พบรหัสแถว {ids.length} รายการ{tooMany ? ` — เกิน ${MAX_ROWS} แถว กรุณาแบ่งเป็นหลายชุด` : ""}</p>
            {(rows.isFetching || registry.isFetching) && <p className="text-muted-foreground">กำลังตรวจ…</p>}
            {rows.error && <p role="alert" className="text-destructive">{dbErrorMessage(rows.error)}</p>}
            {verdicts && (
              <div className="space-y-2" data-testid="allowlist-result">
                <p><b className="text-success">ผ่าน {pass.length}</b> · <b className={fail.length ? "text-destructive" : ""}>ไม่ผ่าน {fail.length}</b>{noDesc > 0 && <> · ผ่านแต่ไม่มีคำอธิบายรายวิชา {noDesc} (เติมทะเบียนได้ระดับโครงสร้าง)</>}</p>
                {fail.length > 0 && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setShowFail(!showFail)}>{showFail ? "ซ่อน" : "ดู"}รายการที่ไม่ผ่าน (ไม่ถูกอนุมัติ)</Button>
                    {showFail && <ul className="max-h-48 space-y-1 overflow-auto rounded-md border p-2 text-xs">{fail.map((v) => <li key={v.id}><b>{v.code} {v.name}</b> หน้า {v.page ?? "-"}: {v.reasons.join("; ")}</li>)}</ul>}
                  </>
                )}
                {pass.length > 0 && <details className="text-xs"><summary className="cursor-pointer">รายการที่จะอนุมัติ ({pass.length})</summary><ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">{pass.map((v) => <li key={v.id}>{v.code} {v.name} · หน้า {v.page ?? "-"} {v.notes.length ? `· ${v.notes.join("; ")}` : ""}</li>)}</ul></details>}
                <label htmlFor="allow-note" className="block font-medium">เหตุผลร่วมของชุดนี้ (อย่างน้อย {NOTE_MIN} ตัวอักษร — บันทึกใน Audit Log)</label>
                <textarea id="allow-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-md border bg-background p-2" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>ปิด</Button>
              <Button disabled={busy || pass.length === 0 || note.trim().length < NOTE_MIN} onClick={() => setConfirm(true)}>อนุมัติ {pass.length} แถวที่ผ่าน</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`ยืนยันอนุมัติ ${pass.length} แถว?`}
        description="เป็นการตัดสินของผู้ดูแลหลักสูตร (บันทึกชื่อผู้ตัดสิน) เฉพาะแถวที่ผ่านการตรวจเท่านั้น — ไม่รวมแถวที่ไม่ผ่าน และยังไม่สร้างทะเบียน" confirmLabel="ยืนยันอนุมัติ" onConfirm={apply} />
    </>
  );
}
