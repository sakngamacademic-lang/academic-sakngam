import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Send } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { DashSection, LiveBadge } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAcademicYears, useGradeLevels } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { toast } from "@/lib/toast";
import {
  allVersions,
  curriculumKey,
  insertRow,
  rpc,
  STAGE_LABELS,
  useClassroomCurriculum,
  useCurricula,
  useFrameworkVersions,
  useImplementations,
  usePrograms,
  useSourceDocuments,
  type CurriculumVersion,
} from "../api";
import { CurriculumNav, EmptyState, formatLocator, Notice, VersionBadge } from "../components";

const inputCls = "h-11";

export function VersionsPage() {
  const { can } = useAuth();
  const canManage = can("curriculum.manage");
  const canApprove = can("curriculum.approve");
  const qc = useQueryClient();
  const curricula = useCurricula();
  const frameworks = useFrameworkVersions();
  const sources = useSourceDocuments();
  const [dialog, setDialog] = useState<null | "curriculum" | "version" | "implementation">(null);
  const [cloneFrom, setCloneFrom] = useState<CurriculumVersion | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: curriculumKey });
  const fwLabel = useMemo(() => new Map(frameworks.data?.map((f) => [f.id, `${f.framework?.name_th ?? ""} ${f.version_label}`])), [frameworks.data]);

  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    try {
      await rpc(fn, args);
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(dbErrorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="ฉบับหลักสูตร"
        description="draft → รอตรวจ → อนุมัติ → ใช้งาน → เลิกใช้ · ฉบับที่อนุมัติแล้วแก้ไม่ได้ ต้องสร้างฉบับใหม่"
        actions={
          <>
            {canApprove && <Button variant="outline" onClick={() => setDialog("curriculum")}><Plus /> หลักสูตรสถานศึกษา</Button>}
            {canManage && <Button onClick={() => setDialog("version")} disabled={!curricula.data?.length}><Plus /> ฉบับร่างใหม่</Button>}
          </>
        }
      />
      <CurriculumNav />

      {curricula.isPending ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : !curricula.data?.length ? (
        <EmptyState title="ยังไม่มีหลักสูตรสถานศึกษา">หัวหน้าฝ่ายวิชาการสร้างหลักสูตรสถานศึกษา แล้วฝ่ายวิชาการสร้างฉบับร่างพร้อมอ้างประกาศใช้</EmptyState>
      ) : (
        curricula.data.map((c) => (
          <DashSection key={c.id} id={`cur-${c.id}`} className="mb-4" title={<span className="flex items-center gap-2">{c.name_th} <LiveBadge /></span>} meta={`${c.versions.length} ฉบับ`}>
            {c.versions.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีฉบับ</p>}
            <ul className="divide-y">
              {c.versions.map((v) => (
                <li key={v.id} data-testid="version" className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">{v.version_label} <VersionBadge status={v.status} /></p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      กรอบแกนกลาง: {v.framework_version_id ? fwLabel.get(v.framework_version_id) : "ยังไม่ระบุ"} ({v.framework_status === "confirmed" ? "ยืนยันแล้ว" : "provisional"})
                      {" · "}ประกาศใช้: {v.announcement_source_id ? formatLocator(v.announcement_locator) : "ยังไม่อ้างเอกสาร"}
                      {v.hours_per_credit && ` · ชม./หน่วยกิต (ใช้เตือนเท่านั้น): ${v.hours_per_credit}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {v.status === "draft" && canManage && (
                      <Button size="sm" onClick={() => act("curriculum_version_submit", { p_id: v.id }, "ส่งตรวจแล้ว")}><Send /> ส่งตรวจ</Button>
                    )}
                    {v.status === "under_review" && canApprove && (
                      <>
                        <Button size="sm" onClick={() => act("curriculum_version_approve", { p_id: v.id }, "อนุมัติแล้ว — เนื้อหาถูกล็อก")}>อนุมัติ</Button>
                        <Button size="sm" variant="outline" onClick={() => act("curriculum_version_return", { p_id: v.id }, "ส่งกลับเป็นฉบับร่าง")}>ส่งกลับแก้ไข</Button>
                      </>
                    )}
                    {v.status === "approved" && canApprove && (
                      <Button size="sm" onClick={() => act("curriculum_version_activate", { p_id: v.id }, "เปิดใช้งานแล้ว")}>เปิดใช้งาน</Button>
                    )}
                    {(v.status === "approved" || v.status === "active") && canApprove && (
                      <Button size="sm" variant="outline" onClick={() => act("curriculum_version_retire", { p_id: v.id }, "เลิกใช้แล้ว")}>เลิกใช้</Button>
                    )}
                    {canApprove && v.status !== "retired" && (
                      <Button size="sm" variant="ghost" onClick={() =>
                        act("curriculum_version_set_framework_status", { p_id: v.id, p_status: v.framework_status === "confirmed" ? "provisional" : "confirmed" },
                          "ปรับสถานะกรอบแกนกลางแล้ว")}>
                        {v.framework_status === "confirmed" ? "กลับเป็น provisional" : "ยืนยันกรอบแกนกลาง"}
                      </Button>
                    )}
                    {v.status !== "draft" && canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setCloneFrom(v)}><Copy /> สร้างฉบับใหม่เพื่อแก้ไข</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </DashSection>
        ))
      )}

      <CohortSection canSet={canApprove} onAdd={() => setDialog("implementation")} />

      <CurriculumDialog open={dialog === "curriculum"} onClose={() => setDialog(null)} onDone={refresh} />
      <VersionDialog open={dialog === "version"} onClose={() => setDialog(null)} onDone={refresh} curricula={curricula.data ?? []}
        frameworks={frameworks.data ?? []} sources={sources.data ?? []} />
      <ImplementationDialog open={dialog === "implementation"} onClose={() => setDialog(null)} onDone={refresh} sources={sources.data ?? []} />
      <Dialog open={cloneFrom !== null} onOpenChange={(o) => !o && setCloneFrom(null)}>
        <DialogContent title={`สร้างฉบับใหม่จาก ${cloneFrom?.version_label ?? ""}`} description="คัดลอกแผนการเรียน รายวิชา โครงสร้าง กิจกรรม และผลการเรียนรู้พร้อมแหล่งที่มา — mapping ต้องตรวจซ้ำ">
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const label = new FormData(e.currentTarget).get("label") as string;
            await act("curriculum_version_clone", { p_source_id: cloneFrom!.id, p_version_label: label }, "สร้างฉบับร่างใหม่แล้ว");
            setCloneFrom(null);
          }}>
            <FormField label="ชื่อฉบับใหม่" htmlFor="clone-label"><Input id="clone-label" name="label" required className={inputCls} /></FormField>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCloneFrom(null)}>ยกเลิก</Button><Button type="submit">สร้างฉบับร่าง</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** รุ่นผู้เรียน → ฉบับหลักสูตร และผลการระบุหลักสูตรของห้องเรียน (ไม่เดาจากปีปัจจุบัน) */
function CohortSection({ canSet, onAdd }: { canSet: boolean; onAdd: () => void }) {
  const impl = useImplementations();
  const curricula = useCurricula();
  const years = useAcademicYears();
  const grades = useGradeLevels();
  const [yearId, setYearId] = useState("");
  const year = yearId || years.data?.find((y) => y.is_current)?.id || "";
  const rooms = useClassroomCurriculum(year || undefined);
  const vLabel = new Map(allVersions(curricula.data).map((v) => [v.id, v.version_label]));
  const yLabel = new Map(years.data?.map((y) => [y.id, y.year_be]));
  const gLabel = new Map(grades.data?.map((g) => [g.id, g.name_th]));
  return (
    <DashSection id="cohorts" className="mt-4" title={<span className="flex items-center gap-2">การใช้หลักสูตรตามรุ่น <LiveBadge /></span>}
      actions={canSet && <Button size="sm" onClick={onAdd}><Plus /> กำหนดรุ่น</Button>}>
      <Notice>รุ่น = ปีที่เข้าเรียน + ชั้นแรกเข้า (+ แผนการเรียน) · ห้องที่ไม่มีเอกสารยืนยันจะแสดง “ยังระบุไม่ได้” — ระบบไม่เดาฉบับ</Notice>
      {impl.data?.length ? (
        <ul className="mb-4 divide-y text-sm">
          {impl.data.map((i) => (
            <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>เข้า {gLabel.get(i.entry_grade_level_id)} ปี {yLabel.get(i.entry_academic_year_id)} {i.study_program_id ? "(เฉพาะแผน)" : "(ทุกแผน)"} → <b>{vLabel.get(i.curriculum_version_id)}</b></span>
              <span className="text-xs text-muted-foreground">อ้าง {formatLocator(i.decided_locator)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">ยังไม่ได้กำหนดการใช้หลักสูตรกับรุ่นใด</p>
      )}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">ห้องเรียนปี</span>
        <Select value={year} onChange={(e) => setYearId(e.target.value)} aria-label="ปีการศึกษาของห้องเรียน" className="w-32">
          {years.data?.map((y) => <option key={y.id} value={y.id}>{y.year_be}</option>)}
        </Select>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="หลักสูตรของห้องเรียน">
        {rooms.data?.map((r) => (
          <li key={r.classroom_id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>{gLabel.get(r.grade_level_id)}/{r.room_no}</span>
            {r.resolution === "resolved" ? (
              <span className="text-success">{vLabel.get(r.curriculum_version_id!) ?? "—"} <span className="text-xs text-muted-foreground">(รุ่น {r.entry_year_be})</span></span>
            ) : (
              <span className="text-warning">{r.resolution === "ambiguous" ? "กำกวม" : "ยังระบุไม่ได้"}</span>
            )}
          </li>
        ))}
      </ul>
    </DashSection>
  );
}

function useSubmit(onDone: () => Promise<unknown>, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (fn: () => Promise<unknown>, ok: string) => {
      setBusy(true);
      try {
        await fn();
        toast.success(ok);
        await onDone();
        onClose();
      } catch (e) {
        toast.error(dbErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
  };
}

function CurriculumDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const s = useSubmit(onDone, onClose);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="สร้างหลักสูตรสถานศึกษา">
        <form className="space-y-4" onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const name = new FormData(e.currentTarget).get("name") as string;
          void s.run(() => insertRow("school_curricula", { name_th: name.trim() }), "สร้างหลักสูตรแล้ว");
        }}>
          <FormField label="ชื่อหลักสูตร (ตามเอกสาร)" htmlFor="cur-name"><Input id="cur-name" name="name" required className={inputCls} /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button><Button type="submit" disabled={s.busy}>บันทึก</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VersionDialog({ open, onClose, onDone, curricula, frameworks, sources }: {
  open: boolean; onClose: () => void; onDone: () => Promise<unknown>;
  curricula: { id: string; name_th: string }[]; frameworks: { id: string; version_label: string; framework: { name_th: string } | null }[];
  sources: { id: string; register_code: string; title: string }[];
}) {
  const s = useSubmit(onDone, onClose);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="ฉบับร่างใหม่" description="เลขหน้าอ้างอิงใช้รูปแบบ pdf:4;book:3">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => ((f.get(k) as string) ?? "").trim() || null;
          void s.run(() => insertRow("curriculum_versions", {
            school_curriculum_id: v("curriculum"),
            version_label: v("label"),
            framework_version_id: v("framework"),
            effective_year_be: v("year") ? Number(v("year")) : null,
            hours_per_credit: v("hpc") ? Number(v("hpc")) : null,
            announcement_source_id: v("source"),
            announcement_locator: v("locator"),
          }), "สร้างฉบับร่างแล้ว");
        }}>
          <FormField label="หลักสูตร" htmlFor="v-cur"><Select id="v-cur" name="curriculum" required>{curricula.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}</Select></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ชื่อฉบับ" htmlFor="v-label"><Input id="v-label" name="label" required className={inputCls} /></FormField>
            <FormField label="ปีที่ประกาศใช้ (พ.ศ.)" htmlFor="v-year"><Input id="v-year" name="year" inputMode="numeric" className={inputCls} /></FormField>
          </div>
          <FormField label="กรอบหลักสูตรแกนกลางที่อ้างอิง" htmlFor="v-fw" hint={frameworks.length ? undefined : "ยังไม่มีข้อมูลอ้างอิงในระบบ — ระบุภายหลังได้"}>
            <Select id="v-fw" name="framework"><option value="">ยังไม่ระบุ</option>{frameworks.map((fw) => <option key={fw.id} value={fw.id}>{fw.framework?.name_th} {fw.version_label}</option>)}</Select>
          </FormField>
          <FormField label="ชั่วโมงต่อหน่วยกิต (ไม่บังคับ — ใช้เตือนเท่านั้น ไม่แก้ค่าต้นฉบับ)" htmlFor="v-hpc"><Input id="v-hpc" name="hpc" inputMode="decimal" className={inputCls} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="เอกสารประกาศใช้" htmlFor="v-src"><Select id="v-src" name="source"><option value="">ยังไม่ระบุ</option>{sources.map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}</Select></FormField>
            <FormField label="ตำแหน่งในเอกสาร" htmlFor="v-loc"><Input id="v-loc" name="locator" placeholder="pdf:4;book:3" className={inputCls} /></FormField>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button><Button type="submit" disabled={s.busy}>บันทึก</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImplementationDialog({ open, onClose, onDone, sources }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown>; sources: { id: string; register_code: string; title: string }[] }) {
  const s = useSubmit(onDone, onClose);
  const curricula = useCurricula();
  const years = useAcademicYears();
  const grades = useGradeLevels();
  const usable = allVersions(curricula.data).filter((v) => v.status === "approved" || v.status === "active");
  const [versionId, setVersionId] = useState("");
  const programs = usePrograms(versionId || usable[0]?.id);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="กำหนดการใช้หลักสูตรกับรุ่น" description="ใช้ได้เฉพาะฉบับที่อนุมัติแล้ว และต้องอ้างเอกสารที่กำหนดการใช้">
        {usable.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีฉบับที่อนุมัติแล้ว</p> : (
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const v = (k: string) => ((f.get(k) as string) ?? "").trim() || null;
            void s.run(() => rpc("curriculum_implementation_set", {
              p_version_id: v("version"), p_study_program_id: v("program"), p_entry_academic_year_id: v("year"),
              p_entry_grade_level_id: v("grade"), p_source_id: v("source"), p_locator: v("locator"), p_status: "planned",
            }), "กำหนดรุ่นแล้ว");
          }}>
            <FormField label="ฉบับหลักสูตร" htmlFor="i-v"><Select id="i-v" name="version" value={versionId || usable[0]!.id} onChange={(e) => setVersionId(e.target.value)}>{usable.map((x) => <option key={x.id} value={x.id}>{x.curriculum_name} · {x.version_label}</option>)}</Select></FormField>
            <FormField label="แผนการเรียน" htmlFor="i-p"><Select id="i-p" name="program"><option value="">ทุกแผน</option>{programs.data?.map((p) => <option key={p.id} value={p.id}>{p.name_th} ({STAGE_LABELS[p.stage]})</option>)}</Select></FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="ปีที่เข้าเรียน" htmlFor="i-y"><Select id="i-y" name="year">{years.data?.map((y) => <option key={y.id} value={y.id}>{y.year_be}</option>)}</Select></FormField>
              <FormField label="ชั้นแรกเข้า" htmlFor="i-g"><Select id="i-g" name="grade">{grades.data?.filter((g) => g.is_active).map((g) => <option key={g.id} value={g.id}>{g.name_th}</option>)}</Select></FormField>
              <FormField label="เอกสารอ้างอิง" htmlFor="i-s"><Select id="i-s" name="source" required>{sources.map((d) => <option key={d.id} value={d.id}>{d.register_code} {d.title}</option>)}</Select></FormField>
              <FormField label="ตำแหน่ง" htmlFor="i-l"><Input id="i-l" name="locator" required placeholder="pdf:4;book:3" className={inputCls} /></FormField>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button><Button type="submit" disabled={s.busy}>บันทึก</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
