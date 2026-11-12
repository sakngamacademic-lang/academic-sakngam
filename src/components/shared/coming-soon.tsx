import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./page-header";

interface ComingSoonProps {
  title: string;
  phase?: string;
}

/** หน้าที่ยังไม่ได้พัฒนา — แสดงชัดเจนว่าอยู่ใน Phase ใด แทนการแสดงข้อมูลปลอม */
export function ComingSoon({ title, phase }: ComingSoonProps) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
          <Construction className="size-7" />
        </div>
        <h2 className="text-lg font-semibold">อยู่ระหว่างการพัฒนา</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          หน้านี้จะเปิดใช้งานใน {phase ?? "ระยะถัดไป"} ตามแผนพัฒนาระบบ
        </p>
      </Card>
    </>
  );
}
