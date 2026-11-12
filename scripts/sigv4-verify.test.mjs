// node --test scripts/sigv4-verify.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifySigV4 } from "./sigv4-verify.mjs";

// AWS official example: "Query String Request Authentication (GET Object)" — docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const q = new URLSearchParams({
  "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
  "X-Amz-Credential": "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
  "X-Amz-Date": "20130524T000000Z",
  "X-Amz-Expires": "86400",
  "X-Amz-SignedHeaders": "host",
  "X-Amz-Signature": "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
});
const req = (query) => ({ method: "GET", rawPath: "/test.txt", query, headers: { host: "examplebucket.s3.amazonaws.com" } });
const at = Date.UTC(2013, 4, 24, 1);
const secretFor = (k) => (k === "AKIAIOSFODNN7EXAMPLE" ? SECRET : undefined);

test("AWS test vector ผ่าน", () => assert.deepEqual(verifySigV4(req(q), secretFor, at), { ok: true }));
test("ลายเซ็นผิด → SignatureDoesNotMatch", () => {
  const bad = new URLSearchParams(q);
  bad.set("X-Amz-Signature", "0".repeat(64));
  assert.equal(verifySigV4(req(bad), secretFor, at).code, "SignatureDoesNotMatch");
});
test("หมดอายุ → AccessDenied", () => assert.equal(verifySigV4(req(q), secretFor, Date.UTC(2013, 4, 26)).ok, false));
test("key ไม่รู้จัก → InvalidAccessKeyId", () => assert.equal(verifySigV4(req(q), () => undefined, at).code, "InvalidAccessKeyId"));
test("เปลี่ยน path → SignatureDoesNotMatch", () =>
  assert.equal(verifySigV4({ ...req(q), rawPath: "/other.txt" }, secretFor, at).code, "SignatureDoesNotMatch"));
