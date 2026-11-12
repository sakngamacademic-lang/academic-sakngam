import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <h1 className="text-lg font-semibold">ไม่พบหน้าที่ต้องการ</h1>
      <p className="text-sm text-muted-foreground">ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายแล้ว</p>
      <Button asChild className="mt-2">
        <Link to="/">กลับหน้าแรก</Link>
      </Button>
    </div>
  );
}
