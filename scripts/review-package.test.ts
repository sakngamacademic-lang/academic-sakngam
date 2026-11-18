import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { canAgree, opinionError, opinionsCsv, parseReviewPackage, summarize, visibleAreaCodes, type ReviewPackage } from "../src/features/curriculum/review/review-package.ts";

// ข้อมูลสังเคราะห์ (ไม่ใช่ข้อมูลหลักสูตรจริง)
const v = (value: string | null, ref: string | null = null) => ({ value, ref });
const pkg: ReviewPackage = {
  kind: "curriculum-structure-review", version: 1, title: "t", source: { pdf: "p", xlsx: "x", registry: "r" },
  areas: [{ code: "SC", name: "วิทย์" }, { code: "SO", name: "สังคม" }],
  decisions: [{ no: 3, title: "d3", affects: "สังคม", refs: "-" }],
  items: [
    { id: "SC-1-001", area: "SC", grade: "M1", code: "ว00001", name: "a", kind: "add", issue: "i", pdf: v("a 1(40)", "PDF น.1"), xls: v("a 1(40)", "1!B2"), reg: v(null), evidence: null, plans: "p", proposal: "a 1(40)", dependsOn: [] },
    { id: "SO-1-001", area: "SO", grade: "M1", code: "ส00001", name: "b", kind: "conflict", issue: "i", pdf: v("b"), xls: v("c"), reg: v("b"), evidence: null, plans: "p", proposal: null, dependsOn: [3] },
  ],
};

Deno.test("parse: validates kind/version and duplicate ids", () => {
  assertEquals(parseReviewPackage(JSON.stringify(pkg)).items.length, 2);
  assertThrows(() => parseReviewPackage("{"), Error, "JSON");
  assertThrows(() => parseReviewPackage(JSON.stringify({ ...pkg, kind: "x" })), Error, "ไม่ใช่ไฟล์ชุดตรวจทาน");
  assertThrows(() => parseReviewPackage(JSON.stringify({ ...pkg, items: [pkg.items[0], pkg.items[0]] })), Error, "ซ้ำ");
});

Deno.test("scope: uses existing roles/assignments only", () => {
  const all = ["SC", "SO"];
  assertEquals(visibleAreaCodes(["academic_head"], [], all), all);
  assertEquals(visibleAreaCodes(["learning_area_head"], ["SC"], all), ["SC"]);
  assertEquals(visibleAreaCodes(["learning_area_head"], [], all), []);
  assertEquals(visibleAreaCodes(["teacher"], ["SC"], all), []);
});

Deno.test("school-level dependent items cannot be agreed; summary does not count them as passed", () => {
  const so = pkg.items[1]!;
  assertEquals(canAgree(so), false);
  assertEquals(opinionError(so, { choice: "agree", note: "" }) !== null, true);
  assertEquals(opinionError(so, { choice: "escalate", note: "" }), "กรุณาระบุเหตุผลหรือค่าที่เสนอ");
  const s = summarize(pkg, { "SO-1-001": { choice: "agree", note: "" }, "SC-1-001": { choice: "agree", note: "" } }, ["SC", "SO"]);
  assertEquals(s.map((x) => [x.code, x.answered, x.agree, x.waitingSchool]), [["SC", 1, 1, 0], ["SO", 0, 0, 1]]);
  assertEquals(opinionsCsv(pkg, {}).split("\r\n").length, 3);
});
