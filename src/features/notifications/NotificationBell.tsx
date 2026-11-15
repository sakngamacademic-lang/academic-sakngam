import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/AuthProvider";
import { requireSupabase } from "@/lib/supabase";
import { formatDateTH } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Notification { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

/** แจ้งเตือนของผู้ใช้ (RLS: เห็นเฉพาะของตนเอง) — สร้างจากเหตุการณ์งานในฐานข้อมูล */
export function NotificationBell() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ["notifications", session?.user.id];
  const q = useQuery({
    queryKey: key,
    enabled: Boolean(session),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("notifications").select("id, kind, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data as Notification[];
    },
  });
  const unread = q.data?.filter((n) => !n.read_at) ?? [];
  const markRead = async () => {
    if (!unread.length) return;
    await requireSupabase().from("notifications").update({ read_at: new Date().toISOString() }).in("id", unread.map((n) => n.id));
    await qc.invalidateQueries({ queryKey: key });
  };
  return (
    <>
      <Button variant="ghost" size="icon" className="relative" aria-label={`การแจ้งเตือน${unread.length ? ` ยังไม่อ่าน ${unread.length}` : ""}`} onClick={() => setOpen(true)}>
        <Bell className="size-5" />
        {unread.length > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">{unread.length > 9 ? "9+" : unread.length}</span>}
      </Button>
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) void markRead(); }}>
        <SheetContent side="right" className="w-96 max-w-[100vw] overflow-y-auto border-l bg-background p-5">
          <SheetTitle className="pr-8 text-base font-semibold">การแจ้งเตือน</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">{unread.length ? `ยังไม่อ่าน ${unread.length} รายการ` : "อ่านครบแล้ว"}</SheetDescription>
          {q.error ? <p role="alert" className="mt-4 text-sm text-destructive">โหลดการแจ้งเตือนไม่สำเร็จ</p> : !q.data?.length ? (
            <p className="mt-6 text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
          ) : (
            <ul className="mt-4 divide-y">
              {q.data.map((n) => (
                <li key={n.id} className={cn("py-3 text-sm", !n.read_at && "font-medium")}>
                  {n.link ? <Link to={n.link} onClick={() => setOpen(false)} className="hover:text-primary">{n.title}</Link> : n.title}
                  {n.body && <p className="mt-0.5 text-xs font-normal text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-xs font-normal text-muted-foreground">{formatDateTH(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
