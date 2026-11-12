/**
 * Storage Adapter ฝั่ง client — หน้าจอเรียกผ่าน interface นี้เท่านั้น
 * ไม่มี credential ของ R2 ใน browser: ทุกคำขอผ่าน Edge Function ที่ตรวจสิทธิ์ แล้วได้ presigned URL อายุ 5 นาที
 * ไฟล์ส่งตรงจาก browser → storage (ไม่ผ่าน Edge Function) แล้วยืนยันด้วย storage-confirm-upload
 */
import { env } from "@/lib/env";
import { requireSupabase } from "@/lib/supabase";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const ACCEPT_ATTR = Object.keys(ACCEPTED).map((e) => "." + e).join(",");

export class StorageError extends Error {}

export interface UploadTarget {
  documentId?: string;
  /** แนบเป็นแม่แบบของภาระงาน */
  taskId?: string;
  title?: string;
  category?: string;
}

export interface DocumentStorage {
  upload(file: File, target: UploadTarget, onStage?: (s: "requesting" | "uploading" | "verifying") => void): Promise<{ fileId: string; documentId: string; version: number }>;
  downloadUrl(fileId: string): Promise<{ url: string; fileName: string }>;
  /** ดาวน์โหลดด้วย presigned URL อายุ 5 นาที */
  download(fileId: string): Promise<void>;
  remove(fileId: string): Promise<void>;
}

const functionsBase = () => env.VITE_FUNCTIONS_URL || `${env.VITE_SUPABASE_URL}/functions/v1`;

async function call<T>(name: string, body: unknown): Promise<T> {
  const { data } = await requireSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new StorageError("กรุณาเข้าสู่ระบบ");
  let res: Response;
  try {
    res = await fetch(`${functionsBase()}/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: env.VITE_SUPABASE_ANON_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new StorageError("ไม่สามารถเชื่อมต่อระบบจัดเก็บไฟล์ได้");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new StorageError(json.error ?? "คำขอไม่สำเร็จ");
  return json as T;
}

/** ตรวจเบื้องต้นฝั่ง client (ฝั่ง server ตรวจซ้ำเสมอ รวม magic bytes) */
export function precheck(file: File): { ext: string; mime: string } {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const mime = ACCEPTED[ext];
  if (!mime) throw new StorageError("รองรับเฉพาะไฟล์ PDF, Word (.doc/.docx) และ Excel (.xls/.xlsx)");
  if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new StorageError("ขนาดไฟล์ต้องไม่เกิน 20 MB");
  return { ext, mime };
}

export const edgeFunctionStorage: DocumentStorage = {
  async upload(file, target, onStage) {
    const { mime } = precheck(file);
    onStage?.("requesting");
    const t = await call<{ fileId: string; documentId: string; version: number; uploadUrl: string; headers: Record<string, string> }>(
      "storage-upload-url",
      { documentId: target.documentId ?? null, taskId: target.taskId ?? null, title: target.title, category: target.category, fileName: file.name, mimeType: mime, size: file.size },
    );
    onStage?.("uploading");
    const put = await fetch(t.uploadUrl, { method: "PUT", headers: t.headers, body: file }).catch(() => null);
    if (!put?.ok) throw new StorageError("อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    onStage?.("verifying");
    await call("storage-confirm-upload", { fileId: t.fileId });
    return { fileId: t.fileId, documentId: t.documentId, version: t.version };
  },
  async downloadUrl(fileId) {
    return call<{ url: string; fileName: string }>("storage-download-url", { fileId });
  },
  async download(fileId) {
    // ดาวน์โหลดตรงจาก storage ด้วย presigned URL (Content-Disposition: attachment + ชื่อไฟล์ UTF-8)
    const { url } = await this.downloadUrl(fileId);
    window.location.assign(url);
  },
  async remove(fileId) {
    await call("storage-delete", { fileId });
  },
};
