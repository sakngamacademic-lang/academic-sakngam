import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/shared";
import { DashSection, LiveBadge } from "@/components/dashboard";
import { ACCEPT_ATTR, edgeFunctionStorage, precheck, StorageError } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { dbErrorMessage } from "@/lib/db-errors";
import { CATEGORY_LABELS, documentsKey, useDocuments } from "../api";
import { DocumentFiles } from "./DocumentFiles";

const STAGE_TEXT = { requesting: "กำลังขอสิทธิ์อัปโหลด…", uploading: "กำลังอัปโหลด…", verifying: "กำลังตรวจสอบไฟล์…" } as const;

/** คลังเอกสารของครู — อัปโหลดเอกสารใหม่ / เวอร์ชันใหม่ ดาวน์โหลด และลบฉบับที่ยังไม่ถูกตรวจรับ */
export function MyDocumentsPage() {
  const docs = useDocuments();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("lesson_plan");
  const [target, setTarget] = useState(""); // "" = เอกสารใหม่
  const [stage, setStage] = useState<keyof typeof STAGE_TEXT | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    try {
      if (!file) throw new StorageError("กรุณาเลือกไฟล์");
      if (!target && !title.trim()) throw new StorageError("กรุณาระบุชื่อเอกสาร");
      precheck(file);
      const r = await edgeFunctionStorage.upload(file, target ? { documentId: target } : { title: title.trim(), category }, setStage);
      toast.success(`อัปโหลดฉบับที่ ${r.version} สำเร็จ`);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof StorageError ? err.message : dbErrorMessage(err));
    } finally {
      setStage(null);
      void qc.invalidateQueries({ queryKey: documentsKey });
    }
  };

  return (
    <>
      <PageHeader title="คลังเอกสารของฉัน" description="ไฟล์เก็บในที่จัดเก็บแบบส่วนตัว เฉพาะคุณและฝ่ายวิชาการที่มีสิทธิ์เท่านั้นที่เปิดได้" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_1fr]">
        <DashSection id="upload" title="อัปโหลดเอกสาร" meta="PDF / Word / Excel · ไม่เกิน 20 MB">
          <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
            <FormField label="อัปโหลดเป็น" htmlFor="doc-target">
              <Select id="doc-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">เอกสารใหม่</option>
                {docs.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    ฉบับใหม่ของ: {d.title}
                  </option>
                ))}
              </Select>
            </FormField>
            {!target && (
              <>
                <FormField label="ชื่อเอกสาร" htmlFor="doc-title">
                  <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
                </FormField>
                <FormField label="ประเภท" htmlFor="doc-category">
                  <Select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </FormField>
              </>
            )}
            <FormField label="ไฟล์" htmlFor="doc-file">
              <input id="doc-file" ref={fileRef} type="file" accept={ACCEPT_ATTR} className="block w-full rounded-md border border-input bg-background px-2 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:text-foreground" />
            </FormField>
            {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={stage !== null}>
              {stage ? <><Upload className="animate-pulse" /> {STAGE_TEXT[stage]}</> : <><FileUp /> อัปโหลด</>}
            </Button>
          </form>
        </DashSection>

        <DashSection id="my-documents" title={<span className="flex items-center gap-2">เอกสารของฉัน <LiveBadge /></span>} meta={docs.data ? `${docs.data.length} เอกสาร` : undefined}>
          {docs.isPending ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
          ) : docs.error ? (
            <p role="alert" className="text-sm text-destructive">{dbErrorMessage(docs.error)}</p>
          ) : docs.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีเอกสาร</p>
          ) : (
            <ul className="space-y-4">
              {docs.data.map((d) => (
                <li key={d.id} className="rounded-xl border p-3 sm:p-4" data-testid="document">
                  <p className="font-medium">{d.title}</p>
                  <p className="mb-3 text-xs text-muted-foreground">{CATEGORY_LABELS[d.category] ?? d.category}</p>
                  <DocumentFiles files={d.files} canDelete canLock={false} />
                </li>
              ))}
            </ul>
          )}
        </DashSection>
      </div>
    </>
  );
}
