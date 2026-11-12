/**
 * Local only: ทำให้ s3rver ทำงานเหมือน R2 private bucket
 * s3rver ยอมรับคำขอที่ไม่มีลายเซ็น และ "ไม่ตรวจ" ลายเซ็น SigV4 เลย — proxy นี้จึงตรวจเองทุกคำขอ
 * (ลายเซ็น, expiry, header ที่ลงนาม) ด้วยตัวตรวจอิสระที่ผ่าน test vector ของ AWS แล้วจึงส่งต่อ
 */
import http from "node:http";
import { verifySigV4 } from "./sigv4-verify.mjs";

export function startPrivateProxy({ listenPort, targetPort, credentials }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method !== "OPTIONS") {
      const rawPath = req.url.split("?")[0];
      const check = verifySigV4({ method: req.method, rawPath, query: url.searchParams, headers: req.headers }, (k) => credentials[k]);
      if (!check.ok) {
        res.writeHead(403, { "Content-Type": "application/xml" });
        res.end(`<Error><Code>${check.code}</Code><Message>Bucket is private</Message></Error>`);
        return;
      }
    }
    const up = http.request({ host: "127.0.0.1", port: targetPort, method: req.method, path: req.url, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  return new Promise((resolve) => server.listen(listenPort, "127.0.0.1", () => resolve(server)));
}
