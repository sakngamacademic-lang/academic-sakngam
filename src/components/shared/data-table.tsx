import type { ReactNode } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** ซ่อนบนมือถือ (มุมมองการ์ด) */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  actions?: (row: T) => ReactNode;
  caption: string;
  rowClassName?: (row: T) => string | undefined;
}

/**
 * ตารางข้อมูลแบบ responsive
 * - md ขึ้นไป: ตารางปกติ
 * - มือถือ: รายการการ์ด (หัวคอลัมน์แสดงเป็น label)
 */
export function DataTable<T>({ rows, columns, rowKey, loading, error, emptyText, actions, caption, rowClassName }: DataTableProps<T>) {
  if (loading) {
    return (
      <Card className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" /> กำลังโหลดข้อมูล…
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="py-12 text-center text-sm text-destructive" role="alert">
        {error}
      </Card>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
        <Inbox className="size-8" />
        {emptyText ?? "ไม่พบข้อมูล"}
      </Card>
    );
  }
  return (
    <>
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 font-medium", c.className)}>
                  {c.header}
                </th>
              ))}
              {actions && <th scope="col" className="px-4 py-3 text-right font-medium">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={cn("border-b last:border-0 hover:bg-muted/30", rowClassName?.(row))}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
                {actions && <td className="px-4 py-2 text-right whitespace-nowrap">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <Card className={cn("p-4", rowClassName?.(row))}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {columns
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-muted-foreground">{c.header}</dt>
                      <dd className="min-w-0 text-right">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
              {actions && <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">{actions(row)}</div>}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
