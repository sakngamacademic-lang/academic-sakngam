import { useMemo } from "react";
import { TeamLanyardRail, type LanyardMember } from "@/components/ui/team-lanyard-rail";
import type { PublicVisitData } from "./visit-api";

/**
 * ราวป้ายเล่มหลักสูตร (หน้าเยี่ยมชม) — 1 ป้าย = 1 เล่มหลักสูตรสถานศึกษา หรือ 1 กลุ่มสาระที่มีเล่มเผยแพร่
 * ข้อมูลทุกบรรทัดมาจาก public_visit_data() · พลิกป้ายแล้วกด ม.ต้น / ม.ปลาย เพื่อเปิด PDF (/b/<id>) · ไม่มีข้อมูลสมมติ
 */
const STAGE = { lower: "ม.ต้น", upper: "ม.ปลาย" } as const;
const ORDER = ["lower", "upper"] as const;
const dateTh = (s: string) => new Date(s).toLocaleDateString("th-TH", { dateStyle: "medium" });

export function VisitRail({ data }: { data: PublicVisitData }) {
  const items = useMemo<LanyardMember[]>(() => {
    const inBooks = new Set(data.books.map((b) => b.document_id));
    const school: LanyardMember[] = data.documents.filter((d) => !inBooks.has(d.id)).map((d) => ({
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
        tags: books.map((b) => `${STAGE[b.stage]}${b.page_count ? ` ${b.page_count.toLocaleString("th-TH")} หน้า` : ""}`),
        links: books.map((b) => ({ label: `เปิดเล่ม ${STAGE[b.stage]}`, href: `/b/${b.document_id}`, target: "_blank" })),
        code: `ปรับปรุง ${dateTh(latest)}`,
      }];
    });
    return [...school, ...areas];
  }, [data]);
  if (!items.length) return <p className="visit__muted visit__empty">ยังไม่มีเล่มหลักสูตรที่อนุมัติให้เผยแพร่</p>;
  return (
    <TeamLanyardRail
      items={items}
      className="visit-rail rounded-[28px] border border-border"
      eyebrow={`เล่มหลักสูตรที่เผยแพร่ · ${items.length.toLocaleString("th-TH")} รายการ`}
      heading="เลือกเล่มหลักสูตรที่ต้องการเปิดอ่าน"
      caption="แตะป้ายเพื่อพลิกดูรายละเอียด แล้วเลือกระดับ ม.ต้น / ม.ปลาย"
      labels={{ flip: "แตะหรือกด Enter เพื่อพลิกป้าย", back: "กดลิงก์บนป้ายเพื่อเปิดเล่ม · แตะอีกครั้งเพื่อพลิกกลับ", show: "แสดง" }}
      aria-label="เล่มหลักสูตรที่เผยแพร่"
    />
  );
}
