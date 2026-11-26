/**
 * เล่มนำเสนอหลักสูตรแบบถาวร — ที่เก็บหลัก: Supabase (presentation_items → source_documents → files) + Cloudflare R2 (ตัวไฟล์ · bucket private)
 * เปิดจากเครื่อง/ลิงก์ใดก็เห็นชุดเดียวกัน · Deploy ใหม่ไม่กระทบ · สิทธิ์บังคับที่ฐานข้อมูล (RPC presentation_item_*)
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { callFunction, edgeFunctionStorage, StorageError } from "@/lib/storage";
import { isMissing } from "@/features/curriculum/categories/api";
import { pdfPageCount } from "./PdfPages";
import type { PlanMeta } from "./plans";

export type Stage = "lower" | "upper";
export type ItemKind = "school_book" | "area_book" | "lesson_plan";
export const STAGES: Stage[] = ["lower", "upper"];
export const STAGE_SHORT: Record<Stage, string> = { lower: "ม.ต้น", upper: "ม.ปลาย" };
export const STAGE_TEXT: Record<Stage, string> = { lower: "ม.ต้น (ม.1–ม.3)", upper: "ม.ปลาย (ม.4–ม.6)" };

export interface LibDoc { id: string; title: string; page_count: number | null; file_id: string | null; register_code: string }
export interface LibItem { id: string; kind: ItemKind; learning_area_id: string | null; stage: Stage | null; title: string; meta: PlanMeta | null; created_at: string; doc: LibDoc; published: boolean }
export interface LibArea { id: string; name_th: string }
export interface Library { installed: boolean; areas: LibArea[]; items: LibItem[] }
export const libKey = ["presentation-library"] as const;

export function useLibrary() {
  return useQuery({
    queryKey: libKey,
    queryFn: async (): Promise<Library> => {
      const sb = requireSupabase();
      const areas = await sb.from("learning_areas").select("id, name_th, sort_order").eq("is_active", true).order("sort_order");
      if (areas.error) throw areas.error;
      const rows = await sb.from("presentation_items").select("id, kind, learning_area_id, stage, title, meta, created_at, source_document_id").eq("status", "active").order("created_at");
      if (rows.error) {
        if (isMissing(rows.error)) return { installed: false, areas: areas.data as LibArea[], items: [] };
        throw rows.error;
      }
      const raw = rows.data as (Omit<LibItem, "doc" | "published"> & { source_document_id: string })[];
      const ids = [...new Set(raw.map((r) => r.source_document_id))];
      const docs = ids.length ? await sb.from("source_documents").select("id, title, page_count, file_id, register_code").in("id", ids) : { data: [], error: null };
      if (docs.error) throw docs.error;
      const rel = ids.length ? await sb.from("public_releases").select("target_id").eq("status", "published").eq("target_type", "source_document").in("target_id", ids) : { data: [], error: null };
      const published = new Set(((rel.error ? [] : rel.data) as { target_id: string }[]).map((r) => r.target_id));
      const docOf = new Map((docs.data as LibDoc[]).map((d) => [d.id, d]));
      return {
        installed: true, areas: areas.data as LibArea[],
        items: raw.filter((r) => docOf.has(r.source_document_id)).map(({ source_document_id, ...r }) => ({ ...r, doc: docOf.get(source_document_id)!, published: published.has(source_document_id) })),
      };
    },
    retry: (n, e) => !isMissing(e) && n < 2,
  });
}

export interface Target { kind: ItemKind; areaId: string | null; stage: Stage | null; title: string; meta?: PlanMeta | null; replace?: boolean }
const rpcAttach = async (t: Target, extra: Record<string, unknown>) => {
  const { data, error } = await requireSupabase().rpc("presentation_item_attach", {
    p_kind: t.kind, p_learning_area_id: t.areaId, p_stage: t.stage, p_title: t.title, p_meta: t.meta ?? null, p_replace: t.replace ?? false, ...extra,
  });
  if (error) throw error;
  return data as string;
};
/** อัปโหลดไฟล์ขึ้น R2 (ผ่าน Edge Function เดิม) แล้วบันทึกตำแหน่งในฐานข้อมูล */
export async function attachFile(blob: Blob, name: string, t: Target) {
  const file = blob instanceof File && blob.name === name ? blob : new File([blob], name, { type: "application/pdf" });
  const pages = await pdfPageCount(blob).catch(() => null);
  const up = await edgeFunctionStorage.upload(file, { curriculumSource: true });
  return rpcAttach(t, { p_file_id: up.fileId, p_page_count: pages });
}
/** ผูกเอกสาร PDF ที่อยู่ในระบบอยู่แล้ว (ไม่อัปโหลดซ้ำ) */
export const attachExisting = (docId: string, t: Target) => rpcAttach(t, { p_source_document_id: docId });
export async function removeItem(id: string, reason: string) {
  const { error } = await requireSupabase().rpc("presentation_item_remove", { p_id: id, p_reason: reason });
  if (error) throw error;
}
export async function publishItem(i: LibItem) {
  const { error } = await requireSupabase().rpc("public_release_publish", { p_target_type: "source_document", p_target_id: i.doc.id, p_learning_area_id: i.kind === "area_book" ? i.learning_area_id : null, p_book_stage: i.kind === "area_book" ? i.stage : null });
  if (error) throw error.code === "23505" ? new Error("มีเล่มของกลุ่มสาระและระดับนี้เผยแพร่อยู่แล้ว — ถอนของเดิมที่เมนู “อนุมัติเผยแพร่” ก่อน") : error;
}

const signed = (fileId: string) => callFunction<{ url: string }>("storage-download-url", { fileId, inline: true });
const blobs = new Map<string, Promise<Blob>>();
/** ดาวน์โหลดไฟล์จาก R2 ด้วย presigned URL อายุสั้น (จำไว้ในหน่วยความจำระหว่างเปิดหน้า) */
export function fetchBlob(fileId: string): Promise<Blob> {
  let p = blobs.get(fileId);
  if (!p) {
    p = signed(fileId).then(async ({ url }) => {
      const res = await fetch(url).catch(() => null);
      if (!res?.ok) throw new StorageError("ดาวน์โหลดไฟล์ไม่สำเร็จ — ถ้าเปิดจากลิงก์ทดสอบ (Preview) โดเมนนี้อาจยังไม่ได้รับอนุญาตในที่เก็บไฟล์ ให้ใช้ลิงก์หลักของระบบ");
      return res.blob();
    });
    blobs.set(fileId, p);
    p.catch(() => blobs.delete(fileId));
  }
  return p;
}
export async function openInTab(fileId: string) {
  const w = window.open("about:blank", "_blank");
  try { const { url } = await signed(fileId); if (w) { w.opener = null; w.location.href = url; } else window.open(url, "_blank", "noopener"); }
  catch (e) { w?.close(); throw e; }
}
/** เทียบชื่อกลุ่มสาระแบบไม่สนช่องว่าง/คำว่า “และ” — ใช้จับคู่ปุ่มเดิมกับกลุ่มสาระในระบบ (ไม่พบ = ให้ผู้ใช้เลือกเอง) */
export const normArea = (s: string) => s.replace(/\s+/g, "").replace(/และ/g, "");
