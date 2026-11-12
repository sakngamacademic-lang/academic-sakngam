import { GraduationCap } from "lucide-react";

export function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <GraduationCap className="size-5" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">โรงเรียนสักงามวิทยา</p>
        <p className="truncate text-xs text-sidebar-muted">{subtitle}</p>
      </div>
    </div>
  );
}
