/** ลบไฟล์ตามสิทธิ์: ฐานข้อมูลตรวจสิทธิ์ + ห้ามลบไฟล์ที่ล็อกเป็นหลักฐาน → ลบ object ใน storage */
import { handle, HttpError, isUuid, readJson } from "../_shared/http.ts";
import { requireUser, userRpc } from "../_shared/supabase.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";

export const handler = handle(async (req) => {
  const caller = await requireUser(req);
  const { fileId } = await readJson<{ fileId?: string }>(req);
  if (!isUuid(fileId)) throw new HttpError(400, "รหัสไฟล์ไม่ถูกต้อง");
  const objectKey = await userRpc<string>(caller, "storage_delete_file", { p_file_id: fileId });
  // ถ้าลบใน storage ไม่สำเร็จ งาน storage-cleanup จะไม่ย้อนสถานะ — object กำพร้าตรวจพบได้จาก files.status = 'deleted'
  await createStorageProvider().delete(objectKey);
  return { fileId, status: "deleted" };
});
