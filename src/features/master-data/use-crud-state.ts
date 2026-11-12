import { useState } from "react";

/** สถานะร่วมของหน้า CRUD: dialog เพิ่ม/แก้ไข และ dialog ยืนยัน */
export function useCrudState<T>() {
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<T | null>(null);
  return {
    editing,
    creating,
    confirming,
    formOpen: creating || editing !== null,
    openCreate: () => {
      setEditing(null);
      setCreating(true);
    },
    openEdit: (row: T) => {
      setCreating(false);
      setEditing(row);
    },
    closeForm: () => {
      setCreating(false);
      setEditing(null);
    },
    setConfirming,
  };
}

export function matchesSearch(search: string, ...fields: (string | number | null | undefined)[]) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f ?? "").toLowerCase().includes(q));
}
