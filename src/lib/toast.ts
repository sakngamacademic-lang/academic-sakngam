import { useSyncExternalStore } from "react";

export type ToastTone = "success" | "error" | "info";
export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(tone: ToastTone, message: string) {
  const id = nextId++;
  items = [...items, { id, tone, message }].slice(-4);
  emit();
  setTimeout(() => dismissToast(id), tone === "error" ? 7000 : 4000);
}

/** แจ้งเตือนแบบ toast (ไม่ต้องใช้ library เพิ่ม) */
export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m),
  info: (m: string) => push("info", m),
};

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
  );
}
