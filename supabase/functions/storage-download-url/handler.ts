/** ขอ URL ดาวน์โหลด: ฐานข้อมูลตรวจสิทธิ์และบันทึก file_events ก่อน → presigned GET 5 นาที (attachment; inline ได้เฉพาะ PDF เพื่อเปิดตรงหน้า) */
import { handle, HttpError, isUuid, readJson } from "../_shared/http.ts";
import { requireUser, userRpc } from "../_shared/supabase.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";
import { PRESIGN_TTL_SECONDS } from "../_shared/storage/provider.ts";

export const handler = handle(async (req) => {
  const caller = await requireUser(req);
  const { fileId, inline } = await readJson<{ fileId?: string; inline?: boolean }>(req);
  if (!isUuid(fileId)) throw new HttpError(400, "รหัสไฟล์ไม่ถูกต้อง");
  const [f] = await userRpc<{ object_key: string; original_name: string; mime_type: string }[]>(caller, "storage_authorize_download", {
    p_file_id: fileId,
  });
  if (!f) throw new HttpError(404, "ไม่พบไฟล์");
  const url = await createStorageProvider().presignGet(f.object_key, {
    downloadName: f.original_name,
    contentType: f.mime_type,
    expiresInSeconds: PRESIGN_TTL_SECONDS,
    inline: inline === true && f.mime_type === "application/pdf",
  });
  return { url, fileName: f.original_name, expiresInSeconds: PRESIGN_TTL_SECONDS };
});
