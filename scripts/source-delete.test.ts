import { assertEquals } from "jsr:@std/assert@1";
import { deletePlan, SOURCE_REFERENCES, type RefResult } from "../src/features/curriculum/source-delete.ts";

const base = (counts: Record<string, number | null>): RefResult[] =>
  SOURCE_REFERENCES.map((r) => ({ ...r, count: `${r.table}.${r.column}` in counts ? counts[`${r.table}.${r.column}`] as number | null : 0 }));

Deno.test("referenced → archive only (e.g. SRC-01 with children P1–P6)", () => {
  const p = deletePlan(base({ "source_documents.parent_id": 6, "subjects.source_document_id": 3 }));
  assertEquals([p.mode, p.total, p.referenced.length], ["archive", 9, 2]);
});
Deno.test("unreadable table → unknown (never delete)", () => {
  assertEquals(deletePlan(base({ "grading_policies.source_document_id": null })).mode, "unknown");
});
Deno.test("no references and fully checked → delete registry row only", () => {
  assertEquals(deletePlan(base({})).mode, "delete");
});
Deno.test("covers every FK to source_documents (24 on Staging)", () => {
  assertEquals(SOURCE_REFERENCES.length, 24);
});

import { parseActionResult, resultMessage, serverPlan } from "../src/features/curriculum/source-delete.ts";
Deno.test("server results: success only when DB confirms archived/deleted", () => {
  assertEquals(resultMessage(parseActionResult({ result: "deleted", file_id: "f" })).ok, true);
  assertEquals(resultMessage(parseActionResult({ result: "archived" })).ok, true);
  const rej = resultMessage(parseActionResult({ result: "rejected", cause: "referenced", references: [{ table: "subjects", column: "source_document_id", count: 3 }] }));
  assertEquals([rej.ok, rej.text.includes("รายวิชา 3")], [false, true]);
  assertEquals(resultMessage(parseActionResult({ result: "rejected", cause: "reference_check_failed" })).ok, false);
  assertEquals(resultMessage(parseActionResult(null)).ok, false);
  assertEquals(resultMessage(parseActionResult({ ok: true })).ok, false);
});
Deno.test("server plan from DB references", () => {
  assertEquals(serverPlan([]).mode, "delete");
  const p = serverPlan([{ table: "public.source_documents", column: "parent_id", count: 6 }]);
  assertEquals([p.mode, p.total, p.referenced[0]!.label], ["archive", 6, "เอกสารย่อย (เช่น SRC-01-P1…P6)"]);
});
