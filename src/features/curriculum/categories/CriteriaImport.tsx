import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileSearch, Loader2, Save } from "lucide-react";
import { callRpc } from "@/features/master-data/api";
import { JOB_STATUS_LABELS, startAnalysis, useAnalyses } from "../analysis-api";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { useSourceDocuments } from "../api";
import { SourcePdfLink } from "../components";
import { catKey, saveCriterion, type Criterion } from "./api";
import { CATEGORIES, type Category } from "./classify";
import { parseCriteriaText } from "./criteria-import";

/**
 * นำเข้าเกณฑ์ประเมินจากต้นฉบับ (PDF ที่ลงทะเบียน · ภาพให้สแกนเป็น PDF ก่อน)
 * ผู้ดูแลวางข้อความที่ถอดจากต้นฉบับ → ระบบแยกเกณฑ์หลัก/องค์ประกอบย่อย/หน้า → ตรวจตัวอย่าง → บันทึกเป็น “ร่าง” ทั้งหมด
 * ไม่ยืนยันเกณฑ์อัตโนมัติ — ต้องเปิด PDF ตรวจทีละข้อแล้วกด “ยืนยันเกณฑ์”
 */
export function CriteriaImport({ cat, existing, onDone }: { cat: Category; existing: Criterion[]; onDone: () => void }) {
  const qc = useQueryClient();
  const docs = useSourceDocuments();
  const [docId, setDocId] = useState("");
  const [meta, setMeta] = useState({ prefix: "", issuer: "", edition: "", year_be: "" });
  const [cats, setCats] = useState<Category[]>([cat]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const analyses = useAnalyses();
  const job = analyses.data?.find((a) => a.source_document_id === docId) ?? null; // ล่าสุดก่อน
  const [range, setRange] = useState({ from: "", to: "" });
  const [reading, setReading] = useState(false);
  const readPdf = async () => {
    if (!job || job.status !== "done") return;
    setReading(true);
    try {
      const pages = (await callRpc<string[]>("document_analysis_page_texts", { p_analysis_id: job.id })) ?? [];
      const a = Math.max(1, Number(range.from) || 1), b = Math.min(pages.length, Number(range.to) || pages.length);
      const out = pages.slice(a - 1, b).map((t, i) => `หน้า ${a + i}\n${(t ?? "").trim()}`).join("\n");
      setText(out);
      toast.success(`อ่านข้อความ PDF หน้า ${a}–${b} แล้ว — ตรวจตัวอย่างด้านล่าง แก้เฉพาะการตัดบรรทัด/เลขข้อให้ตรงต้นฉบับ`);
    } catch (e) { toast.error(dbErrorMessage(e)); } finally { setReading(false); }
  };
  const parsed = useMemo(() => parseCriteriaText(text, meta.prefix.trim()), [text, meta.prefix]);
  const clash = parsed.items.filter((i) => existing.some((e) => e.code === i.code)).map((i) => i.code);
  const save = async () => {
    if (!docId) { toast.error("เลือกเอกสารต้นฉบับของเกณฑ์ก่อน"); return; }
    if (!parsed.items.length || clash.length) return;
    setBusy(true);
    const ids = new Map<string, string>();
    let n = 0;
    try {
      for (const it of parsed.items) { // เรียงตามต้นฉบับ: รายการแม่ถูกบันทึกก่อนรายการย่อยเสมอ
        const id = await saveCriterion(null, {
          code: it.code, title_th: it.text.slice(0, 500), requirement_th: it.text.length > 500 ? it.text : null, parent_id: it.parentCode ? ids.get(it.parentCode) ?? "" : "",
          seq: n + 1, issuer: meta.issuer, edition: meta.edition, year_be: meta.year_be, quality_level: it.level ?? "", categories: cats,
          source_document_id: docId, source_locator: it.page ? `pdf:${it.page}` : "",
        });
        ids.set(it.code, id);
        n++;
      }
      toast.success(`บันทึกเกณฑ์เป็นร่าง ${n} รายการ — ตรวจกับ PDF แล้วกดยืนยันทีละข้อ`);
      await qc.invalidateQueries({ queryKey: catKey });
      onDone();
    } catch (e) {
      toast.error(`บันทึกได้ ${n} จาก ${parsed.items.length} รายการ: ${dbErrorMessage(e)}`);
      await qc.invalidateQueries({ queryKey: catKey });
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-xl border bg-background p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        1) ลงทะเบียน PDF แบบประเมินที่หน้า “นำเข้าเอกสารหลักสูตร” (ภาพให้สแกนรวมเป็น PDF) · 2) เลือกเอกสารแล้วกด “อ่านข้อความจาก PDF” ระบบใส่เลขหน้าให้อัตโนมัติ ·
        3) ตรวจตัวอย่างที่แยกเป็นข้อ/องค์ประกอบย่อย แล้วบันทึกเป็นร่าง — ระบบไม่แต่งข้อความ ไม่สร้างค่าขั้นต่ำ และไม่ยืนยันเกณฑ์ให้
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormField label="เอกสารต้นฉบับของเกณฑ์" htmlFor="ci-doc"><Select id="ci-doc" value={docId} onChange={(e) => setDocId(e.target.value)}>
          <option value="">เลือกเอกสาร</option>{(docs.data ?? []).filter((x) => !x.parent_id).map((x) => <option key={x.id} value={x.id}>{x.register_code} {x.title}</option>)}</Select></FormField></div>
        <FormField label="หน่วยงานที่กำหนด" htmlFor="ci-iss"><Input id="ci-iss" value={meta.issuer} onChange={(e) => setMeta({ ...meta, issuer: e.target.value })} /></FormField>
        <FormField label="ฉบับ" htmlFor="ci-ed"><Input id="ci-ed" value={meta.edition} onChange={(e) => setMeta({ ...meta, edition: e.target.value })} /></FormField>
        <FormField label="ปี พ.ศ." htmlFor="ci-y"><Input id="ci-y" inputMode="numeric" value={meta.year_be} onChange={(e) => setMeta({ ...meta, year_be: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></FormField>
        <FormField label="คำนำหน้ารหัส (ไม่บังคับ)" htmlFor="ci-px" hint="เช่น K5- เพื่อแยกชุดเกณฑ์"><Input id="ci-px" value={meta.prefix} onChange={(e) => setMeta({ ...meta, prefix: e.target.value })} /></FormField>
      </div>
      <fieldset><legend className="font-medium">ประเภทหลักสูตรที่เกี่ยวข้อง</legend><div className="mt-1 flex flex-wrap gap-1">{CATEGORIES.map((c) => (
        <label key={c.key} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"><input type="checkbox" checked={cats.includes(c.key)} onChange={(e) => setCats(e.target.checked ? [...cats, c.key] : cats.filter((x) => x !== c.key))} />{c.short}</label>))}</div></fieldset>
      {docId && (
        <div className="rounded-lg border border-primary/20 bg-accent/50 p-2 text-xs">
          <p className="font-medium">อ่านข้อความจาก PDF ที่เลือก</p>
          {!job ? <div className="mt-1 flex flex-wrap items-center gap-2"><span>ระบบยังไม่เคยอ่านไฟล์นี้</span>
              <Button size="sm" variant="outline" onClick={async () => { try { await startAnalysis(docId, false); toast.success("เริ่มอ่าน PDF แล้ว — รอสักครู่แล้วกดอ่านข้อความ"); await analyses.refetch(); } catch (e) { toast.error(dbErrorMessage(e)); } }}><FileSearch /> ให้ระบบอ่าน PDF นี้</Button></div>
            : job.status !== "done" ? <p className="mt-1">สถานะการอ่าน: {JOB_STATUS_LABELS[job.status] ?? job.status}{job.page_count ? ` · ${job.pages_done}/${job.page_count} หน้า` : ""} — รอให้เสร็จก่อน</p>
            : <div className="mt-1 flex flex-wrap items-end gap-2">
                <FormField label="จากหน้า" htmlFor="ci-from"><Input id="ci-from" className="h-8 w-20" inputMode="numeric" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value.replace(/\D/g, "") })} placeholder="1" /></FormField>
                <FormField label="ถึงหน้า" htmlFor="ci-to"><Input id="ci-to" className="h-8 w-20" inputMode="numeric" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value.replace(/\D/g, "") })} placeholder={String(job.page_count ?? "")} /></FormField>
                <Button size="sm" disabled={reading} onClick={readPdf}>{reading ? <Loader2 className="animate-spin" /> : <FileSearch />} อ่านข้อความจาก PDF</Button>
              </div>}
        </div>
      )}
      <FormField label="ข้อความเกณฑ์จากต้นฉบับ (ระบบเติมจาก PDF หรือวางเอง)" htmlFor="ci-text">
        <textarea id="ci-text" className="min-h-40 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"หน้า 12\nระดับ 5\n1. (ข้อความเกณฑ์ตามต้นฉบับ)\n1.1 (องค์ประกอบย่อย)\n(1) (เงื่อนไขย่อย)"} />
      </FormField>
      {text.trim() && (
        <div className="space-y-2">
          {(parsed.warnings.length > 0 || clash.length > 0) && (
            <ul role="note" className="space-y-0.5 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
              {clash.length > 0 && <li className="flex gap-1"><AlertTriangle className="size-3.5 shrink-0 text-warning" />รหัสซ้ำกับเกณฑ์ที่มีอยู่: {clash.join(", ")} — ใช้คำนำหน้ารหัสอื่น</li>}
              {parsed.warnings.map((w) => <li key={w} className="flex gap-1"><AlertTriangle className="size-3.5 shrink-0 text-warning" />{w}</li>)}
            </ul>
          )}
          <p className="text-xs font-medium">ตัวอย่างก่อนบันทึก ({parsed.items.length} รายการ)</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {parsed.items.map((it) => (
              <li key={it.code} className="rounded-lg border px-2 py-1 text-xs" style={{ marginLeft: `${Math.min(3, it.code.split(/[.(]/).length - 1) * 1}rem` }}>
                <b>{it.code}</b> {it.text} <span className="text-muted-foreground">· {it.page ? `PDF หน้า ${it.page}` : "ไม่มีหน้า"}{it.level ? ` · ระดับ ${it.level}` : ""}</span>
                {docId && it.page && <SourcePdfLink docId={docId} locator={`pdf:${it.page}`} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !parsed.items.length || clash.length > 0 || !docId} onClick={save}>{busy ? <Loader2 className="animate-spin" /> : <Save />} บันทึกเป็นร่าง {parsed.items.length || ""} รายการ</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>ยกเลิก</Button>
      </div>
    </div>
  );
}
