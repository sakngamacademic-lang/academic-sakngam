import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarCheck, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/form-controls";
import { ConfirmDialog, DataTable, PageHeader, TableToolbar, type Column } from "@/components/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { formatIsoDateTH } from "@/lib/format";
import { callRpc, insertRows, mdKey, updateRow, useAcademicYears, useMdMutation, useTerms } from "../api";
import type { AcademicYear } from "../types";
import { matchesSearch, useCrudState } from "../use-crud-state";
import { FormActions, ReadOnlyNotice } from "./parts";

const schema = z
  .object({
    year_be: z.coerce.number<number>().int().min(2500, "ปี พ.ศ. ต้องอยู่ระหว่าง 2500–2700").max(2700, "ปี พ.ศ. ต้องอยู่ระหว่าง 2500–2700"),
    starts_on: z.iso.date("กรุณาเลือกวันเริ่มต้น"),
    ends_on: z.iso.date("กรุณาเลือกวันสิ้นสุด"),
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.ends_on > v.starts_on, { path: ["ends_on"], message: "วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น" });
type FormValues = z.infer<typeof schema>;

function defaultsFor(yearBe: number): FormValues {
  const ce = yearBe - 543;
  return { year_be: yearBe, starts_on: `${ce}-05-16`, ends_on: `${ce + 1}-05-15`, note: "" };
}

export function AcademicYearsPage() {
  const { can } = useAuth();
  const canManage = can("masterdata.manage");
  const years = useAcademicYears();
  const terms = useTerms();
  const crud = useCrudState<AcademicYear>();
  const [search, setSearch] = useState("");

  const termCount = useMemo(() => {
    const m = new Map<string, number>();
    terms.data?.forEach((t) => m.set(t.academic_year_id, (m.get(t.academic_year_id) ?? 0) + 1));
    return m;
  }, [terms.data]);

  const rows = years.data?.filter((y) => matchesSearch(search, y.year_be, y.note));
  const setCurrent = useMdMutation((id: string) => callRpc("set_current_academic_year", { p_year_id: id }), {
    success: "ตั้งปีการศึกษาปัจจุบันเรียบร้อย",
    invalidate: [mdKey("academic_years"), mdKey("terms")],
  });

  const columns: Column<AcademicYear>[] = [
    {
      key: "year",
      header: "ปีการศึกษา",
      cell: (y) => (
        <span className="flex items-center gap-2 font-medium">
          {y.year_be} {y.is_current && <Badge variant="success">ปัจจุบัน</Badge>}
        </span>
      ),
    },
    { key: "start", header: "วันเริ่มต้น", cell: (y) => formatIsoDateTH(y.starts_on) },
    { key: "end", header: "วันสิ้นสุด", cell: (y) => formatIsoDateTH(y.ends_on) },
    { key: "terms", header: "ภาคเรียน", cell: (y) => `${termCount.get(y.id) ?? 0} ภาค` },
    { key: "note", header: "หมายเหตุ", cell: (y) => y.note || "–", hideOnMobile: true },
  ];

  const nextYear = (years.data?.[0]?.year_be ?? new Date().getFullYear() + 543) + 1;

  return (
    <>
      <PageHeader
        title="ปีการศึกษา"
        description="ปีการศึกษาเก็บเป็นประวัติถาวร ไม่สามารถลบได้"
        actions={canManage && <Button onClick={crud.openCreate}><Plus /> เพิ่มปีการศึกษา</Button>}
      />
      {!canManage && <ReadOnlyNotice />}
      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหาปี พ.ศ. หรือหมายเหตุ" />
      <DataTable
        caption="รายการปีการศึกษา"
        rows={rows}
        columns={columns}
        rowKey={(y) => y.id}
        loading={years.isPending}
        error={years.error ? dbErrorMessage(years.error) : null}
        emptyText="ยังไม่มีปีการศึกษา"
        actions={
          canManage
            ? (y) => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => crud.openEdit(y)} aria-label={`แก้ไขปีการศึกษา ${y.year_be}`}>
                    <Pencil /> แก้ไข
                  </Button>
                  {!y.is_current && (
                    <Button size="sm" variant="outline" onClick={() => crud.setConfirming(y)}>
                      <CalendarCheck /> ตั้งเป็นปีปัจจุบัน
                    </Button>
                  )}
                </>
              )
            : undefined
        }
      />

      <YearFormDialog
        open={crud.formOpen}
        editing={crud.editing}
        defaults={crud.editing ? { ...crud.editing, note: crud.editing.note ?? "" } : defaultsFor(nextYear)}
        onClose={crud.closeForm}
      />

      <ConfirmDialog
        open={crud.confirming !== null}
        onOpenChange={(o) => !o && crud.setConfirming(null)}
        title={`ตั้งปีการศึกษา ${crud.confirming?.year_be ?? ""} เป็นปีปัจจุบัน?`}
        description="ปีปัจจุบันเดิมจะถูกยกเลิก และภาคเรียนปัจจุบันที่อยู่คนละปีจะถูกยกเลิกด้วย"
        confirmLabel="ยืนยัน"
        onConfirm={() => setCurrent.mutateAsync(crud.confirming!.id)}
      />
    </>
  );
}

function YearFormDialog({
  open,
  editing,
  defaults,
  onClose,
}: {
  open: boolean;
  editing: AcademicYear | null;
  defaults: FormValues;
  onClose: () => void;
}) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), values: defaults });
  const save = useMdMutation(
    (v: FormValues) =>
      editing
        ? updateRow("academic_years", editing.id, { starts_on: v.starts_on, ends_on: v.ends_on, note: v.note || null })
        : insertRows("academic_years", { ...v, note: v.note || null }),
    { success: editing ? "บันทึกการแก้ไขเรียบร้อย" : "เพิ่มปีการศึกษาเรียบร้อย", invalidate: [mdKey("academic_years")] },
  );
  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? `แก้ไขปีการศึกษา ${editing.year_be}` : "เพิ่มปีการศึกษา"}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            await save.mutateAsync(v).then(onClose, () => undefined);
          })}
        >
          <FormField label="ปีการศึกษา (พ.ศ.)" htmlFor="year_be" error={errors.year_be?.message} hint={editing ? "แก้ไขปีไม่ได้" : undefined}>
            <Input id="year_be" type="number" inputMode="numeric" disabled={!!editing} {...form.register("year_be")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="วันเริ่มต้น" htmlFor="starts_on" error={errors.starts_on?.message}>
              <Input id="starts_on" type="date" {...form.register("starts_on")} />
            </FormField>
            <FormField label="วันสิ้นสุด" htmlFor="ends_on" error={errors.ends_on?.message}>
              <Input id="ends_on" type="date" {...form.register("ends_on")} />
            </FormField>
          </div>
          <FormField label="หมายเหตุ" htmlFor="note" error={errors.note?.message}>
            <Input id="note" {...form.register("note")} />
          </FormField>
          <FormActions onCancel={onClose} busy={isSubmitting} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
