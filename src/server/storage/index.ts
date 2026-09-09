import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { envString } from "@/lib/env";

/**
 * Object storage for user uploads.
 *
 * S3-compatible, configured for Cloudflare R2 by default: 10 GB free, and —
 * the part that actually matters for video — **no egress fees**. Serving video
 * from a metered-egress bucket is how a free side project acquires a bill.
 *
 * Uploads go **directly** from the browser to the bucket via a presigned PUT.
 * Proxying them through the app would burn serverless bandwidth and, on
 * Vercel, hit the ~4.5 MB request body limit — which rules out video entirely.
 *
 * Storage is optional. With no credentials configured the whole feature
 * reports itself unavailable and the UI hides the upload controls, rather than
 * failing at the moment somebody tries to contribute.
 */

export interface StorageConfig {
  bucket: string;
  publicBaseUrl: string;
  client: S3Client;
}

let cached: StorageConfig | null | undefined;

export function storage(): StorageConfig | null {
  if (cached !== undefined) return cached;

  const accountId = envString("R2_ACCOUNT_ID");
  const accessKeyId = envString("R2_ACCESS_KEY_ID");
  const secretAccessKey = envString("R2_SECRET_ACCESS_KEY");
  const bucket = envString("R2_BUCKET");
  const publicBaseUrl = envString("R2_PUBLIC_BASE_URL");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    cached = null;
    return cached;
  }

  cached = {
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return cached;
}

export function isStorageConfigured(): boolean {
  return storage() !== null;
}

/** Public URL for a stored object. The bucket is served read-only via R2/CDN. */
export function publicUrl(key: string): string | null {
  const config = storage();
  return config ? `${config.publicBaseUrl}/${key}` : null;
}

/**
 * A short-lived PUT URL. The content type and length are pinned into the
 * signature, so a client cannot sign for a 2 MB JPEG and then upload a 2 GB
 * executable.
 */
export async function presignUpload(input: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}): Promise<string | null> {
  const config = storage();
  if (!config) return null;

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });

  return getSignedUrl(config.client, command, {
    expiresIn: input.expiresInSeconds ?? 600,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

/** Read-back URL, for private buckets or moderator review. */
export async function presignRead(key: string, expiresInSeconds = 3600): Promise<string | null> {
  const config = storage();
  if (!config) return null;
  return getSignedUrl(config.client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

export async function deleteObject(key: string): Promise<boolean> {
  const config = storage();
  if (!config) return false;
  try {
    await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    return true;
  } catch (error) {
    console.warn("[storage] delete failed", error);
    return false;
  }
}
