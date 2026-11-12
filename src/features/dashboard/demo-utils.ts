/** สร้างวันที่สัมพัทธ์กับวันนี้ เพื่อให้ข้อมูลจำลองดูเป็นปัจจุบันเสมอ (ใช้กับ Demo เท่านั้น) */
export function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
