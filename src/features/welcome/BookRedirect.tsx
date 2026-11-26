import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { callPublicFunction } from "@/lib/storage";

/**
 * ปลายทางของ QR Code: /b/<documentId> → ขอ URL PDF อายุสั้นจาก public-document-url แล้วเปลี่ยนหน้าไปที่ PDF ทันที
 * ฐานข้อมูลตรวจทุกครั้งว่าเล่มยัง "อนุมัติเผยแพร่" อยู่ — ถอนการเผยแพร่แล้ว QR เดิมจะเปิดไม่ได้
 * ใช้ location.replace เพื่อไม่ให้หน้านี้ค้างในประวัติ (กดย้อนกลับไม่วนมาที่หน้าโหลด)
 */
export function BookRedirect() {
  const { docId } = useParams();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    callPublicFunction<{ url: string }>("public-document-url", { documentId: docId })
      .then((r) => { if (!cancelled) window.location.replace(r.url); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "เปิดเล่มไม่สำเร็จ"); });
    return () => { cancelled = true; };
  }, [docId]);
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-center">
      {error ? (
        <div className="space-y-3">
          <p className="font-semibold">เปิดเล่มหลักสูตรไม่ได้</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link to="/visit" className="text-sm text-primary underline">ดูเล่มทั้งหมดที่หน้าเยี่ยมชม</Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" aria-hidden="true" /> กำลังเปิดเล่มหลักสูตร…</p>
      )}
    </main>
  );
}

export default BookRedirect;
