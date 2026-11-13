/** ส่งออกข้อมูลที่แสดงอยู่ (ฝั่ง client) — CSV UTF-8 พร้อม BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง */
export function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // กันสูตร (CSV injection) เมื่อเปิดใน Excel
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
}

export function downloadCsv(fileName: string, rows: Record<string, string | number | null | undefined>[]) {
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
