import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Globe, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { callRpc, useMdMutation } from "@/features/master-data/api";
import { requireSupabase } from "@/lib/supabase";
import { allVersions, useCurricula, useSourceDocuments } from "../api";
import { isMissing } from "../categories/api";

/**
 * อนุมัติให้เผยแพร่ (หน้าเยี่ยมชม /visit) — แยกจากการยืนยันความถูกต้องของข้อมูล
 * เฉพาะผู้ดูแลหลักสูตร (academic_head) · RPC public_release_publish / public_release_withdraw ตรวจสิทธิ์ซ้ำที่ฐานข้อมูล · Audit Log ทุกครั้ง
 * เล่มกลุ่มสาระ: ผู้ดูแลเลือกกลุ่มสาระและระดับ (ม.ต้น/ม.ปลาย) เอง — ระบบไม่เดาจากชื่อไฟล์ · 1 เล่มต่อกลุ่มสาระต่อระดับ
 */
interface Release { id: string; target_type: "curriculum_version" | "source_document"; target_id: string; learning_area_id: string | null; book_stage: "lower" | "upper" | null; status: string; published_at: string; note: string | null }
const key = ["public-releases"] as const;
const STAGE = { lower: "ม.ต้น (ม.1–3)", upper: "ม.ปลาย (ม.4–6)" } as const;
const sel = "h-9 w-full rounded-lg border bg-background px-2 text-sm";

export function PublishPage() {
  const { can } = useAuth();
  const canManage = can("curriculum.manage");
  const releases = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("public_releases").select("id, target_type, target_id, learning_area_id, book_stage, status, published_at, note").eq("status", "published").order("published_at", { ascending: false });
      if (error) throw error;
      return data as Release[];
    },
    retry: (n, e) => !isMissing(e) && n < 2,
  });
  const areas = useQuery({
    queryKey: ["master-data", "learning-areas", "publish"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("learning_areas").select("id, name_th, sort_order").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data as { id: string; name_th: string }[];
    },
  });
  const curricula = useCurricula();
  const docs = useSourceDocuments();
  const versions = allVersions(curricula.data).filter((v) => v.status !== "retired");
  const pdfDocs = (docs.data ?? []).filter((d) => d.file_id && d.status !== "archived" && d.doc_type !== "structure_workbook");
  const publish = useMdMutation((a: { type: string; id: string; area?: string | null; stage?: string | null }) =>
    callRpc("public_release_publish", { p_target_type: a.type, p_target_id: a.id, p_learning_area_id: a.area ?? null, p_book_stage: a.stage ?? null }), { success: "อนุมัติเผยแพร่แล้ว", invalidate: [key] });
  const withdraw = useMdMutation((a: { id: string; reason: string }) => callRpc("public_release_withdraw", { p_id: a.id, p_reason: a.reason }), { success: "ถอนการเผยแพร่แล้ว", invalidate: [key] });

  const [ver, setVer] = useState("");
  const [doc, setDoc] = useState("");
  const [area, setArea] = useState("");
  const [stage, setStage] = useState("");

  if (releases.isError && isMissing(releases.error)) {
    return <><PageHeader title="อนุมัติเผยแพร่ (หน้าเยี่ยมชม)" icon={Globe} /><p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">ฐานข้อมูลนี้ยังไม่ได้ติดตั้ง migration <code>20261208000100_public_visit_releases</code> — ผู้ดูแลระบบต้องรันใน SQL Editor ก่อน</p></>;
  }
  const rel = releases.data ?? [];
  const docTitle = (id: string) => { const d = docs.data?.find((x) => x.id === id); return d ? `${d.register_code} ${d.title}` : id; };
  const verTitle = (id: string) => { const v = versions.find((x) => x.id === id); return v ? `${v.curriculum_name} ${v.version_label}` : id; };
  const areaName = (id: string | null) => areas.data?.find((a) => a.id === id)?.name_th ?? "";
  const askWithdraw = (id: string) => { const r = window.prompt("เหตุผลที่ถอนการเผยแพร่"); if (r && r.trim()) withdraw.mutate({ id, reason: r.trim() }); };

  return (
    <>
      <PageHeader title="อนุมัติเผยแพร่ (หน้าเยี่ยมชม)" description="เลือกข้อมูลที่บุคคลภายนอกและคณะกรรมการเห็นได้โดยไม่ต้องเข้าสู่ระบบ — แยกจากการยืนยันความถูกต้อง" icon={Globe}
        actions={<Button asChild variant="outline" size="sm"><Link to="/visit" target="_blank" rel="noopener"><ExternalLink /> เปิดหน้าเยี่ยมชม</Link></Button>} />
      <div className="space-y-4">
        <section className="rounded-2xl border bg-card p-4 shadow-card">
          <h2 className="font-semibold">ที่เผยแพร่อยู่ ({rel.length})</h2>
          {releases.isPending ? <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> กำลังโหลด…</p> : !rel.length ? <p className="mt-2 text-sm text-muted-foreground">ยังไม่มีรายการที่เผยแพร่</p> : (
            <ul className="mt-2 divide-y text-sm">
              {rel.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    {r.target_type === "curriculum_version" ? <>ฉบับหลักสูตร: {verTitle(r.target_id)}</> : <>PDF: {docTitle(r.target_id)}</>}
                    {r.learning_area_id && <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs">{areaName(r.learning_area_id)} · {r.book_stage ? STAGE[r.book_stage] : ""}</span>}
                    <span className="block text-xs text-muted-foreground">เผยแพร่ {new Date(r.published_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </span>
                  {canManage && <Button size="sm" variant="ghost" disabled={withdraw.isPending} onClick={() => askWithdraw(r.id)}>ถอนการเผยแพร่</Button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4 shadow-card">
              <h2 className="font-semibold">เผยแพร่ฉบับหลักสูตร</h2>
              <p className="text-xs text-muted-foreground">หน้าเยี่ยมชมแสดงเฉพาะรายการจัดประเภทที่ “ยืนยันแล้ว” ของฉบับนี้</p>
              <label className="mt-3 block text-sm">ฉบับหลักสูตร
                <select className={sel} value={ver} onChange={(e) => setVer(e.target.value)}>
                  <option value="">— เลือก —</option>
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.curriculum_name} {v.version_label} ({v.status})</option>)}
                </select>
              </label>
              <Button className="mt-3" size="sm" disabled={!ver || publish.isPending} onClick={() => publish.mutate({ type: "curriculum_version", id: ver }, { onSuccess: () => setVer("") })}>อนุมัติเผยแพร่</Button>
            </section>
            <section className="rounded-2xl border bg-card p-4 shadow-card">
              <h2 className="font-semibold">เผยแพร่เอกสาร PDF / เล่มกลุ่มสาระ</h2>
              <p className="text-xs text-muted-foreground">เผยแพร่ได้เฉพาะ PDF ที่อัปโหลดในระบบแล้ว · ถ้าเป็นเล่มกลุ่มสาระ ให้เลือกกลุ่มสาระและระดับเอง</p>
              <label className="mt-3 block text-sm">เอกสาร
                <select className={sel} value={doc} onChange={(e) => setDoc(e.target.value)}>
                  <option value="">— เลือก —</option>
                  {pdfDocs.map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}{d.page_count ? ` (${d.page_count} หน้า)` : ""}</option>)}
                </select>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block text-sm">กลุ่มสาระ (ถ้าเป็นเล่ม)
                  <select className={sel} value={area} onChange={(e) => setArea(e.target.value)}>
                    <option value="">— ไม่ใช่เล่มกลุ่มสาระ —</option>
                    {(areas.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name_th}</option>)}
                  </select>
                </label>
                <label className="block text-sm">ระดับ
                  <select className={sel} value={stage} onChange={(e) => setStage(e.target.value)} disabled={!area}>
                    <option value="">— เลือก —</option>
                    <option value="lower">{STAGE.lower}</option>
                    <option value="upper">{STAGE.upper}</option>
                  </select>
                </label>
              </div>
              <Button className="mt-3" size="sm" disabled={!doc || (!!area && !stage) || publish.isPending}
                onClick={() => publish.mutate({ type: "source_document", id: doc, area: area || null, stage: area ? stage : null }, { onSuccess: () => { setDoc(""); setArea(""); setStage(""); } })}>อนุมัติเผยแพร่</Button>
            </section>
          </div>
        ) : <p className="text-sm text-muted-foreground">เฉพาะผู้ดูแลหลักสูตรอนุมัติหรือถอนการเผยแพร่ได้</p>}
      </div>
    </>
  );
}
