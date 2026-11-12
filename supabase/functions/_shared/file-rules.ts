/**
 * กติกาไฟล์ (ต้องตรงกับ private.mime_for_ext ใน migration 20261116000100)
 * ตรวจชนิดจริงจาก magic bytes — ไม่เชื่อนามสกุลหรือ Content-Type ที่ผู้ใช้ส่งมา
 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const ALLOWED: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const utf16 = (s: string) => [...s].flatMap((c) => [c.charCodeAt(0), 0]);

function includes(hay: Uint8Array, needle: number[]) {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** ระบุชนิดไฟล์จากเนื้อหา คืนนามสกุลที่ตรง หรือ null ถ้าไม่ใช่ชนิดที่อนุญาต */
export function detectKind(b: Uint8Array): { ext: string | null; reason?: string } {
  if (startsWith(b, ascii("%PDF-"))) return { ext: "pdf" };
  // OOXML = ZIP: ตรวจชื่อ entry ภายใน และไม่รับไฟล์ที่มี macro
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    if (!includes(b, ascii("[Content_Types].xml"))) return { ext: null, reason: "ไฟล์ ZIP ที่ไม่ใช่เอกสาร Office" };
    if (includes(b, ascii("vbaProject.bin"))) return { ext: null, reason: "ไม่รับไฟล์ที่มี Macro" };
    if (includes(b, ascii("word/"))) return { ext: "docx" };
    if (includes(b, ascii("xl/"))) return { ext: "xlsx" };
    return { ext: null, reason: "ไฟล์ Office ชนิดที่ไม่รองรับ" };
  }
  // OLE2 (Word 97-2003 / Excel 97-2003)
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (includes(b, utf16("_VBA_PROJECT")) || includes(b, utf16("Macros"))) return { ext: null, reason: "ไม่รับไฟล์ที่มี Macro" };
    if (includes(b, utf16("WordDocument"))) return { ext: "doc" };
    if (includes(b, utf16("Workbook")) || includes(b, utf16("Book"))) return { ext: "xls" };
    return { ext: null, reason: "ไฟล์ Office 97-2003 ชนิดที่ไม่รองรับ" };
  }
  return { ext: null, reason: "เนื้อไฟล์ไม่ตรงกับชนิดที่อนุญาต (PDF / Word / Excel)" };
}

/** ตรวจไฟล์ที่อัปโหลดแล้วเทียบกับข้อมูลที่ขอไว้ตอนเริ่มอัปโหลด */
export function verifyUpload(bytes: Uint8Array, expected: { ext: string; size: number }): { ok: true } | { ok: false; reason: string } {
  if (bytes.length !== expected.size) return { ok: false, reason: `ขนาดไฟล์ไม่ตรงกับที่แจ้ง (${bytes.length} ≠ ${expected.size})` };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "ไฟล์ใหญ่เกิน 20 MB" };
  const kind = detectKind(bytes);
  if (!kind.ext) return { ok: false, reason: kind.reason ?? "ชนิดไฟล์ไม่ถูกต้อง" };
  if (kind.ext !== expected.ext) return { ok: false, reason: `เนื้อไฟล์เป็น ${kind.ext.toUpperCase()} แต่นามสกุลเป็น .${expected.ext}` };
  return { ok: true };
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
