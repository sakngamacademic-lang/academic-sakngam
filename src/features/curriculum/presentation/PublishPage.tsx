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
import { QrSheet } from "./QrSheet";

/**
 * อนุมัติให้เผยแพร่ (หน้าเยี่ยมชม /visit) — แยกจากการยืนยันความถูกต้องของข้อมูล
 * เฉพาะผู้ดูแลหลักสูตร (academic_head) · RPC public_release_publish / public_release_withdraw ตรวจสิทธิ์ซ้ำที่ฐานข้อมูล · Audit Log ทุกครั้ง
 * เล่มกลุ่มสาระ: ผู้ดูแลเลือกกลุ่มสาระและระดับ (ม.ต้น/ม.ปลาย) เอง — ระบบไม่เดาจากชื่อไฟล์ · 1 เล่มต่อกลุ่มสาระต่อระดับ
 */
interface Release { id: string; target_type: "curriculum_version" | "source_document"; target_id: string; learning_area_id: string | null; book_stage: "lower" | "upper" | null; status: string; published_at: string; note: string | null }
const key = ["public-releases"] as const;
const STAGE = { lower: "ม.ต้น (ม.1–3)", upper: "ม.ปลาย (ม.4–6)" } as const;

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
  const withdraw = useMdMutation((a: { id: string; reason: string }) => callRpc("public_release_withdraw", { p_id: a.id, p_reason: a.reason }), { success: "ถอนการเผยแพร่แล้ว", invalidate: [key] });


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
      <PageHeader title="อนุมัติเผยแพร่ (หน้าเยี่ยมชม)" description="รายการเล่มที่บุคคลภายนอกและคณะกรรมการเห็นได้โดยไม่ต้องเข้าสู่ระบบ · ถอนการเผยแพร่ได้ที่นี่" icon={Globe}
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

        <QrSheet />
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          เผยแพร่เล่มหลักสูตรได้ที่ <Link to="/office/curriculum-v2/present" className="font-medium text-primary hover:underline">นำเสนอเล่มหลักสูตร</Link> → “จัดการเล่ม / แนบไฟล์” → ปุ่ม “เผยแพร่” ข้างไฟล์ (แยก ม.ต้น / ม.ปลาย)
        </p>
      </div>
    </>
  );
}
