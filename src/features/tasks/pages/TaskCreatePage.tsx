import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared";
import { DashSection } from "@/components/dashboard";
import { toast } from "@/lib/toast";
import { dbErrorMessage } from "@/lib/db-errors";
import { createTask, tasksKey } from "../api";
import { TaskForm } from "./TaskForm";

/** สร้างงาน (ฉบับร่าง) → ไปหน้ารายละเอียดเพื่อแนบแม่แบบและเลือกผู้รับ */
export function TaskCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader title="สร้างภาระงาน" description="ขั้นที่ 1 จาก 2 — บันทึกเป็นฉบับร่าง แล้วแนบแม่แบบและเลือกผู้รับก่อนเผยแพร่" />
      <DashSection id="task-form" title="รายละเอียดงาน" className="max-w-3xl">
        <TaskForm
          submitLabel="บันทึกฉบับร่าง และไปขั้นถัดไป"
          onCancel={() => navigate("/office/tasks")}
          onSubmit={async (v) => {
            try {
              const id = await createTask(v);
              await qc.invalidateQueries({ queryKey: tasksKey });
              toast.success("บันทึกฉบับร่างแล้ว");
              navigate(`/office/tasks/${id}`);
            } catch (e) {
              toast.error(dbErrorMessage(e));
              throw e;
            }
          }}
        />
      </DashSection>
    </>
  );
}
