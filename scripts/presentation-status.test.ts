// deno test --config supabase/functions/deno.json scripts/presentation-status.test.ts — ข้อมูลจำลอง
import { assert, assertEquals } from "jsr:@std/assert@1";
import { curriculumStatus, type StatusInput } from "../src/features/curriculum/presentation/status.ts";

const SHA = "a".repeat(64);
const base: StatusInput = { confirmations: [], documents: [{ id: "d", sha256: SHA }], conflicts: [], compliance: [], verifiedRules: 0 };
const conf = { scope: "structure", status: "active", document_sha256: SHA, source_document_id: "d" };

Deno.test("โรงเรียนยืนยันแล้ว ≠ ผ่านเกณฑ์", () => {
  const s = curriculumStatus({ ...base, confirmations: [conf], conflicts: [{ status: "needs_decision" }] });
  assertEquals(s.school, "confirmed");
  assertEquals(s.review, "issues");
  const t = curriculumStatus({ ...base, confirmations: [conf] });
  assertEquals(t.review, "in_review"); // ไม่มีกฎที่ยืนยัน/ผลตรวจ → ไม่ถือว่าผ่าน
});
Deno.test("ไฟล์เปลี่ยนหลังยืนยัน / การยืนยันถูกเพิกถอน", () => {
  assertEquals(curriculumStatus({ ...base, confirmations: [conf], documents: [{ id: "d", sha256: "b".repeat(64) }] }).school, "file_changed");
  assertEquals(curriculumStatus({ ...base, confirmations: [{ ...conf, status: "revoked" }] }).school, "not_confirmed");
});
Deno.test("ผ่านการตรวจได้เฉพาะเมื่อมีกฎยืนยันแล้ว ผลผ่านทุกข้อ และไม่มีข้อสงสัยค้าง", () => {
  const ok = curriculumStatus({ ...base, verifiedRules: 3, compliance: [{ status: "pass" }], conflicts: [{ status: "resolved" }] });
  assertEquals(ok.review, "passed");
  assertEquals(curriculumStatus({ ...base, verifiedRules: 3, compliance: [{ status: "pass" }], conflicts: [{ status: "open" }] }).review, "in_review");
  assertEquals(curriculumStatus({ ...base, verifiedRules: 3, compliance: [{ status: "warning" }] }).review, "in_review");
  assertEquals(curriculumStatus({ ...base, verifiedRules: 3, compliance: [{ status: "fail" }] }).review, "issues");
});
Deno.test("แยกข้อสงสัยกับประเด็นที่ยืนยันแล้ว", () => {
  const s = curriculumStatus({ ...base, conflicts: [{ status: "open" }, { status: "needs_decision" }, { status: "needs_decision" }, { status: "resolved" }] });
  assertEquals(s.counts, { suspected: 1, confirmedIssues: 2, resolved: 1, complianceFail: 0, complianceOpen: 0 });
  assert(s.reasons.some((r) => r.includes("ประเด็นที่ยืนยันแล้วรอตัดสิน 2")));
});
