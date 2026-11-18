/**
 * อ่านไฟล์ .xlsx ขั้นต่ำ (ไม่มี dependency): ชื่อชีต ค่าในเซลล์ (ข้อความ/ตัวเลข) และช่วงเซลล์ที่รวม (merged)
 * ใช้ DecompressionStream("deflate-raw") — มีในเบราว์เซอร์สมัยใหม่และ Deno · ไม่ประเมินสูตร (อ่านค่าที่บันทึกไว้)
 */
export interface XlsxSheet { name: string; cells: Map<string, string>; merged: { r1: number; c1: number; r2: number; c2: number }[] }

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
/** อ่านไฟล์ใน ZIP ตาม central directory */
export async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ .xlsx ที่อ่านได้");
  const n = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const files = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const method = u16(b, p + 10), csize = u32(b, p + 20), nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), off = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    const lnlen = u16(b, off + 26), lxlen = u16(b, off + 28);
    const raw = b.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    files.set(name, method === 0 ? raw : await inflate(raw));
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1]!)).join("");
export const colNum = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const colName = (n: number) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const ref = (r: string) => { const m = /^([A-Z]+)(\d+)$/.exec(r)!; return { c: colNum(m[1]!), r: Number(m[2]) }; };

export async function readXlsx(buf: ArrayBuffer): Promise<XlsxSheet[]> {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const get = (p: string) => { const f = files.get(p); return f ? dec.decode(f) : ""; };
  const shared = [...get("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!));
  const rels = new Map([...get("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1] ?? "", /Target="([^"]+)"/.exec(m[0])?.[1] ?? ""]));
  const sheets: XlsxSheet[] = [];
  for (const m of get("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const name = unesc(/name="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1] ?? "";
    const target = (rels.get(rid) ?? "").replace(/^\/?xl\//, "");
    const xml = get(`xl/${target}`);
    const cells = new Map<string, string>();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!, body = c[2] ?? "";
      const r = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!r) continue;
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val: string | null = null;
      if (t === "s" && v != null) val = shared[Number(v)] ?? "";
      else if (t === "inlineStr") val = texts(body);
      else if (v != null) val = unesc(v);
      if (val != null && val !== "") cells.set(r, val);
    }
    const merged = [...xml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g)].map((x) => { const a = ref(x[1]!), b = ref(x[2]!); return { r1: a.r, c1: a.c, r2: b.r, c2: b.c }; });
    sheets.push({ name, cells, merged });
  }
  return sheets;
}
