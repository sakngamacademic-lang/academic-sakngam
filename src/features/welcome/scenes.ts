/**
 * เนื้อหาหน้า Welcome (ข้อมูลล้วน — ไม่มี logic ของ animation)
 * ⚠️ หน้า public: ไม่ดึงข้อมูลจากฐานข้อมูล ตัวเลขเป็นข้อเท็จจริงของระบบ หรือ "ภาพตัวอย่าง" เท่านั้น
 */
export type SceneChart =
  | { kind: "rings"; values: number[]; center: string; label: string }
  | { kind: "donut"; values: number[]; center: string; total: string; label: string; colors?: string[] }
  | { kind: "bars"; values: number[]; labels: string[]; label: string }
  | { kind: "gauge"; values: number[]; center: string; label: string };

export type ScenePanel =
  | { kind: "rows"; title: string; meta: string; rows: { name: string; tag: string; tone: "todo" | "wait" | "ok"; sub?: string }[] }
  | { kind: "steps"; title: string; meta: string; steps: { title: string; text: string; state?: "done" | "now" }[] }
  | { kind: "line"; title: string; meta: string; values: number[]; labels: string[]; label: string };

export interface Scene {
  accent: string;
  name: string;
  navLabel: string;
  thumbName: string;
  eyebrow: string;
  /** บรรทัดบาง / บรรทัดหนา และจำนวนอักษรฐาน (ใช้ย่อขนาดให้พอดีคอลัมน์ ดู DESIGN-SYSTEM.md §2) */
  title: [{ text: string; chars: number }, { text: string; chars: number }];
  lede: string;
  kpis: { label: string; value: string; unit?: string }[];
  chart: SceneChart;
  /** แผนภูมิย่อใน thumbnail (ค่าตัวอย่าง) */
  mini: SceneChart;
  square?: boolean;
  panel: ScenePanel & { aria: string };
  secondaryCta?: boolean;
}

const RISK_COLORS = ["var(--rose)", "var(--amber)", "var(--accent)"];

export const SCENES: Scene[] = [
  {
    accent: "#8b7cf6",
    name: "ระบบบริหารงานวิชาการ",
    navLabel: "ภาพรวม",
    thumbName: "ภาพรวมระบบ",
    eyebrow: "Sak Ngam Academic",
    title: [{ text: "ระบบบริหาร", chars: 9 }, { text: "งานวิชาการ", chars: 9 }],
    lede: "พื้นที่ทำงานเดียวของฝ่ายวิชาการและครูผู้สอน — ตั้งแต่ข้อมูลพื้นฐาน หลักสูตร การวัดผล ไปจนถึงการส่งและตรวจรับเอกสาร",
    kpis: [
      { label: "Portal", value: "2", unit: "ส่วน" },
      { label: "บทบาทผู้ใช้", value: "6", unit: "บทบาท" },
      { label: "กลุ่มสาระ", value: "8", unit: "กลุ่ม" },
      { label: "สิทธิ์ข้อมูลทุกตาราง", value: "RLS" },
    ],
    chart: { kind: "rings", values: [100, 82, 64], center: "ตัวอย่างความคืบหน้า", label: "ภาพตัวอย่าง: วงแหวนความคืบหน้างานวิชาการ" },
    mini: { kind: "rings", values: [100, 82, 64], center: "", label: "" },
    panel: {
      kind: "rows",
      aria: "ระบบนี้ทำอะไรได้",
      title: "สองพื้นที่ทำงาน ระบบเดียว",
      meta: "เข้าสู่ระบบครั้งเดียว ระบบพาไปตามบทบาท",
      rows: [
        { name: "Academic Office", tag: "ฝ่ายวิชาการ", tone: "todo", sub: "ทะเบียน หลักสูตร วัดผล มอบหมายและตรวจรับเอกสาร" },
        { name: "Teacher Portal", tag: "ครูผู้สอน", tone: "wait", sub: "ภาระงานของฉัน ส่งเอกสาร ติดตามผลการตรวจ" },
      ],
    },
    secondaryCta: true,
  },
  {
    accent: "#6d7cff",
    name: "หลักสูตรและข้อมูลพื้นฐาน",
    navLabel: "หลักสูตร",
    thumbName: "หลักสูตร",
    eyebrow: "Curriculum & Master Data",
    title: [{ text: "หลักสูตร", chars: 6 }, { text: "ข้อมูลพื้นฐาน", chars: 10 }],
    lede: "ปีการศึกษา ภาคเรียน ระดับชั้น ห้องเรียน และ 8 กลุ่มสาระ เป็นฐานเดียวกันของทุกโมดูล ขึ้นปีการศึกษาใหม่ได้ในไม่กี่ขั้นตอน",
    kpis: [
      { label: "ระดับชั้น", value: "ป.1–ม.6" },
      { label: "ภาคเรียน", value: "1 · 2" },
      { label: "คัดลอกห้องเรียน", value: "1", unit: "คลิก" },
      { label: "ประวัติปีเก่า", value: "ครบ" },
    ],
    chart: { kind: "donut", values: [14, 14, 16, 12, 8, 8, 10, 14], total: "8", center: "กลุ่มสาระ", label: "ภาพตัวอย่าง: สัดส่วนรายวิชาของ 8 กลุ่มสาระ" },
    mini: { kind: "donut", values: [14, 14, 16, 12, 8, 8, 10, 14], total: "", center: "", label: "" },
    panel: {
      kind: "steps",
      aria: "ตัวอย่างข้อมูลพื้นฐาน",
      title: "ขึ้นปีการศึกษาใหม่",
      meta: "ตัวอย่างขั้นตอน",
      steps: [
        { title: "เพิ่มปีการศึกษา 2570", text: "กำหนดวันเริ่ม–สิ้นสุด", state: "done" },
        { title: "เพิ่มภาคเรียนที่ 1 และ 2", text: "ระบบตรวจวันที่ไม่ให้ทับซ้อน", state: "done" },
        { title: "คัดลอกห้องเรียนจากปีก่อน", text: "ข้ามห้องที่มีอยู่แล้ว", state: "now" },
        { title: "ตั้งเป็นปีปัจจุบัน", text: "มีได้ครั้งละหนึ่งปีเท่านั้น" },
      ],
    },
  },
  {
    accent: "#38d6f5",
    name: "วัดและประเมินผล",
    navLabel: "วัดผล",
    thumbName: "วัดผล",
    eyebrow: "Assessment",
    title: [{ text: "วัดและ", chars: 5 }, { text: "ประเมินผล", chars: 8 }],
    lede: "ทะเบียนผลการเรียน การกระจายเกรด แนวโน้มรายภาค และรายงาน ปพ. จากข้อมูลชุดเดียวกัน",
    kpis: [
      { label: "ผลการเรียน", value: "4–0" },
      { label: "สถานะพิเศษ", value: "ร · มส" },
      { label: "รายงาน", value: "ปพ." },
      { label: "อนุมัติผล", value: "2", unit: "ขั้น" },
    ],
    chart: { kind: "bars", values: [18, 16, 21, 15, 12, 8, 6, 4], labels: ["4", "3.5", "3", "2.5", "2", "1.5", "1", "0"], label: "ภาพตัวอย่าง: การกระจายผลการเรียน" },
    mini: { kind: "bars", values: [18, 16, 21, 15, 12, 8], labels: [], label: "" },
    square: true,
    panel: {
      kind: "line",
      aria: "ตัวอย่างแนวโน้มผลการเรียน",
      title: "แนวโน้มเกรดเฉลี่ย",
      meta: "ภาพตัวอย่าง · ข้อมูลจำลอง",
      values: [2.71, 2.78, 2.8, 2.87],
      labels: ["1/68", "2/68", "1/69", "2/69"],
      label: "ภาพตัวอย่าง: เกรดเฉลี่ยเพิ่มขึ้นใน 4 ภาคเรียน",
    },
  },
  {
    accent: "#5eead4",
    name: "ภาระงานเอกสาร",
    navLabel: "เอกสาร",
    thumbName: "เอกสาร",
    eyebrow: "Document Workflow",
    title: [{ text: "มอบหมาย", chars: 7 }, { text: "ส่ง · ตรวจรับ", chars: 11 }],
    lede: "ฝ่ายวิชาการมอบหมายงานพร้อมแม่แบบ ครูส่ง PDF / Word / Excel ตรวจรับหรือส่งกลับแก้ไขได้ทันที ทุกฉบับเก็บเป็นประวัติ",
    kpis: [
      { label: "ชนิดไฟล์", value: "3", unit: "แบบ" },
      { label: "เวอร์ชันเอกสาร", value: "ไม่ทับ" },
      { label: "สถานะ", value: "4", unit: "ขั้น" },
      { label: "แจ้งเตือน", value: "อัตโนมัติ" },
    ],
    chart: { kind: "gauge", values: [64], center: "ตรวจรับแล้ว", label: "ภาพตัวอย่าง: เกจร้อยละเอกสารที่ตรวจรับแล้ว" },
    mini: { kind: "gauge", values: [64], center: "", label: "" },
    panel: {
      kind: "steps",
      aria: "ขั้นตอนงานเอกสาร",
      title: "วงจรเอกสารหนึ่งฉบับ",
      meta: "ตัวอย่าง",
      steps: [
        { title: "มอบหมาย", text: "ฝ่ายวิชาการแนบแม่แบบ กำหนดส่ง", state: "done" },
        { title: "ส่งเอกสาร", text: "ครูอัปโหลด ฉบับที่ 1", state: "done" },
        { title: "ส่งกลับแก้ไข", text: "พร้อมข้อเสนอแนะ", state: "now" },
        { title: "ตรวจรับ", text: "ครูส่งฉบับที่ 2 แล้วผ่าน" },
      ],
    },
  },
  {
    accent: "#c084fc",
    name: "ติดตามนักเรียน",
    navLabel: "ติดตามนักเรียน",
    thumbName: "ติดตามนักเรียน",
    eyebrow: "Student Monitoring",
    title: [{ text: "ติดตาม", chars: 5 }, { text: "นักเรียน", chars: 6 }],
    lede: "เห็นนักเรียนที่ติด 0 ร มส และกลุ่มเสี่ยงตั้งแต่เนิ่น ๆ พร้อมสถานะการแก้ผลการเรียนรายคน — เห็นเฉพาะผู้มีสิทธิ์",
    kpis: [
      { label: "สถานะติดตาม", value: "0 · ร · มส" },
      { label: "ครูที่ปรึกษา", value: "แจ้งได้" },
      { label: "ข้อมูลส่วนบุคคล", value: "PDPA" },
      { label: "Audit log", value: "ทุกการแก้" },
    ],
    chart: { kind: "donut", values: [31, 19, 9], colors: RISK_COLORS, total: "0·ร·มส", center: "ตัวอย่าง", label: "ภาพตัวอย่าง: สัดส่วน 0 ร มส" },
    mini: { kind: "donut", values: [31, 19, 9], colors: RISK_COLORS, total: "", center: "", label: "" },
    panel: {
      kind: "rows",
      aria: "ความปลอดภัยของข้อมูล",
      title: "ข้อมูลนักเรียนปลอดภัย",
      meta: "หลักการของระบบ",
      rows: [
        { name: "แยกข้อมูลตามโรงเรียน", tag: "RLS", tone: "ok" },
        { name: "เห็นตามบทบาทและกลุ่มสาระ", tag: "RBAC", tone: "ok" },
        { name: "บันทึกทุกการเปลี่ยนแปลง", tag: "Audit", tone: "ok" },
      ],
    },
  },
];

export const FEATURES = [
  { title: "ฝ่ายวิชาการ", text: "แดชบอร์ดงานค้าง คิวตรวจรับ ทะเบียน หลักสูตร วัดผล และรายงาน", color: "var(--violet)", icon: "office" },
  { title: "ครูผู้สอน", text: "เห็นงานที่ต้องส่ง กำหนดส่ง ข้อเสนอแนะ และส่งเอกสารได้ในไม่กี่คลิก", color: "var(--cyan)", icon: "teacher" },
  { title: "ผู้บริหาร", text: "ภาพรวมผลสัมฤทธิ์และความคืบหน้า แบบอ่านอย่างเดียว", color: "var(--mint)", icon: "exec" },
  { title: "ความปลอดภัย", text: "สิทธิ์บังคับที่ฐานข้อมูล ไม่มีการสมัครเอง และไม่มีการเลือกบทบาทเอง", color: "var(--rose)", icon: "secure" },
] as const;
