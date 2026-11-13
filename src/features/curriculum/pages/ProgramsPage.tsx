import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DataTable, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import { curriculumKey, insertRow, STAGE_LABELS, usePrograms, useSourceDocuments, type StudyProgram } from "../api";
import { CurriculumNav, EmptyState, SourceRef, useSelectedVersion, VersionPicker } from "../components";

/** แผนการเรียน — แยกตามที่พบจริงในเอกสาร (ห้ามรวมแผนที่รายวิชา/หน่วยกิตต่างกัน) */
export function ProgramsPage() {
  const { can } = useAuth();
  const sel = useSelectedVersion();
  const programs = usePrograms(sel.selected?.id);
  const sources = useSourceDocuments();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const editable = can("curriculum.manage") && sel.selected?.status === "draft";

  return (
    <>
      <PageHeader title="แผนการเรียน" description="หนึ่งฉบับมีได้หลายแผน · แต่ละแผนอ้างหน้าในเอกสารต้นทาง"
        actions={editable && <Button onClick={() => setOpen(true)}><Plus /> เพิ่มแผนการเรียน</Button>} />
      <CurriculumNav />
      <div className="mb-4">
        <VersionPicker value={sel.selected?.id ?? ""} onChange={sel.select} versions={sel.versions} />
      </div>
      {!sel.loading && !sel.versions.length ? (
        <EmptyState title="ยังไม่มีหลักสูตร">สร้างหลักสูตรและฉบับร่างก่อน</EmptyState>
      ) : (
        <DataTable<StudyProgram>
          caption="แผนการเรียน"
          rows={programs.data}
          loading={programs.isPending}
          error={programs.error ? dbErrorMessage(programs.error) : null}
          emptyText="ยังไม่มีแผนการเรียนในฉบับนี้ — นำเข้าหรือเพิ่มจากเอกสารต้นทาง"
          rowKey={(p) => p.id}
          columns={[
            { key: "code", header: "รหัส", cell: (p) => <code className="text-xs">{p.code}</code>, className: "w-28" },
            { key: "name", header: "ชื่อแผนการเรียน", cell: (p) => <span className="font-medium">{p.name_th}</span> },
            { key: "stage", header: "ช่วงชั้น", cell: (p) => STAGE_LABELS[p.stage] },
            { key: "src", header: "แหล่งที่มา", cell: (p) => <SourceRef locator={p.source_locator} /> },
          ]}
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="เพิ่มแผนการเรียน" description="กรอกตามเอกสารต้นทาง และระบุหน้าที่อ้างอิง">
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await insertRow("study_programs", {
                curriculum_version_id: sel.selected!.id, code: f.get("code"), name_th: f.get("name"), stage: f.get("stage"),
                source_document_id: f.get("source"), source_locator: f.get("locator"),
              });
              toast.success("เพิ่มแผนการเรียนแล้ว");
              setOpen(false);
              await qc.invalidateQueries({ queryKey: curriculumKey });
            } catch (err) {
              toast.error(dbErrorMessage(err));
            }
          }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="รหัสแผน" htmlFor="p-code"><Input id="p-code" name="code" required /></FormField>
              <FormField label="ช่วงชั้น" htmlFor="p-stage"><Select id="p-stage" name="stage">{Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FormField>
            </div>
            <FormField label="ชื่อแผนการเรียน (ตามเอกสาร)" htmlFor="p-name"><Input id="p-name" name="name" required /></FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="เอกสารต้นทาง" htmlFor="p-src"><Select id="p-src" name="source" required>{sources.data?.map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}</Select></FormField>
              <FormField label="ตำแหน่ง" htmlFor="p-loc"><Input id="p-loc" name="locator" required placeholder="pdf:12" /></FormField>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button><Button type="submit">บันทึก</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
