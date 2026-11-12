import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ListPlus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, FormField, Input, Select } from "@/components/ui/form-controls";
import { ActiveBadge, ConfirmDialog, DataTable, PageHeader, TableToolbar, type Column } from "@/components/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { insertRows, mdKey, updateRow, useGradeLevels, useMdMutation } from "../api";
import { STAGE_LABELS, STANDARD_GRADE_LEVELS, type GradeLevel, type GradeStage } from "../types";
import { matchesSearch, useCrudState } from "../use-crud-state";
import { FormActions, ReadOnlyNotice, StatusFilter, statusMatches } from "./parts";
import { ToggleActiveButton } from "./ToggleActiveButton";

const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,16}$/, "รหัสใช้ได้เฉพาะ A–Z, 0–9, - และ _ (ไม่เกิน 16 ตัว)"),
  name_th: z.string().trim().min(1, "กรุณากรอกชื่อระดับชั้น").max(50),
  stage: z.enum(["primary", "lower_secondary", "upper_secondary", "other"]),
  level_order: z.coerce.number<number>().int().min(0).max(999),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function GradeLevelsPage() {
  const { can } = useAuth();
  const canManage = can("masterdata.manage");
  const grades = useGradeLevels();
  const crud = useCrudState<GradeLevel>();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("");
  const [addingStandard, setAddingStandard] = useState(false);

  const rows = grades.data?.filter(
    (g) => matchesSearch(search, g.code, g.name_th) && (!stage || g.stage === stage) && statusMatches(status, g.is_active),
  );
  const missingStandard = STANDARD_GRADE_LEVELS.filter((s) => !grades.data?.some((g) => g.code === s.code));

  const toggle = useMdMutation((g: GradeLevel) => updateRow("grade_levels", g.id, { is_active: !g.is_active }), {
    success: (g) => (g.is_active ? `ปิดใช้งาน ${g.name_th} แล้ว` : `เปิดใช้งาน ${g.name_th} แล้ว`),
    invalidate: [mdKey("grade_levels")],
  });
  const addStandard = useMdMutation(() => insertRows("grade_levels", missingStandard.map((s) => ({ ...s, is_active: true }))), {
    success: () => `เพิ่มระดับชั้นมาตรฐาน ${missingStandard.length} รายการ`,
    invalidate: [mdKey("grade_levels")],
  });

  const columns: Column<GradeLevel>[] = [
    { key: "order", header: "ลำดับ", cell: (g) => g.level_order, className: "w-20 tabular-nums" },
    { key: "name", header: "ระดับชั้น", cell: (g) => <span className="font-medium">{g.name_th}</span> },
    { key: "code", header: "รหัส", cell: (g) => <code className="text-xs">{g.code}</code> },
    { key: "stage", header: "ช่วงชั้น", cell: (g) => STAGE_LABELS[g.stage] },
    { key: "status", header: "สถานะ", cell: (g) => <ActiveBadge active={g.is_active} /> },
  ];

  return (
    <>
      <PageHeader
        title="ระดับชั้น"
        description="ระดับชั้นมาตรฐาน ป.1–ป.6, ม.1–ม.6 หรือระดับที่โรงเรียนกำหนดเอง"
        actions={
          canManage && (
            <>
              {missingStandard.length > 0 && grades.data && (
                <Button variant="outline" onClick={() => setAddingStandard(true)}>
                  <ListPlus /> เพิ่มระดับชั้นมาตรฐาน
                </Button>
              )}
              <Button onClick={crud.openCreate}><Plus /> เพิ่มระดับชั้น</Button>
            </>
          )
        }
      />
      {!canManage && <ReadOnlyNotice />}
      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหาชื่อหรือรหัส">
        <Select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="กรองตามช่วงชั้น" className="sm:w-52">
          <option value="">ทุกช่วงชั้น</option>
          {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <StatusFilter value={status} onChange={setStatus} />
      </TableToolbar>
      <DataTable
        caption="รายการระดับชั้น"
        rows={rows}
        columns={columns}
        rowKey={(g) => g.id}
        loading={grades.isPending}
        error={grades.error ? dbErrorMessage(grades.error) : null}
        emptyText="ยังไม่มีระดับชั้น"
        rowClassName={(g) => (g.is_active ? undefined : "opacity-60")}
        actions={
          canManage
            ? (g) => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => crud.openEdit(g)}><Pencil /> แก้ไข</Button>
                  <ToggleActiveButton active={g.is_active} label={g.name_th} onClick={() => crud.setConfirming(g)} />
                </>
              )
            : undefined
        }
      />

      <GradeFormDialog
        open={crud.formOpen}
        editing={crud.editing}
        defaults={crud.editing ?? { code: "", name_th: "", stage: "other", level_order: (grades.data?.at(-1)?.level_order ?? 0) + 1, is_active: true }}
        onClose={crud.closeForm}
      />
      <ConfirmDialog
        open={crud.confirming !== null}
        onOpenChange={(o) => !o && crud.setConfirming(null)}
        title={`${crud.confirming?.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}ระดับชั้น ${crud.confirming?.name_th ?? ""}?`}
        description={crud.confirming?.is_active ? "ระดับชั้นที่ปิดใช้งานจะไม่ถูกใช้สร้างห้องเรียนใหม่ แต่ข้อมูลเดิมยังอยู่ครบ" : "ระดับชั้นนี้จะกลับมาใช้งานได้"}
        confirmLabel={crud.confirming?.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        destructive={crud.confirming?.is_active}
        onConfirm={() => toggle.mutateAsync(crud.confirming!)}
      />
      <ConfirmDialog
        open={addingStandard}
        onOpenChange={setAddingStandard}
        title="เพิ่มระดับชั้นมาตรฐาน?"
        description={`จะเพิ่ม ${missingStandard.map((s) => s.name_th).join(", ")} (เฉพาะรายการที่ยังไม่มี)`}
        confirmLabel="เพิ่ม"
        onConfirm={() => addStandard.mutateAsync(undefined)}
      />
    </>
  );
}

function GradeFormDialog({ open, editing, defaults, onClose }: { open: boolean; editing: GradeLevel | null; defaults: FormValues; onClose: () => void }) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), values: defaults });
  const save = useMdMutation(
    (v: FormValues) =>
      editing
        ? updateRow("grade_levels", editing.id, { name_th: v.name_th, stage: v.stage, level_order: v.level_order, is_active: v.is_active })
        : insertRows("grade_levels", v),
    { success: editing ? "บันทึกการแก้ไขเรียบร้อย" : "เพิ่มระดับชั้นเรียบร้อย", invalidate: [mdKey("grade_levels")] },
  );
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? `แก้ไขระดับชั้น ${editing.name_th}` : "เพิ่มระดับชั้น"}>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).then(onClose, () => undefined))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ชื่อระดับชั้น" htmlFor="name_th" error={errors.name_th?.message}>
              <Input id="name_th" placeholder="เช่น ม.1" {...form.register("name_th")} />
            </FormField>
            <FormField label="รหัส" htmlFor="code" error={errors.code?.message} hint={editing ? "แก้ไขรหัสไม่ได้" : "เช่น M1"}>
              <Input id="code" disabled={!!editing} {...form.register("code")} />
            </FormField>
            <FormField label="ช่วงชั้น" htmlFor="stage" error={errors.stage?.message}>
              <Select id="stage" {...form.register("stage")}>
                {(Object.keys(STAGE_LABELS) as GradeStage[]).map((k) => <option key={k} value={k}>{STAGE_LABELS[k]}</option>)}
              </Select>
            </FormField>
            <FormField label="ลำดับการแสดงผล" htmlFor="level_order" error={errors.level_order?.message}>
              <Input id="level_order" type="number" inputMode="numeric" {...form.register("level_order")} />
            </FormField>
          </div>
          <Checkbox label="เปิดใช้งาน" {...form.register("is_active")} />
          <FormActions onCancel={onClose} busy={isSubmitting} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
