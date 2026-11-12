import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/form-controls";

/** แถบค้นหา + ตัวกรอง (เรียงซ้อนบนมือถือ) */
export function TableToolbar({
  search,
  onSearch,
  placeholder = "ค้นหา…",
  children,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label="ค้นหา"
          className="pl-9"
        />
      </div>
      {children}
    </div>
  );
}
