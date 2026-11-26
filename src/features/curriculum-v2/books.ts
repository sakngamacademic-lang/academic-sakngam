/**
 * เล่มสำหรับนำเสนอ (ปุ่ม → เปิดเล่ม) — เก็บไฟล์ PDF ไว้ในเบราว์เซอร์เครื่องนี้ (IndexedDB) ไม่อัปโหลด ไม่เขียนฐานข้อมูล
 */
import { useSyncExternalStore } from "react";
import { areaOfCode, type PlanMeta } from "./plans";

export type Stage = "lower" | "upper";
/** stage: ระดับของเล่ม (ไม่ระบุ = ไฟล์เดิมที่ยังไม่รู้ระดับ ให้ผู้ดูแลเลือกเอง — ไม่เดา) · docId/published: สถานะส่งขึ้นระบบเพื่อหน้าเยี่ยมชม */
export interface BookFile { name: string; size: number; blob: Blob; stage?: Stage; docId?: string; published?: boolean }
/** แผนการจัดการเรียนรู้ที่แนบ: bookId = ปุ่มกลุ่มสาระ (null = ยังไม่ได้จัดกลุ่ม ให้ผู้ใช้เลือก) */
export interface PlanFile extends BookFile { id: string; bookId: string | null; meta: PlanMeta }
export interface Book { id: string; title: string; subtitle: string; files: BookFile[]; group?: "subject" }

const KEY = "cv2-books";
const PLAN_KEY = "cv2-plans";
const SUBJECT_AREAS = ["ภาษาไทย", "คณิตศาสตร์", "วิทยาศาสตร์และเทคโนโลยี", "สังคมศึกษา ศาสนา และวัฒนธรรม", "สุขศึกษาและพลศึกษา", "ศิลปะ", "การงานอาชีพ", "ภาษาต่างประเทศ", "กิจกรรมพัฒนาผู้เรียน"];
const DEFAULT: Book[] = [
  { id: "school", title: "หลักสูตรสถานศึกษา", subtitle: "เล่มหลักสูตรโรงเรียน", files: [] },
  ...SUBJECT_AREAS.map((t, i) => ({ id: `area-${i + 1}`, title: t, subtitle: "ม.ต้น / ม.ปลาย", files: [], group: "subject" as const })),
];
let books: Book[] = DEFAULT;
let plans: PlanFile[] = [];
let loaded = false;
let snap = { books, plans, loaded };
const subs = new Set<() => void>();
const emit = () => { snap = { books, plans, loaded }; subs.forEach((f) => f()); };

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("academic-curriculum-v2", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
/** เครื่องที่เคยใช้ปุ่ม "หลักสูตรรายวิชา" รวมเล่มเดียว: เก็บไว้ และเติมปุ่มกลุ่มสาระที่ยังไม่มี */
function migrate(v: Book[]): Book[] {
  if (v.some((b) => b.group === "subject")) return v;
  return [...v, ...DEFAULT.filter((d) => d.group === "subject")];
}
async function load() {
  try {
    const d = await db();
    const v = await new Promise<Book[] | undefined>((res, rej) => { const r = d.transaction("kv").objectStore("kv").get(KEY); r.onsuccess = () => res(r.result as Book[] | undefined); r.onerror = () => rej(r.error); });
    if (Array.isArray(v) && v.length) books = migrate(v);
    const pv = await new Promise<PlanFile[] | undefined>((res, rej) => { const r = d.transaction("kv").objectStore("kv").get(PLAN_KEY); r.onsuccess = () => res(r.result as PlanFile[] | undefined); r.onerror = () => rej(r.error); });
    if (Array.isArray(pv)) plans = pv;
  } catch { /* ใช้หน่วยความจำ */ }
  loaded = true; emit();
}
async function persist() {
  try { const d = await db(); await new Promise<void>((res, rej) => { const tx = d.transaction("kv", "readwrite"); tx.objectStore("kv").put(books, KEY); tx.objectStore("kv").put(plans, PLAN_KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  catch { /* โหมดส่วนตัว: ใช้ได้เฉพาะหน้านี้ */ }
}
function set(next: Book[]) { books = next; emit(); void persist(); }

export function useBooks() {
  return useSyncExternalStore((f) => { subs.add(f); if (!loaded) void load(); return () => subs.delete(f); }, () => snap);
}
/** แนบเพิ่มต่อท้าย (ไม่ทับไฟล์เดิม) · stage = ระดับของไฟล์ที่แนบ */
export const addFiles = (id: string, files: File[], stage?: Stage) =>
  set(books.map((b) => (b.id === id ? { ...b, files: [...b.files, ...files.map((f) => ({ name: f.name, size: f.size, blob: f as Blob, ...(stage ? { stage } : {}) }))] } : b)));
const patchFile = (id: string, i: number, p: Partial<BookFile>) =>
  set(books.map((b) => (b.id === id ? { ...b, files: b.files.map((f, k) => (k === i ? { ...f, ...p } : f)) } : b)));
/** เปลี่ยนระดับเฉพาะไฟล์นี้ — ไฟล์อื่นไม่เปลี่ยน */
export const setFileStage = (id: string, i: number, stage: Stage | undefined) => patchFile(id, i, { stage });
export const markFile = (id: string, i: number, p: { docId?: string; published?: boolean }) => patchFile(id, i, p);
/** แทนที่ไฟล์ช่องนี้ด้วยไฟล์ใหม่ (คงระดับเดิม) — สถานะเผยแพร่ของไฟล์เก่าไม่ถูกโอนมา */
export const replaceFile = (id: string, i: number, f: File) =>
  set(books.map((b) => (b.id === id ? { ...b, files: b.files.map((x, k) => (k === i ? { name: f.name, size: f.size, blob: f as Blob, stage: x.stage } : x)) } : b)));
export const removeFile = (id: string, i: number) => set(books.map((b) => (b.id === id ? { ...b, files: b.files.filter((_, k) => k !== i) } : b)));
export const moveFile = (id: string, i: number, d: -1 | 1) => set(books.map((b) => {
  if (b.id !== id) return b; const f = [...b.files]; const j = i + d; if (j < 0 || j >= f.length) return b; [f[i], f[j]] = [f[j]!, f[i]!]; return { ...b, files: f };
}));
export const renameBook = (id: string, title: string, subtitle: string) => set(books.map((b) => (b.id === id ? { ...b, title, subtitle } : b)));
export const addBook = (group?: "subject") => set([...books, { id: crypto.randomUUID(), title: group ? "รายวิชาใหม่" : "เล่มใหม่", subtitle: "", files: [], group }]);
export const removeBook = (id: string) => set(books.filter((b) => b.id !== id));

const setPlans = (next: PlanFile[]) => { plans = next; emit(); void persist(); };
/** แนบแผนหลายไฟล์: อ่านหัวแผน แล้วจัดเข้าปุ่มกลุ่มสาระตามอักษรนำหน้ารหัสวิชา (ไม่มีรหัส/ไม่มีปุ่ม → ยังไม่จัดกลุ่ม) */
export async function addPlans(files: File[], read: (b: Blob) => Promise<PlanMeta>) {
  const added: PlanFile[] = [];
  for (const f of files) {
    let meta: PlanMeta = {};
    try { meta = await read(f); } catch { /* อ่านหัวไม่ได้: ให้ผู้ใช้จัดเอง */ }
    const area = areaOfCode(meta.code);
    added.push({ id: crypto.randomUUID(), name: f.name, size: f.size, blob: f, meta, bookId: area && books.some((b) => b.id === area) ? area : null });
  }
  setPlans([...plans, ...added]);
  return added;
}
export const movePlan = (id: string, bookId: string | null) => setPlans(plans.map((p) => (p.id === id ? { ...p, bookId } : p)));
export const removePlan = (id: string) => setPlans(plans.filter((p) => p.id !== id));
