/**
 * ที่เก็บข้อมูล Curriculum V2 ระยะ Preview: พื้นที่ทำงานในเบราว์เซอร์ (IndexedDB) — ไม่เขียนฐานข้อมูล
 * - แยกจากตารางหลักสูตรเดิมทั้งหมด (ไม่อ่าน/ไม่เขียน subjects, subject_offerings ฯลฯ)
 * - นำเข้าไฟล์เดิมซ้ำ (sha256 เดียวกันในปีเดียวกัน) = แทนที่ชุดเดิม ไม่เกิดข้อมูลซ้ำ
 * - แต่ละไฟล์เป็นแหล่งแยก (PDF ไม่เขียนทับ Excel) · ผู้ใช้เลือกแหล่งที่ใช้แสดงผลของแต่ละปีเอง
 * - เมื่อติดตั้ง migration Curriculum V2 แล้ว ส่วนนี้จะถูกแทนด้วยตาราง cv2_* (ดู docs/architecture/CURRICULUM-V2.md)
 */
import { useSyncExternalStore } from "react";
import type { ConsolidatedRow } from "./consolidate";
import type { SourceKind, V2Activity, V2Declared, V2Description, V2Issue } from "./model";

export interface StoredSource {
  id: string; kind: SourceKind; fileName: string; sha256: string; importedAt: string; importedBy: string;
  rows: ConsolidatedRow[]; activities: V2Activity[]; declared: V2Declared[]; descriptions: V2Description[]; issues: V2Issue[]; notes: string[];
}
export interface Dataset { year: number; label: string; primarySourceId: string | null; sources: StoredSource[] }
export interface LogEntry { at: string; by: string; action: "import" | "replace" | "remove" | "set_primary" | "clear"; year: number; file?: string; sha256?: string; rows?: number }
export interface Workspace { version: 1; datasets: Dataset[]; log: LogEntry[] }

const KEY = "cv2-workspace";
const emptyWs = (): Workspace => ({ version: 1, datasets: [], log: [] });
let ws: Workspace = emptyWs();
let loaded = false;
let snap: Workspace & { loaded: boolean } = { ...ws, loaded };
const subs = new Set<() => void>();
const emit = () => { snap = { ...ws, loaded }; subs.forEach((f) => f()); };

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("academic-curriculum-v2", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function persist() {
  try { const db = await idb(); await new Promise<void>((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(ws, KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  catch { /* โหมดส่วนตัว/ปิดที่เก็บ: ใช้งานได้เฉพาะในหน้านี้ */ }
}
export async function loadWorkspace() {
  if (loaded) return;
  try {
    const db = await idb();
    const v = await new Promise<Workspace | undefined>((res, rej) => { const r = db.transaction("kv").objectStore("kv").get(KEY); r.onsuccess = () => res(r.result as Workspace | undefined); r.onerror = () => rej(r.error); });
    if (v?.version === 1) ws = v;
  } catch { /* ใช้หน่วยความจำ */ }
  loaded = true; emit();
}
function set(next: Workspace) { ws = next; emit(); void persist(); }

export function useWorkspace(): Workspace & { loaded: boolean } {
  return useSyncExternalStore((f) => { subs.add(f); if (!loaded) void loadWorkspace(); return () => subs.delete(f); }, () => snap);
}
export const getWorkspace = () => ws;

export function saveSource(year: number, label: string, src: Omit<StoredSource, "id" | "importedAt">) {
  const now = new Date().toISOString();
  const datasets = ws.datasets.map((d) => ({ ...d, sources: [...d.sources] }));
  let d = datasets.find((x) => x.year === year);
  if (!d) { d = { year, label, primarySourceId: null, sources: [] }; datasets.push(d); }
  if (label.trim()) d.label = label.trim();
  const i = d.sources.findIndex((s) => s.sha256 === src.sha256);
  const stored: StoredSource = { ...src, id: src.sha256, importedAt: now };
  if (i >= 0) d.sources[i] = stored; else d.sources.push(stored);
  if (!d.primarySourceId) d.primarySourceId = stored.id;
  datasets.sort((a, b) => a.year - b.year);
  set({ ...ws, datasets, log: [...ws.log, { at: now, by: src.importedBy, action: i >= 0 ? "replace" : "import", year, file: src.fileName, sha256: src.sha256, rows: src.rows.length }] });
  return i >= 0 ? "replaced" : "added";
}
export function setPrimary(year: number, sourceId: string, by: string) {
  set({ ...ws, datasets: ws.datasets.map((d) => (d.year === year ? { ...d, primarySourceId: sourceId } : d)), log: [...ws.log, { at: new Date().toISOString(), by, action: "set_primary", year, sha256: sourceId }] });
}
export function removeSource(year: number, sourceId: string, by: string) {
  const datasets = ws.datasets.map((d) => d.year !== year ? d : { ...d, sources: d.sources.filter((s) => s.id !== sourceId), primarySourceId: d.primarySourceId === sourceId ? (d.sources.find((s) => s.id !== sourceId)?.id ?? null) : d.primarySourceId }).filter((d) => d.sources.length);
  const file = ws.datasets.find((d) => d.year === year)?.sources.find((s) => s.id === sourceId)?.fileName;
  set({ ...ws, datasets, log: [...ws.log, { at: new Date().toISOString(), by, action: "remove", year, file, sha256: sourceId }] });
}
export function clearWorkspace(by: string) { set({ ...emptyWs(), log: [...ws.log, { at: new Date().toISOString(), by, action: "clear", year: 0 }] }); }
export const primaryOf = (d: Dataset | undefined) => d?.sources.find((s) => s.id === d.primarySourceId) ?? d?.sources[0];
