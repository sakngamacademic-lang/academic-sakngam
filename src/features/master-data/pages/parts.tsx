import { Eye, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import type { AcademicYear } from "../types";

export function FormActions({ onCancel, busy, label = "บันทึก" }: { onCancel: () => void; busy: boolean; label?: string }) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
        ยกเลิก
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Save />} {label}
      </Button>
    </div>
  );
}

export function ReadOnlyNotice({ text = "คุณมีสิทธิ์ดูข้อมูลอย่างเดียว" }: { text?: string }) {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground" role="note">
      <Eye className="size-4" /> {text}
    </p>
  );
}

export function YearFilter({
  years,
  value,
  onChange,
  includeAll = false,
}: {
  years: AcademicYear[] | undefined;
  value: string;
  onChange: (v: string) => void;
  includeAll?: boolean;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="กรองตามปีการศึกษา" className="sm:w-48">
      {includeAll && <option value="">ทุกปีการศึกษา</option>}
      {years?.map((y) => (
        <option key={y.id} value={y.id}>
          ปีการศึกษา {y.year_be}
          {y.is_current ? " (ปัจจุบัน)" : ""}
        </option>
      ))}
    </Select>
  );
}

export function StatusFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="กรองตามสถานะ" className="sm:w-40">
      <option value="">ทุกสถานะ</option>
      <option value="active">ใช้งาน</option>
      <option value="inactive">ปิดใช้งาน</option>
    </Select>
  );
}

export const statusMatches = (filter: string, active: boolean) =>
  filter === "" || (filter === "active" ? active : !active);
