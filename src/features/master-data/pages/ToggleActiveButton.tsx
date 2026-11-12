import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ToggleActiveButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} aria-label={`${active ? "ปิดใช้งาน" : "เปิดใช้งาน"} ${label}`}>
      {active ? <PowerOff /> : <Power />} {active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
    </Button>
  );
}
