/**
 * ตัวตรวจลายเซ็น AWS Signature V4 (อิสระจากตัวลงนามใน Edge Function) — ใช้ใน local proxy แทนการตรวจของ R2
 * รองรับทั้ง presigned URL (query) และ Authorization header · ตรวจ expiry · ทดสอบกับ test vector ของ AWS
 */
import { createHash, createHmac } from "node:crypto";

const enc = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const sha = (s) => createHash("sha256").update(s).digest("hex");
const hmac = (k, s) => createHmac("sha256", k).update(s).digest();

function signature(secret, day, region, service, stringToSign) {
  const k = hmac(hmac(hmac(hmac("AWS4" + secret, day), region), service), "aws4_request");
  return createHmac("sha256", k).update(stringToSign).digest("hex");
}

function parseAmzDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s ?? "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}

/**
 * @param {{method:string, rawPath:string, query:URLSearchParams, headers:Record<string,string|string[]|undefined>}} req
 * @param {(accessKeyId:string)=>string|undefined} secretFor
 * @returns {{ok:true}|{ok:false, code:string}}
 */
export function verifySigV4(req, secretFor, now = Date.now()) {
  const q = req.query;
  const presigned = q.has("X-Amz-Signature");
  let credential, signedHeaders, provided, amzDate, payload, expires;
  if (presigned) {
    credential = q.get("X-Amz-Credential");
    signedHeaders = q.get("X-Amz-SignedHeaders");
    provided = q.get("X-Amz-Signature");
    amzDate = q.get("X-Amz-Date");
    expires = Number(q.get("X-Amz-Expires"));
    payload = "UNSIGNED-PAYLOAD";
    if (q.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256") return { ok: false, code: "AuthorizationQueryParametersError" };
  } else {
    const m = /^AWS4-HMAC-SHA256 Credential=([^,]+),\s*SignedHeaders=([^,]+),\s*Signature=([0-9a-f]{64})$/.exec(String(req.headers.authorization ?? ""));
    if (!m) return { ok: false, code: "AccessDenied" };
    [, credential, signedHeaders, provided] = m;
    amzDate = String(req.headers["x-amz-date"] ?? "");
    payload = String(req.headers["x-amz-content-sha256"] ?? "");
    expires = 15 * 60; // คลาดเคลื่อนเวลาได้ไม่เกิน 15 นาที
  }
  const [accessKeyId, day, region, service, term] = String(credential ?? "").split("/");
  const secret = secretFor(accessKeyId);
  if (!secret || term !== "aws4_request" || !amzDate?.startsWith(day)) return { ok: false, code: "InvalidAccessKeyId" };
  const t = parseAmzDate(amzDate);
  if (!Number.isFinite(t) || !(expires > 0) || expires > 604800) return { ok: false, code: "AuthorizationQueryParametersError" };
  if (now > t + expires * 1000 || (!presigned && t - now > expires * 1000)) return { ok: false, code: "AccessDenied (Request has expired)" };

  const names = signedHeaders.split(";");
  if (!names.includes("host")) return { ok: false, code: "AccessDenied" };
  const canonicalHeaders = names
    .map((n) => {
      const v = req.headers[n];
      return `${n}:${(Array.isArray(v) ? v.join(",") : (v ?? "")).trim().replace(/\s+/g, " ")}\n`;
    })
    .join("");
  const canonicalQuery = [...q.entries()]
    .filter(([k]) => k !== "X-Amz-Signature")
    .map(([k, v]) => [enc(k), enc(v)])
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [req.method, req.rawPath, canonicalQuery, canonicalHeaders, signedHeaders, payload].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, `${day}/${region}/${service}/aws4_request`, sha(canonical)].join("\n");
  return signature(secret, day, region, service, toSign) === provided ? { ok: true } : { ok: false, code: "SignatureDoesNotMatch" };
}
