import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { ActiveBadge, ConfirmDialog, DataTable, PageHeader, TableToolbar, type Column } from "@/components/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import { callRpc, insertRows, mdKey, updateRow, useAcademicYears, useClassrooms, useGradeLevels, useMdMutation } from "../api";
import type { Classroom, GradeLevel } from "../types";
import { matchesSearch, useCrudState } from "../use-crud-state";
import { FormActions, ReadOnlyNotice, StatusFilter, statusMatches, YearFilter } from "./parts";
import { ToggleActiveButton } from "./ToggleActiveButton";

const schema = z.object({
  grade_level_id: z.uuid("กรุณาเลือกระดับชั้น"),
  room_no: z.coerce.number<number>().int("เลขห้องต้องเป็นจำนวนเต็ม").min(1, "เลขห้องต้องอยู่ระหว่าง 1–99").max(99, "เลขห้องต้องอยู่ระหว่าง 1–99"),
});
type FormValues = z.infer<typeof schema>;

export function ClassroomsPage() {
  const { can } = useAuth();
  const canManage = can("masterdata.manage");
  const years = useAcademicYears();
  const grades = useGradeLevels();
  const rooms = useClassrooms();
  const crud = useCrudState<Classroom>();
  const [yearId, setYearId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);

  useEffect(() => {
    if (!yearId && years.data?.length) setYearId(years.data.find((y) => y.is_current)?.id ?? years.data[0]!.id);
  }, [years.data, yearId]);

  const gradeById = useMemo(() => new Map(grades.data?.map((g) => [g.id, g])), [grades.data]);
  const roomName = (c: Classroom) => `${gradeById.get(c.grade_level_id)?.name_th ?? "?"}/${c.room_no}`;
  const year = years.data?.find((y) => y.id === yearId);

  const rows = rooms.data
    ?.filter((c) => c.academic_year_id === yearId && (!gradeId || c.grade_level_id === gradeId) && statusMatches(status, c.is_active))
    .filter((c) => matchesSearch(search, roomName(c)))
    .sort((a, b) => (gradeById.get(a.grade_level_id)?.level_order ?? 0) - (gradeById.get(b.grade_level_id)?.level_order ?? 0) || a.room_no - b.room_no);

  const toggle = useMdMutation((c: Classroom) => updateRow("classrooms", c.id, { is_active: !c.is_active }), {
    success: (c) => (c.is_active ? `ปิดใช้งานห้อง ${roomName(c)} แล้ว` : `เปิดใช้งานห้อง ${roomName(c)} แล้ว`),
    invalidate: [mdKey("classrooms")],
  });

  const columns: Column<Classroom>[] = [
    { key: "room", header: "ห้องเรียน", cell: (c) => <span className="font-medium">{roomName(c)}</span> },
    { key: "grade", header: "ระดับชั้น", cell: (c) => gradeById.get(c.grade_level_id)?.name_th ?? "–" },
    { key: "year", header: "ปีการศึกษา", cell: () => year?.year_be ?? "–", hideOnMobile: true },
    { key: "status", header: "สถานะ", cell: (c) => <ActiveBadge active={c.is_active} /> },
  ];

  const activeGrades = grades.data?.filter((g) => g.is_active) ?? [];

  return (
    <>
      <PageHeader
        title="ห้องเรียน"
        description="ห้องเรียนแยกตามปีการศึกษา ข้อมูลปีเก่ายังเก็บไว้ครบ"
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={!yearId || (years.data?.length ?? 0) < 2}>
                <Copy /> คัดลอกจากปีอื่น
              </Button>
              <Button onClick={crud.openCreate} disabled={!yearId || activeGrades.length === 0}>
                <Plus /> เพิ่มห้องเรียน
              </Button>
            </>
          )
        }
      />
      {!canManage && <ReadOnlyNotice />}
      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหาห้อง เช่น ม.1/1">
        <YearFilter years={years.data} value={yearId} onChange={setYearId} />
        <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)} aria-label="กรองตามระดับชั้น" className="sm:w-40">
          <option value="">ทุกระดับชั้น</option>
          {grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name_th}</option>)}
        </Select>
        <StatusFilter value={status} onChange={setStatus} />
      </TableToolbar>
      <p className="mb-2 text-sm text-muted-foreground" aria-live="polite">
        {rows ? `ทั้งหมด ${rows.length} ห้อง` : ""}
      </p>
      <DataTable
        caption="รายการห้องเรียน"
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        loading={rooms.isPending || years.isPending || grades.isPending}
        error={rooms.error ? dbErrorMessage(rooms.error) : null}
        emptyText="ยังไม่มีห้องเรียนในปีการศึกษานี้"
        rowClassName={(c) => (c.is_active ? undefined : "opacity-60")}
        actions={
          canManage
            ? (c) => (
                <>
                  <Button size="sm" variant="ghost" onClick={() => crud.openEdit(c)} aria-label={`แก้ไขห้อง ${roomName(c)}`}><Pencil /> แก้ไข</Button>
                  <ToggleActiveButton active={c.is_active} label={`ห้อง ${roomName(c)}`} onClick={() => crud.setConfirming(c)} />
                </>
              )
            : undefined
        }
      />

      <RoomFormDialog
        open={crud.formOpen}
        editing={crud.editing}
        yearId={yearId}
        yearLabel={year?.year_be}
        grades={activeGrades}
        defaults={crud.editing ?? { grade_level_id: gradeId || activeGrades[0]?.id || "", room_no: 1 }}
        onClose={crud.closeForm}
      />
      <ConfirmDialog
        open={crud.confirming !== null}
        onOpenChange={(o) => !o && crud.setConfirming(null)}
        title={`${crud.confirming?.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}ห้อง ${crud.confirming ? roomName(crud.confirming) : ""}?`}
        description={crud.confirming?.is_active ? "ห้องเรียนจะไม่ถูกลบ ข้อมูลประวัติยังอยู่ครบ" : "ห้องเรียนนี้จะกลับมาใช้งานได้"}
        confirmLabel={crud.confirming?.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        destructive={crud.confirming?.is_active}
        onConfirm={() => toggle.mutateAsync(crud.confirming!)}
      />
      <CopyRoomsDialog open={copyOpen} onClose={() => setCopyOpen(false)} toYearId={yearId} />
    </>
  );
}

function RoomFormDialog({
  open, editing, yearId, yearLabel, grades, defaults, onClose,
}: {
  open: boolean; editing: Classroom | null; yearId: string; yearLabel?: number; grades: GradeLevel[]; defaults: FormValues; onClose: () => void;
}) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), values: defaults });
  const save = useMdMutation(
    (v: FormValues) => (editing ? updateRow("classrooms", editing.id, v) : insertRows("classrooms", { ...v, academic_year_id: yearId })),
    { success: editing ? "บันทึกการแก้ไขเรียบร้อย" : "เพิ่มห้องเรียนเรียบร้อย", invalidate: [mdKey("classrooms")] },
  );
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? "แก้ไขห้องเรียน" : "เพิ่มห้องเรียน"} description={`ปีการศึกษา ${yearLabel ?? ""}`}>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).then(onClose, () => undefined))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ระดับชั้น" htmlFor="grade_level_id" error={errors.grade_level_id?.message}>
              <Select id="grade_level_id" {...form.register("grade_level_id")}>
                {grades.map((g) => <option key={g.id} value={g.id}>{g.name_th}</option>)}
              </Select>
            </FormField>
            <FormField label="ห้องที่" htmlFor="room_no" error={errors.room_no?.message}>
              <Input id="room_no" type="number" inputMode="numeric" {...form.register("room_no")} />
            </FormField>
          </div>
          <FormActions onCancel={onClose} busy={isSubmitting} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CopyRoomsDialog({ open, onClose, toYearId }: { open: boolean; onClose: () => void; toYearId: string }) {
  const years = useAcademicYears();
  const others = years.data?.filter((y) => y.id !== toYearId) ?? [];
  const [fromId, setFromId] = useState("");
  useEffect(() => setFromId(others[0]?.id ?? ""), [open, toYearId]);
  const target = years.data?.find((y) => y.id === toYearId);
  const copy = useMdMutation(() => callRpc<number>("copy_classrooms", { p_from_year: fromId, p_to_year: toYearId }), {
    success: (_v, n) => (n ? `คัดลอกห้องเรียน ${n} ห้องเรียบร้อย` : "ไม่มีห้องเรียนใหม่ให้คัดลอก (มีครบแล้ว)"),
    invalidate: [mdKey("classrooms")],
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`คัดลอกห้องเรียนไปปีการศึกษา ${target?.year_be ?? ""}`}
        description="คัดลอกเฉพาะห้องที่เปิดใช้งาน และข้ามห้องที่มีอยู่แล้ว"
      >
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void copy.mutateAsync(undefined).then(onClose, () => undefined); }}>
          <FormField label="คัดลอกจากปีการศึกษา" htmlFor="from_year">
            <Select id="from_year" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {others.map((y) => <option key={y.id} value={y.id}>{y.year_be}</option>)}
            </Select>
          </FormField>
          <FormActions onCancel={onClose} busy={copy.isPending} label="คัดลอก" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
