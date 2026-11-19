import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft } from "lucide-react";
import { DataTable, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { requireSupabase } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/db-errors";
import { curriculumKey, DOC_TYPE_LABELS, type SourceDocument } from "../api";
import { isMissing } from "../categories/api";
import { SourceFileActions } from "./ImportsPage";

/** เอกสารต้นทางที่เก็บเข้าคลัง (status = archived) + ประวัติการเก็บเข้าคลัง/ลบ (เฉพาะผู้ดูแลหลักสูตร) — อ่านอย่างเดียว */
type ArchivedDoc = SourceDocument & { archived_at: string | null; archive_reason: string | null };
interface DocEvent { id: number; register_code: string; title: string; event: string; reason: string; detail: Record<string, unknown>; created_at: string }
const EVENT_LABEL: Record<string, string> = { archived: "เก็บเข้าคลัง", archive_rejected: "เก็บเข้าคลังไม่สำเร็จ", deleted: "ลบรายการทะเบียน", delete_rejected: "ปฏิเสธการลบ" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function SourceArchivePage() {
  const { can } = useAuth();
  const canManage = can("curriculum.manage");
  const docs = useQuery({
    queryKey: [...curriculumKey, "sources", "archived"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("source_documents").select("*").eq("status", "archived").order("register_code");
      if (error) throw error;
      return data as ArchivedDoc[];
    },
  });
  const events = useQuery({
    queryKey: [...curriculumKey, "source-events"], enabled: canManage,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("source_document_events").select("id, register_code, title, event, reason, detail, created_at").order("created_at", { ascending: false }).limit(200);
      if (error) { if (isMissing(error)) return null; throw error; }
      return data as DocEvent[];
    },
  });
  return (
    <>
      <PageHeader icon={Archive} title="เอกสารที่เก็บเข้าคลัง" description="เอกสารที่เลิกใช้งานแล้ว — ไม่แสดงในทะเบียนใช้งานปกติ แต่หลักฐานและความสัมพันธ์เดิมยังอยู่ครบ"
        actions={<Button asChild variant="outline" size="sm"><Link to="/office/curriculum/imports"><ArrowLeft /> กลับทะเบียนเอกสาร</Link></Button>} />
      <DataTable<ArchivedDoc>
        caption="เอกสารที่เก็บเข้าคลัง"
        rows={docs.data}
        loading={docs.isPending}
        error={docs.error ? dbErrorMessage(docs.error) : null}
        emptyText="ยังไม่มีเอกสารที่เก็บเข้าคลัง"
        rowKey={(d) => d.id}
        columns={[
          { key: "code", header: "รหัส", cell: (d) => <code className="text-xs">{d.register_code}</code>, className: "w-28" },
          { key: "title", header: "เอกสาร", cell: (d) => <span><span className="font-medium">{d.title}</span><span className="block text-xs text-muted-foreground">{DOC_TYPE_LABELS[d.doc_type]}</span></span> },
          { key: "when", header: "เก็บเข้าคลังเมื่อ", cell: (d) => fmt(d.archived_at) },
          { key: "reason", header: "เหตุผล", cell: (d) => d.archive_reason ?? "—" },
          { key: "file", header: "ไฟล์", cell: (d) => (d.file_id ? <SourceFileActions doc={d} /> : <span className="text-xs text-muted-foreground">—</span>), className: "w-[19rem]" },
        ]}
      />
      {canManage && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">ประวัติการเก็บเข้าคลังและการลบ</h2>
          {events.data === null ? (
            <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">ฐานข้อมูลนี้ยังไม่ได้ติดตั้งบันทึกเหตุการณ์ (migration 20261206000100)</p>
          ) : (
            <DataTable<DocEvent>
              caption="ประวัติการเก็บเข้าคลังและการลบ"
              rows={events.data}
              loading={events.isPending}
              error={events.error ? dbErrorMessage(events.error) : null}
              emptyText="ยังไม่มีเหตุการณ์"
              rowKey={(e) => String(e.id)}
              columns={[
                { key: "t", header: "เวลา", cell: (e) => fmt(e.created_at), className: "w-44" },
                { key: "c", header: "รหัส", cell: (e) => <code className="text-xs">{e.register_code}</code>, className: "w-28" },
                { key: "e", header: "ผล", cell: (e) => EVENT_LABEL[e.event] ?? e.event },
                { key: "r", header: "เหตุผล", cell: (e) => e.reason },
              ]}
            />
          )}
        </section>
      )}
    </>
  );
}
