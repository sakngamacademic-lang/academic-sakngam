/** ยืนยันการอัปโหลด: อ่านไฟล์จาก storage → ตรวจขนาด + magic bytes + sha256 → บันทึกผล (service_role) */
import { handle, HttpError, isUuid, readJson } from "../_shared/http.ts";
import { requireUser, serviceRpc, userRpc } from "../_shared/supabase.ts";
import { MAX_SOURCE_BYTES, sha256Hex, verifyUpload } from "../_shared/file-rules.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";

interface Pending {
  file_id: string;
  object_key: string;
  file_ext: string;
  mime_type: string;
  size_bytes: number;
}

export const handler = handle(async (req) => {
  const caller = await requireUser(req);
  const { fileId } = await readJson<{ fileId?: string }>(req);
  if (!isUuid(fileId)) throw new HttpError(400, "รหัสไฟล์ไม่ถูกต้อง");

  // ฐานข้อมูลยืนยันว่าเป็นผู้อัปโหลดเองและไฟล์ยังรอยืนยันอยู่
  const [p] = await userRpc<Pending[]>(caller, "storage_pending_upload", { p_file_id: fileId });
  if (!p) throw new HttpError(404, "ไม่พบไฟล์ที่รอยืนยัน หรือหมดเวลาแล้ว");

  const storage = createStorageProvider();
  const head = await storage.head(p.object_key);
  if (!head) throw new HttpError(409, "ยังไม่พบไฟล์ในที่จัดเก็บ กรุณาอัปโหลดก่อนยืนยัน");

  let result: { ok: true } | { ok: false; reason: string };
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  // ขนาดต้องเท่ากับที่ฐานข้อมูลอนุญาตตอนเริ่ม (เพดานรายชนิดบังคับใน RPC แล้ว)
  if (head.size > MAX_SOURCE_BYTES || head.size !== p.size_bytes) {
    result = { ok: false, reason: `ขนาดไฟล์ไม่ตรงกับที่แจ้ง (${head.size} ≠ ${p.size_bytes})` };
  } else {
    bytes = await storage.getBytes(p.object_key);
    result = verifyUpload(bytes, { ext: p.file_ext, size: p.size_bytes });
  }
  const sha = result.ok && bytes ? await sha256Hex(bytes) : null;

  const status = await serviceRpc<string>("storage_complete_upload", {
    p_file_id: p.file_id,
    p_actor: caller.id,
    p_ok: result.ok,
    p_actual_size: head.size,
    p_sha256: sha,
    p_provider: storage.name,
    p_reason: result.ok ? null : result.reason,
  });
  // ไฟล์ที่ไม่ผ่านการตรวจ: ลบออกจาก storage ทันที (metadata ยังเก็บไว้เป็นหลักฐาน)
  if (!result.ok) {
    await storage.delete(p.object_key);
    throw new HttpError(422, `ไฟล์ไม่ผ่านการตรวจสอบ: ${result.reason}`);
  }
  return { fileId: p.file_id, status, sha256: sha, size: head.size };
});
