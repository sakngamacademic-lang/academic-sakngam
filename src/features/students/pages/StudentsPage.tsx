import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { DataTable, PageHeader, TableToolbar, type Column } from "@/components/shared";
import { KpiCard } from "@/components/dashboard";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAcademicYears, useClassrooms, useGradeLevels, useMdMutation } from "@/features/master-data/api";
import { FormActions, ReadOnlyNotice } from "@/features/master-data/pages/parts";
import { matchesSearch, useCrudState } from "@/features/master-data/use-crud-state";
import { dbErrorMessage } from "@/lib/db-errors";
import { insertStudent, studentName, studentsKey, STUDENT_STATUS_LABELS, updateStudent, useStudents, type Student, type StudentInput, type StudentStatus } from "../api";

const STATUS_VARIANT: Record<StudentStatus, BadgeProps["variant"]> = { active: "success", transferred: "secondary", graduated: "info", withdrawn: "secondary" };

const schema = z.object({
  student_code: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/, "รหัสใช้ได้เฉพาะ A–Z, 0–9 และ - (ไม่เกิน 20 ตัว)"),
  prefix: z.string().trim().min(1, "กรุณาระบุคำนำหน้า").max(30),
  first_name: z.string().trim().min(1, "กรุณากรอกชื่อ").max(100),
  last_name: z.string().trim().min(1, "กรุณากรอกนามสกุล").max(100),
  status: z.enum(Object.keys(STUDENT_STATUS_LABELS) as [StudentStatus, ...StudentStatus[]]),
  classroom_id: z.string(),
});
type FormValues = z.infer<typeof schema>;
const EMPTY: FormValues = { student_code: "", prefix: "เด็กชาย", first_name: "", last_name: "", status: "active", classroom_id: "" };

/** ทะเบียนนักเรียน — ข้อมูลจากฐานข้อมูลโรงเรียนจริงเท่านั้น (ยังไม่มีข้อมูล = Empty State) */
export function StudentsPage() {
  const { can } = useAuth();
  const canManage = can("students.manage");
  const students = useStudents();
  const classrooms = useClassrooms();
  const grades = useGradeLevels();
  const years = useAcademicYears();
  const crud = useCrudState<Student>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [room, setRoom] = useState("");

  const roomLabel = useMemo(() => {
    const g = new Map(grades.data?.map((x) => [x.id, x.name_th]));
    const y = new Map(years.data?.map((x) => [x.id, x.year_be]));
    return new Map((classrooms.data ?? []).map((c) => [c.id, `${g.get(c.grade_level_id) ?? "?"}/${c.room_no} (${y.get(c.academic_year_id) ?? "?"})`]));
  }, [classrooms.data, grades.data, years.data]);

  const all = students.data ?? [];
  const rows = all.filter(
    (s) =>
      matchesSearch(search, s.student_code, s.first_name, s.last_name, s.prefix + s.first_name) &&
      (!status || s.status === status) &&
      (!room || (room === "none" ? s.classroom_students.length === 0 : s.classroom_students.some((c) => c.classroom_id === room))),
  );
  const columns: Column<Student>[] = [
    { key: "code", header: "รหัสนักเรียน", cell: (s) => <code className="text-xs">{s.student_code}</code>, className: "w-32" },
    { key: "name", header: "ชื่อ–สกุล", cell: (s) => <span className="font-medium">{studentName(s)}</span> },
    {
      key: "room",
      header: "ห้องเรียน",
      cell: (s) => (s.classroom_students[0] ? (roomLabel.get(s.classroom_students[0].classroom_id) ?? "–") : <span className="text-muted-foreground">ยังไม่จัดห้อง</span>),
    },
    { key: "status", header: "สถานะ", cell: (s) => <Badge variant={STATUS_VARIANT[s.status]}>{STUDENT_STATUS_LABELS[s.status]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="ทะเบียนนักเรียน"
        description="ข้อมูลนักเรียนเป็นข้อมูลส่วนบุคคล — เห็นได้ตามสิทธิ์ของบทบาท และเพิ่ม/แก้ไขได้เฉพาะฝ่ายวิชาการ"
        actions={canManage && <Button onClick={crud.openCreate}><UserPlus /> เพิ่มนักเรียน</Button>}
      />
      {!canManage && <ReadOnlyNotice text="คุณมีสิทธิ์ดูข้อมูลอย่างเดียว" />}
      <section aria-label="สรุปทะเบียน" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard label="ทั้งหมด" value={all.length} loading={students.isPending} />
        <KpiCard label="กำลังศึกษา" value={all.filter((s) => s.status === "active").length} tone="ok" loading={students.isPending} />
        <KpiCard label="ยังไม่จัดห้อง" value={all.filter((s) => s.status === "active" && !s.classroom_students.length).length} tone="accent" loading={students.isPending} />
      </section>
      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหารหัสหรือชื่อ">
        <Select value={room} onChange={(e) => setRoom(e.target.value)} aria-label="กรองตามห้องเรียน" className="sm:w-56">
          <option value="">ทุกห้องเรียน</option>
          {[...roomLabel].map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          <option value="none">ยังไม่จัดห้อง</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="กรองตามสถานะ" className="sm:w-44">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STUDENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </TableToolbar>
      <DataTable
        caption="รายชื่อนักเรียน"
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        loading={students.isPending}
        error={students.error ? dbErrorMessage(students.error) : null}
        emptyText={all.length ? "ไม่พบรายการที่ตรงกับตัวกรอง" : "ยังไม่มีข้อมูลนักเรียนในทะเบียน"}
        actions={canManage ? (s) => <Button size="sm" variant="ghost" onClick={() => crud.openEdit(s)} aria-label={`แก้ไข ${studentName(s)}`}><Pencil /> แก้ไข</Button> : undefined}
      />
      <StudentFormDialog open={crud.formOpen} editing={crud.editing} rooms={[...roomLabel]} onClose={crud.closeForm} />
    </>
  );
}

function StudentFormDialog({ open, editing, rooms, onClose }: { open: boolean; editing: Student | null; rooms: [string, string][]; onClose: () => void }) {
  const defaults: FormValues = editing ? { ...editing, classroom_id: editing.classroom_students[0]?.classroom_id ?? "" } : EMPTY;
  const form = useForm<FormValues>({ resolver: zodResolver(schema), values: defaults });
  const save = useMdMutation(
    (v: FormValues) => {
      const { classroom_id, ...input } = v;
      return editing ? updateStudent(editing, input as StudentInput, classroom_id || null) : insertStudent(input as StudentInput, classroom_id || null);
    },
    { success: editing ? "บันทึกการแก้ไขเรียบร้อย" : "เพิ่มนักเรียนเรียบร้อย", invalidate: [studentsKey] },
  );
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? `แก้ไขข้อมูล ${studentName(editing)}` : "เพิ่มนักเรียน"}>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).then(onClose, () => undefined))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="รหัสนักเรียน" htmlFor="student_code" error={errors.student_code?.message}>
              <Input id="student_code" autoComplete="off" {...form.register("student_code")} />
            </FormField>
            <FormField label="คำนำหน้า" htmlFor="prefix" error={errors.prefix?.message}>
              <Input id="prefix" list="student-prefix-options" {...form.register("prefix")} />
              <datalist id="student-prefix-options">{["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว"].map((p) => <option key={p} value={p} />)}</datalist>
            </FormField>
            <FormField label="ชื่อ" htmlFor="first_name" error={errors.first_name?.message}><Input id="first_name" {...form.register("first_name")} /></FormField>
            <FormField label="นามสกุล" htmlFor="last_name" error={errors.last_name?.message}><Input id="last_name" {...form.register("last_name")} /></FormField>
            <FormField label="สถานะ" htmlFor="status" error={errors.status?.message}>
              <Select id="status" {...form.register("status")}>{Object.entries(STUDENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </FormField>
            <FormField label="ห้องเรียน" htmlFor="classroom_id" error={errors.classroom_id?.message}>
              <Select id="classroom_id" {...form.register("classroom_id")}>
                <option value="">ยังไม่จัดห้อง</option>
                {rooms.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </Select>
            </FormField>
          </div>
          <FormActions onCancel={onClose} busy={isSubmitting} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
