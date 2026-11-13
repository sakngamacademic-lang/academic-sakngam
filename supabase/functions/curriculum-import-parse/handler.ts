/** อ่านไฟล์ต้นฉบับของชุดนำเข้า → แถว staging (ยังไม่เข้าข้อมูลหลัก) */
import { handle, HttpError, isUuid, readJson } from "../_shared/http.ts";
import { requireUser, serviceRpc, userRpc } from "../_shared/supabase.ts";
import { createStorageProvider } from "../_shared/storage/index.ts";
import { parsePdf, parseXlsx, type XlsxMapping } from "../_shared/curriculum-parse.ts";

interface Target {
  batch_id: string;
  kind: string;
  file_ext: string;
  object_key: string;
  column_mapping: Record<string, unknown> | null;
  doc_type: string;
  page_count: number | null;
}

export const handler = handle(async (req) => {
  const caller = await requireUser(req);
  const { batchId } = await readJson<{ batchId?: string }>(req);
  if (!isUuid(batchId)) throw new HttpError(400, "รหัสชุดนำเข้าไม่ถูกต้อง");
  // ฐานข้อมูลตรวจสิทธิ์ (ผู้ใช้ที่เป็นคน + ขอบเขต) และสถานะชุด
  const [t] = await userRpc<Target[]>(caller, "curriculum_import_parse_target", { p_batch_id: batchId });
  if (!t) throw new HttpError(404, "ไม่พบชุดนำเข้า");
  const bytes = await createStorageProvider().getBytes(t.object_key);

  let rows;
  let parser: string;
  try {
    if (t.file_ext === "xlsx") {
      rows = await parseXlsx(bytes, (t.column_mapping ?? {}) as unknown as XlsxMapping);
      parser = "exceljs@4.4.0";
    } else if (t.file_ext === "pdf") {
      const r = await parsePdf(bytes, (t.column_mapping ?? null) as { pages?: string } | null);
      if (t.page_count && r.pageCount !== t.page_count) {
        throw new HttpError(422, `จำนวนหน้า PDF (${r.pageCount}) ไม่ตรงกับทะเบียนเอกสาร (${t.page_count})`);
      }
      rows = r.rows;
      parser = "unpdf@0.12.1";
    } else {
      throw new HttpError(422, "ไฟล์ .xls (รุ่นเก่า) ยังไม่รองรับการอ่านอัตโนมัติ — กรุณาบันทึกเป็น .xlsx หรือกรอกแถวด้วยมือพร้อมอ้างเซลล์");
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
  }
  const stored = await serviceRpc<number>("curriculum_import_store_rows", {
    p_batch_id: t.batch_id,
    p_actor: caller.id,
    p_parser: parser,
    p_rows: rows,
  });
  return { batchId: t.batch_id, rows: stored, parser };
});
