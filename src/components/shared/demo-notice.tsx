import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** ป้ายระบุว่าเป็นข้อมูลจำลอง — ต้องแสดงทุกหน้าที่ใช้ demo data */
export function DemoNotice() {
  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm"
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" />
      <p>
        <strong className="font-semibold">ข้อมูลตัวอย่าง (Demo)</strong> — ตัวเลข รายชื่อ และงานในหน้านี้เป็นข้อมูลจำลองเพื่อแสดงหน้าจอเท่านั้น
        ไม่ใช่ข้อมูลจริงของโรงเรียน
      </p>
    </div>
  );
}

export function DemoBadge() {
  return (
    <Badge variant="warning" title="ข้อมูลจำลอง">
      Demo
    </Badge>
  );
}
