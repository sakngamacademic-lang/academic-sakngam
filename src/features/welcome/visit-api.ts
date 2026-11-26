/**
 * ข้อมูลหน้าเยี่ยมชม (สาธารณะ) — อ่านผ่าน RPC public_visit_data() เท่านั้น (anon ไม่มีสิทธิ์ตารางโดยตรง)
 * คืนเฉพาะ: ฉบับหลักสูตรที่ "อนุมัติเผยแพร่" + รายการจัดประเภทที่ "ยืนยันแล้ว" + เล่ม PDF ที่ "อนุมัติเผยแพร่"
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { callPublicFunction } from "@/lib/storage";
import { isMissing } from "@/features/curriculum/categories/api";
import type { Category } from "@/features/curriculum/categories/classify";

export interface PublicItem {
  category: Category; target_type: "subject" | "program" | "activity"; target_id: string;
  code: string | null; name: string; subject_type: string | null; credits: number | null; hours: number | null;
  activity_type: string | null; program_code: string | null; grade_code: string | null; program_stage: string | null;
  locator: string | null; document_id: string | null;
}
export interface PublicBook { learning_area_id: string; stage: "lower" | "upper"; document_id: string; title: string; page_count: number | null; updated_at: string }
export interface PublicVisitData {
  version: { id: string; label: string; year_be: number | null; status: string; curriculum_name: string } | null;
  items: PublicItem[];
  areas: { id: string; name: string; code: string }[];
  books: PublicBook[];
  documents: { id: string; title: string; page_count: number | null; page_offset: number | null }[];
}

export function usePublicVisit() {
  return useQuery({
    queryKey: ["public-visit"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc("public_visit_data");
      if (error) throw error;
      return data as PublicVisitData;
    },
    staleTime: 60_000,
    retry: (n, e) => !isMissing(e) && n < 2,
  });
}

/** เปิด PDF ที่อนุมัติเผยแพร่ (presigned URL อายุสั้น) ไปยังหน้าที่ระบุ */
export async function openPublicPdf(documentId: string, page?: number | null) {
  const w = window.open("about:blank", "_blank");
  try {
    const r = await callPublicFunction<{ url: string }>("public-document-url", { documentId });
    const url = page ? `${r.url}#page=${page}` : r.url;
    if (w) { w.opener = null; w.location.href = url; } else window.open(url, "_blank", "noopener");
  } catch (e) {
    w?.close();
    throw e;
  }
}
