/**
 * เลือกผู้ให้บริการจาก Edge Function Secrets (ไม่มีค่าใดอยู่ใน frontend หรือ Git)
 *   STORAGE_PROVIDER=r2   : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   STORAGE_PROVIDER=s3   : S3_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET
 *                           (ใช้กับ S3 emulator ใน local เท่านั้น)
 */
import { S3CompatibleProvider } from "./s3.ts";
import type { StorageProvider } from "./provider.ts";

export const DEFAULT_BUCKET = "sakngam-academic-documents";

function need(env: (k: string) => string | undefined, k: string) {
  const v = env(k);
  if (!v) throw new Error(`missing storage secret ${k}`);
  return v;
}

export function createStorageProvider(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): StorageProvider {
  const kind = env("STORAGE_PROVIDER") ?? "r2";
  if (kind === "r2") {
    const endpoint = `https://${need(env, "R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
    return new S3CompatibleProvider({
      name: "r2",
      endpoint,
      region: "auto",
      bucket: env("R2_BUCKET") ?? DEFAULT_BUCKET,
      accessKeyId: need(env, "R2_ACCESS_KEY_ID"),
      secretAccessKey: need(env, "R2_SECRET_ACCESS_KEY"),
    });
  }
  if (kind === "s3") {
    return new S3CompatibleProvider({
      name: "s3-local",
      endpoint: need(env, "S3_ENDPOINT"),
      publicEndpoint: env("S3_PUBLIC_ENDPOINT"),
      region: env("S3_REGION") ?? "us-east-1",
      bucket: env("S3_BUCKET") ?? DEFAULT_BUCKET,
      accessKeyId: need(env, "S3_ACCESS_KEY_ID"),
      secretAccessKey: need(env, "S3_SECRET_ACCESS_KEY"),
    });
  }
  throw new Error(`unknown STORAGE_PROVIDER ${kind}`);
}
