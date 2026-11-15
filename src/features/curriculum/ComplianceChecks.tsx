import { useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ComplianceRow, ComplianceStatus } from "./api";
import { CHECK_STATUS_LABELS, CHECK_STATUS_ORDER, checkView } from "./compliance-view";
import { formatLocator } from "./components";

const TONE: Record<ComplianceStatus, BadgeProps["variant"]> = { pass: "success", fail: "destructive", insufficient_data: "secondary", warning: "warning" };
const PAGE = 40;

/** รายการตรวจสอบความครบถ้วนของหลักสูตร: รายการ · สถานะ · รายละเอียด · สิ่งที่ต้องดำเนินการ (รหัสเทคนิคอยู่ใน “รายละเอียดเพิ่มเติม”) */
export function ComplianceChecks({ rows, programs }: { rows: ComplianceRow[]; programs?: { code: string; name_th: string }[] }) {
  const [filter, setFilter] = useState<ComplianceStatus | "attention">("attention");
  const [limit, setLimit] = useState(PAGE);
  const views = rows.map((r) => checkView(r, programs));
  const count = (s: ComplianceStatus) => views.filter((v) => v.status === s).length;
  const shown = views
    .filter((v) => (filter === "attention" ? v.status !== "pass" : v.status === filter))
    .sort((a, b) => CHECK_STATUS_ORDER.indexOf(a.status) - CHECK_STATUS_ORDER.indexOf(b.status));
  return (
    <div data-testid="compliance-checks">
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="กรองตามสถานะ">
        {([["attention", `ต้องดำเนินการ (${views.length - count("pass")})`], ...CHECK_STATUS_ORDER.map((s) => [s, `${CHECK_STATUS_LABELS[s]} (${count(s)})`])] as [string, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => { setFilter(k as ComplianceStatus | "attention"); setLimit(PAGE); }}
            className={`rounded-full border px-3 py-1 text-sm ${filter === k ? "border-primary/60 bg-primary/15" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {!shown.length && <p className="text-sm text-muted-foreground">ไม่มีรายการในสถานะนี้</p>}
      <ul className="space-y-2">
        {shown.slice(0, limit).map((v, i) => (
          <li key={i} className="rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={TONE[v.status]}>{v.statusLabel}</Badge>
              <span className="font-medium">{v.title}</span>
              {v.scope && <span className="text-xs text-muted-foreground">({v.scope})</span>}
            </div>
            <p className="mt-1 text-muted-foreground">
              {v.detail && <>{v.detail} · </>}ที่ควรเป็น: {v.expected} · ที่พบ: {v.actual}
            </p>
            {v.status !== "pass" && <p className="mt-1"><b>สิ่งที่ต้องดำเนินการ:</b> {v.action}</p>}
            <details className="mt-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer">รายละเอียดเพิ่มเติม</summary>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2">
                <dt>รหัสเกณฑ์</dt><dd>{v.tech.code} (v{v.tech.version})</dd>
                <dt>หมวด</dt><dd>{v.tech.category}</dd>
                <dt>ขอบเขต (ค่าเดิม)</dt><dd>{v.tech.rawScope || "–"}</dd>
                <dt>ค่าที่คาดหวัง (ค่าเดิม)</dt><dd>{v.tech.rawExpected || "–"}</dd>
                <dt>ค่าที่พบ (ค่าเดิม)</dt><dd>{v.tech.rawActual || "–"}</dd>
                <dt>แหล่งอ้างอิง</dt><dd>{v.tech.source ? v.tech.source.replace(/\s*(pdf:.*)$/, (_m, loc: string) => ` · ${formatLocator(loc)}`) : "–"}</dd>
              </dl>
            </details>
          </li>
        ))}
      </ul>
      {shown.length > limit && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLimit(limit + PAGE)}>แสดงเพิ่ม ({shown.length - limit})</Button>}
    </div>
  );
}
