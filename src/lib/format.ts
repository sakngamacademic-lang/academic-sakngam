/** การแสดงผลวันที่/ตัวเลขแบบไทย (ปีพุทธศักราช) — แปลงที่ UI จุดเดียว ข้อมูลเก็บเป็น ค.ศ. */
const dateFormatter = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateLongFormatter = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const numberFormatter = new Intl.NumberFormat("th-TH");

export const formatDateTH = (d: Date | string) => dateFormatter.format(new Date(d));
export const formatDateLongTH = (d: Date | string) => dateLongFormatter.format(new Date(d));
export const formatNumberTH = (n: number) => numberFormatter.format(n);

/** จำนวนวันจากวันนี้ถึงวันที่กำหนด (ติดลบ = เลยกำหนด) */
export function daysUntil(d: Date | string, from: Date = new Date()): number {
  const ms = new Date(d).setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}
