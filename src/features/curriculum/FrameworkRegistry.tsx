import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { callRpc } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { requireSupabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { curriculumKey, useFrameworkVersions, useSourceDocuments } from "./api";
import { EmptyState, Notice } from "./components";

/**
 * ทะเบียนมาตรฐานและตัวชี้วัด (Phase 2.1/2.3)
 * กรอบหลักสูตร → ฉบับ → กลุ่มสาระ → สาระ → มาตรฐาน → ระดับชั้น → ตัวชี้วัด · สมรรถนะ/คุณลักษณะ · ความครบถ้วน (ไม่แสดง % ถ้ายังไม่ยืนยันว่าครบ)
 * ข้อมูลทุกชิ้นมาจากรายการที่ผู้ดูแลตรวจแล้ว (ระบบวิเคราะห์เอกสาร) และแสดงแหล่งอ้างอิง
 */
interface Std { id: string; code: string; statement_th: string; source_citation: string; strand: { code: string; name_th: string } | null; area: { code: string; name_th: string } | null;
  indicators: { id: string; full_code: string; code: string; statement_th: string; stage_kind: "interim" | "final" | "unspecified"; source_citation: string; grade: { code: string; level_order: number } | null }[] }
interface Competency { id: string; kind: string; code: string; name_th: string; description_th: string | null; source_citation: string }
interface CompletenessRow { area_code: string; area_name: string; grade_code: string | null; standards: number; indicators: number; interim: number; final: number; unspecified: number; version_status: string; is_complete: boolean }

const STAGE: Record<string, string> = { interim: "ระหว่างทาง", final: "ปลายทาง", unspecified: "เอกสารไม่ระบุชนิด" };
const KIND: Record<string, string> = { key_competency: "สมรรถนะสำคัญของผู้เรียน", desired_characteristic: "คุณลักษณะอันพึงประสงค์", reading_thinking_writing: "การอ่าน คิดวิเคราะห์ และเขียน" };

function useFrameworkTree(fvId: string | undefined) {
  return useQuery({
    queryKey: [...curriculumKey, "framework-tree", fvId],
    enabled: !!fvId,
    queryFn: async () => {
      const sb = requireSupabase();
      const [s, c, r] = await Promise.all([
        sb.from("learning_standards").select("id, code, statement_th, source_citation, strand:framework_strands(code, name_th), area:framework_learning_areas(code, name_th), indicators(id, full_code, code, statement_th, stage_kind, source_citation, grade:framework_grade_levels(code, level_order))")
          .eq("framework_version_id", fvId!).order("code"),
        sb.from("framework_competencies").select("id, kind, code, name_th, description_th, source_citation").eq("framework_version_id", fvId!).order("kind").order("code"),
        callRpc<CompletenessRow[]>("framework_completeness", { p_framework_version_id: fvId }),
      ]);
      if (s.error) throw s.error;
      if (c.error) throw c.error;
      return { standards: s.data as unknown as Std[], competencies: c.data as Competency[], completeness: r ?? [] };
    },
  });
}

export function FrameworkRegistry() {
  const versions = useFrameworkVersions();
  const [fvId, setFvId] = useState("");
  const id = fvId || versions.data?.[0]?.id;
  const fv = versions.data?.find((v) => v.id === id);
  const tree = useFrameworkTree(id);
  const [area, setArea] = useState("");
  const [grade, setGrade] = useState("");
  const [q, setQ] = useState("");

  if (versions.isPending) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (!versions.data?.length) {
    return <EmptyState title="ยังไม่มีกรอบหลักสูตรแกนกลางในระบบ">อัปโหลดเอกสารหลักสูตรแกนกลาง/มาตรฐานและตัวชี้วัด แล้วตรวจรับรองที่เมนู “วิเคราะห์เอกสาร (อัตโนมัติ)” ก่อนบันทึกเข้าทะเบียน</EmptyState>;
  }
  const stds = (tree.data?.standards ?? []).filter((s) => !area || s.area?.code === area);
  const areas = [...new Map((tree.data?.standards ?? []).map((s) => [s.area?.code, s.area?.name_th])).entries()].filter(([c]) => c);
  const grades = [...new Set((tree.data?.standards ?? []).flatMap((s) => s.indicators.map((i) => i.grade?.code)).filter(Boolean))] as string[];
  const match = (t: string) => !q.trim() || t.includes(q.trim());
  const byStrand = new Map<string, Std[]>();
  for (const s of stds) {
    const k = `${s.area?.code ?? "?"}|${s.strand ? `สาระที่ ${s.strand.code} ${s.strand.name_th === `สาระที่ ${s.strand.code}` ? "" : s.strand.name_th}` : "ไม่ระบุสาระ"}`;
    byStrand.set(k, [...(byStrand.get(k) ?? []), s]);
  }
  const totals = (tree.data?.completeness ?? []).reduce((a, r) => ({ ind: a.ind + r.indicators, un: a.un + r.unspecified }), { ind: 0, un: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="ฉบับกรอบหลักสูตร" htmlFor="fv">
          <Select id="fv" value={id ?? ""} onChange={(e) => setFvId(e.target.value)}>
            {versions.data.map((v) => <option key={v.id} value={v.id}>{v.framework?.name_th} · {v.version_label}</option>)}
          </Select>
        </FormField>
        <FormField label="กลุ่มสาระ" htmlFor="fa">
          <Select id="fa" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">ทั้งหมด</option>
            {areas.map(([c, n]) => <option key={c} value={c!}>{n}</option>)}
          </Select>
        </FormField>
        <FormField label="ระดับชั้น" htmlFor="fg">
          <Select id="fg" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">ทั้งหมด</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </FormField>
        <FormField label="ค้นหารหัสหรือข้อความ" htmlFor="fq"><Input id="fq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เช่น ว 1.1 หรือ ม.1/2" /></FormField>
      </div>

      {fv && (
        <Notice tone={fv.status === "published" && fv.is_complete ? "info" : "warning"}>
          {fv.status === "published" ? "ฉบับนี้ผู้ดูแลยืนยันแล้ว" : "ฉบับนี้ยังเป็นร่าง (ยังไม่ยืนยัน)"} ·{" "}
          {fv.is_complete ? "ยืนยันว่าชุดตัวชี้วัดครบตามเอกสาร" : "ยังไม่ยืนยันว่าชุดตัวชี้วัดครบ — ระบบจึงไม่คำนวณเปอร์เซ็นต์ความครอบคลุม"}
        </Notice>
      )}

      <section aria-label="ความครบถ้วน" className="rounded-xl border p-3 text-sm">
        <p className="font-medium">ความครบถ้วนของข้อมูลที่บันทึกแล้ว</p>
        <p className="text-xs text-muted-foreground">ตัวชี้วัด {totals.ind} ข้อ · ไม่ระบุชนิดระหว่างทาง/ปลายทาง {totals.un} ข้อ (ตามที่เอกสารพิมพ์)</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {[...new Map((tree.data?.completeness ?? []).map((r) => [r.area_code, r])).values()].map((a) => (
            <li key={a.area_code} className="rounded-lg bg-muted/40 p-2">
              <b>{a.area_name}</b> · มาตรฐาน {a.standards}
              <span className="block text-xs text-muted-foreground">
                {(tree.data?.completeness ?? []).filter((r) => r.area_code === a.area_code && r.grade_code).map((r) => `${r.grade_code} ${r.indicators}`).join(" · ") || "ยังไม่มีตัวชี้วัด"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {tree.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : tree.error ? <p role="alert" className="text-sm text-destructive">{dbErrorMessage(tree.error)}</p> : (
        <div className="space-y-2" data-testid="framework-tree">
          {[...byStrand.entries()].map(([k, list]) => (
            <details key={k} className="rounded-xl border p-3" open={byStrand.size <= 3}>
              <summary className="cursor-pointer font-medium">{areas.find(([c]) => c === k.split("|")[0])?.[1] ?? k.split("|")[0]} — {k.split("|")[1]} <span className="text-xs text-muted-foreground">({list.length} มาตรฐาน)</span></summary>
              {list.map((s) => {
                const inds = s.indicators.filter((i) => (!grade || i.grade?.code === grade) && (match(i.full_code) || match(i.statement_th))).sort((a, b) => (a.grade?.level_order ?? 0) - (b.grade?.level_order ?? 0) || Number(a.code) - Number(b.code));
                if (!match(s.code) && !match(s.statement_th) && !inds.length) return null;
                return (
                  <div key={s.id} className="mt-3 border-t pt-2 text-sm">
                    <p><b>มาตรฐาน {s.code}</b> {s.statement_th}</p>
                    <p className="text-xs text-muted-foreground">อ้างอิง: {s.source_citation}</p>
                    <ul className="mt-1 space-y-1">
                      {inds.map((i) => (
                        <li key={i.id} className="rounded-lg bg-muted/30 p-2">
                          <code className="text-xs">{i.full_code}</code> <Badge variant={i.stage_kind === "unspecified" ? "outline" : "secondary"}>{STAGE[i.stage_kind]}</Badge>
                          <span className="block">{i.statement_th}</span>
                          <span className="text-xs text-muted-foreground">อ้างอิง: {i.source_citation}</span>
                        </li>
                      ))}
                      {!inds.length && <li className="text-xs text-muted-foreground">ไม่มีตัวชี้วัดตามตัวกรอง</li>}
                    </ul>
                  </div>
                );
              })}
            </details>
          ))}
          {!byStrand.size && <EmptyState title="ยังไม่มีมาตรฐานในฉบับนี้" />}
        </div>
      )}

      <Competencies fvId={id} published={fv?.status === "published"} list={tree.data?.competencies ?? []} />
    </div>
  );
}

function Competencies({ fvId, published, list }: { fvId?: string; published: boolean; list: Competency[] }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const docs = useSourceDocuments();
  const [busy, setBusy] = useState(false);
  return (
    <section aria-label="สมรรถนะและคุณลักษณะ" className="rounded-xl border p-3 text-sm">
      <p className="font-medium">สมรรถนะสำคัญ · คุณลักษณะอันพึงประสงค์ · การอ่าน คิดวิเคราะห์ และเขียน</p>
      {!list.length && <p className="text-xs text-muted-foreground">ยังไม่มีข้อมูล — ผู้ดูแลหลักสูตรบันทึกจากเอกสารหลักสูตรแกนกลางพร้อมหน้าอ้างอิง</p>}
      {Object.keys(KIND).map((k) => list.some((c) => c.kind === k) && (
        <div key={k} className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">{KIND[k]}</p>
          <ul className="list-disc pl-5">{list.filter((c) => c.kind === k).map((c) => <li key={c.id}>{c.code}. {c.name_th} <span className="text-xs text-muted-foreground">({c.source_citation})</span></li>)}</ul>
        </div>
      ))}
      {can("curriculum.manage") && fvId && !published && (
        <form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const g = (k: string) => String(f.get(k) ?? "").trim();
          setBusy(true);
          try {
            await callRpc("framework_competency_add", { p_framework_version_id: fvId, p_kind: g("kind"), p_code: g("code"), p_name_th: g("name"), p_description_th: g("desc") || null, p_source_document_id: g("doc"), p_locator: g("loc") });
            toast.success("บันทึกแล้ว");
            (e.target as HTMLFormElement).reset();
            await qc.invalidateQueries({ queryKey: curriculumKey });
          } catch (err) {
            toast.error(dbErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}>
          <FormField label="ประเภท" htmlFor="ck"><Select id="ck" name="kind">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
          <FormField label="ลำดับ/รหัสตามเอกสาร" htmlFor="cc"><Input id="cc" name="code" required maxLength={20} /></FormField>
          <FormField label="ชื่อตามเอกสาร" htmlFor="cn"><Input id="cn" name="name" required maxLength={300} /></FormField>
          <FormField label="เอกสารอ้างอิง" htmlFor="cd"><Select id="cd" name="doc" required>{(docs.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}</Select></FormField>
          <FormField label="หน้า" htmlFor="cl" hint="เช่น pdf:6"><Input id="cl" name="loc" required pattern="pdf:[1-9][0-9]*" /></FormField>
          <FormField label="คำอธิบาย (ถ้ามี)" htmlFor="cx"><Input id="cx" name="desc" maxLength={4000} /></FormField>
          <div className="sm:col-span-3"><Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} บันทึกตามเอกสาร</Button></div>
        </form>
      )}
    </section>
  );
}
