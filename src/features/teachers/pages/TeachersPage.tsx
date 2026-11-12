import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link2, Link2Off, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { ConfirmDialog, DataTable, PageHeader, TableToolbar, type Column } from "@/components/shared";
import { KpiCard } from "@/components/dashboard";
import { useAuth } from "@/features/auth/AuthProvider";
import { hasAnyRole } from "@/features/auth/roles";
import { useLearningAreas, useMdMutation } from "@/features/master-data/api";
import { FormActions, ReadOnlyNotice } from "@/features/master-data/pages/parts";
import { matchesSearch, useCrudState } from "@/features/master-data/use-crud-state";
import { dbErrorMessage } from "@/lib/db-errors";
import {
  insertTeacher,
  linkTeacherAccount,
  teachersKey,
  unlinkTeacherAccount,
  updateTeacher,
  useSchoolAccounts,
  useTeachers,
  type TeacherInput,
} from "../api";
import { fullName, POSITION_LABELS, PREFIX_OPTIONS, STATUS_LABELS, type EmploymentStatus, type Teacher, type TeacherPosition } from "../types";

const STATUS_VARIANT: Record<EmploymentStatus, BadgeProps["variant"]> = {
  active: "success",
  on_leave: "warning",
  transferred: "secondary",
  retired: "secondary",
  resigned: "secondary",
};

const schema = z.object({
  teacher_code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/, "รหัสใช้ได้เฉพาะ A–Z, 0–9, - และ _ (ไม่เกิน 32 ตัว)"),
  prefix: z.string().trim().min(1, "กรุณาระบุคำนำหน้า").max(50),
  first_name: z.string().trim().min(1, "กรุณากรอกชื่อ").max(100),
  last_name: z.string().trim().min(1, "กรุณากรอกนามสกุล").max(100),
  position: z.enum(Object.keys(POSITION_LABELS) as [TeacherPosition, ...TeacherPosition[]]),
  learning_area_id: z.string(),
  employment_status: z.enum(Object.keys(STATUS_LABELS) as [EmploymentStatus, ...EmploymentStatus[]]),
  email: z.union([z.literal(""), z.email("รูปแบบอีเมลไม่ถูกต้อง").max(200)]),
});
type FormValues = z.infer<typeof schema>;

const toInput = (v: FormValues): TeacherInput => ({
  ...v,
  learning_area_id: v.learning_area_id || null,
  email: v.email.trim() ? v.email.trim().toLowerCase() : null,
});

const EMPTY: FormValues = {
  teacher_code: "",
  prefix: "นาย",
  first_name: "",
  last_name: "",
  position: "teacher",
  learning_area_id: "",
  employment_status: "active",
  email: "",
};

export function TeachersPage() {
  const { can, access, roles } = useAuth();
  const canManage = can("teachers.manage");
  const canLink = can("teachers.link");
  const teachers = useTeachers();
  const areas = useLearningAreas();
  const crud = useCrudState<Teacher>();
  const [linking, setLinking] = useState<Teacher | null>(null);
  const [unlinking, setUnlinking] = useState<Teacher | null>(null);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("active");
  const [account, setAccount] = useState("");

  const areaName = useMemo(() => new Map(areas.data?.map((a) => [a.id, a.name_th])), [areas.data]);
  const all = teachers.data ?? [];
  const rows = teachers.data?.filter(
    (t) =>
      matchesSearch(search, t.teacher_code, t.prefix + t.first_name, t.first_name, t.last_name, t.email) &&
      (!area || (area === "none" ? !t.learning_area_id : t.learning_area_id === area)) &&
      (!position || t.position === position) &&
      (!status || t.employment_status === status) &&
      (!account || (account === "linked") === !!t.profile_id),
  );
  // หัวหน้ากลุ่มสาระที่ไม่มีบทบาทระดับโรงเรียน: RLS ส่งเฉพาะครูในกลุ่มสาระของตน
  const isAreaScoped = !hasAnyRole(roles, ["system_admin", "academic_head", "academic_staff", "executive"]) && (access?.learning_area_ids?.length ?? 0) > 0;
  const scopeNames = (access?.learning_area_ids ?? []).map((id) => areaName.get(id)).filter(Boolean).join(", ");

  const unlink = useMdMutation((t: Teacher) => unlinkTeacherAccount(t.id), {
    success: (t) => `ยกเลิกการผูกบัญชีของ ${fullName(t)} แล้ว`,
    invalidate: [teachersKey],
  });

  const columns: Column<Teacher>[] = [
    { key: "code", header: "รหัส", cell: (t) => <code className="text-xs">{t.teacher_code}</code>, className: "w-24" },
    {
      key: "name",
      header: "ชื่อ–สกุล",
      cell: (t) => (
        <div className="min-w-0">
          <p className="font-medium">{fullName(t)}</p>
          {t.email && <p className="truncate text-xs text-muted-foreground">{t.email}</p>}
        </div>
      ),
    },
    { key: "position", header: "ตำแหน่ง", cell: (t) => POSITION_LABELS[t.position] },
    { key: "area", header: "กลุ่มสาระ", cell: (t) => (t.learning_area_id ? (areaName.get(t.learning_area_id) ?? "–") : <span className="text-muted-foreground">ไม่สังกัด</span>) },
    { key: "status", header: "สถานะ", cell: (t) => <Badge variant={STATUS_VARIANT[t.employment_status]}>{STATUS_LABELS[t.employment_status]}</Badge> },
    {
      key: "account",
      header: "บัญชีเข้าระบบ",
      cell: (t) => (t.profile_id ? <Badge variant="info">มีบัญชี</Badge> : <Badge variant="outline" className="text-muted-foreground">ยังไม่มีบัญชี</Badge>),
    },
  ];

  const linked = all.filter((t) => t.profile_id).length;
  const active = all.filter((t) => t.employment_status === "active").length;

  return (
    <>
      <PageHeader
        title="ทะเบียนครูและบุคลากร"
        description="ข้อมูลครูแยกจากบัญชีผู้ใช้ — เพิ่มครูที่ยังไม่มีบัญชีได้ และผูกบัญชีภายหลังโดยไม่สร้างบัญชีซ้ำ"
        actions={canManage && <Button onClick={crud.openCreate}><UserPlus /> เพิ่มครู / บุคลากร</Button>}
      />
      {!canManage && (
        <ReadOnlyNotice text={isAreaScoped && scopeNames ? `คุณดูข้อมูลได้อย่างเดียว เฉพาะกลุ่มสาระ: ${scopeNames}` : "คุณมีสิทธิ์ดูข้อมูลอย่างเดียว"} />
      )}

      <section aria-label="สรุปทะเบียน" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="ทั้งหมด" value={all.length} loading={teachers.isPending} />
        <KpiCard label="ปฏิบัติงาน" value={active} tone="ok" loading={teachers.isPending} />
        <KpiCard label="มีบัญชีเข้าระบบ" value={linked} tone="accent" loading={teachers.isPending} />
        <KpiCard label="ยังไม่มีบัญชี" value={all.length - linked} loading={teachers.isPending} />
      </section>

      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหารหัส ชื่อ หรืออีเมล">
        <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="กรองตามกลุ่มสาระ" className="sm:w-56">
          <option value="">ทุกกลุ่มสาระ</option>
          {areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name_th}</option>)}
          <option value="none">ไม่สังกัดกลุ่มสาระ</option>
        </Select>
        <Select value={position} onChange={(e) => setPosition(e.target.value)} aria-label="กรองตามตำแหน่ง" className="sm:w-48">
          <option value="">ทุกตำแหน่ง</option>
          {Object.entries(POSITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="กรองตามสถานะการทำงาน" className="sm:w-44">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="กรองตามบัญชีเข้าระบบ" className="sm:w-44">
          <option value="">บัญชี: ทั้งหมด</option>
          <option value="linked">มีบัญชีแล้ว</option>
          <option value="unlinked">ยังไม่มีบัญชี</option>
        </Select>
      </TableToolbar>

      <DataTable
        caption="รายชื่อครูและบุคลากร"
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        loading={teachers.isPending}
        error={teachers.error ? dbErrorMessage(teachers.error) : null}
        emptyText={all.length ? "ไม่พบรายการที่ตรงกับตัวกรอง" : "ยังไม่มีข้อมูลครูในทะเบียน"}
        rowClassName={(t) => (t.employment_status === "active" ? undefined : "opacity-70")}
        actions={
          canManage || canLink
            ? (t) => (
                <>
                  {canManage && <Button size="sm" variant="ghost" onClick={() => crud.openEdit(t)} aria-label={`แก้ไข ${fullName(t)}`}><Pencil /> แก้ไข</Button>}
                  {canLink &&
                    (t.profile_id ? (
                      <Button size="sm" variant="ghost" onClick={() => setUnlinking(t)} aria-label={`ยกเลิกผูกบัญชี ${fullName(t)}`}><Link2Off /> ยกเลิกผูก</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setLinking(t)} aria-label={`ผูกบัญชี ${fullName(t)}`}><Link2 /> ผูกบัญชี</Button>
                    ))}
                </>
              )
            : undefined
        }
      />

      <TeacherFormDialog
        open={crud.formOpen}
        editing={crud.editing}
        areas={areas.data?.filter((a) => a.is_active || a.id === crud.editing?.learning_area_id) ?? []}
        onClose={crud.closeForm}
      />
      {canLink && <LinkAccountDialog teacher={linking} teachers={all} onClose={() => setLinking(null)} />}
      <ConfirmDialog
        open={unlinking !== null}
        onOpenChange={(o) => !o && setUnlinking(null)}
        title={`ยกเลิกการผูกบัญชีของ ${unlinking ? fullName(unlinking) : ""}?`}
        description="บัญชีผู้ใช้และบทบาทยังอยู่ครบ เพียงแต่ไม่เชื่อมกับระเบียนครูนี้แล้ว"
        confirmLabel="ยกเลิกการผูก"
        destructive
        onConfirm={() => unlink.mutateAsync(unlinking!)}
      />
    </>
  );
}

function TeacherFormDialog({
  open,
  editing,
  areas,
  onClose,
}: {
  open: boolean;
  editing: Teacher | null;
  areas: { id: string; name_th: string }[];
  onClose: () => void;
}) {
  const defaults: FormValues = editing
    ? { ...editing, learning_area_id: editing.learning_area_id ?? "", email: editing.email ?? "" }
    : EMPTY;
  const form = useForm<FormValues>({ resolver: zodResolver(schema), values: defaults });
  const save = useMdMutation((v: FormValues) => (editing ? updateTeacher(editing.id, toInput(v)) : insertTeacher(toInput(v))), {
    success: editing ? "บันทึกการแก้ไขเรียบร้อย" : "เพิ่มครูในทะเบียนเรียบร้อย",
    invalidate: [teachersKey],
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? `แก้ไขข้อมูล ${fullName(editing)}` : "เพิ่มครู / บุคลากร"}>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).then(onClose, () => undefined))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="รหัสประจำตัว" htmlFor="teacher_code" error={errors.teacher_code?.message} hint="เช่น T001">
              <Input id="teacher_code" autoComplete="off" {...form.register("teacher_code")} />
            </FormField>
            <FormField label="คำนำหน้า" htmlFor="prefix" error={errors.prefix?.message}>
              <Input id="prefix" list="prefix-options" {...form.register("prefix")} />
              <datalist id="prefix-options">{PREFIX_OPTIONS.map((p) => <option key={p} value={p} />)}</datalist>
            </FormField>
            <FormField label="ชื่อ" htmlFor="first_name" error={errors.first_name?.message}>
              <Input id="first_name" {...form.register("first_name")} />
            </FormField>
            <FormField label="นามสกุล" htmlFor="last_name" error={errors.last_name?.message}>
              <Input id="last_name" {...form.register("last_name")} />
            </FormField>
            <FormField label="ตำแหน่ง" htmlFor="position" error={errors.position?.message}>
              <Select id="position" {...form.register("position")}>
                {Object.entries(POSITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </FormField>
            <FormField label="กลุ่มสาระ" htmlFor="learning_area_id" error={errors.learning_area_id?.message}>
              <Select id="learning_area_id" {...form.register("learning_area_id")}>
                <option value="">ไม่สังกัดกลุ่มสาระ</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name_th}</option>)}
              </Select>
            </FormField>
            <FormField label="สถานะการทำงาน" htmlFor="employment_status" error={errors.employment_status?.message}>
              <Select id="employment_status" {...form.register("employment_status")}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </FormField>
            <FormField label="อีเมล (ไม่บังคับ)" htmlFor="email" error={errors.email?.message} hint="ใช้ช่วยจับคู่บัญชีเข้าระบบ">
              <Input id="email" type="email" inputMode="email" autoComplete="off" {...form.register("email")} />
            </FormField>
          </div>
          <FormActions onCancel={onClose} busy={isSubmitting} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** ผูกระเบียนครูกับบัญชีที่มีอยู่แล้ว — ไม่สร้างบัญชีใหม่ (บัญชีสร้างโดยผู้ดูแลระบบใน Supabase Auth) */
function LinkAccountDialog({ teacher, teachers, onClose }: { teacher: Teacher | null; teachers: Teacher[]; onClose: () => void }) {
  const accounts = useSchoolAccounts(teacher !== null);
  const [selected, setSelected] = useState("");
  const taken = new Set(teachers.map((t) => t.profile_id).filter(Boolean));
  const free = (accounts.data ?? []).filter((a) => !taken.has(a.id) && a.is_active);
  const suggested = teacher?.email ? free.find((a) => a.email?.toLowerCase() === teacher.email) : undefined;
  const value = selected || suggested?.id || "";
  const link = useMdMutation((v: { t: Teacher; profileId: string }) => linkTeacherAccount(v.t.id, v.profileId), {
    success: (v) => `ผูกบัญชีกับ ${fullName(v.t)} เรียบร้อย`,
    invalidate: [teachersKey, ["teachers", "accounts"]],
  });

  const close = () => {
    setSelected("");
    onClose();
  };

  return (
    <Dialog open={teacher !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent title={`ผูกบัญชีเข้าระบบ: ${teacher ? fullName(teacher) : ""}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (teacher && value) link.mutateAsync({ t: teacher, profileId: value }).then(close, () => undefined);
          }}
        >
          <p className="text-sm text-muted-foreground">
            เลือกจากบัญชีที่มีอยู่แล้วในโรงเรียนและยังไม่ได้ผูกกับครูคนอื่น ระบบไม่สร้างบัญชีใหม่และไม่เปลี่ยนบทบาทของบัญชี
          </p>
          <FormField label="บัญชีผู้ใช้" htmlFor="link-account" hint={suggested ? "แนะนำบัญชีที่อีเมลตรงกับทะเบียน" : undefined}>
            <Select id="link-account" value={value} onChange={(e) => setSelected(e.target.value)} disabled={accounts.isPending}>
              <option value="">{accounts.isPending ? "กำลังโหลด…" : free.length ? "— เลือกบัญชี —" : "ไม่มีบัญชีที่ว่าง"}</option>
              {free.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name || "(ไม่มีชื่อ)"} · {a.email}
                </option>
              ))}
            </Select>
          </FormField>
          {accounts.error && <p role="alert" className="text-sm text-destructive">{dbErrorMessage(accounts.error)}</p>}
          <FormActions onCancel={close} busy={link.isPending} label="ผูกบัญชี" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
