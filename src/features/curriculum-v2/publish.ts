/**
 * ส่งเล่มจากหน้านำเสนอ (ไฟล์ในเบราว์เซอร์) ขึ้นระบบ แล้วอนุมัติเผยแพร่บนหน้าเยี่ยมชม (/visit)
 * ใช้ระบบเดิมทั้งหมด: อัปโหลดผ่าน storage-upload-url (bucket private) → ลงทะเบียน source_documents → public_release_publish
 * สิทธิ์บังคับที่ฐานข้อมูล (ผู้ดูแลหลักสูตรเท่านั้น) · กลุ่มสาระจับคู่จากชื่อในตาราง learning_areas — ไม่พบ = หยุดและแจ้ง ไม่เดา
 */
import { requireSupabase } from "@/lib/supabase";
import { edgeFunctionStorage } from "@/lib/storage";
import { pdfPageCount } from "./PdfPages";
import type { Stage } from "./books";

const norm = (s: string) => s.replace(/\s+/g, "").replace(/และ/g, "");
export const STAGE_TEXT: Record<Stage, string> = { lower: "ม.ต้น (ม.1–ม.3)", upper: "ม.ปลาย (ม.4–ม.6)" };

async function findArea(title: string) {
  const { data, error } = await requireSupabase().from("learning_areas").select("id, name_th").eq("is_active", true);
  if (error) throw error;
  const hit = (data as { id: string; name_th: string }[]).find((a) => norm(a.name_th) === norm(title));
  if (!hit) throw new Error(`ไม่พบกลุ่มสาระ “${title}” ในข้อมูลพื้นฐานของโรงเรียน — ตรวจชื่อปุ่มให้ตรงกับชื่อกลุ่มสาระในระบบ`);
  return hit.id;
}

/** อัปโหลด + ลงทะเบียน (ครั้งเดียว) แล้วเผยแพร่ · คืน docId เพื่อไม่อัปโหลดซ้ำเมื่อกดอีกครั้ง */
export async function publishBookFile(a: { blob: Blob; name: string; bookTitle: string; subject: boolean; stage?: Stage; docId?: string }, onDocId: (id: string) => void) {
  if (a.subject && !a.stage) throw new Error("เลือกระดับ (ม.ต้น / ม.ปลาย) ของไฟล์นี้ก่อนเผยแพร่");
  const sb = requireSupabase();
  const areaId = a.subject ? await findArea(a.bookTitle) : null;
  let docId = a.docId;
  if (!docId) {
    const file = new File([a.blob], a.name, { type: "application/pdf" });
    const pages = await pdfPageCount(a.blob).catch(() => null);
    const up = await edgeFunctionStorage.upload(file, { curriculumSource: true });
    const title = a.subject ? `${a.bookTitle} ${a.stage === "lower" ? "ม.ต้น" : "ม.ปลาย"}` : a.bookTitle;
    const { data, error } = await sb.from("source_documents").insert({
      title, doc_type: a.subject ? "learning_area_curriculum" : "curriculum_book", content_status: "has_content",
      learning_area_id: areaId, grade_scope: a.subject ? (a.stage === "lower" ? "ม.1-3" : "ม.4-6") : null,
      page_count: pages, file_id: up.fileId, sha256: up.sha256, notes: `ส่งจากหน้านำเสนอเล่ม · ไฟล์ ${a.name}`,
    }).select("id").single();
    if (error) throw error;
    docId = (data as { id: string }).id;
    onDocId(docId);
  }
  const { error } = await sb.rpc("public_release_publish", { p_target_type: "source_document", p_target_id: docId, p_learning_area_id: areaId, p_book_stage: a.subject ? a.stage : null });
  if (error) {
    if (error.code === "23505") throw new Error(`มีเล่มของ${a.subject ? ` ${a.bookTitle} ${a.stage === "lower" ? "ม.ต้น" : "ม.ปลาย"}` : "นี้"} เผยแพร่อยู่แล้ว — ถอนของเดิมที่เมนู “อนุมัติเผยแพร่ (หน้าเยี่ยมชม)” ก่อน`);
    throw error;
  }
  return docId;
}
