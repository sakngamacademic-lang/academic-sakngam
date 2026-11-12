import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, FileUp, Pencil, Search, Send, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-controls";
import { ConfirmDialog, PageHeader } from "@/components/shared";
import { DashSection, KpiCard, LiveBadge } from "@/components/dashboard";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLearningAreas } from "@/features/master-data/api";
import { useTeachers } from "@/features/teachers/api";
import { fullName } from "@/features/teachers/types";
import { CATEGORY_LABELS, documentsKey, useTaskTemplates } from "@/features/documents/api";
import { DocumentFiles } from "@/features/documents/pages/DocumentFiles";
import { ACCEPT_ATTR, edgeFunctionStorage, StorageError } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { dbErrorMessage } from "@/lib/db-errors";
import { formatDateTH } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  cancelAssignment,
  cancelTask,
  EXT_LABELS,
  isOverdue,
  publishTask,
  tasksKey,
  updateTask,
  useTask,
  type PublishMode,
  type Task,
} from "../api";
import { AssignmentStatusBadge, dueText, TaskStatusBadge } from "./TaskStatusBadge";
import { TaskForm } from "./TaskForm";

export function TaskDetailPage() {
  const { taskId } = useParams();
  const { can } = useAuth();
  const q = useTask(taskId);
  const areas = useLearningAreas();
  const teachers = useTeachers();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const task = q.data?.task;
  const assignments = q.data?.assignments ?? [];
  const areaName = useMemo(() => new Map(areas.data?.map((a) => [a.id, a.name_th])), [areas.data]);
  const teacherById = useMemo(() => new Map(teachers.data?.map((t) => [t.id, t])), [teachers.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: tasksKey });

  if (q.isPending) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (q.error) return <p role="alert" className="text-sm text-destructive">{dbErrorMessage(q.error)}</p>;
  if (!task) return <p role="alert" className="text-sm">ไม่พบงาน หรือคุณไม่มีสิทธิ์เข้าถึงงานนี้</p>;

  // ปุ่มจัดการแสดงตามสิทธิ์ทั่วไป — ฐานข้อมูลตรวจขอบเขตกลุ่มสาระอีกครั้งทุกคำสั่ง
  const editable = can("tasks.manage") && (task.status === "draft" || task.status === "published");
  const active = assignments.filter((a) => a.status !== "cancelled");
  const count = (s: string) => assignments.filter((a) => a.status === s).length;
  const overdue = assignments.filter((a) => isOverdue(task.due_at, a.status, task.status)).length;
  const due = dueText(task.due_at);

  return (
    <>
      <Link to="/office/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> รายการงาน
      </Link>
      <PageHeader
        title={task.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            {task.learning_area_id ? `กลุ่มสาระ${areaName.get(task.learning_area_id) ?? ""}` : "ทั้งโรงเรียน"} · {CATEGORY_LABELS[task.category]}
          </span>
        }
        actions={
          editable && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> แก้ไข</Button>
              <Button variant="outline" className="text-destructive" onClick={() => setCancelling(true)}><Ban /> ยกเลิกงาน</Button>
            </>
          )
        }
      />
      {task.status === "cancelled" && (
        <p role="status" className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          งานนี้ถูกยกเลิกแล้ว — เหตุผล: {task.cancel_reason} · ประวัติการมอบหมายและเอกสารที่ส่งแล้วยังเก็บไว้ครบ
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <DashSection id="task-info" title="รายละเอียดและข้อกำหนด" className="xl:col-span-2">
          {task.description && <p className="mb-4 text-sm whitespace-pre-line">{task.description}</p>}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">วันเริ่มต้น</dt><dd>{formatDateTH(task.starts_at)}</dd></div>
            <div>
              <dt className="text-muted-foreground">วันครบกำหนด</dt>
              <dd>{formatDateTH(task.due_at)} {task.status === "published" && <span className={due.tone}>({due.text})</span>}</dd>
            </div>
            <div><dt className="text-muted-foreground">ชนิดไฟล์ที่รับ</dt><dd>{task.allowed_exts.map((e) => EXT_LABELS[e]).join(", ")}</dd></div>
            <div><dt className="text-muted-foreground">จำนวนไฟล์สูงสุด</dt><dd>{task.max_files} ไฟล์</dd></div>
          </dl>
        </DashSection>
        <TemplatesSection task={task} editable={editable} />
      </div>

      {editable && <PublishSection task={task} assignedTeacherIds={new Set(assignments.map((a) => a.teacher_id))} onDone={refresh} />}

      <DashSection id="recipients" className="mt-4" title={<span className="flex items-center gap-2">ผู้รับและสถานะ <LiveBadge /></span>} meta={`${active.length} คน`}>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="ยังไม่ส่ง" value={count("assigned") + count("revision_requested")} />
          <KpiCard label="ส่งแล้ว รอตรวจ" tone="accent" value={count("submitted")} />
          <KpiCard label="ตรวจรับแล้ว" tone="ok" value={count("approved")} />
          <KpiCard label="เลยกำหนด" tone="alert" value={overdue} />
        </div>
        {assignments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่ได้มอบหมายให้ครู</p>
        ) : (
          <ul className="divide-y">
            {assignments
              .map((a) => ({ a, t: teacherById.get(a.teacher_id) }))
              .sort((x, y) => (x.t?.teacher_code ?? "").localeCompare(y.t?.teacher_code ?? ""))
              .map(({ a, t }) => (
                <li key={a.id} data-testid="recipient" className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{t ? fullName(t) : "ครู"} <span className="text-xs text-muted-foreground">({t?.teacher_code})</span></span>
                    <span className="block text-xs text-muted-foreground">
                      {t?.learning_area_id ? areaName.get(t.learning_area_id) : "ไม่สังกัดกลุ่มสาระ"}
                      {a.last_submitted_at && ` · ส่งล่าสุด ${formatDateTH(a.last_submitted_at)} (ฉบับที่ ${a.current_version})`}
                      {t && !t.profile_id && " · ยังไม่มีบัญชีเข้าระบบ"}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <AssignmentStatusBadge status={a.status} overdue={isOverdue(task.due_at, a.status, task.status)} />
                    {editable && (a.status === "assigned" || a.status === "revision_requested") && (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(a.id)} aria-label={`ยกเลิกการมอบหมาย ${t ? fullName(t) : ""}`}>
                        <UserMinus />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </DashSection>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="แก้ไขงาน" className="max-w-2xl">
          <TaskForm
            task={task}
            submitLabel="บันทึกการแก้ไข"
            onCancel={() => setEditing(false)}
            onSubmit={async (v) => {
              try {
                await updateTask(task.id, v);
                toast.success("บันทึกการแก้ไขแล้ว");
                setEditing(false);
                await refresh();
              } catch (e) {
                toast.error(dbErrorMessage(e));
                throw e;
              }
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent title="ยกเลิกงานนี้?" description="ครูที่ยังไม่ส่งจะถูกยกเลิกการมอบหมาย งานที่ส่งแล้วยังเก็บไว้เป็นหลักฐาน">
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await cancelTask(task.id, reason);
                toast.success("ยกเลิกงานแล้ว");
                setCancelling(false);
                await refresh();
              } catch (err) {
                toast.error(dbErrorMessage(err));
              }
            }}
          >
            <FormField label="เหตุผลการยกเลิก" htmlFor="cancel-reason">
              <textarea id="cancel-reason" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCancelling(false)}>ปิด</Button>
              <Button type="submit" variant="destructive" disabled={!reason.trim()}>ยืนยันยกเลิกงาน</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="ยกเลิกการมอบหมายครูคนนี้?"
        description="ประวัติการมอบหมายยังคงบันทึกไว้"
        confirmLabel="ยกเลิกการมอบหมาย"
        destructive
        onConfirm={async () => {
          try {
            await cancelAssignment(removing!);
            toast.success("ยกเลิกการมอบหมายแล้ว");
            await refresh();
          } catch (e) {
            toast.error(dbErrorMessage(e));
            throw e;
          }
        }}
      />
    </>
  );
}

/** แม่แบบเอกสาร — อัปโหลดผ่าน Storage Adapter (Phase 1.6) */
function TemplatesSection({ task, editable }: { task: Task; editable: boolean }) {
  const tpl = useTaskTemplates(task.id);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      await edgeFunctionStorage.upload(file, { taskId: task.id });
      toast.success("แนบแม่แบบแล้ว");
    } catch (e) {
      toast.error(e instanceof StorageError ? e.message : dbErrorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: documentsKey });
    }
  };
  return (
    <DashSection id="templates" title="แม่แบบเอกสาร" meta={`${tpl.data?.length ?? 0} ไฟล์`}>
      {tpl.data?.length ? <DocumentFiles files={tpl.data} canDelete={editable} canLock={false} /> : <p className="text-sm text-muted-foreground">ยังไม่มีแม่แบบ</p>}
      {editable && (
        <label className={cn("mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground hover:border-input", busy && "opacity-60")}>
          <FileUp className="size-4" /> {busy ? "กำลังอัปโหลด…" : "แนบแม่แบบ (PDF / Word / Excel ≤ 20 MB)"}
          <input ref={fileRef} type="file" accept={ACCEPT_ATTR} className="sr-only" aria-label="แนบแม่แบบ" disabled={busy} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </label>
      )}
    </DashSection>
  );
}

/** เลือกผู้รับ: ทั้งหมด / ตามกลุ่มสาระ / รายบุคคล — RPC task_publish ข้ามผู้ที่ได้รับมอบหมายแล้ว */
function PublishSection({ task, assignedTeacherIds, onDone }: { task: Task; assignedTeacherIds: Set<string>; onDone: () => Promise<unknown> }) {
  const areas = useLearningAreas();
  const teachers = useTeachers();
  const [mode, setMode] = useState<PublishMode>(task.learning_area_id ? "learning_areas" : "all");
  const [areaIds, setAreaIds] = useState<string[]>(task.learning_area_id ? [task.learning_area_id] : []);
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const candidates = (teachers.data ?? []).filter(
    (t) => t.employment_status === "active" && !assignedTeacherIds.has(t.id) && `${t.teacher_code} ${t.first_name} ${t.last_name}`.includes(search.trim()),
  );
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const ready = mode === "all" || (mode === "learning_areas" ? areaIds.length > 0 : teacherIds.length > 0);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await publishTask(task.id, mode, areaIds, teacherIds);
      toast.success(`มอบหมายใหม่ ${r.assigned_count} คน${r.skipped_count ? ` · ข้ามผู้ที่ได้รับมอบหมายแล้ว ${r.skipped_count} คน` : ""}`);
      setTeacherIds([]);
      await onDone();
    } catch (e) {
      toast.error(dbErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const modeBtn = (m: PublishMode, label: string) => (
    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm has-checked:border-primary/60 has-checked:bg-primary/15">
      <input type="radio" name="publish-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--violet)]" />
      {label}
    </label>
  );

  return (
    <DashSection
      id="publish"
      className="mt-4"
      title={task.status === "draft" ? "ขั้นที่ 2: เลือกผู้รับและเผยแพร่" : "เพิ่มผู้รับ"}
      meta={task.status === "draft" ? "ครูจะเห็นงานทันทีหลังเผยแพร่" : "ผู้ที่ได้รับมอบหมายแล้วจะไม่ถูกเพิ่มซ้ำ"}
    >
      <fieldset className="mb-4 flex flex-wrap gap-2">
        <legend className="sr-only">วิธีเลือกผู้รับ</legend>
        {modeBtn("all", task.learning_area_id ? "ครูทุกคนในขอบเขต" : "ครูผู้สอนทั้งหมด")}
        {modeBtn("learning_areas", "ตามกลุ่มสาระ")}
        {modeBtn("teachers", "เลือกรายบุคคล")}
      </fieldset>
      {mode === "learning_areas" && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="เลือกกลุ่มสาระ">
          {areas.data?.filter((a) => a.is_active).map((a) => (
            <label key={a.id} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-checked:border-primary/60 has-checked:bg-primary/15">
              <input type="checkbox" checked={areaIds.includes(a.id)} onChange={() => setAreaIds(toggle(areaIds, a.id))} className="accent-[var(--violet)]" />
              {a.name_th}
            </label>
          ))}
        </div>
      )}
      {mode === "teachers" && (
        <div className="mb-4">
          <label className="relative mb-2 block sm:w-72">
            <span className="sr-only">ค้นหาครู</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัสหรือชื่อครู" className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm" />
          </label>
          <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2" aria-label="รายชื่อครู">
            {candidates.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                  <input type="checkbox" checked={teacherIds.includes(t.id)} onChange={() => setTeacherIds(toggle(teacherIds, t.id))} className="accent-[var(--violet)]" />
                  <span className="truncate">{fullName(t)} <span className="text-xs text-muted-foreground">({t.teacher_code})</span></span>
                </label>
              </li>
            ))}
            {candidates.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">ไม่มีครูที่เลือกได้</li>}
          </ul>
        </div>
      )}
      <Button onClick={() => void submit()} disabled={!ready || busy}>
        <Send /> {task.status === "draft" ? "เผยแพร่และมอบหมาย" : "มอบหมายเพิ่ม"}
        {mode === "teachers" && teacherIds.length > 0 && ` (${teacherIds.length} คน)`}
      </Button>
    </DashSection>
  );
}
