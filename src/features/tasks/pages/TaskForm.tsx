import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLearningAreas } from "@/features/master-data/api";
import { useCurrentPeriod } from "@/features/dashboard/use-current-period";
import { CATEGORY_LABELS } from "@/features/documents/api";
import { EXT_LABELS, type Task, type TaskInput } from "../api";

/** datetime-local ↔ ISO (เวลาท้องถิ่นของผู้ใช้) */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const schema = z
  .object({
    title: z.string().trim().min(1, "กรุณากรอกชื่องาน").max(200),
    description: z.string().max(5000),
    category: z.string(),
    learning_area_id: z.string(),
    starts_at: z.string().min(1, "กรุณาระบุวันเริ่มต้น"),
    due_at: z.string().min(1, "กรุณาระบุวันครบกำหนด"),
    allowed_exts: z.array(z.string()).min(1, "เลือกชนิดไฟล์อย่างน้อย 1 ชนิด"),
    max_files: z.coerce.number<number>().int().min(1, "อย่างน้อย 1 ไฟล์").max(10, "ไม่เกิน 10 ไฟล์"),
  })
  .refine((v) => new Date(v.due_at) > new Date(v.starts_at), { path: ["due_at"], message: "วันครบกำหนดต้องอยู่หลังวันเริ่มต้น" });
type FormValues = z.infer<typeof schema>;

export function TaskForm({ task, submitLabel, onSubmit, onCancel }: {
  task?: Task;
  submitLabel: string;
  onSubmit: (v: TaskInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const { roles } = useAuth();
  const areas = useLearningAreas();
  const period = useCurrentPeriod();
  // หัวหน้ากลุ่มสาระ (ไม่ใช่ฝ่ายวิชาการ) ต้องผูกงานกับกลุ่มสาระของตน
  const areaOnly = !roles.some((r) => r === "academic_head" || r === "academic_staff");
  const now = new Date();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: task
      ? { ...task, learning_area_id: task.learning_area_id ?? "", starts_at: toLocal(task.starts_at), due_at: toLocal(task.due_at) }
      : {
          title: "",
          description: "",
          category: "lesson_plan",
          learning_area_id: areaOnly ? (areas.data?.[0]?.id ?? "") : "",
          starts_at: toLocal(now.toISOString()),
          due_at: toLocal(new Date(now.getTime() + 7 * 86400000).toISOString()),
          allowed_exts: ["pdf", "docx"],
          max_files: 1,
        },
  });
  const { errors, isSubmitting } = form.formState;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((v) =>
        onSubmit({
          ...v,
          description: v.description.trim(),
          learning_area_id: v.learning_area_id || null,
          term_id: task?.term_id ?? period.term?.id ?? null,
          starts_at: new Date(v.starts_at).toISOString(),
          due_at: new Date(v.due_at).toISOString(),
        }).catch(() => undefined),
      )}
    >
      <FormField label="ชื่องาน" htmlFor="task-title" error={errors.title?.message}>
        <Input id="task-title" {...form.register("title")} />
      </FormField>
      <FormField label="รายละเอียด / ข้อกำหนด" htmlFor="task-desc" error={errors.description?.message}>
        <textarea id="task-desc" rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register("description")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="ประเภทเอกสาร" htmlFor="task-category">
          <Select id="task-category" {...form.register("category")}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FormField>
        <FormField label="ขอบเขตงาน" htmlFor="task-area" hint={areaOnly ? "งานของกลุ่มสาระที่คุณดูแล" : "งานระดับโรงเรียน หรือเฉพาะกลุ่มสาระ"}>
          <Select id="task-area" {...form.register("learning_area_id")}>
            {!areaOnly && <option value="">ทั้งโรงเรียน</option>}
            {areas.data?.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>กลุ่มสาระ{a.name_th}</option>)}
          </Select>
        </FormField>
        <FormField label="วันเริ่มต้น" htmlFor="task-start" error={errors.starts_at?.message}>
          <Input id="task-start" type="datetime-local" {...form.register("starts_at")} />
        </FormField>
        <FormField label="วันครบกำหนด" htmlFor="task-due" error={errors.due_at?.message}>
          <Input id="task-due" type="datetime-local" {...form.register("due_at")} />
        </FormField>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">ชนิดไฟล์ที่รับ</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(EXT_LABELS).map(([k, v]) => (
            <label key={k} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-checked:border-primary/60 has-checked:bg-primary/15">
              <input type="checkbox" value={k} className="accent-[var(--violet)]" {...form.register("allowed_exts")} />
              {v}
            </label>
          ))}
        </div>
        {errors.allowed_exts && <p className="mt-1 text-xs text-destructive">{errors.allowed_exts.message}</p>}
      </fieldset>
      <FormField label="จำนวนไฟล์สูงสุดต่อการส่ง" htmlFor="task-max" error={errors.max_files?.message}>
        <Input id="task-max" type="number" min={1} max={10} inputMode="numeric" className="sm:w-32" {...form.register("max_files")} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
