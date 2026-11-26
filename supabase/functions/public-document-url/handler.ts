/**
 * URL เปิด PDF สาธารณะ (หน้า /visit) — ไม่ต้องเข้าสู่ระบบ
 * - ฐานข้อมูลเป็นผู้ตัดสิน: public_document_authorize() คืนไฟล์เฉพาะเอกสารที่ "อนุมัติให้เผยแพร่" (public_releases) + PDF + ไฟล์พร้อมใช้
 *   และบันทึก file_events ทุกครั้ง · ฟังก์ชันนี้ grant ให้ service_role เท่านั้น (anon เรียกตรงไม่ได้ ไม่เห็น object_key)
 * - presigned GET อายุสั้น แบบ inline (เปิดในเบราว์เซอร์) · bucket ยังเป็น private
 */
import { handle, HttpError, isUuid, readJson } from "../_shared/http.ts";
import { serviceRpc } from "../_shared/supabase.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";
import { PRESIGN_TTL_SECONDS } from "../_shared/storage/provider.ts";

export const handler = handle(async (req) => {
  const { documentId } = await readJson<{ documentId?: string }>(req);
  if (!isUuid(documentId)) throw new HttpError(400, "รหัสเอกสารไม่ถูกต้อง");
  const [f] = await serviceRpc<{ object_key: string; original_name: string; mime_type: string }[]>("public_document_authorize", { p_document_id: documentId });
  if (!f || f.mime_type !== "application/pdf") throw new HttpError(404, "ไม่พบเอกสารที่เผยแพร่");
  const url = await createStorageProvider().presignGet(f.object_key, {
    downloadName: f.original_name,
    contentType: f.mime_type,
    expiresInSeconds: PRESIGN_TTL_SECONDS,
    inline: true,
  });
  return { url, expiresInSeconds: PRESIGN_TTL_SECONDS };
});
