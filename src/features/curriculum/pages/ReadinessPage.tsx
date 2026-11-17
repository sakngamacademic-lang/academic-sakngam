import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, BookOpenCheck, ClipboardCheck, ClipboardList, FileDown, FileText, Layers, Loader2, Plus, Printer, ShieldCheck, Users, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { DashSection, KpiCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/AuthProvider";
import { callRpc } from "@/features/master-data/api";
import { dbErrorMessage } from "@/lib/db-errors";
import { requireSupabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { allVersions, useCurricula } from "../api";
import { CurriculumNav } from "../components";
import { downloadCsv } from "../export";

/**
 * Phase 5 — Dashboard ความพร้อมฝ่ายวิชาการ · ข้อมูลส่งตารางสอน · กิจกรรมพัฒนาผู้เรียน · ส่งออกเล่มหลักสูตร
 * ทุกตัวเลขมาจากข้อมูลจริงในฐานข้อมูล — ไม่มีข้อมูลตัวอย่าง
 */
const key = ["readiness"] as const;
interface Summary {
  versions: { label: string; year: number | null; status: string; subjects: number; offerings: number; framework_linked: boolean }[];
  framework: { label: string; status: string; is_complete: boolean; standards: number; indicators: number }[];
  analysis_pending: number; syllabi: Record<string, number>; syllabi_by_area: { area: string; pending: number; approved: number }[];
  plans: Record<string, number>; tasks_open: number; conflicts_open: number; timetable: { sections: number; ready: number }; activity_groups: number;
}
interface Feed { course_section_id: string; academic_year_be: number; term_no: number; curriculum_version: string; program_code: string | null; program_name: string | null; grade_code: string | null;
  classroom: string | null; subject_code: string; subject_name: string | null; subject_type: string | null; section_label: string | null; periods_per_week: number | null;
  minutes_per_period: number | null; hours_per_week: number | null; hours_per_term: number | null; teachers: string | null; status: string; missing: string[] }
const VSTATUS: Record<string, string> = { draft: "ร่าง", submitted: "รอพิจารณา", approved: "อนุมัติแล้ว", active: "ใช้งาน", retired: "เลิกใช้" };
const KIND: Record<string, string> = { guidance: "แนะแนว", scout: "ลูกเสือ/เนตรนารี/ยุวกาชาด", club: "ชุมนุม", social_service: "เพื่อสังคมและสาธารณประโยชน์", other: "อื่น ๆ" };

export function ReadinessPage() {
  const s = useQuery({ queryKey: [...key, "summary"], queryFn: () => callRpc<Summary>("academic_readiness_summary", {}) });
  return (
    <>
      <PageHeader icon={BookOpen} title="ความพร้อมของหลักสูตรและงานวิชาการ" description="ภาพรวมจากข้อมูลจริงในระบบ — ข้อมูลร่างแสดงแยกจากข้อมูลที่อนุมัติแล้ว" />
      <CurriculumNav />
      {s.isPending ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : s.error ? <p role="alert" className="text-sm text-destructive">{dbErrorMessage(s.error)}</p> : s.data && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <KpiCard tone="orange" icon={AlertTriangle} label="ข้อขัดแย้งที่ยังไม่ได้ตัดสิน" value={s.data.conflicts_open} />
            <KpiCard tone="blue" icon={FileText} label="รายการจาก PDF รอตรวจ" value={s.data.analysis_pending} />
            <KpiCard tone="green" icon={BookOpenCheck} label="คำอธิบายรายวิชาอนุมัติแล้ว" value={s.data.syllabi.approved ?? 0} />
            <KpiCard tone="purple" icon={Layers} label="คำอธิบาย/โครงสร้างรอตรวจ" value={(s.data.syllabi.submitted ?? 0) + (s.data.syllabi.reviewed ?? 0)} />
            <KpiCard tone="blue" icon={ClipboardList} label="แผนการสอนที่ส่งแล้ว" value={(s.data.plans.submitted ?? 0) + (s.data.plans.area_approved ?? 0) + (s.data.plans.approved ?? 0)} />
            <KpiCard tone="green" icon={ShieldCheck} label="แผนการสอนอนุมัติแล้ว" value={s.data.plans.approved ?? 0} />
            <KpiCard tone="pink" icon={UsersRound} label="งานมอบหมายที่ยังค้าง" value={s.data.tasks_open} />
            <KpiCard tone="indigo" icon={Users} label="กลุ่มเรียนพร้อมจัดตาราง" value={`${s.data.timetable.ready} / ${s.data.timetable.sections}`}
              hint={s.data.timetable.sections ? undefined : "ยังไม่มีกลุ่มเรียนในระบบ"} />
          </div>
          {s.data.timetable.sections > 0 && (
            <div className="mt-3 rounded-2xl border bg-card p-4 shadow-card">
              <p className="flex items-center justify-between text-sm font-medium"><span className="flex items-center gap-2"><ClipboardCheck className="size-4" aria-hidden="true" /> ความพร้อมข้อมูลจัดตารางสอน</span>
                <span className="tabular-nums">{Math.round((s.data.timetable.ready / s.data.timetable.sections) * 100)}%</span></p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={s.data.timetable.sections} aria-valuenow={s.data.timetable.ready} aria-label="กลุ่มเรียนที่ข้อมูลครบ">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(s.data.timetable.ready / s.data.timetable.sections) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">คิดจากกลุ่มเรียนที่มีจำนวนคาบ ครูผู้สอน และห้องเรียนครบ</p>
            </div>
          )}
          <DashSection id="versions" className="mt-4 border-l-4 border-l-[var(--gold)]" title={<span className="flex items-center gap-2"><BookOpen className="size-5 text-[var(--gold)]" aria-hidden="true" /> ความพร้อมของหลักสูตรแต่ละปี</span>}>
            <ul className="space-y-1 text-sm">
              {s.data.versions.map((v) => (
                <li key={v.label} className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3">
                  <b className="text-base">{v.label}</b><Badge variant={v.status === "active" || v.status === "approved" ? "success" : "info"}>{VSTATUS[v.status] ?? v.status}</Badge>
                  <span className="text-xs text-muted-foreground">รายวิชา {v.subjects} · การจัดรายวิชา {v.offerings} · {v.framework_linked ? "ผูกกรอบแกนกลางแล้ว" : "ยังไม่ผูกกรอบแกนกลาง"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">กรอบแกนกลาง: {s.data.framework.map((f) => `${f.label} (${f.status === "published" ? "ยืนยันแล้ว" : "ร่าง"} · มาตรฐาน ${f.standards} · ตัวชี้วัด ${f.indicators}${f.is_complete ? " · ยืนยันว่าครบ" : ""})`).join(" · ") || "ยังไม่มี"}</p>
            {s.data.syllabi_by_area.length > 0 && <p className="mt-1 text-xs text-muted-foreground">งานค้างรายกลุ่มสาระ: {s.data.syllabi_by_area.map((a) => `${a.area} รอตรวจ ${a.pending} / อนุมัติ ${a.approved}`).join(" · ")}</p>}
          </DashSection>
        </>
      )}
      <TimetableFeed />
      <ActivityGroups />
      <BookExport />
    </>
  );
}

function TimetableFeed() {
  const feed = useQuery({ queryKey: [...key, "feed"], queryFn: async () => {
    const { data, error } = await requireSupabase().from("v_timetable_feed").select("*").order("academic_year_be", { ascending: false }).order("term_no").order("grade_code").order("subject_code").limit(2000);
    if (error) throw error;
    return data as Feed[];
  } });
  const rows = feed.data ?? [];
  const missing = rows.filter((r) => r.missing.length);
  return (
    <DashSection id="timetable" className="mt-4" title="ข้อมูลสำหรับจัดตารางสอน" meta={`${rows.length} กลุ่มเรียน`}
      actions={<Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCsv("timetable-feed.csv", rows.map((r) => ({
        ปีการศึกษา: r.academic_year_be, ภาคเรียน: r.term_no, หลักสูตร: r.curriculum_version, แผนการเรียน: r.program_name, ระดับชั้น: r.grade_code, ห้องเรียน: r.classroom,
        รหัสวิชา: r.subject_code, ชื่อวิชา: r.subject_name, กลุ่มเรียน: r.section_label, คาบต่อสัปดาห์: r.periods_per_week, นาทีต่อคาบ: r.minutes_per_period,
        ครูผู้สอน: r.teachers, ข้อมูลที่ยังขาด: r.missing.join("; "),
      })))}><FileDown /> ส่งออก CSV/Excel</Button>}>
      <p className="text-sm text-muted-foreground">จำนวนคาบต่อสัปดาห์เป็นค่าที่ฝ่ายวิชาการกำหนดในกลุ่มเรียน — ระบบไม่คำนวณจากหน่วยกิต · ระบบอื่นอ่านข้อมูลชุดนี้ผ่าน API <code>/rest/v1/v_timetable_feed</code> (ตามสิทธิ์ผู้ใช้)</p>
      {feed.error && <p role="alert" className="text-sm text-destructive">{dbErrorMessage(feed.error)}</p>}
      <p className="mt-2 text-sm">พร้อม {rows.length - missing.length} · ยังขาดข้อมูล {missing.length}</p>
      <ul className="mt-1 space-y-1 text-xs">
        {missing.slice(0, 30).map((r) => <li key={r.course_section_id} className="rounded-lg border p-2"><code>{r.subject_code}</code> {r.subject_name} · {r.grade_code ?? "–"} {r.classroom ?? ""} — {r.missing.join(", ")}</li>)}
      </ul>
    </DashSection>
  );
}

function ActivityGroups() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const years = useQuery({ queryKey: [...key, "years"], queryFn: async () => { const { data, error } = await requireSupabase().from("academic_years").select("id, year_be").order("year_be", { ascending: false }); if (error) throw error; return data as { id: string; year_be: number }[]; } });
  const teachers = useQuery({ queryKey: [...key, "teachers"], queryFn: async () => { const { data, error } = await requireSupabase().from("teachers").select("id, prefix, first_name, last_name").order("first_name"); if (error) throw error; return data as { id: string; prefix: string | null; first_name: string; last_name: string }[]; } });
  const groups = useQuery({ queryKey: [...key, "groups"], queryFn: async () => {
    const { data, error } = await requireSupabase().from("activity_groups").select("id, kind, name_th, hours, criteria_note, status, policy_locator, year:academic_years(year_be), teacher:teachers(prefix, first_name, last_name)").order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as { id: string; kind: string; name_th: string; hours: number | null; criteria_note: string | null; status: string; policy_locator: string | null; year: { year_be: number } | null; teacher: { prefix: string | null; first_name: string; last_name: string } | null }[];
  } });
  const [busy, setBusy] = useState(false);
  return (
    <DashSection id="activities" className="mt-4" title="กิจกรรมพัฒนาผู้เรียน" meta={`${groups.data?.length ?? 0} กลุ่ม`}>
      <p className="text-sm text-muted-foreground">เกณฑ์การประเมินต้องเป็นไปตามนโยบายที่โรงเรียนยืนยัน — ระบบไม่กำหนดเกณฑ์ผ่านให้เอง</p>
      <ul className="mt-2 space-y-1 text-sm">
        {(groups.data ?? []).map((g) => (
          <li key={g.id} className="rounded-lg border p-2"><Badge variant="secondary">{KIND[g.kind]}</Badge> <b>{g.name_th}</b> · ปี {g.year?.year_be} · {g.hours ?? "–"} ชม. · ครู {g.teacher ? `${g.teacher.prefix ?? ""}${g.teacher.first_name} ${g.teacher.last_name}` : "ยังไม่กำหนด"}
            <span className="block text-xs text-muted-foreground">เกณฑ์: {g.criteria_note ?? "ยังไม่กำหนด (รอนโยบายโรงเรียน)"}{g.policy_locator ? ` · อ้างอิง ${g.policy_locator}` : ""}</span></li>
        ))}
      </ul>
      {(can("masterdata.manage") || can("curriculum.manage")) && (
        <form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const f = new FormData(e.currentTarget);
          const g = (k: string) => String(f.get(k) ?? "").trim() || null;
          setBusy(true);
          try {
            const { error } = await requireSupabase().from("activity_groups").insert({ academic_year_id: g("year"), kind: g("kind"), name_th: g("name"), teacher_id: g("teacher"), hours: g("hours") ? Number(g("hours")) : null, criteria_note: g("criteria") });
            if (error) throw error;
            toast.success("เพิ่มกลุ่มกิจกรรมแล้ว");
            (e.target as HTMLFormElement).reset();
            await qc.invalidateQueries({ queryKey: key });
          } catch (err) { toast.error(dbErrorMessage(err)); } finally { setBusy(false); }
        }}>
          <FormField label="ปีการศึกษา" htmlFor="ay"><Select id="ay" name="year" required>{(years.data ?? []).map((y) => <option key={y.id} value={y.id}>{y.year_be}</option>)}</Select></FormField>
          <FormField label="ประเภท" htmlFor="ak"><Select id="ak" name="kind">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
          <FormField label="ชื่อกิจกรรม/ชุมนุม" htmlFor="an"><Input id="an" name="name" required maxLength={200} /></FormField>
          <FormField label="ครูผู้รับผิดชอบ" htmlFor="at"><Select id="at" name="teacher"><option value="">ยังไม่กำหนด</option>{(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.prefix ?? ""}{t.first_name} {t.last_name}</option>)}</Select></FormField>
          <FormField label="ชั่วโมงกิจกรรม" htmlFor="ah"><Input id="ah" name="hours" type="number" min={0} step="0.5" /></FormField>
          <FormField label="เกณฑ์ประเมิน (ตามนโยบายโรงเรียน)" htmlFor="ac"><Input id="ac" name="criteria" maxLength={4000} placeholder="เว้นว่างได้ถ้ายังไม่มีนโยบาย" /></FormField>
          <div className="sm:col-span-3"><Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} เพิ่มกลุ่มกิจกรรม</Button></div>
        </form>
      )}
    </DashSection>
  );
}

// ---------------------------------------------------------------- ส่งออกเล่มหลักสูตร
type Book = {
  version: { label: string; status: string; effective_year_be: number | null; approved_at: string | null; announcement: { register_code: string; title: string; locator: string | null } | null };
  curriculum_name: string | null; framework: { label: string; status: string } | null;
  competencies: { kind: string; code: string; name_th: string; citation: string }[]; programs: { code: string; name_th: string }[];
  structure: { grade_code: string; program_code: string | null; subject_type: string; subjects: number; credits: number; learning_hours: number }[];
  subjects: { code: string; name_th: string; type: string; credits: number; hours: number; area: string | null; grade: string | null; description_th: string | null;
    syllabus: { status: string; version_no: number; essence: string | null; units: { seq: number; title: string; hours: number | null; max_score: number | null }[] | null } | null }[];
  activities: { type: string; name_th: string; hours: number; grade: string | null }[]; grading: { status: string; note: string | null } | null; open_conflicts: number;
};
const e = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const NONE = `<p style="color:#666">— ยังไม่มีข้อมูลในระบบ (ผู้ดูแลต้องจัดทำและตรวจรับรองก่อน) —</p>`;
export function bookHtml(b: Book) {
  const approved = b.version.status === "approved" || b.version.status === "active";
  const mark = (ok: boolean) => (ok ? "" : ` <span style="color:#b00">[ร่าง]</span>`);
  const comp = (k: string) => b.competencies.filter((c) => c.kind === k);
  const list = (xs: { code: string; name_th: string; citation: string }[]) => (xs.length ? `<ol>${xs.map((c) => `<li>${e(c.name_th)} <small>(${e(c.citation)})</small></li>`).join("")}</ol>` : NONE);
  const sections = [
    `<div style="text-align:center"><h1>${e(b.curriculum_name ?? "หลักสูตรสถานศึกษา")}</h1><h2>${e(b.version.label)}</h2>${approved ? "" : `<p style="color:#b00;font-size:20pt"><b>ร่าง — ยังไม่ผ่านการอนุมัติ</b></p>`}</div>`,
    `<h2>ประกาศใช้หลักสูตร</h2>${b.version.announcement ? `<p>ดูเอกสารประกาศ ${e(b.version.announcement.register_code)} ${e(b.version.announcement.title)} ${e(b.version.announcement.locator ?? "")} (แนบฉบับจริงที่ลงนามแล้ว — ระบบไม่สร้างข้อความประกาศหรือชื่อผู้ลงนาม)</p>` : NONE}`,
    `<h2>คำนำ</h2>${NONE}`, `<h2>สารบัญ</h2><p>(สร้างในโปรแกรม Word: อ้างอิง → สารบัญ)</p>`, `<h2>วิสัยทัศน์และหลักการ</h2>${NONE}`, `<h2>จุดหมายของหลักสูตร</h2>${NONE}`,
    `<h2>สมรรถนะสำคัญของผู้เรียน${mark(b.framework?.status === "published")}</h2>${list(comp("key_competency"))}`,
    `<h2>คุณลักษณะอันพึงประสงค์${mark(b.framework?.status === "published")}</h2>${list(comp("desired_characteristic"))}`,
    `<h2>โครงสร้างเวลาเรียน${mark(approved)}</h2>${b.structure.length ? `<table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>ชั้น</th><th>แผน</th><th>ประเภท</th><th>รายวิชา</th><th>หน่วยกิต</th><th>ชั่วโมง</th></tr>${b.structure.map((r) => `<tr><td>${e(r.grade_code)}</td><td>${e(r.program_code ?? "ทุกแผน")}</td><td>${r.subject_type === "basic" ? "พื้นฐาน" : "เพิ่มเติม"}</td><td>${r.subjects}</td><td>${r.credits}</td><td>${r.learning_hours}</td></tr>`).join("")}</table>` : NONE}`,
    `<h2>แผนการเรียน${mark(approved)}</h2>${b.programs.length ? `<ul>${b.programs.map((p) => `<li>${e(p.code)} ${e(p.name_th)}</li>`).join("")}</ul>` : NONE}`,
    `<h2>โครงสร้างรายวิชาและคำอธิบายรายวิชา</h2>${b.subjects.length ? b.subjects.map((s) => `<h3>${e(s.code)} ${e(s.name_th)}${mark(s.syllabus?.status === "approved")}</h3><p>${e(s.area)} · ${e(s.grade)} · ${s.type === "basic" ? "รายวิชาพื้นฐาน" : "รายวิชาเพิ่มเติม"} · ${s.credits} หน่วยกิต · ${s.hours} ชั่วโมง</p>${s.description_th ? `<p>${e(s.description_th)}</p>` : ""}${s.syllabus?.units?.length ? `<ol>${s.syllabus.units.map((u) => `<li>${e(u.title)} — ${e(u.hours)} ชม. · ${e(u.max_score)} คะแนน</li>`).join("")}</ol>` : ""}`).join("") : NONE}`,
    `<h2>กิจกรรมพัฒนาผู้เรียน${mark(approved)}</h2>${b.activities.length ? `<ul>${b.activities.map((a) => `<li>${e(a.grade)} ${e(a.name_th)} ${a.hours} ชม.</li>`).join("")}</ul>` : NONE}`,
    `<h2>การวัดและประเมินผล${mark(b.grading?.status === "verified")}</h2>${b.grading?.note ? `<p>${e(b.grading.note)}</p>` : NONE}`,
    `<h2>ภาคผนวกและหลักฐานประกอบ</h2><p>ข้อขัดแย้งของเอกสารต้นทางที่ยังไม่ตัดสิน: ${b.open_conflicts} ข้อ</p>`,
  ];
  return `<html><head><meta charset="utf-8"><title>${e(b.version.label)}</title><style>body{font-family:'TH SarabunPSK',Tahoma,sans-serif;font-size:16pt} h2{page-break-before:always}</style></head><body>${sections.join("\n")}</body></html>`;
}

function BookExport() {
  const curricula = useCurricula();
  const versions = allVersions(curricula.data).filter((v) => v.status !== "retired");
  const [vid, setVid] = useState("");
  const [busy, setBusy] = useState(false);
  const build = async (mode: "word" | "print") => {
    const id = vid || versions[0]?.id;
    if (!id || busy) return;
    setBusy(true);
    try {
      const html = bookHtml(await callRpc<Book>("curriculum_book_data", { p_version_id: id }));
      if (mode === "word") {
        const url = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/msword" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: "curriculum-book.doc" });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const w = window.open("", "_blank");
        if (!w) throw new Error("เบราว์เซอร์บล็อกหน้าต่างใหม่");
        w.document.write(html); w.document.close(); w.focus(); w.print();
      }
    } catch (err) { toast.error(dbErrorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <DashSection id="book" className="mt-4" title="ส่งออกเล่มหลักสูตรสถานศึกษา">
      <p className="text-sm text-muted-foreground">สร้างจากข้อมูลในระบบเท่านั้น · ส่วนที่ยังไม่อนุมัติมีเครื่องหมาย “ร่าง” · ส่วนที่ยังไม่มีข้อมูลระบุว่า “ยังไม่มีข้อมูลในระบบ” · ไม่สร้างข้อความประกาศหรือชื่อผู้ลงนาม</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <FormField label="ฉบับหลักสูตร" htmlFor="bv"><Select id="bv" value={vid || versions[0]?.id || ""} onChange={(ev) => setVid(ev.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>{v.version_label}</option>)}</Select></FormField>
        <Button size="sm" variant="outline" disabled={busy || !versions.length} onClick={() => build("word")}>{busy ? <Loader2 className="animate-spin" /> : <FileDown />} Word</Button>
        <Button size="sm" variant="outline" disabled={busy || !versions.length} onClick={() => build("print")}><Printer /> พิมพ์/PDF</Button>
      </div>
    </DashSection>
  );
}
