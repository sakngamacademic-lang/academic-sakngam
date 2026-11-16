/**
 * ตัวช่วยเปิด/ดาวน์โหลดไฟล์เอกสารต้นทาง (ไม่มี dependency — ทดสอบด้วย scripts/source-file.test.ts)
 * ไฟล์อยู่ใน storage แบบ private เสมอ: เปิดผ่าน presigned URL จาก storage-download-url (ตรวจสิทธิ์ + บันทึก log ที่ฐานข้อมูล)
 */

/** แปลงช่อง "หน้า" → เลขหน้า (ว่าง = หน้า 1) หรือข้อความผิดพลาด */
export function parsePdfPage(input: string, pageCount: number | null | undefined): { page: number } | { error: string } {
  const s = input.trim();
  if (!s) return { page: 1 };
  if (!/^\d+$/.test(s) || Number(s) < 1) return { error: "เลขหน้าต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป" };
  const page = Number(s);
  if (pageCount && page > pageCount) return { error: `เอกสารนี้มี ${pageCount} หน้า` };
  return { page };
}

/** ต่อ #page=N ให้ตัวอ่าน PDF ของเบราว์เซอร์เปิดตรงหน้าที่อ้างอิง (ไม่แตะ query ที่ลงนามไว้) */
export function pdfPageUrl(url: string, page: number) {
  const base = url.split("#")[0]!;
  return page > 1 ? `${base}#page=${page}` : base;
}

export const isPdfName = (name: string | null | undefined) => /\.pdf$/i.test(name ?? "");

/** ข้อความผิดพลาดที่ผู้ใช้เข้าใจได้ */
export function fileErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/ไม่มีสิทธิ์|insufficient_privilege|permission|403/i.test(m)) return "คุณไม่มีสิทธิ์เปิดเอกสารนี้ หรือไม่พบไฟล์ — ติดต่อผู้ดูแลหลักสูตร";
  if (/ยังไม่พร้อม/.test(m)) return "ไฟล์ยังอัปโหลด/ตรวจสอบไม่เสร็จ — ลองใหม่ภายหลัง หรืออัปโหลดไฟล์ใหม่";
  if (/ไม่พบไฟล์|404/.test(m)) return "ไม่พบไฟล์ในระบบจัดเก็บ — อาจถูกลบหรือยังอัปโหลดไม่สำเร็จ";
  if (/เข้าสู่ระบบ|401|jwt/i.test(m)) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  if (/popup/i.test(m)) return "เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาต Pop-up สำหรับเว็บนี้แล้วลองอีกครั้ง";
  if (/เชื่อมต่อ/.test(m)) return m;
  return m ? `เปิดเอกสารไม่สำเร็จ: ${m}` : "เปิดเอกสารไม่สำเร็จ กรุณาลองใหม่";
}
