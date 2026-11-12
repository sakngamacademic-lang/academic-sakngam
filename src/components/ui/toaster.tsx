import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { dismissToast, useToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

const tone = {
  success: { icon: CheckCircle2, cls: "border-success/40 text-success" },
  error: { icon: XCircle, cls: "border-destructive/40 text-destructive" },
  info: { icon: Info, cls: "border-info/40 text-info" },
};

export function Toaster() {
  const toasts = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((t) => {
        const T = tone[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg", T.cls)}
          >
            <T.icon className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1 text-foreground">{t.message}</p>
            <button onClick={() => dismissToast(t.id)} aria-label="ปิดการแจ้งเตือน" className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
