/**
 * Storage Adapter — interface กลางของผู้ให้บริการจัดเก็บไฟล์
 * Edge Functions เรียกผ่าน interface นี้เท่านั้น เพื่อสลับ R2 / S3 / ผู้ให้บริการอื่นได้โดยไม่แก้ business logic
 */
export interface PresignPutOptions {
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
}

export interface PresignGetOptions {
  downloadName: string;
  contentType: string;
  expiresInSeconds: number;
}

export interface ObjectHead {
  size: number;
  contentType: string | null;
}

export interface StorageProvider {
  /** ชื่อผู้ให้บริการที่บันทึกลง files.storage_provider */
  readonly name: string;
  readonly bucket: string;
  presignPut(key: string, opts: PresignPutOptions): Promise<string>;
  presignGet(key: string, opts: PresignGetOptions): Promise<string>;
  head(key: string): Promise<ObjectHead | null>;
  /** อ่านทั้ง object (ใช้ตรวจ magic bytes และคำนวณ sha256 — จำกัดขนาดโดยผู้เรียก) */
  getBytes(key: string): Promise<Uint8Array<ArrayBuffer>>;
  delete(key: string): Promise<void>;
}

export const PRESIGN_TTL_SECONDS = 300; // 5 นาที
