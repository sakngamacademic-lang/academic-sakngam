import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, GitCompareArrows, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { requireSupabase } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-errors";
import { readXlsx } from "@/lib/xlsx-read";
import { cn } from "@/lib/utils";
import { allVersions, curriculumKey, useCurricula } from "../api";
import { blockChecks, parseStructureWorkbook } from "../structure-workbook";
import { compareBlocks, DIFF_LABEL, roomProposals, type BlockCompare, type DiffKind, type RegOffering } from "../structure-compare";

/**
 * เทียบไฟล์โครงสร้างหลักสูตร (Excel ที่โรงเรียนยืนยัน) กับทะเบียนรายวิชาในระบบ — อ่านอย่างเดียว
 * ไฟล์อ่านในเบราว์เซอร์เท่านั้น (ไม่อัปโหลด ไม่บันทึก) · ไม่แก้ทะเบียน ไม่ผูกห้อง — ผลเป็นรายงานให้ฝ่ายวิชาการตัดสิน
 */
interface RegData { offerings: RegOffering[]; classrooms: { grade: string; room: number }[]; linked: number }

function useRegistry(versionId: string | null) {
  return useQuery({
    queryKey: [...curriculumKey, "workbook-compare", versionId], enabled: !!versionId,
    queryFn: async (): Promise<RegData> => {
      const sb = requireSupabase();
      const [o, c, l] = await Promise.all([
        sb.from("subject_offerings").select("term_no, offering_kind, is_active, grade:grade_levels(code), program:study_programs(id, code, name_th), subject:subjects(code, name_th, credits, learning_hours)")
          .eq("curriculum_version_id", versionId!).limit(5000),
        sb.from("classrooms").select("room_no, grade:grade_levels(code)"),
        sb.from("classroom_programs").select("classroom_id", { count: "exact", head: true }),
      ]);
      if (o.error) throw o.error;
      type Row = { term_no: number | null; offering_kind: string; is_active: boolean | null; grade: { code: string } | null; program: { id: string; code: string; name_th: string } | null; subject: { code: string; name_th: string; credits: number | null; learning_hours: number | null } | null };
      const offerings = (o.data as unknown as Row[]).filter((r) => r.subject && r.program && r.grade && r.is_active !== false).map((r) => ({
        programId: r.program!.id, programCode: r.program!.code, programName: r.program!.name_th, grade: r.grade!.code, term: r.term_no ?? 0,
        code: r.subject!.code, name: r.subject!.name_th, credits: r.subject!.credits, hours: r.subject!.learning_hours, kind: r.offering_kind,
      }));
      const classrooms = ((c.data ?? []) as unknown as { room_no: number; grade: { code: string } | null }[]).filter((x) => x.grade).map((x) => ({ grade: x.grade!.code, room: x.room_no }));
      return { offerings, classrooms, linked: l.count ?? 0 };
    },
  });
}

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const KIND_TONE: Record<DiffKind, string> = {
  missing_in_db: "bg-red-50 text-red-700", extra_in_db: "bg-amber-50 text-amber-800", name: "bg-orange-50 text-orange-700", name_minor: "bg-slate-100 text-slate-600",
  credits: "bg-red-50 text-red-700", hours: "bg-red-50 text-red-700", total: "bg-violet-50 text-violet-700",
};
const gradeLabel = (g: string | null) => (g ? `ม.${g.replace(/\D/g, "")}` : "-");

function csvOf(cmp: BlockCompare[]) {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["ชีต", "เซลล์", "ชั้น", "ห้องในไฟล์", "ภาค", "แผนในไฟล์", "แผนในระบบ", "ประเภท", "รหัส", "ไฟล์", "ระบบ"]];
  for (const c of cmp) {
    const b = c.block;
    for (const d of c.diffs) rows.push([b.sheet.trim(), d.cell, gradeLabel(b.grade), b.room ?? "", String(b.term), b.plan ?? "", c.programCode ?? "", DIFF_LABEL[d.kind], d.code, d.file, d.db]);
    for (const n of blockChecks(b)) rows.push([b.sheet.trim(), n.cell, gradeLabel(b.grade), b.room ?? "", String(b.term), b.plan ?? "", c.programCode ?? "", "ตรวจภายในไฟล์", "", n.text, ""]);
  }
  return "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n");
}

export function WorkbookComparePage() {
  const curricula = useCurricula();
  const versions = allVersions(curricula.data).filter((v) => v.status !== "retired");
  const [vid, setVid] = useState<string | null>(null);
  const version = versions.find((v) => v.id === vid) ?? versions[0];
  const reg = useRegistry(version?.id ?? null);
  const [file, setFile] = useState<{ name: string; hash: string; cmp: BlockCompare[]; skipped: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [hideMinor, setHideMinor] = useState(true);

  async function onFile(f: File | undefined) {
    if (!f || !reg.data) return;
    setBusy(true); setErr(null);
    try {
      const buf = await f.arrayBuffer();
      const { blocks, skipped } = parseStructureWorkbook(await readXlsx(buf));
      if (!blocks.length) throw new Error("ไม่พบตารางโครงสร้าง (ต้องมีแถว “ภาคเรียนที่ 1/2” และ “รายวิชาพื้นฐาน”)");
      setFile({ name: f.name, hash: await sha256(buf), cmp: compareBlocks(blocks, reg.data.offerings), skipped });
      setSel(0);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const counts = useMemo(() => {
    const m = new Map<DiffKind, number>();
    for (const c of file?.cmp ?? []) for (const d of c.diffs) m.set(d.kind, (m.get(d.kind) ?? 0) + 1);
    return m;
  }, [file]);
  const rooms = useMemo(() => (file && reg.data ? roomProposals(file.cmp, reg.data.classrooms) : []), [file, reg.data]);
  const cur = file?.cmp[sel];
  const checks = cur ? blockChecks(cur.block) : [];

  return (
    <>
      <PageHeader icon={GitCompareArrows} title="เทียบไฟล์โครงสร้างกับระบบ" description="เลือกไฟล์ Excel โครงสร้างหลักสูตรที่โรงเรียนยืนยัน ระบบจะอ่านในเครื่องนี้และเทียบกับทะเบียนรายวิชา — ไม่บันทึกหรือแก้ข้อมูลใด ๆ" />
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">หลักสูตรในระบบ</span>
            <select className="h-9 rounded-md border bg-background px-2" value={version?.id ?? ""} onChange={(e) => { setVid(e.target.value); setFile(null); }}>
              {versions.map((v) => <option key={v.id} value={v.id}>{v.effective_year_be} · {v.status}</option>)}
            </select>
          </label>
          <label className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground", (!reg.data || busy) && "pointer-events-none opacity-50")}>
            {busy || reg.isLoading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} เลือกไฟล์ .xlsx
            <input type="file" accept=".xlsx" className="sr-only" aria-label="เลือกไฟล์โครงสร้าง" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {file && <Button variant="outline" size="sm" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csvOf(file.cmp)], { type: "text/csv" })); a.download = `เทียบโครงสร้าง_${file.hash.slice(0, 8)}.csv`; a.click(); }}><FileDown /> ดาวน์โหลดรายงาน (CSV)</Button>}
        </div>
        {reg.error && <p className="text-sm text-red-600">{dbErrorMessage(reg.error)}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {reg.data && !reg.data.offerings.length && <p className="text-sm text-muted-foreground">ยังอ่านทะเบียนรายวิชาของหลักสูตรนี้ไม่ได้ (ไม่มีข้อมูลหรือไม่มีสิทธิ์อ่าน)</p>}

        {file && (
          <>
            <div className="rounded-xl border bg-card p-4 text-sm">
              <p><b>ไฟล์:</b> {file.name} · SHA-256 <code className="text-xs">{file.hash.slice(0, 16)}…</code> · {file.cmp.length} ตาราง{file.skipped.length ? ` · ข้ามชีต: ${file.skipped.join(", ")}` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(DIFF_LABEL) as DiffKind[]).map((k) => <span key={k} className={cn("rounded-full px-2.5 py-1 text-xs", KIND_TONE[k])}>{DIFF_LABEL[k]} {counts.get(k) ?? 0}</span>)}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <nav aria-label="ตารางในไฟล์" className="max-h-[70vh] space-y-1 overflow-auto rounded-xl border bg-card p-2">
                {file.cmp.map((c, i) => (
                  <button key={i} type="button" onClick={() => setSel(i)} className={cn("w-full rounded-lg px-3 py-2 text-left text-sm", i === sel ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                    <span className="font-medium">{gradeLabel(c.block.grade)}{c.block.room ? ` (${c.block.room})` : ""} · ภาค {c.block.term}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.block.plan ?? "-"} → {c.ambiguous ? "⚠ ต้องเลือกแผน" : c.programName}</span>
                    <span className="text-xs text-muted-foreground">ชีต “{c.block.sheet.trim()}” · ต่าง {c.diffs.filter((d) => d.kind !== "name_minor").length}</span>
                  </button>
                ))}
              </nav>
              {cur && (
                <section className="space-y-3 rounded-xl border bg-card p-4">
                  <h2 className="font-semibold">ชีต “{cur.block.sheet.trim()}” คอลัมน์ {cur.block.col} — {cur.block.title}</h2>
                  <p className="text-sm">แผนในไฟล์: <b>{cur.block.plan ?? "-"}</b> · แผนในระบบที่รายวิชาตรงมากสุด: <b>{cur.programCode ?? "-"} {cur.programName ?? ""}</b> ({Math.round(cur.score * 100)}%)
                    {cur.ambiguous && <span className="ml-1 text-amber-700">— ไม่ชัดเจน ({cur.candidates.map((x) => `${x.code} ${Math.round(x.score * 100)}%`).join(", ")}) ฝ่ายวิชาการต้องเลือก</span>}</p>
                  <p className="text-sm text-muted-foreground">ยอดรายวิชา: ไฟล์ {cur.totals.fileCredits} นก. ({cur.totals.fileHours} ชม.) · ระบบ {cur.totals.dbCredits} นก. ({cur.totals.dbHours} ชม.) · รวมเวลาเรียนที่ระบุในไฟล์ {cur.block.declared.total ?? "-"} ชม.</p>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hideMinor} onChange={(e) => setHideMinor(e.target.checked)} /> ซ่อนชื่อที่ต่างเฉพาะรูปแบบ (ช่องว่าง/วงเล็บ)</label>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-2">ประเภท</th><th className="pr-2">รหัส</th><th className="pr-2">ในไฟล์</th><th className="pr-2">ในระบบ</th><th>เซลล์</th></tr></thead>
                      <tbody>
                        {cur.diffs.filter((d) => !hideMinor || d.kind !== "name_minor").map((d, i) => (
                          <tr key={i} className="border-b align-top">
                            <td className="py-2 pr-2"><span className={cn("rounded px-1.5 py-0.5 text-xs", KIND_TONE[d.kind])}>{DIFF_LABEL[d.kind]}</span></td>
                            <td className="pr-2 font-mono">{d.code}</td><td className="pr-2">{d.file}</td><td className="pr-2">{d.db}</td>
                            <td className="font-mono text-xs">{d.cell ? `${cur.block.sheet.trim()}!${d.cell}` : "-"}</td>
                          </tr>
                        ))}
                        {!cur.diffs.length && <tr><td colSpan={5} className="py-3 text-muted-foreground">ตรงกันทุกรายวิชา</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {checks.length > 0 && (
                    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">ข้อสังเกตภายในไฟล์ (ไม่เกี่ยวกับระบบ)</p>
                      <ul className="mt-1 list-disc pl-5">{checks.map((n, i) => <li key={i}>{n.text} <code className="text-xs">{cur.block.sheet.trim()}!{n.cell}</code></li>)}</ul>
                    </div>
                  )}
                </section>
              )}
            </div>

            <section className="rounded-xl border bg-card p-4">
              <h2 className="font-semibold">ข้อเสนอผูกห้องเรียนกับแผน (ยังไม่บันทึก)</h2>
              <p className="mt-1 text-sm text-muted-foreground">ใช้เฉพาะห้องที่ไฟล์ระบุไว้ชัดเจน (แถว 2 เช่น “ชั้นมัธยมศึกษาปีที่ 1/1”) · ม.4–ม.6 ในไฟล์ไม่ระบุเลขห้อง จึงไม่เสนอ · ปัจจุบันผูกไว้ในระบบ {reg.data?.linked ?? 0} รายการ</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-2">ห้อง</th><th className="pr-2">แผนที่เสนอ</th><th className="pr-2">มีห้องในระบบ</th><th className="pr-2">สถานะ</th><th>อ้างอิง</th></tr></thead>
                  <tbody>
                    {rooms.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 pr-2">ม.{r.room}</td><td className="pr-2">{r.programCode} {r.programName}</td><td className="pr-2">{r.existsInDb ? "มี" : "ไม่มี"}</td>
                        <td className="pr-2">{r.ambiguous ? <span className="text-amber-700">ต้องให้ฝ่ายวิชาการยืนยันแผน</span> : "พร้อมเสนอ"}</td>
                        <td className="font-mono text-xs">{r.sheet.trim()}!{r.cell}</td>
                      </tr>
                    ))}
                    {!rooms.length && <tr><td colSpan={5} className="py-3 text-muted-foreground">ไฟล์ไม่ระบุเลขห้อง — แสดงเฉพาะแผนการเรียน</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
