import { Link } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAcademicYears, useClassrooms, useGradeLevels, useLearningAreas, useTerms } from "./api";

/** ความพร้อมข้อมูลพื้นฐานของโรงเรียน (นับจากฐานข้อมูลจริง) — ซ่อนเมื่อครบทุกขั้น; หลักสูตรต้องมีกลุ่มสาระและระดับชั้นก่อนนำเข้า */
export function SetupChecklist({ base = "/office" }: { base?: string }) {
  const { can } = useAuth();
  const years = useAcademicYears();
  const terms = useTerms();
  const grades = useGradeLevels();
  const areas = useLearningAreas();
  const rooms = useClassrooms();
  const loading = [years, terms, grades, areas, rooms].some((q) => q.isPending);
  const steps = [
    { label: "กลุ่มสาระการเรียนรู้ (ต้องมีก่อนนำเข้าหลักสูตร)", n: areas.data?.length ?? 0, to: "learning-areas", required: true },
    { label: "ระดับชั้น (ต้องมีก่อนนำเข้าหลักสูตร)", n: grades.data?.length ?? 0, to: "grade-levels", required: true },
    { label: "ปีการศึกษา", n: years.data?.length ?? 0, to: "academic-years" },
    { label: "ภาคเรียน", n: terms.data?.length ?? 0, to: "terms" },
    { label: "ห้องเรียน", n: rooms.data?.length ?? 0, to: "classrooms" },
  ];
  if (loading || steps.every((s) => s.n > 0) || !can("masterdata.manage")) return null;
  return (
    <section aria-label="ความพร้อมข้อมูลพื้นฐาน" className="mb-5 rounded-2xl border border-warning/40 bg-warning/10 p-4" data-testid="setup-checklist">
      <h2 className="mb-2 text-sm font-semibold">ตั้งค่าข้อมูลพื้นฐานโรงเรียนก่อนใช้งานหลักสูตร</h2>
      <ol className="space-y-1 text-sm">
        {steps.map((s) => (
          <li key={s.to} className="flex items-center gap-2">
            {s.n > 0 ? <CheckCircle2 className="size-4 text-success" aria-label="ครบแล้ว" /> : <Circle className="size-4 text-muted-foreground" aria-label="ยังไม่มี" />}
            <Link to={`${base}/${s.to}`} className="underline-offset-2 hover:underline">{s.label}</Link>
            <span className="text-muted-foreground">{s.n > 0 ? `${s.n} รายการ` : s.required ? "ยังไม่มี — จำเป็น" : "ยังไม่มี"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
