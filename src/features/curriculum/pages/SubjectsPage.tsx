import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form-controls";
import { DataTable, PageHeader, TableToolbar } from "@/components/shared";
import { useGradeLevels, useLearningAreas } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { SUBJECT_TYPE_LABELS, useSubjectDetail, useSubjects, type Subject } from "../api";
import { CurriculumNav, EmptyState, formatLocator, Pager, SourceRef, useSelectedVersion, VersionPicker , VersionStatusNotice } from "../components";

/** รายวิชา — แบ่งหน้า 25 รายการ (ไม่โหลดทั้งหมด) + รายละเอียดพร้อมแหล่งที่มา */
export function SubjectsPage() {
  const sel = useSelectedVersion();
  const [params, setParams] = useSearchParams();
  const areas = useLearningAreas();
  const grades = useGradeLevels();
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [type, setType] = useState("");
  const [grade, setGrade] = useState("");
  const page = Number(params.get("page") ?? 0);
  const setPage = (p: number) => setParams((x) => { x.set("page", String(p)); return x; });
  const q = useSubjects(sel.selected?.id, { search, area, type, grade, page });
  const [detail, setDetail] = useState<string | null>(null);
  const areaName = useMemo(() => new Map(areas.data?.map((a) => [a.id, a.name_th])), [areas.data]);
  const gradeName = useMemo(() => new Map(grades.data?.map((g) => [g.id, g.name_th])), [grades.data]);
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(0); };

  return (
    <>
      <PageHeader title="รายวิชา" description="หน่วยกิตและชั่วโมงเรียนแสดงตามต้นฉบับ (ไม่คำนวณแทนกัน)" />
      <CurriculumNav />
      <TableToolbar search={search} onSearch={reset(setSearch)} placeholder="ค้นหารหัสหรือชื่อวิชา">
        <VersionPicker value={sel.selected?.id ?? ""} onChange={sel.select} versions={sel.versions} />
        <Select value={area} onChange={(e) => reset(setArea)(e.target.value)} aria-label="กรองตามกลุ่มสาระ" className="sm:w-52">
          <option value="">ทุกกลุ่มสาระ</option>{areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name_th}</option>)}
        </Select>
        <Select value={type} onChange={(e) => reset(setType)(e.target.value)} aria-label="กรองตามประเภท" className="sm:w-44">
          <option value="">ทุกประเภท</option>{Object.entries(SUBJECT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={grade} onChange={(e) => reset(setGrade)(e.target.value)} aria-label="กรองตามระดับชั้น" className="sm:w-32">
          <option value="">ทุกชั้น</option>{grades.data?.filter((g) => g.is_active).map((g) => <option key={g.id} value={g.id}>{g.name_th}</option>)}
        </Select>
      </TableToolbar>
      <VersionStatusNotice status={sel.selected?.status} />
      {!sel.loading && !sel.versions.length ? (
        <EmptyState title="ยังไม่มีหลักสูตร" />
      ) : (
        <>
          <DataTable<Subject>
            caption="รายวิชา"
            rows={q.data?.rows}
            loading={q.isPending}
            error={q.error ? dbErrorMessage(q.error) : null}
            emptyText="ไม่พบรายวิชา — ข้อมูลรายวิชาต้องมาจากการนำเข้าที่ผ่านการตรวจ"
            rowKey={(s) => s.id}
            columns={[
              { key: "code", header: "รหัส", cell: (s) => <code className="text-xs">{s.code}</code>, className: "w-24" },
              { key: "name", header: "ชื่อวิชา", cell: (s) => <span className="font-medium">{s.name_th}</span> },
              { key: "type", header: "ประเภท", cell: (s) => <Badge variant={s.subject_type === "basic" ? "default" : "info"}>{SUBJECT_TYPE_LABELS[s.subject_type]}</Badge> },
              { key: "area", header: "กลุ่มสาระ", cell: (s) => subjectAreaLabel(s, areaName), hideOnMobile: true },
              { key: "grade", header: "ชั้น", cell: (s) => (s.grade_level_id ? gradeName.get(s.grade_level_id) : "–") },
              { key: "credit", header: "หน่วยกิต", cell: (s) => <span className="tabular-nums">{Number(s.credits).toFixed(1)}</span> },
              { key: "hours", header: "ชั่วโมง", cell: (s) => <span className="tabular-nums">{s.learning_hours}</span> },
            ]}
            actions={(s) => <Button size="sm" variant="ghost" onClick={() => setDetail(s.id)} aria-label={`รายละเอียด ${s.code}`}>รายละเอียด</Button>}
          />
          <Pager page={page} total={q.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      <SubjectDetailDialog id={detail} onClose={() => setDetail(null)} areaName={areaName} gradeName={gradeName} />
    </>
  );
}

function SubjectDetailDialog({ id, onClose, areaName, gradeName }: { id: string | null; onClose: () => void; areaName: Map<string, string>; gradeName: Map<string, string> }) {
  const d = useSubjectDetail(id);
  const s = d.data;
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={s ? `${s.code} ${s.name_th}` : "รายละเอียดรายวิชา"} className="max-w-3xl">
        {d.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : !s ? <p className="text-sm">ไม่พบรายวิชา</p> : (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm">
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
              <div><dt className="text-muted-foreground">ประเภท</dt><dd>{SUBJECT_TYPE_LABELS[s.subject_type]}</dd></div>
              <div><dt className="text-muted-foreground">กลุ่มสาระ</dt><dd>{subjectAreaLabel(s, areaName)}</dd></div>
              <div><dt className="text-muted-foreground">ชั้น</dt><dd>{s.grade_level_id ? gradeName.get(s.grade_level_id) : "–"}</dd></div>
              <div><dt className="text-muted-foreground">หน่วยกิต</dt><dd>{Number(s.credits).toFixed(1)}</dd></div>
              <div><dt className="text-muted-foreground">ชั่วโมงเรียน</dt><dd>{s.learning_hours}</dd></div>
              <div><dt className="text-muted-foreground">แหล่งข้อมูล</dt><dd><SourceRef code={s.source?.register_code} locator={s.source_locator} /></dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">
              สถานะการตรวจ: {s.import_row_id ? "นำเข้าผ่านการตรวจรายแถวและอนุมัติแล้ว" : "บันทึกด้วยมือ"} · ความน่าเชื่อถือของแหล่ง: {s.source?.reliability ?? "–"}
              {s.source?.status !== "reviewed" && " (แหล่งยังไม่ผ่านการทบทวน)"}
            </p>
            <section>
              <h3 className="mb-1 font-semibold">คำอธิบายรายวิชา</h3>
              <p className="whitespace-pre-line text-muted-foreground">{s.description_th || "ยังไม่มีข้อมูล"}</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold">มาตรฐานและตัวชี้วัด (ปลายทาง)</h3>
              {s.mappings.length === 0 ? <p className="text-muted-foreground">ยังไม่มี mapping</p> : (
                <ul className="space-y-2">
                  {s.mappings.map((m) => (
                    <li key={m.id} className="rounded-lg border p-2">
                      <p className="flex flex-wrap items-center gap-2"><code className="text-xs">{m.indicator?.full_code}</code>
                        <Badge variant={m.status === "verified" ? "success" : m.status === "rejected" ? "destructive" : "warning"}>{m.status === "verified" ? "ยืนยันแล้ว" : m.status === "rejected" ? "ปฏิเสธ" : "รอตรวจ"}</Badge></p>
                      <p className="mt-1 text-muted-foreground">{m.indicator?.statement_th}</p>
                      {m.indicator?.standard && <p className="text-xs text-muted-foreground">มาตรฐาน {m.indicator.standard.code}</p>}
                      <SourceRef locator={m.source_locator} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-1 font-semibold">ผลการเรียนรู้ / ตัวชี้วัดระหว่างทาง</h3>
              {s.outcomes.length === 0 ? <p className="text-muted-foreground">ยังไม่มีข้อมูล</p> : (
                <ul className="space-y-1.5">
                  {s.outcomes.map((o) => (
                    <li key={o.id}><b className="mr-1">{o.code}</b>{o.statement_th} <span className="text-xs text-muted-foreground">({o.outcome_kind === "interim_indicator" ? "ระหว่างทาง" : "ผลการเรียนรู้"} · {formatLocator(o.source_locator)})</span></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** IS ไม่สังกัดกลุ่มสาระ (ตามเล่มหลักสูตร) — แสดงช่วงชั้นแทน */
function subjectAreaLabel(s: { learning_area_id: string | null; subject_category?: string; education_stage?: string | null }, areaName: Map<string, string>) {
  if (s.subject_category === "is") return `IS · ${s.education_stage === "upper_secondary" ? "ม.ปลาย" : "ม.ต้น"} (ไม่สังกัดกลุ่มสาระ)`;
  return (s.learning_area_id && areaName.get(s.learning_area_id)) || "–";
}
