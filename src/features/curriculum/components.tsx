import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, FileSearch, Info, Loader2 } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import { callFunction } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { allVersions, PAGE_SIZE, useCurricula, useSourceDocuments, VERSION_STATUS_LABELS, type SourceDocument, type VersionStatus } from "./api";

const TABS = [
  { to: "/office/curriculum", label: "ภาพรวม", end: true },
  { to: "/office/curriculum/versions", label: "ฉบับหลักสูตร" },
  { to: "/office/curriculum/programs", label: "แผนการเรียน" },
  { to: "/office/curriculum/subjects", label: "รายวิชา" },
  { to: "/office/curriculum/structure", label: "โครงสร้าง" },
  { to: "/office/curriculum/indicators", label: "ตัวชี้วัด & Mapping" },
  { to: "/office/curriculum/imports", label: "แหล่งข้อมูล & นำเข้า" },
  { to: "/office/curriculum/conflicts", label: "ข้อขัดแย้ง" },
  { to: "/office/curriculum/reports", label: "รายงาน" },
  { to: "/office/curriculum/review", label: "ตรวจรายแถว" },
];

/** แถบเมนูย่อยของระบบหลักสูตร */
export function CurriculumNav() {
  return (
    <nav aria-label="เมนูหลักสูตร" className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1 max-sm:[mask-image:linear-gradient(90deg,#000_88%,transparent)]">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
              isActive ? "border-primary/60 bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

const STATUS_VARIANT: Record<VersionStatus, BadgeProps["variant"]> = {
  draft: "secondary",
  under_review: "warning",
  approved: "info",
  active: "success",
  retired: "outline",
};
export const VersionBadge = ({ status }: { status: VersionStatus }) => <Badge variant={STATUS_VARIANT[status]}>{VERSION_STATUS_LABELS[status]}</Badge>;

/** เลือกหลักสูตร + ฉบับ (เก็บใน URL ?v= เพื่อแชร์/ย้อนกลับได้) */
export function useSelectedVersion() {
  const [params, setParams] = useSearchParams();
  const curricula = useCurricula();
  const versions = allVersions(curricula.data);
  const id = params.get("v") ?? "";
  const selected = versions.find((v) => v.id === id) ?? null;
  // ค่าเริ่มต้น: ฉบับที่ใช้งานอยู่ → อนุมัติ → ฉบับแรก
  useEffect(() => {
    if (!id && versions.length) {
      const pick = versions.find((v) => v.status === "active") ?? versions.find((v) => v.status === "approved") ?? versions[0]!;
      setParams((p) => {
        p.set("v", pick.id);
        return p;
      }, { replace: true });
    }
  }, [id, versions, setParams]);
  const select = (v: string) =>
    setParams((p) => {
      p.set("v", v);
      p.delete("page");
      return p;
    });
  return { versions, selected, select, loading: curricula.isPending, error: curricula.error };
}

export function VersionPicker({ value, onChange, versions }: { value: string; onChange: (v: string) => void; versions: ReturnType<typeof allVersions> }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="เลือกหลักสูตรและฉบับ" className="sm:w-80">
      {versions.length === 0 && <option value="">ยังไม่มีหลักสูตร</option>}
      {versions.map((v) => (
        <option key={v.id} value={v.id}>
          {v.curriculum_name} · {v.version_label} ({VERSION_STATUS_LABELS[v.status]})
        </option>
      ))}
    </Select>
  );
}

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} จาก {total}
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="หน้าก่อนหน้า"><ChevronLeft /></Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="หน้าถัดไป"><ChevronRight /></Button>
      </div>
    </div>
  );
}

/** แสดงที่มา เช่น pdf:4;book:3 → "PDF หน้า 4 (หน้าเล่ม 3)" */
export function formatLocator(loc: string | null | undefined) {
  if (!loc) return "–";
  return loc
    .split(";")
    .map((p) => {
      const [k, ...rest] = p.split(":");
      const v = rest.join(":");
      return k === "pdf" ? `PDF หน้า ${v}` : k === "book" ? `หน้าเล่ม ${v}` : k === "sheet" ? `Sheet ${v}` : k === "file" ? `ไฟล์ ${v}` : p;
    })
    .join(" · ");
}

export function SourceRef({ code, locator }: { code?: string | null; locator: string | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <FileSearch className="size-3.5" aria-hidden="true" />
      {code && <span className="font-mono">{code}</span>} {formatLocator(locator)}
    </span>
  );
}

/** Empty state ของข้อมูลจริง — ไม่แสดงตัวเลขสมมติ */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  return (
    <p role="note" className={cn("mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm", tone === "warning" ? "border-warning/40 bg-warning/10" : "border-info/30 bg-info/10")}>
      <Info className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-warning" : "text-info")} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** ฉบับที่ยังไม่อนุมัติ: ข้อมูลที่แสดงยังไม่ใช่หลักสูตรที่ใช้งานจริง */
export function VersionStatusNotice({ status }: { status: VersionStatus | undefined }) {
  if (!status || status === "approved" || status === "active") return null;
  return (
    <p role="status" data-testid="version-status-notice" className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <b>{VERSION_STATUS_LABELS[status]}</b> — ข้อมูลในฉบับนี้{status === "retired" ? "เลิกใช้แล้ว" : "ยังไม่ผ่านการอนุมัติ ไม่ใช่หลักสูตรที่ใช้งานจริง"}
    </p>
  );
}

/**
 * Source Viewer: หาไฟล์ส่วนที่ครอบคลุมหน้า PDF ฉบับเต็ม (เอกสารลูกเรียงตามรหัสทะเบียน) แล้วเปิด presigned URL แบบ inline ที่ #page=N
 * โหลดเฉพาะเมื่อกด (ไม่โหลด PDF ทั้งเล่มเข้าหน้าจอ) · URL หมดอายุ 5 นาที · ตรวจสิทธิ์และบันทึก log ที่ฐานข้อมูล
 */
export function resolvePdfPart(docs: SourceDocument[], docId: string, page: number): { fileId: string; localPage: number; code: string } | null {
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return null;
  if (doc.file_id && (!doc.page_count || page <= doc.page_count)) return { fileId: doc.file_id, localPage: page, code: doc.register_code };
  let start = 1;
  for (const part of docs.filter((d) => d.parent_id === docId).sort((a, b) => a.register_code.localeCompare(b.register_code))) {
    const n = part.page_count ?? 0;
    if (page >= start && page < start + n && part.file_id) return { fileId: part.file_id, localPage: page - start + 1, code: part.register_code };
    start += n;
  }
  return null;
}

export function SourcePdfLink({ docId, locator }: { docId: string | null | undefined; locator: string | null | undefined }) {
  const docs = useSourceDocuments();
  const [busy, setBusy] = useState(false);
  const page = Number(/(?:^|;)pdf:(\d+)/.exec(locator ?? "")?.[1] ?? NaN);
  if (!docId || !Number.isFinite(page)) return null;
  const part = docs.data ? resolvePdfPart(docs.data, docId, page) : null;
  if (!part) return null;
  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} aria-label={`เปิดต้นฉบับ PDF หน้า ${page}`}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await callFunction<{ url: string }>("storage-download-url", { fileId: part.fileId, inline: true });
          window.open(`${r.url}#page=${part.localPage}`, "_blank", "noopener");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ");
        } finally {
          setBusy(false);
        }
      }}>
      {busy ? <Loader2 className="animate-spin" /> : <ExternalLink />} PDF หน้า {page}
    </Button>
  );
}
