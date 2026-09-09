import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { del as blobDel, issueSignedToken, presignUrl } from "@vercel/blob";
import { envString } from "@/lib/env";

/**
 * Object storage for user uploads.
 *
 * Two providers behind one interface, because the client flow is identical for
 * both: the browser receives a short-lived PUT URL and uploads **directly** to
 * storage. Proxying bytes through the app would burn serverless bandwidth and,
 * on Vercel, hit the ~4.5 MB request-body limit — which rules out video.
 *
 *   vercel-blob  Zero setup: the store's token is injected into the project by
 *                Vercel itself, so no credential is ever handled by hand. Free
 *                tier is ~1 GB and metered egress, which is fine for photos and
 *                tight for video.
 *
 *   r2           Cloudflare R2. 10 GB free and — the part that matters for
 *                video — **no egress fees**. Preferred once video volume grows.
 *                Requires R2 to be enabled on the Cloudflare account and an
 *                S3 API token to be created.
 *
 * R2 wins when both are configured. Neither configured means the feature
 * reports itself unavailable and the UI hides the upload controls, rather than
 * failing at the moment somebody tries to contribute.
 *
 * One genuine difference between them: with S3 the public URL is derivable
 * from the key, but Vercel Blob only reveals it in the PUT response. So an
 * upload ticket carries an optional `publicUrl`, and when it is absent the
 * client reports back the URL it received — validated server-side against the
 * expected host before it is stored.
 */

export type StorageProvider = "r2" | "vercel-blob";

export interface UploadTarget {
  uploadUrl: string;
  /** Known upfront for S3; null for Blob, which returns it on completion. */
  publicUrl: string | null;
  expiresInSeconds: number;
}

interface R2Config {
  bucket: string;
  publicBaseUrl: string;
  client: S3Client;
}

let r2Cache: R2Config | null | undefined;

function r2(): R2Config | null {
  if (r2Cache !== undefined) return r2Cache;

  const accountId = envString("R2_ACCOUNT_ID");
  const accessKeyId = envString("R2_ACCESS_KEY_ID");
  const secretAccessKey = envString("R2_SECRET_ACCESS_KEY");
  const bucket = envString("R2_BUCKET");
  const publicBaseUrl = envString("R2_PUBLIC_BASE_URL");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    r2Cache = null;
    return r2Cache;
  }

  r2Cache = {
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return r2Cache;
}

function blobConfigured(): boolean {
  return Boolean(envString("BLOB_READ_WRITE_TOKEN"));
}

export function activeProvider(): StorageProvider | null {
  if (r2()) return "r2";
  if (blobConfigured()) return "vercel-blob";
  return null;
}

export function isStorageConfigured(): boolean {
  return activeProvider() !== null;
}

/** Public URL for an S3 key. Null on Blob, where the URL is not derivable. */
export function publicUrl(key: string): string | null {
  const config = r2();
  return config ? `${config.publicBaseUrl}/${key}` : null;
}

/**
 * A short-lived upload URL. Content type and maximum size are pinned into the
 * signature on both providers, so a client cannot sign for a 2 MB JPEG and
 * then push a 2 GB file.
 */
export async function presignUpload(input: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}): Promise<UploadTarget | null> {
  const expiresIn = input.expiresInSeconds ?? 600;
  const config = r2();

  if (config) {
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    const uploadUrl = await getSignedUrl(config.client, command, {
      expiresIn,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return { uploadUrl, publicUrl: publicUrl(input.key), expiresInSeconds: expiresIn };
  }

  if (!blobConfigured()) return null;

  const validUntil = Date.now() + expiresIn * 1000;
  const signedToken = await issueSignedToken({
    pathname: input.key,
    operations: ["put"],
    validUntil,
    allowedContentTypes: [input.contentType],
    maximumSizeInBytes: input.contentLength,
  });

  const { presignedUrl } = await presignUrl(signedToken, {
    operation: "put",
    access: "public",
    pathname: input.key,
    validUntil,
    allowedContentTypes: [input.contentType],
    maximumSizeInBytes: input.contentLength,
    // The key already contains a UUID; a second suffix would make the stored
    // pathname diverge from the one we recorded.
    addRandomSuffix: false,
    cacheControlMaxAge: 31_536_000,
  });

  return { uploadUrl: presignedUrl, publicUrl: null, expiresInSeconds: expiresIn };
}

/**
 * Validates a URL the client claims storage returned. Without this, confirm
 * would accept an arbitrary URL and the gallery would render whatever host an
 * attacker named.
 */
export function isTrustedStorageUrl(url: string, key: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const config = r2();
  if (config) return url.startsWith(`${config.publicBaseUrl}/`);

  // Vercel Blob serves from <storeId>.public.blob.vercel-storage.com and the
  // pathname must be the key we issued the ticket for.
  return (
    parsed.hostname.endsWith(".blob.vercel-storage.com") &&
    decodeURIComponent(parsed.pathname).replace(/^\//, "") === key
  );
}

/** Read-back URL for a private object; used for moderator review on S3. */
export async function presignRead(key: string, expiresInSeconds = 3600): Promise<string | null> {
  const config = r2();
  if (!config) return null;
  return getSignedUrl(config.client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/** Deletes the bytes. Rejected uploads are removed, not merely hidden. */
export async function deleteObject(keyOrUrl: string): Promise<boolean> {
  const config = r2();
  try {
    if (config) {
      await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: keyOrUrl }));
      return true;
    }
    if (!blobConfigured()) return false;
    // Blob deletes by URL; callers pass the stored public URL when on Blob.
    await blobDel(keyOrUrl);
    return true;
  } catch (error) {
    console.warn("[storage] delete failed", error);
    return false;
  }
}
