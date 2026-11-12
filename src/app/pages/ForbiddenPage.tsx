import { Link } from "react-router-dom";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { defaultPortalPath } from "@/features/auth/roles";

/** 403 — ใช้ทั้งในและนอก layout ของ portal */
export function ForbiddenPage() {
  const { roles, signOut } = useAuth();
  const home = defaultPortalPath(roles);
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="size-7" />
      </div>
      <p className="text-4xl font-semibold text-destructive">403</p>
      <h1 className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        บทบาทของคุณไม่ได้รับอนุญาตให้ใช้งานส่วนนี้ หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อฝ่ายวิชาการหรือผู้ดูแลระบบ
      </p>
      <div className="mt-2 flex gap-2">
        {home ? (
          <Button asChild>
            <Link to={home}>กลับหน้าหลักของฉัน</Link>
          </Button>
        ) : (
          <Button onClick={() => void signOut()}>ออกจากระบบ</Button>
        )}
      </div>
    </div>
  );
}
