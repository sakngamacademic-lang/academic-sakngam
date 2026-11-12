/**
 * S3-compatible provider (AWS Signature V4) — ใช้กับ Cloudflare R2 ใน staging/production
 * และใช้กับ S3 emulator ใน local (ค่าเดียวกัน ต่างแค่ endpoint)
 * ไม่มี dependency ภายนอก: ใช้ Web Crypto ซึ่งมีทั้งใน Deno (Edge Runtime) และ Node
 */
import type { ObjectHead, PresignGetOptions, PresignPutOptions, StorageProvider } from "./provider.ts";

export interface S3Config {
  name: string;
  /** endpoint ที่ Edge Function ใช้คุยกับ storage (เช่น https://<account>.r2.cloudflarestorage.com) */
  endpoint: string;
  /** endpoint ที่ใส่ใน presigned URL ให้ browser (R2 = ค่าเดียวกับ endpoint) */
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (data: Uint8Array<ArrayBuffer> | string) =>
  hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
async function hmac(key: BufferSource, data: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}
/** RFC 3986 encoding ตามที่ SigV4 กำหนด */
export const uriEncode = (s: string, keepSlash = false) =>
  [...enc.encode(s)]
    .map((b) => {
      const c = String.fromCharCode(b);
      if (/[A-Za-z0-9\-._~]/.test(c) || (keepSlash && c === "/")) return c;
      return "%" + b.toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");

/** RFC 6266: ชื่อ ASCII สำรอง + ชื่อจริง (UTF-8) สำหรับชื่อไฟล์ภาษาไทย */
export function contentDisposition(name: string) {
  const ext = name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? "";
  const fallback = /^[\x20-\x7e]+$/.test(name) && !/["\\]/.test(name) ? name : `document${ext}`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${uriEncode(name)}`;
}

function amzDate(now: Date) {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amz: iso, day: iso.slice(0, 8) };
}

async function signingKey(secret: string, day: string, region: string) {
  const kDate = await hmac(enc.encode("AWS4" + secret), day);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

export class S3CompatibleProvider implements StorageProvider {
  readonly name: string;
  readonly bucket: string;
  constructor(private cfg: S3Config, private now: () => Date = () => new Date()) {
    this.name = cfg.name;
    this.bucket = cfg.bucket;
  }

  private url(base: string, key: string) {
    const u = new URL(base);
    return { origin: `${u.protocol}//${u.host}`, host: u.host, path: `/${this.bucket}/${uriEncode(key, true)}` };
  }

  /** presigned URL (query-string auth) — header ที่ลงนามต้องถูกส่งมาตรงกันจึงจะผ่าน */
  async presign(method: string, key: string, expires: number, extraQuery: Record<string, string>, signedHeaders: Record<string, string>) {
    const { origin, host, path } = this.url(this.cfg.publicEndpoint ?? this.cfg.endpoint, key);
    const { amz, day } = amzDate(this.now());
    const scope = `${day}/${this.cfg.region}/s3/aws4_request`;
    const headers: Record<string, string> = { host, ...Object.fromEntries(Object.entries(signedHeaders).map(([k, v]) => [k.toLowerCase(), v])) };
    const names = Object.keys(headers).sort();
    const query: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.cfg.accessKeyId}/${scope}`,
      "X-Amz-Date": amz,
      "X-Amz-Expires": String(expires),
      "X-Amz-SignedHeaders": names.join(";"),
      ...extraQuery,
    };
    const canonicalQuery = Object.keys(query).sort().map((k) => `${uriEncode(k)}=${uriEncode(query[k]!)}`).join("&");
    const canonical = [method, path, canonicalQuery, names.map((n) => `${n}:${headers[n]!.trim()}\n`).join(""), names.join(";"), "UNSIGNED-PAYLOAD"].join("\n");
    const toSign = ["AWS4-HMAC-SHA256", amz, scope, await sha256Hex(canonical)].join("\n");
    const sig = hex(await hmac(await signingKey(this.cfg.secretAccessKey, day, this.cfg.region), toSign));
    return `${origin}${path}?${canonicalQuery}&X-Amz-Signature=${sig}`;
  }

  /** คำขอจากฝั่ง server (Authorization header) */
  private async request(method: string, key: string): Promise<Response> {
    const { origin, host, path } = this.url(this.cfg.endpoint, key);
    const { amz, day } = amzDate(this.now());
    const scope = `${day}/${this.cfg.region}/s3/aws4_request`;
    const payloadHash = await sha256Hex("");
    const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amz };
    const names = Object.keys(headers).sort();
    const canonical = [method, path, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
    const toSign = ["AWS4-HMAC-SHA256", amz, scope, await sha256Hex(canonical)].join("\n");
    const sig = hex(await hmac(await signingKey(this.cfg.secretAccessKey, day, this.cfg.region), toSign));
    const { host: _h, ...sendHeaders } = headers;
    return fetch(`${origin}${path}`, {
      method,
      headers: {
        ...sendHeaders,
        authorization: `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}`,
      },
    });
  }

  presignPut(key: string, o: PresignPutOptions) {
    return this.presign("PUT", key, o.expiresInSeconds, {}, { "content-type": o.contentType, "content-length": String(o.contentLength) });
  }

  presignGet(key: string, o: PresignGetOptions) {
    return this.presign("GET", key, o.expiresInSeconds, {
      "response-content-disposition": contentDisposition(o.downloadName),
      "response-content-type": o.contentType,
    }, {});
  }

  async head(key: string): Promise<ObjectHead | null> {
    const res = await this.request("HEAD", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`storage HEAD failed: ${res.status}`);
    return { size: Number(res.headers.get("content-length") ?? "0"), contentType: res.headers.get("content-type") };
  }

  async getBytes(key: string): Promise<Uint8Array<ArrayBuffer>> {
    const res = await this.request("GET", key);
    if (!res.ok) throw new Error(`storage GET failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const res = await this.request("DELETE", key);
    if (!res.ok && res.status !== 404) throw new Error(`storage DELETE failed: ${res.status}`);
  }
}
