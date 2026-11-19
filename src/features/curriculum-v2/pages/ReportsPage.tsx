import { useState } from "react";
import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { toast } from "@/lib/toast";
import { compareCurricula } from "../compare";
import { compareTables, hoursSummaryTable, registryTable, structureTables, toExcel, toPdf, toWord, type Table } from "../exporters";
import { primaryOf, useWorkspace } from "../store";
import { EmptyV2, PreviewNotice, yearName } from "../ui";

/** รายงานและส่งออก — ทุกไฟล์สร้างจากข้อมูลชุดเดียวกับหน้าเว็บ */
export function ReportsPage() {
  const ws = useWorkspace();
  const years = ws.datasets.map((d) => d.year);
  const [y, setY] = useState<number | null>(null);
  const d = ws.datasets.find((x) => x.year === (y ?? years[years.length - 1]));
  const s = primaryOf(d);
  const prev = d ? ws.datasets.filter((x) => x.year < d.year).at(-1) : undefined;
  const sp = primaryOf(prev);
  if (!ws.loaded) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  const reports: { key: string; title: string; desc: string; make: () => Table[] | null; src: string }[] = d && s ? [
    { key: "structure", title: "โครงสร้างหลักสูตรรายชั้น/แผน/ภาค", desc: "รายวิชา ชั่วโมง หน่วยกิต ยอดรวมรายภาค พร้อมอ้างอิงไฟล์", make: () => structureTables(d, s), src: s.fileName },
    { key: "registry", title: "ทะเบียนรายวิชา", desc: "รายวิชาทุกแถวในโครงสร้าง (รวมแถวที่ยังไม่ระบุชั้น/แผน/ภาค)", make: () => [registryTable(d, s)], src: s.fileName },
    { key: "hours", title: "สรุปชั่วโมงและหน่วยกิต", desc: "ต่อภาคและต่อปี แยกชั้นและแผน (รวมกิจกรรมตามที่ไฟล์ระบุ)", make: () => [hoursSummaryTable(d, s)], src: s.fileName },
    ...(prev && sp ? [
      { key: "compare", title: `ตารางเปรียบเทียบ ${prev.year}–${d.year}`, desc: "การเปลี่ยนแปลงรายวิชา แผน และยอดรวม พร้อมหลักฐานสองฝั่ง", make: () => compareTables(yearName(prev), yearName(d), compareCurricula(sp.rows, s.rows)), src: `${sp.fileName} → ${s.fileName}` },
      { key: "summary", title: `สรุปวิชาเพิ่ม/ลด/เปลี่ยน ${prev.year}–${d.year}`, desc: "จำนวนการเปลี่ยนแปลงแต่ละประเภท และแผนเพิ่ม/ลด", make: () => { const t = compareTables(yearName(prev), yearName(d), compareCurricula(sp.rows, s.rows)); return [t[0]!, t[2]!]; }, src: `${sp.fileName} → ${s.fileName}` },
    ] : []),
  ] : [];
  const run = (kind: "xlsx" | "doc" | "pdf", r: (typeof reports)[number]) => {
    const t = r.make(); if (!t || !t.length) return toast.error("ไม่มีข้อมูลสำหรับรายงานนี้");
    const name = `${r.title}-${d!.year}`;
    if (kind === "xlsx") toExcel(name, t, r.src); else if (kind === "doc") toWord(name, r.title, t, r.src); else if (!toPdf(r.title, t, r.src)) toast.error("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up แล้วลองใหม่");
  };
  return (
    <>
      <PageHeader icon={FileDown} title="รายงานและส่งออก" description="Excel / Word / PDF จากข้อมูลชุดเดียวกับที่แสดงในหน้าเว็บ — ไม่สร้างตัวเลขหรือรายวิชาเพิ่มเอง" />
      <PreviewNotice />
      {!d || !s ? <EmptyV2 title="ยังไม่มีข้อมูลสำหรับรายงาน" text="นำเข้าหลักสูตรอย่างน้อยหนึ่งปีก่อน รายงานเปรียบเทียบต้องมีอย่างน้อยสองปี" /> : (
        <>
          <label className="mb-4 inline-block text-sm"><span className="mb-1 block text-muted-foreground">หลักสูตรปี</span>
            <Select aria-label="หลักสูตรปี" value={d.year} onChange={(e) => setY(Number(e.target.value))}>{ws.datasets.map((x) => <option key={x.year} value={x.year}>{yearName(x)}</option>)}</Select></label>
          {!prev && <p className="mb-3 text-sm text-muted-foreground">รายงานเปรียบเทียบจะแสดงเมื่อมีหลักสูตรปีก่อนหน้า {d.year}</p>}
          <ul className="grid gap-3 md:grid-cols-2">
            {reports.map((r) => (
              <li key={r.key} className="rounded-2xl border bg-card p-4 shadow-card">
                <h2 className="font-semibold">{r.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
                <p className="mt-1 text-xs text-muted-foreground">แหล่งข้อมูล: {r.src}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => run("xlsx", r)}><FileSpreadsheet /> Excel</Button>
                  <Button size="sm" variant="outline" onClick={() => run("doc", r)}><FileDown /> Word</Button>
                  <Button size="sm" variant="outline" onClick={() => run("pdf", r)}><Printer /> PDF</Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
