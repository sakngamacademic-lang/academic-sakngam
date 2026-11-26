import { useEffect, useMemo, useState } from "react";
import { TeamLanyardRail, type LanyardMember } from "@/components/ui/team-lanyard-rail";
import type { PublicVisitData } from "./visit-api";
import { isPlanDoc } from "./plans/PlanLinks";

/**
 * ราวป้ายเล่มหลักสูตร (หน้าเยี่ยมชม) — 1 ป้าย = 1 เล่มหลักสูตรสถานศึกษา หรือ 1 กลุ่มสาระที่มีเล่มเผยแพร่
 * ข้อมูลทุกบรรทัดมาจาก public_visit_data() · พลิกป้ายแล้วกด ม.ต้น / ม.ปลาย เพื่อเปิด PDF (/b/<id>) · ไม่มีข้อมูลสมมติ
 */
const STAGE = { lower: "ม.ต้น", upper: "ม.ปลาย" } as const;
const STAGE_FULL = { lower: "มัธยมศึกษาตอนต้น", upper: "มัธยมศึกษาตอนปลาย" } as const;
/** คำถามยืนยันก่อนเปิดเล่ม: href ของลิงก์ → ข้อความ */
type Ask = { href: string; text: string };
const ORDER = ["lower", "upper"] as const;
const dateTh = (s: string) => new Date(s).toLocaleDateString("th-TH", { dateStyle: "medium" });

export function VisitRail({ data }: { data: PublicVisitData }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [flipped, setFlipped] = useState<number | null>(null);
  useEffect(() => {
    if (!ask) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setAsk(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ask]);
  const questions = useMemo(() => {
    const m = new Map<string, string>();
    const inBooks = new Set(data.books.map((b) => b.document_id));
    for (const d of data.documents) if (!inBooks.has(d.id)) m.set(`/b/${d.id}`, `คุณต้องการดู${d.title} หรือไม่`);
    for (const b of data.books) m.set(`/b/${b.document_id}`, `คุณต้องการดูหลักสูตร${data.areas.find((a) => a.id === b.learning_area_id)?.name ?? ""} ${STAGE_FULL[b.stage]} หรือไม่`);
    return m;
  }, [data]);
  const items = useMemo<LanyardMember[]>(() => {
    const inBooks = new Set(data.books.map((b) => b.document_id));
    // แผนการสอนที่เผยแพร่ แสดงในส่วน “จากหลักสูตรสู่แผนการสอน” แทน
    const school: LanyardMember[] = data.documents.filter((d) => !inBooks.has(d.id) && !isPlanDoc(d.title)).map((d) => ({
      id: d.id, name: d.title, role: "เล่มหลักสูตรสถานศึกษา", team: "โรงเรียนสักงามวิทยา", image: "/school-logo.png", imageFit: "contain", tone: 2,
      bio: "เล่มหลักสูตรสถานศึกษาที่อนุมัติให้เผยแพร่ กดเปิดอ่านได้ทันที",
      tags: d.page_count ? [`${d.page_count.toLocaleString("th-TH")} หน้า`] : [],
      links: [{ label: "เปิดอ่านเล่ม", href: `/b/${d.id}`, target: "_blank" }],
    }));
    const areas: LanyardMember[] = data.areas.flatMap((a, i) => {
      const books = ORDER.flatMap((s) => data.books.filter((b) => b.learning_area_id === a.id && b.stage === s));
      if (!books.length) return [];
      const latest = books.map((b) => b.updated_at).sort().at(-1)!;
      return [{
        id: a.id, name: a.name, role: books.map((b) => STAGE[b.stage]).join(" · "), team: "หลักสูตรกลุ่มสาระ", image: "/school-logo.png", imageFit: "contain" as const,
        tone: ([1, 3, 4, 5] as const)[i % 4],
        bio: "เล่มหลักสูตรกลุ่มสาระการเรียนรู้ที่อนุมัติให้เผยแพร่ เลือกระดับด้านล่างเพื่อเปิดอ่าน",
        // ป้ายเดียวบรรทัดเดียว เพื่อไม่ชนปุ่มเปิดเล่มด้านล่างของป้าย
        tags: books.some((b) => b.page_count) ? [books.filter((b) => b.page_count).map((b) => `${STAGE[b.stage]} ${b.page_count!.toLocaleString("th-TH")}`).join(" · ") + " หน้า"] : [],
        links: books.map((b) => ({ label: `เปิดเล่ม ${STAGE[b.stage]}`, href: `/b/${b.document_id}`, target: "_blank" })),
        code: `ปรับปรุง ${dateTh(latest)}`,
      }];
    });
    return [...school, ...areas];
  }, [data]);
  if (!items.length) return <p className="visit__muted visit__empty">ยังไม่มีเล่มหลักสูตรที่อนุมัติให้เผยแพร่</p>;
  const picked = flipped === null ? null : items[flipped] ?? null;
  const open = (href: string) => setAsk({ href, text: questions.get(href) ?? "คุณต้องการเปิดเล่มนี้หรือไม่" });
  return (
    <>
    <TeamLanyardRail
      flipped={flipped}
      onFlippedChange={setFlipped}
      action={picked ? (
        // ปุ่มขนาดใหญ่ใต้ราว (กดง่ายบนมือถือ) — ชุดเดียวกับลิงก์บนป้ายที่พลิกอยู่
        <div className="flex w-full max-w-md flex-wrap justify-center gap-4">
          {(picked.links ?? []).map((l) => (
            <button key={l.href} type="button" onClick={() => open(l.href)} className="inline-flex h-12 min-w-[9.5rem] flex-1 items-center justify-center rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground shadow-sm">{l.label}</button>
          ))}
        </div>
      ) : undefined}
      onLinkClick={(_m, link, event) => { event.preventDefault(); open(link.href); }}
      items={items}
      className="visit-rail rounded-[28px] border border-border"
      eyebrow={`เล่มหลักสูตรที่เผยแพร่ · ${items.length.toLocaleString("th-TH")} รายการ`}
      heading="เลือกเล่มหลักสูตรที่ต้องการเปิดอ่าน"
      caption="แตะป้ายเพื่อพลิกดูรายละเอียด แล้วเลือกระดับ ม.ต้น / ม.ปลาย"
      labels={{ flip: "แตะหรือกด Enter เพื่อพลิกป้าย", back: "เลือกระดับด้านล่างเพื่อเปิดเล่ม · แตะป้ายอีกครั้งเพื่อพลิกกลับ", show: "แสดง" }}
      aria-label="เล่มหลักสูตรที่เผยแพร่"
    />
    {ask && (
      <div role="dialog" aria-modal="true" aria-labelledby="visit-ask" className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-5" onClick={() => setAsk(null)}>
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center text-card-foreground shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p id="visit-ask" className="text-lg font-semibold leading-snug">{ask.text}</p>
          <div className="mt-6 grid gap-3">
            <a href={ask.href} target="_blank" rel="noopener" onClick={() => setAsk(null)} autoFocus className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground">เปิดอ่าน</a>
            <button type="button" onClick={() => setAsk(null)} className="inline-flex h-12 items-center justify-center rounded-full border border-border px-5 text-base font-medium">ยกเลิก</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
