import { LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { ROLE_LABELS } from "@/features/auth/roles";

function formatTime(epochSeconds?: number) {
  if (!epochSeconds) return "";
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(epochSeconds * 1000));
}

/** ข้อมูลผู้ใช้ บทบาท สถานะเซสชัน และปุ่มออกจากระบบ (อยู่ท้าย sidebar) */
export function UserPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { access, roles, session, signOut } = useAuth();
  if (!access) return null;
  const name = access.display_name || access.email || "ผู้ใช้";

  return (
    <div className="rounded-xl bg-white/[0.07] p-3" title={`เซสชันใช้งานอยู่ · ต่ออายุอัตโนมัติ (รอบถัดไป ${formatTime(session?.expires_at)})`}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--navy-800)]" aria-hidden="true">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white" data-testid="user-name">{name}</p>
          <p className="truncate text-xs text-sidebar-muted">{access.school?.name_th}</p>
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1" aria-label="บทบาทของฉัน" data-testid="user-roles">
        {roles.map((r) => (
          <li key={r} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-sidebar-foreground">
            {ROLE_LABELS[r]}
          </li>
        ))}
      </ul>
      <p className="sr-only">เซสชันใช้งานอยู่ ต่ออายุอัตโนมัติ</p>
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          void signOut();
        }}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
      >
        <LogOut className="size-4" /> ออกจากระบบ
      </button>
    </div>
  );
}
