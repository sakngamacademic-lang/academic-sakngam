import { Badge } from "@/components/ui/badge";

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? <Badge variant="success">ใช้งาน</Badge> : <Badge variant="outline">ปิดใช้งาน</Badge>;
}
