import { PageHeader } from "@/components/shared";
import { DashSection, LiveBadge } from "@/components/dashboard";
import { useAuth } from "@/features/auth/AuthProvider";
import { ROLE_LABELS } from "@/features/auth/roles";
import { useLearningAreas } from "@/features/master-data/api";
import { useTeachers } from "../api";
import { fullName, POSITION_LABELS, STATUS_LABELS } from "../types";

/** โปรไฟล์ครู — ระเบียนของตนเอง (RLS ส่งมาเฉพาะแถวที่ profile_id = ผู้ใช้) อ่านอย่างเดียว */
export function TeacherProfilePage() {
  const { access, roles } = useAuth();
  const teachers = useTeachers();
  const areas = useLearningAreas();
  const me = teachers.data?.find((t) => t.profile_id === access?.user_id);
  const area = me?.learning_area_id ? areas.data?.find((a) => a.id === me.learning_area_id)?.name_th : null;

  const rows: [string, string][] = me
    ? [
        ["รหัสประจำตัว", me.teacher_code],
        ["ชื่อ–สกุล", fullName(me)],
        ["ตำแหน่ง", POSITION_LABELS[me.position]],
        // ครูทั่วไปไม่มีสิทธิ์อ่านตาราง learning_areas (RLS Phase 1.4) จึงอาจไม่เห็นชื่อกลุ่มสาระ
        ["กลุ่มสาระ", me.learning_area_id ? (area ?? "สังกัดกลุ่มสาระแล้ว") : "ไม่สังกัดกลุ่มสาระ"],
        ["สถานะการทำงาน", STATUS_LABELS[me.employment_status]],
      ]
    : [];

  return (
    <>
      <PageHeader title="โปรไฟล์" description="ข้อมูลในทะเบียนครูของคุณ — หากไม่ถูกต้องกรุณาแจ้งฝ่ายวิชาการ" />
      <div className="grid gap-4 lg:grid-cols-2">
        <DashSection id="registry" title={<span className="flex items-center gap-2">ทะเบียนครู <LiveBadge /></span>}>
          {teachers.isPending ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
          ) : me ? (
            <dl className="divide-y text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              บัญชีของคุณยังไม่ได้ผูกกับระเบียนครู กรุณาติดต่อฝ่ายวิชาการหรือผู้ดูแลระบบ
            </p>
          )}
        </DashSection>
        <DashSection id="account" title="บัญชีเข้าระบบ">
          <dl className="divide-y text-sm">
            <div className="grid grid-cols-[8rem_1fr] gap-3 pb-2.5"><dt className="text-muted-foreground">อีเมล</dt><dd className="break-all">{access?.email}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2.5"><dt className="text-muted-foreground">โรงเรียน</dt><dd>{access?.school?.name_th}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-3 pt-2.5"><dt className="text-muted-foreground">บทบาท</dt><dd>{roles.map((r) => ROLE_LABELS[r]).join(", ")}</dd></div>
          </dl>
        </DashSection>
      </div>
    </>
  );
}
