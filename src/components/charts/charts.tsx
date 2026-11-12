/**
 * แผนภูมิ SVG แบบเบา (ไม่ใช้ library) — แปลงจาก docs/design/mockup/interaction.js
 * - ไม่มี animation ในตัว: หน้า Welcome ใส่ motion ผ่าน CSS ของหน้าเอง, Dashboard แสดงนิ่ง
 * - สีส่งผ่าน props (ค่าเริ่มต้นใช้ palette ของ Design System)
 * - ทุกแผนภูมิมี role="img" + aria-label สรุปตัวเลข (ยกเว้นรุ่นย่อ mini ที่เป็นภาพประกอบ)
 */
const fmt = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });

export const CHART_PALETTE = [
  "var(--chart-accent, var(--violet))",
  "var(--cyan)",
  "var(--mint)",
  "var(--indigo)",
  "var(--amber)",
  "var(--rose)",
  "var(--violet)",
  "var(--text-3)",
] as const;

const TRACK = "rgba(255,255,255,0.08)";
const TEXT = "var(--text-1)";
const MUTED = "var(--text-3)";
const ACCENT = "var(--chart-accent, var(--violet))";

interface BaseProps {
  values: readonly number[];
  /** ข้อความสรุปสำหรับ screen reader — ว่างได้เฉพาะรุ่นย่อ */
  label?: string;
  mini?: boolean;
  className?: string;
}

function Svg({ viewBox, label, className, children }: { viewBox: string; label?: string; className?: string; children: React.ReactNode }) {
  return label ? (
    <svg viewBox={viewBox} role="img" aria-label={label} focusable="false" className={className} style={{ width: "100%", height: "auto", overflow: "visible" }}>
      {children}
    </svg>
  ) : (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false" className={className} style={{ width: "100%", height: "auto", overflow: "visible" }}>
      {children}
    </svg>
  );
}

const pick = (colors: readonly string[] | undefined, i: number) => colors?.[i] ?? CHART_PALETTE[i % CHART_PALETTE.length]!;

/** วงแหวนซ้อน: ค่าร้อยละหลายตัว */
export function RingsChart({ values, label, mini, className, center, colors }: BaseProps & { center?: string; colors?: readonly string[] }) {
  const sw = mini ? 22 : 15;
  const gap = mini ? 30 : 26;
  return (
    <Svg viewBox="0 0 320 320" label={label} className={className}>
      {values.map((val, i) => {
        const r = 140 - i * gap;
        return (
          <g key={i}>
            <circle className="trk" cx="160" cy="160" r={r} strokeWidth={sw} fill="none" stroke={TRACK} />
            <circle className="seg" cx="160" cy="160" r={r} strokeWidth={sw} fill="none" stroke={pick(colors, i)} strokeLinecap="round"
              pathLength={100} strokeDasharray={`${val} 100`} transform="rotate(-90 160 160)" />
          </g>
        );
      })}
      {!mini && (
        <>
          <text x="160" y="158" textAnchor="middle" fontSize="46" fontWeight="700" fill={TEXT}>{fmt.format(values[0] ?? 0)}%</text>
          <text x="160" y="186" textAnchor="middle" fontSize="15" fill={MUTED}>{center}</text>
        </>
      )}
    </Svg>
  );
}

/** โดนัท: สัดส่วนของทั้งหมด */
export function DonutChart({ values, label, mini, className, center, total, colors }: BaseProps & { center?: string; total?: string; colors?: readonly string[] }) {
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const sw = mini ? 46 : 34;
  const gap = values.length > 1 ? 1.2 : 0;
  let acc = 0;
  return (
    <Svg viewBox="0 0 320 320" label={label} className={className}>
      <circle className="trk" cx="160" cy="160" r="118" strokeWidth={sw} fill="none" stroke={TRACK} />
      {values.map((val, i) => {
        const pct = (val / sum) * 100;
        const offset = -acc;
        acc += pct;
        return (
          <circle key={i} className="seg seg--butt" cx="160" cy="160" r="118" strokeWidth={sw} fill="none" stroke={pick(colors, i)}
            pathLength={100} strokeDasharray={`${Math.max(pct - gap, 0.5)} 100`} strokeDashoffset={offset} transform="rotate(-90 160 160)" />
        );
      })}
      {!mini && (
        <>
          <text x="160" y="162" textAnchor="middle" fontSize="50" fontWeight="700" fill={TEXT}>{total ?? fmt.format(sum)}</text>
          <text x="160" y="190" textAnchor="middle" fontSize="15" fill={MUTED}>{center}</text>
        </>
      )}
    </Svg>
  );
}

/** แท่ง: การกระจาย / เปรียบเทียบ */
export function BarsChart({ values, label, mini, className, labels, colors }: BaseProps & { labels?: readonly string[]; colors?: readonly string[] }) {
  const max = Math.max(...values, 1);
  const W = 320;
  const H = mini ? 320 : 250;
  const base = mini ? 270 : 196;
  const top = mini ? 50 : 30;
  const slot = (W - 40) / Math.max(values.length, 1);
  const bw = Math.min(slot * 0.62, 44);
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} label={label} className={className}>
      {!mini && <line className="grid" x1="20" x2="300" y1={base} y2={base} stroke="var(--line)" />}
      {values.map((val, i) => {
        const h = ((base - top) * val) / max;
        const x = 20 + slot * i + (slot - bw) / 2;
        return (
          <g key={i}>
            <rect className="bar" style={{ "--i": i } as React.CSSProperties} x={x.toFixed(1)} y={(base - h).toFixed(1)} width={bw.toFixed(1)} height={h.toFixed(1)}
              rx={Math.min(bw / 2, 10)} fill={colors ? pick(colors, i) : ACCENT} opacity={colors ? 1 : (0.45 + 0.55 * (val / max)).toFixed(2)} />
            {!mini && (
              <>
                <text x={(x + bw / 2).toFixed(1)} y={(base - h - 8).toFixed(1)} textAnchor="middle" fontSize="13" fontWeight="600" fill={TEXT}>{fmt.format(val)}</text>
                <text x={(x + bw / 2).toFixed(1)} y={base + 22} textAnchor="middle" fontSize="13" fill={MUTED}>{labels?.[i] ?? ""}</text>
              </>
            )}
          </g>
        );
      })}
    </Svg>
  );
}

/** เส้น: แนวโน้มตามเวลา */
export function LineChart({ values, label, mini, className, labels, gradientId }: BaseProps & { labels?: readonly string[]; gradientId: string }) {
  const W = 320;
  const H = mini ? 320 : 170;
  const top = mini ? 90 : 22;
  const base = mini ? 230 : 128;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => [20 + (280 * i) / Math.max(values.length - 1, 1), base - ((base - top) * (v - min)) / span] as const);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} label={label} className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACCENT} stopOpacity=".38" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L300 ${base}L20 ${base}Z`} fill={`url(#${gradientId})`} />
      <path className="seg" d={d} fill="none" stroke={ACCENT} strokeWidth={mini ? 14 : 3} strokeLinecap="round" pathLength={100} strokeDasharray="100 100" strokeLinejoin="round" />
      {!mini &&
        pts.map((p, i) => (
          <g key={i}>
            <circle cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="4" fill="var(--bg-1)" stroke={ACCENT} strokeWidth="2" />
            <text x={p[0].toFixed(1)} y={(p[1] - 11).toFixed(1)} textAnchor="middle" fontSize="12" fontWeight="600" fill={TEXT}>{fmt.format(values[i] ?? 0)}</text>
            <text x={p[0].toFixed(1)} y={base + 24} textAnchor="middle" fontSize="12" fill={MUTED}>{labels?.[i] ?? ""}</text>
          </g>
        ))}
    </Svg>
  );
}

/** เกจครึ่งวง: ค่าร้อยละเดียว */
export function GaugeChart({ values, label, mini, className, center }: BaseProps & { center?: string }) {
  const val = values[0] ?? 0;
  const sw = mini ? 34 : 22;
  const arc = "M40 190A120 120 0 0 1 280 190";
  return (
    <Svg viewBox={mini ? "0 30 320 200" : "0 40 320 190"} label={label} className={className}>
      <path className="trk" d={arc} strokeWidth={sw} strokeLinecap="round" fill="none" stroke={TRACK} />
      <path className="seg" d={arc} stroke={ACCENT} strokeWidth={sw} strokeLinecap="round" fill="none" pathLength={100} strokeDasharray={`${val} 100`} />
      {!mini && (
        <>
          <text x="160" y="176" textAnchor="middle" fontSize="54" fontWeight="700" fill={TEXT}>{fmt.format(val)}%</text>
          <text x="160" y="206" textAnchor="middle" fontSize="15" fill={MUTED}>{center}</text>
        </>
      )}
    </Svg>
  );
}
