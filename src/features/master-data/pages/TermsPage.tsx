import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarCheck, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { ConfirmDialog, DataTable, PageHeader, TableToolbar, type Column } from "@/components/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { formatIsoDateTH } from "@/lib/format";
import { callRpc, insertRows, mdKey, updateRow, useAcademicYears, useMdMutation, useTerms } from "../api";
import type { AcademicYear, Term } from "../types";
import { matchesSearch, useCrudState } from "../use-crud-state";
import { FormActions, ReadOnlyNotice, YearFilter } from "./parts";

function makeSchema(year: AcademicYear | undefined) {
  return z
    .object({
      academic_year_id: z.uuid("กรุณาเลือกปีการศึกษา"),
      term_no: z.coerce.number<number>().int().min(1).max(2),
      starts_on: z.iso.date("กรุณาเลือกวันเปิดภาคเรียน"),
      ends_on: z.iso.date("กรุณาเลือกวันปิดภาคเรียน"),
    })
    .refine((v) => v.ends_on > v.starts_on, { path: ["ends_on"], message: "วันปิดภาคเรียนต้องอยู่หลังวันเปิดภาคเรียน" })
    .refine((v) => !year || (v.starts_on >= year.starts_on && v.ends_on <= year.ends_on), {
      path: ["starts_on"],
      message: year ? `ต้องอยู่ภายในปีการศึกษา ${year.year_be} (${formatIsoDateTH(year.starts_on)} – ${formatIsoDateTH(year.ends_on)})` : "",
    });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function TermsPage() {
  const { can } = useAuth();
  const canManage = can("masterdata.manage");
  const years = useAcademicYears();
  const terms = useTerms();
  const crud = useCrudState<Term>();
  const [yearId, setYearId] = useState("");
  const [search, setSearch] = useState("");

  const yearById = useMemo(() => new Map(years.data?.map((y) => [y.id, y])), [years.data]);
  useEffect(() => {
    if (!yearId && years.data?.length) setYearId(years.data.find((y) => y.is_current)?.id ?? "");
  }, [years.data, yearId]);

  const rows = terms.data
    ?.filter((t) => !yearId || t.academic_year_id === yearId)
    .filter((t) => matchesSearch(search, `ภาคเรียนที่ ${t.term_no}`, yearById.get(t.academic_year_id)?.year_be))
    .sort((a, b) => (a.academic_year_id === b.academic_year_id ? a.term_no - b.term_no : b.starts_on.localeCompare(a.starts_on)));

  const setCurrent = useMdMutation((id: string) => callRpc("set_current_term", { p_term_id: id }), {
    success: "ตั้งภาคเรียนปัจจุบันเรียบร้อย",
    invalidate: [mdKey("academic_years"), mdKey("terms")],
  });

  const columns: Column<Term>[] = [
    { key: "year", header: "ปีการศึกษา", cell: (t) => yearById.get(t.academic_year_id)?.year_be ?? "–" },
    {
      key: "term",
      header: "ภาคเรียน",
      cell: (t) => (
        <span className="flex items-center gap-2 font-medium">
          ภาคเรียนที่ {t.term_no} {t.is_current && <Badge variant="success">ปัจจุบัน</Badge>}
        </span>
      ),
    },
    { key: "start", header: "วันเปิดภาคเรียน", cell: (t) => formatIsoDateTH(t.starts_on) },
    { key: "end", header: "วันปิดภาคเรียน", cell: (t) => formatIsoDateTH(t.ends_on) },
  ];

  const usedTermNos = new Set(terms.data?.filter((t) => t.academic_year_id === yearId).map((t) => t.term_no));
  const createDefaults: FormValues = {
    academic_year_id: yearId,
    term_no: usedTermNos.has(1) ? 2 : 1,
    starts_on: "",
    ends_on: "",
  };

  return (
    <>
      <PageHeader
        title="ภาคเรียน"
        description="ภาคเรียนที่ 1 และ 2 ต้องอยู่ภายในช่วงปีการศึกษาและไม่ทับซ้อนกัน"
        actions={
          canManage && (
            <Button onClick={crud.openCreate} disabled={!years.data?.length}>
              <Plus /> เพิ่มภาคเรียน
            </Button>
          )
        }
      />
      {!canManage && <ReadOnlyNotice />}
      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหาภาคเรียน">
        <YearFilter years={years.data} value={yearId} onChange={setYearId} includeAll />
      </TableToolbar>
      <DataTable
        caption="รายการภาคเรียน"
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        loading={terms.isPending || years.isPending}
        error={terms.error ? dbErrorMessage(terms.error) : null}
        emptyText="ยังไม่มีภาคเรียนในปีการศึกษานี้"
        actions={
          canManage
            ? (t) => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => crud.openEdit(t)}>
                    <Pencil /> แก้ไข
                  </Button>
                  {!t.is_current && (
                    <Button size="sm" variant="outline" onClick={() => crud.setConfirming(t)}>
                      <CalendarCheck /> ตั้งเป็นภาคปัจจุบัน
                    </Button>
                  )}
                </>
              )
            : undefined
        }
      />

      <TermFormDialog
        open={crud.formOpen}
        editing={crud.editing}
        years={years.data ?? []}
        defaults={crud.editing ?? createDefaults}
        onClose={crud.closeForm}
      />

      <ConfirmDialog
        open={crud.confirming !== null}
        onOpenChange={(o) => !o && crud.setConfirming(null)}
        title={`ตั้งภาคเรียนที่ ${crud.confirming?.term_no ?? ""}/${yearById.get(crud.confirming?.academic_year_id ?? "")?.year_be ?? ""} เป็นภาคเรียนปัจจุบัน?`}
        description="ปีการศึกษาของภาคเรียนนี้จะถูกตั้งเป็นปีปัจจุบันด้วย"
        confirmLabel="ยืนยัน"
        onConfirm={() => setCurrent.mutateAsync(crud.confirming!.id)}
      />
    </>
  );
}

function TermFormDialog({
  open,
  editing,
  years,
  defaults,
  onClose,
}: {
  open: boolean;
  editing: Term | null;
  years: AcademicYear[];
  defaults: FormValues;
  onClose: () => void;
}) {
  const [selectedYear, setSelectedYear] = useState(defaults.academic_year_id);
  useEffect(() => setSelectedYear(defaults.academic_year_id), [defaults.academic_year_id, open]);
  const year = years.find((y) => y.id === selectedYear);
  const form = useForm<FormValues>({ resolver: zodResolver(makeSchema(year)), values: defaults });
  const save = useMdMutation(
    (v: FormValues) =>
      editing
        ? updateRow("terms", editing.id, { term_no: v.term_no, starts_on: v.starts_on, ends_on: v.ends_on })
        : insertRows("terms", v),
    { success: editing ? "บันทึกการแก้ไขเรียบร้อย" : "เพิ่มภาคเรียนเรียบร้อย", invalidate: [mdKey("terms")] },
  );
  const { errors, isSubmitting } = form.formState;
  const yearField = form.register("academic_year_id");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? "แก้ไขภาคเรียน" : "เพิ่มภาคเรียน"}>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).then(onClose, () => undefined))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ปีการศึกษา" htmlFor="academic_year_id" error={errors.academic_year_id?.message}>
              <Select
                id="academic_year_id"
                disabled={!!editing}
                {...yearField}
                onChange={(e) => {
                  void yearField.onChange(e);
                  setSelectedYear(e.target.value);
                }}
              >
                <option value="">เลือกปีการศึกษา</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.year_be}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="ภาคเรียนที่" htmlFor="term_no" error={errors.term_no?.message}>
              <Select id="term_no" {...form.register("term_no")}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </Select>
            </FormField>
          </div>
          {year && (
            <p className="text-xs text-muted-foreground">
              ช่วงปีการศึกษา {year.year_be}: {formatIsoDateTH(year.starts_on)} – {formatIsoDateTH(year.ends_on)}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="วันเปิดภาคเรียน" htmlFor="starts_on" error={errors.starts_on?.message}>
              <Input id="starts_on" type="date" min={year?.starts_on} max={year?.ends_on} {...form.register("starts_on")} />
            </FormField>
            <FormField label="วันปิดภาคเรียน" htmlFor="ends_on" error={errors.ends_on?.message}>
              <Input id="ends_on" type="date" min={year?.starts_on} max={year?.ends_on} {...form.register("ends_on")} />
            </FormField>
          </div>
          <FormActions onCancel={onClose} busy={isSubmitting} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
