import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ListPlus, Pencil, Plus, UserCog, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, FormField, Input, Select } from "@/components/ui/form-controls";
import { ActiveBadge, ConfirmDialog, DataTable, PageHeader, TableToolbar, type Column } from "@/components/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { dbErrorMessage } from "@/lib/db-errors";
import {
  areaHeadsKey, assignAreaHead, insertRows, mdKey, revokeAreaHead, updateRow, useAreaHeads, useLearningAreas, useMdMutation,
} from "../api";
import { STANDARD_LEARNING_AREAS, type AreaHeadAssignment, type LearningArea, type SchoolProfile } from "../types";
import { matchesSearch, useCrudState } from "../use-crud-state";
import { FormActions, ReadOnlyNotice, StatusFilter, statusMatches } from "./parts";
import { ToggleActiveButton } from "./ToggleActiveButton";

const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,16}$/, "รหัสใช้ได้เฉพาะ A–Z, 0–9, - และ _ (ไม่เกิน 16 ตัว)"),
  name_th: z.string().trim().min(1, "กรุณากรอกชื่อกลุ่มสาระ").max(200),
  sort_order: z.coerce.number<number>().int().min(0).max(999),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function LearningAreasPage() {
  const { can, roles } = useAuth();
  const canManage = can("learningareas.manage");
  const canAssign = can("roles.manage");
  // admin/หัวหน้าวิชาการอ่าน user_roles ทั้งโรงเรียนได้ (ตาม RLS) จึงแสดงคอลัมน์หัวหน้า
  const canSeeHeads = roles.includes("system_admin") || roles.includes("academic_head");
  const scopedOnly = roles.includes("learning_area_head") && !can("masterdata.manage") && !roles.includes("executive");

  const areas = useLearningAreas();
  const heads = useAreaHeads(canSeeHeads);
  const crud = useCrudState<LearningArea>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [addingStandard, setAddingStandard] = useState(false);
  const [headsFor, setHeadsFor] = useState<LearningArea | null>(null);

  const profileById = useMemo(() => new Map(heads.data?.profiles.map((p) => [p.id, p])), [heads.data]);
  const headNames = (areaId: string) =>
    heads.data?.assignments
      .filter((a) => a.learning_area_id === areaId)
      .map((a) => profileById.get(a.user_id)?.display_name || profileById.get(a.user_id)?.email || "–")
      .join(", ") || "–";

  const rows = areas.data?.filter((a) => matchesSearch(search, a.code, a.name_th) && statusMatches(status, a.is_active));
  const missingStandard = STANDARD_LEARNING_AREAS.filter((s) => !areas.data?.some((a) => a.code === s.code));

  const toggle = useMdMutation((a: LearningArea) => updateRow("learning_areas", a.id, { is_active: !a.is_active }), {
    success: (a) => (a.is_active ? `ปิดใช้งานกลุ่มสาระ${a.name_th}แล้ว` : `เปิดใช้งานกลุ่มสาระ${a.name_th}แล้ว`),
    invalidate: [mdKey("learning_areas")],
  });
  const addStandard = useMdMutation(() => insertRows("learning_areas", missingStandard.map((s) => ({ ...s, is_active: true }))), {
    success: () => `เพิ่มกลุ่มสาระมาตรฐาน ${missingStandard.length} กลุ่ม`,
    invalidate: [mdKey("learning_areas")],
  });

  const columns: Column<LearningArea>[] = [
    { key: "order", header: "ลำดับ", cell: (a) => a.sort_order, className: "w-20 tabular-nums" },
    { key: "code", header: "รหัส", cell: (a) => <code className="text-xs">{a.code}</code> },
    { key: "name", header: "กลุ่มสาระการเรียนรู้", cell: (a) => <span className="font-medium">{a.name_th}</span> },
    ...(canSeeHeads ? [{ key: "heads", header: "หัวหน้ากลุ่มสาระ", cell: (a: LearningArea) => headNames(a.id) }] : []),
    { key: "status", header: "สถานะ", cell: (a) => <ActiveBadge active={a.is_active} /> },
  ];

  return (
    <>
      <PageHeader
        title="กลุ่มสาระการเรียนรู้"
        description="8 กลุ่มสาระตามหลักสูตรแกนกลาง และกลุ่มที่โรงเรียนกำหนดเอง"
        actions={
          canManage && (
            <>
              {missingStandard.length > 0 && areas.data && (
                <Button variant="outline" onClick={() => setAddingStandard(true)}><ListPlus /> เพิ่ม 8 กลุ่มสาระมาตรฐาน</Button>
              )}
              <Button onClick={crud.openCreate}><Plus /> เพิ่มกลุ่มสาระ</Button>
            </>
          )
        }
      />
      {scopedOnly && <ReadOnlyNotice text="คุณเห็นเฉพาะกลุ่มสาระที่ได้รับมอบหมายเป็นหัวหน้า" />}
      {!scopedOnly && !canManage && <ReadOnlyNotice />}
      <TableToolbar search={search} onSearch={setSearch} placeholder="ค้นหาชื่อหรือรหัส">
        <StatusFilter value={status} onChange={setStatus} />
      </TableToolbar>
      <DataTable
        caption="รายการกลุ่มสาระการเรียนรู้"
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        loading={areas.isPending}
        error={areas.error ? dbErrorMessage(areas.error) : null}
        emptyText={scopedOnly ? "ยังไม่ได้รับมอบหมายกลุ่มสาระ" : "ยังไม่มีกลุ่มสาระ"}
        rowClassName={(a) => (a.is_active ? undefined : "opacity-60")}
        actions={
          canManage || canAssign
            ? (a) => (
                <>
                  {canManage && <Button size="sm" variant="ghost" onClick={() => crud.openEdit(a)}><Pencil /> แก้ไข</Button>}
                  {canAssign && (
                    <Button size="sm" variant="ghost" onClick={() => setHeadsFor(a)} aria-label={`จัดการหัวหน้ากลุ่มสาระ${a.name_th}`}>
                      <UserCog /> หัวหน้า
                    </Button>
                  )}
                  {canManage && <ToggleActiveButton active={a.is_active} label={a.name_th} onClick={() => crud.setConfirming(a)} />}
                </>
              )
            : undefined
        }
      />

      <AreaFormDialog
        open={crud.formOpen}
        editing={crud.editing}
        defaults={crud.editing ?? { code: "", name_th: "", sort_order: (areas.data?.at(-1)?.sort_order ?? 0) + 1, is_active: true }}
        onClose={crud.closeForm}
      />
      <ConfirmDialog
        open={crud.confirming !== null}
        onOpenChange={(o) => !o && crud.setConfirming(null)}
        title={`${crud.confirming?.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}กลุ่มสาระ${crud.confirming?.name_th ?? ""}?`}
        description={crud.confirming?.is_active ? "ข้อมูลเดิมและการมอบหมายหัวหน้ายังคงอยู่" : "กลุ่มสาระนี้จะกลับมาใช้งานได้"}
        confirmLabel={crud.confirming?.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        destructive={crud.confirming?.is_active}
        onConfirm={() => toggle.mutateAsync(crud.confirming!)}
      />
      <ConfirmDialog
        open={addingStandard}
        onOpenChange={setAddingStandard}
        title="เพิ่มกลุ่มสาระมาตรฐาน?"
        description={`จะเพิ่ม ${missingStandard.map((s) => s.name_th).join(", ")}`}
        confirmLabel="เพิ่ม"
        onConfirm={() => addStandard.mutateAsync(undefined)}
      />
      {canAssign && headsFor && (
        <AreaHeadsDialog
          area={headsFor}
          onClose={() => setHeadsFor(null)}
          assignments={heads.data?.assignments.filter((a) => a.learning_area_id === headsFor.id) ?? []}
          profiles={heads.data?.profiles ?? []}
        />
      )}
    </>
  );
}

function AreaFormDialog({ open, editing, defaults, onClose }: { open: boolean; editing: LearningArea | null; defaults: FormValues; onClose: () => void }) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), values: defaults });
  const save = useMdMutation(
    (v: FormValues) =>
      editing
        ? updateRow("learning_areas", editing.id, { name_th: v.name_th, sort_order: v.sort_order, is_active: v.is_active })
        : insertRows("learning_areas", v),
    { success: editing ? "บันทึกการแก้ไขเรียบร้อย" : "เพิ่มกลุ่มสาระเรียบร้อย", invalidate: [mdKey("learning_areas")] },
  );
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? "แก้ไขกลุ่มสาระ" : "เพิ่มกลุ่มสาระ"}>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).then(onClose, () => undefined))}>
          <FormField label="ชื่อกลุ่มสาระการเรียนรู้" htmlFor="name_th" error={errors.name_th?.message}>
            <Input id="name_th" {...form.register("name_th")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="รหัส" htmlFor="code" error={errors.code?.message} hint={editing ? "แก้ไขรหัสไม่ได้" : "เช่น MA"}>
              <Input id="code" disabled={!!editing} {...form.register("code")} />
            </FormField>
            <FormField label="ลำดับการแสดงผล" htmlFor="sort_order" error={errors.sort_order?.message}>
              <Input id="sort_order" type="number" inputMode="numeric" {...form.register("sort_order")} />
            </FormField>
          </div>
          <Checkbox label="เปิดใช้งาน" {...form.register("is_active")} />
          <FormActions onCancel={onClose} busy={isSubmitting} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** มอบหมาย/ถอนหัวหน้ากลุ่มสาระ — เฉพาะ system_admin (RLS บังคับซ้ำ) */
function AreaHeadsDialog({
  area, assignments, profiles, onClose,
}: {
  area: LearningArea; assignments: AreaHeadAssignment[]; profiles: SchoolProfile[]; onClose: () => void;
}) {
  const { access } = useAuth();
  const [userId, setUserId] = useState("");
  const [revoking, setRevoking] = useState<AreaHeadAssignment | null>(null);
  const name = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.display_name || p?.email || "–";
  };
  const candidates = profiles.filter((p) => p.is_active && p.id !== access?.user_id && !assignments.some((a) => a.user_id === p.id));
  const assign = useMdMutation(() => assignAreaHead(userId, access!.school!.id, area.id), {
    success: () => `มอบหมาย ${name(userId)} เป็นหัวหน้ากลุ่มสาระเรียบร้อย`,
    invalidate: [areaHeadsKey],
  });
  const revoke = useMdMutation((a: AreaHeadAssignment) => revokeAreaHead(a.id), {
    success: (a) => `ถอนสิทธิ์หัวหน้ากลุ่มสาระของ ${name(a.user_id)} แล้ว`,
    invalidate: [areaHeadsKey],
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`หัวหน้ากลุ่มสาระ${area.name_th}`} description="ผู้ได้รับมอบหมายจะเห็นข้อมูลเฉพาะกลุ่มสาระนี้ (ไม่สามารถมอบหมายให้ตนเองได้)">
        <ul className="mb-4 divide-y rounded-lg border">
          {assignments.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">ยังไม่มีหัวหน้ากลุ่มสาระ</li>}
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>{name(a.user_id)}</span>
              <Button size="sm" variant="ghost" onClick={() => setRevoking(a)} aria-label={`ถอนสิทธิ์ ${name(a.user_id)}`}>
                <UserMinus /> ถอนสิทธิ์
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (userId) void assign.mutateAsync(undefined).then(() => setUserId(""), () => undefined);
          }}
        >
          <div className="flex-1">
            <FormField label="มอบหมายผู้ใช้" htmlFor="head_user">
              <Select id="head_user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">เลือกบุคลากร</option>
                {candidates.map((p) => <option key={p.id} value={p.id}>{p.display_name || p.email}</option>)}
              </Select>
            </FormField>
          </div>
          <Button type="submit" disabled={!userId || assign.isPending}>มอบหมาย</Button>
        </form>
        <ConfirmDialog
          open={revoking !== null}
          onOpenChange={(o) => !o && setRevoking(null)}
          title={`ถอนสิทธิ์หัวหน้ากลุ่มสาระของ ${revoking ? name(revoking.user_id) : ""}?`}
          description="ผู้ใช้จะไม่เห็นข้อมูลของกลุ่มสาระนี้อีก (มีผลทันทีที่ฐานข้อมูล)"
          confirmLabel="ถอนสิทธิ์"
          destructive
          onConfirm={() => revoke.mutateAsync(revoking!)}
        />
      </DialogContent>
    </Dialog>
  );
}
