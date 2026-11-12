/** ตรวจไฟล์ที่อัปโหลดไม่สำเร็จ (ตั้งเวลาเรียกด้วย cron + STORAGE_CRON_SECRET หรือ service_role เท่านั้น) */
import { handle } from "../_shared/http.ts";
import { requireServiceCall, serviceRpc } from "../_shared/supabase.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";

export const handler = handle(async (req) => {
  requireServiceCall(req);
  const stale = await serviceRpc<{ file_id: string; object_key: string }[]>("storage_expire_stale_uploads", {});
  const storage = createStorageProvider();
  let removed = 0;
  for (const s of stale) {
    // อาจมี object ที่อัปโหลดค้างไว้แต่ไม่ได้ยืนยัน — ลบทิ้ง
    if (await storage.head(s.object_key)) {
      await storage.delete(s.object_key);
      removed++;
    }
  }
  return { expired: stale.length, objectsRemoved: removed };
});
