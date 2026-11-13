/** ขอ URL สำหรับอัปโหลด: ตรวจผู้ใช้ → ฐานข้อมูลตรวจสิทธิ์/ชนิด/ขนาด และสร้าง object key → ออก presigned PUT 5 นาที */
import { handle, HttpError, isUuid, readJson } from "../_shared/http.ts";
import { requireUser, userRpc } from "../_shared/supabase.ts";
import { ALLOWED, MAX_FILE_BYTES, MAX_SOURCE_BYTES } from "../_shared/file-rules.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";
import { PRESIGN_TTL_SECONDS } from "../_shared/storage/provider.ts";

interface Body {
  documentId?: string | null;
  /** แนบแม่แบบให้ภาระงาน (Phase 1.7) — ผู้จัดการงานเท่านั้น */
  taskId?: string | null;
  /** เอกสารต้นทางหลักสูตร (C1.1) — ฝ่ายวิชาการเท่านั้น, PDF/Excel ≤ 100 MB */
  curriculumSource?: boolean;
  title?: string;
  category?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}
interface Begin {
  file_id: string;
  document_id: string;
  version: number;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  expires_at: string;
}

export const handler = handle(async (req) => {
  const caller = await requireUser(req);
  const b = await readJson<Body>(req);
  if (b.documentId != null && !isUuid(b.documentId)) throw new HttpError(400, "รหัสเอกสารไม่ถูกต้อง");
  if (b.taskId != null && !isUuid(b.taskId)) throw new HttpError(400, "รหัสงานไม่ถูกต้อง");
  if (typeof b.fileName !== "string" || typeof b.mimeType !== "string" || !Number.isInteger(b.size)) {
    throw new HttpError(400, "กรุณาระบุชื่อไฟล์ ชนิด และขนาด");
  }
  if (!Object.values(ALLOWED).includes(b.mimeType)) throw new HttpError(400, "รองรับเฉพาะไฟล์ PDF, Word และ Excel");
  const maxBytes = b.curriculumSource ? MAX_SOURCE_BYTES : MAX_FILE_BYTES;
  if (b.size! < 1 || b.size! > maxBytes) throw new HttpError(400, `ขนาดไฟล์ต้องไม่เกิน ${maxBytes / 1024 / 1024} MB`);
  if (!b.curriculumSource && b.taskId == null && b.documentId == null && !b.title?.trim()) throw new HttpError(400, "กรุณาระบุชื่อเอกสาร");

  // ฐานข้อมูลตรวจสิทธิ์และสร้าง object key — เอกสารของครู หรือแม่แบบของงาน
  const [row] = b.curriculumSource
    ? await userRpc<Begin[]>(caller, "storage_begin_curriculum_source_upload", {
        p_original_name: b.fileName,
        p_mime_type: b.mimeType,
        p_size_bytes: b.size,
      })
    : b.taskId
    ? await userRpc<Begin[]>(caller, "storage_begin_template_upload", {
        p_task_id: b.taskId,
        p_original_name: b.fileName,
        p_mime_type: b.mimeType,
        p_size_bytes: b.size,
      })
    : await userRpc<Begin[]>(caller, "storage_begin_upload", {
        p_document_id: b.documentId ?? null,
        p_title: b.title ?? null,
        p_category: b.category ?? "general",
        p_original_name: b.fileName,
        p_mime_type: b.mimeType,
        p_size_bytes: b.size,
      });
  if (!row) throw new Error("storage_begin_upload returned nothing");

  const storage = createStorageProvider();
  const uploadUrl = await storage.presignPut(row.object_key, {
    contentType: row.mime_type,
    contentLength: row.size_bytes,
    expiresInSeconds: PRESIGN_TTL_SECONDS,
  });
  // ไม่ส่ง object key กลับไปให้ client — client อ้างอิงด้วย fileId เท่านั้น
  return {
    fileId: row.file_id,
    documentId: row.document_id,
    version: row.version,
    uploadUrl,
    method: "PUT",
    headers: { "Content-Type": row.mime_type },
    expiresInSeconds: PRESIGN_TTL_SECONDS,
  };
});
