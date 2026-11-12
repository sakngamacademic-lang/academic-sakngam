import { useState } from "react";
import { PageHeader, TableToolbar } from "@/components/shared";
import { DashSection, LiveBadge } from "@/components/dashboard";
import { Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { matchesSearch } from "@/features/master-data/use-crud-state";
import { dbErrorMessage } from "@/lib/db-errors";
import { CATEGORY_LABELS, useDocuments } from "../api";
import { DocumentFiles } from "./DocumentFiles";

/** เอกสารของครู (ฝ่ายวิชาการ) — RLS: หัวหน้า/เจ้าหน้าที่เห็นทั้งโรงเรียน, หัวหน้ากลุ่มสาระเห็นเฉพาะกลุ่มสาระตน */
export function TeacherDocumentsPage() {
  const { roles } = useAuth();
  const docs = useDocuments();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const rows = docs.data?.filter(
    (d) =>
      (!category || d.category === category) &&
      matchesSearch(search, d.title, d.teacher?.teacher_code, d.teacher?.first_name, d.teacher?.last_name),
  );

  return (
    <>
      <PageHeader title="เอกสารของครู" description="ดาวน์โหลดและล็อกเอกสารเป็นหลักฐาน — ระบบมอบหมายและตรวจรับเต็มรูปแบบจะเปิดใน Phase 1.8–1.10" />
      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหาชื่อเอกสารหรือครู">
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="กรองตามประเภท" className="sm:w-56">
          <option value="">ทุกประเภท</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </TableToolbar>
      <DashSection id="teacher-documents" title={<span className="flex items-center gap-2">รายการเอกสาร <LiveBadge /></span>} meta={rows ? `${rows.length} เอกสาร` : undefined}>
        {docs.isPending ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : docs.error ? (
          <p role="alert" className="text-sm text-destructive">{dbErrorMessage(docs.error)}</p>
        ) : !rows?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบเอกสาร</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((d) => (
              <li key={d.id} className="rounded-xl border p-3 sm:p-4" data-testid="document">
                <p className="font-medium">{d.title}</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {d.teacher ? `${d.teacher.prefix}${d.teacher.first_name} ${d.teacher.last_name} (${d.teacher.teacher_code})` : "–"} ·{" "}
                  {CATEGORY_LABELS[d.category] ?? d.category}
                </p>
                <DocumentFiles files={d.files.filter((f) => f.status !== "pending")} canDelete={roles.includes("academic_head")} canLock />
              </li>
            ))}
          </ul>
        )}
      </DashSection>
    </>
  );
}
