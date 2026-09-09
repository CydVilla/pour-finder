import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { deals, media, venues, type Media, type MediaPurpose } from "@/db/schema";
import { envBool } from "@/lib/env";
import { MEDIA_LIMITS, extensionFor, kindForMimeType } from "@/lib/media-limits";
import {
  activeProvider,
  deleteObject,
  isStorageConfigured,
  isTrustedStorageUrl,
  presignUpload,
} from "./storage";

/**
 * Photo and video uploads.
 *
 * The flow is: reserve a row and a presigned URL, upload straight to storage,
 * confirm. The row exists before the bytes do, so an abandoned upload leaves a
 * `pending` record with no `uploadedAt` that a sweep can clean up — rather
 * than an orphaned object nobody has a reference to.
 *
 * Nothing is published without review. Anonymous image uploads on an
 * alcohol-focused site are exactly the surface that needs a human in front of
 * it, and the moderation queue already exists.
 */

export interface UploadTicket {
  mediaId: string;
  uploadUrl: string;
  /** Present when the client generated a thumbnail or video poster. */
  thumbnailUploadUrl: string | null;
  publicUrl: string | null;
  expiresInSeconds: number;
  /** True when the client must report the resolved URL back on confirm. */
  reportUrl: boolean;
}

export type UploadError =
  | { error: "storage_unconfigured" }
  | { error: "unsupported_type" }
  | { error: "too_large"; maxBytes: number }
  | { error: "unknown_venue" }
  | { error: "unknown_deal" };

export async function createUploadTicket(input: {
  venueId: string;
  dealId?: string | null;
  commentId?: string | null;
  purpose: MediaPurpose;
  mimeType: string;
  sizeBytes: number;
  caption?: string | null;
  assertedPriceCents?: number | null;
  thumbnailMimeType?: string | null;
  thumbnailSizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  submitterHash: string;
}): Promise<UploadTicket | UploadError> {
  if (!isStorageConfigured()) return { error: "storage_unconfigured" };

  const kind = kindForMimeType(input.mimeType);
  if (!kind) return { error: "unsupported_type" };

  const limits = MEDIA_LIMITS[kind];
  if (input.sizeBytes <= 0 || input.sizeBytes > limits.maxBytes) {
    return { error: "too_large", maxBytes: limits.maxBytes };
  }

  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, input.venueId))
    .limit(1);
  if (!venue) return { error: "unknown_venue" };

  if (input.dealId) {
    const [deal] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.id, input.dealId), eq(deals.venueId, input.venueId)))
      .limit(1);
    if (!deal) return { error: "unknown_deal" };
  }

  // Key layout groups by venue so a venue's media can be listed or purged
  // without a database round trip.
  const id = randomUUID();
  const key = `venues/${input.venueId}/${kind}/${id}.${extensionFor(input.mimeType)}`;

  const target = await presignUpload({
    key,
    contentType: input.mimeType,
    contentLength: input.sizeBytes,
  });
  if (!target) return { error: "storage_unconfigured" };

  // A thumbnail is its own object, so it needs its own signature. Failing to
  // produce one is not fatal: the gallery falls back to the full image.
  let thumbKey: string | null = null;
  let thumbTarget: Awaited<ReturnType<typeof presignUpload>> = null;
  if (input.thumbnailMimeType && input.thumbnailSizeBytes && input.thumbnailSizeBytes > 0) {
    thumbKey = `venues/${input.venueId}/thumb/${id}.${extensionFor(input.thumbnailMimeType)}`;
    thumbTarget = await presignUpload({
      key: thumbKey,
      contentType: input.thumbnailMimeType,
      contentLength: input.thumbnailSizeBytes,
    });
    if (!thumbTarget) thumbKey = null;
  }

  await db.insert(media).values({
    id,
    venueId: input.venueId,
    dealId: input.dealId ?? null,
    commentId: input.commentId ?? null,
    kind,
    purpose: input.purpose,
    storageKey: key,
    publicUrl: target.publicUrl,
    thumbnailKey: thumbKey,
    thumbnailUrl: thumbTarget?.publicUrl ?? null,
    storageProvider: activeProvider(),
    width: input.width ?? null,
    height: input.height ?? null,
    durationSeconds:
      input.durationSeconds !== null && input.durationSeconds !== undefined
        ? String(Math.round(input.durationSeconds * 100) / 100)
        : null,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    caption: input.caption?.trim() || null,
    assertedPriceCents: input.assertedPriceCents ?? null,
    submitterHash: input.submitterHash,
    // MEDIA_AUTO_APPROVE exists for the same reason MODERATION_AUTO_APPROVE
    // does: a solo operator seeding a market. Not for open traffic.
    status: envBool("MEDIA_AUTO_APPROVE") ? "visible" : "pending",
  });

  return {
    mediaId: id,
    uploadUrl: target.uploadUrl,
    thumbnailUploadUrl: thumbTarget?.uploadUrl ?? null,
    publicUrl: target.publicUrl,
    expiresInSeconds: target.expiresInSeconds,
    // Blob reveals the final URL only in the PUT response, so the client
    // reports it back on confirm; it is validated before being stored.
    reportUrl: target.publicUrl === null,
  };
}

/** Called once the browser's PUT succeeds. Without this the row stays pending. */
export async function confirmUpload(
  mediaId: string,
  submitterHash: string,
  reportedUrl?: string | null,
  reportedThumbnailUrl?: string | null,
): Promise<{ ok: boolean; status?: Media["status"]; reason?: "untrusted_url" }> {
  const [existing] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.submitterHash, submitterHash)))
    .limit(1);
  if (!existing) return { ok: false };

  let resolvedUrl = existing.publicUrl;
  if (!resolvedUrl) {
    if (!reportedUrl) return { ok: false };
    // The client supplies this, so it is untrusted until it matches the key we
    // issued on a host we recognise.
    if (!isTrustedStorageUrl(reportedUrl, existing.storageKey)) {
      return { ok: false, reason: "untrusted_url" };
    }
    resolvedUrl = reportedUrl;
  }

  // Thumbnails are best-effort: an untrusted or missing one is dropped rather
  // than failing the upload, since the gallery can fall back to the full file.
  let resolvedThumb = existing.thumbnailUrl;
  if (!resolvedThumb && reportedThumbnailUrl && existing.thumbnailKey) {
    resolvedThumb = isTrustedStorageUrl(reportedThumbnailUrl, existing.thumbnailKey)
      ? reportedThumbnailUrl
      : null;
  }

  const [row] = await db
    .update(media)
    .set({ uploadedAt: new Date(), publicUrl: resolvedUrl, thumbnailUrl: resolvedThumb })
    .where(eq(media.id, mediaId))
    .returning();

  return row ? { ok: true, status: row.status } : { ok: false };
}

export interface MediaDTO {
  id: string;
  kind: Media["kind"];
  purpose: MediaPurpose;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  assertedPriceCents: number | null;
  dealId: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export async function listVenueMedia(
  venueId: string,
  options: { kind?: Media["kind"]; limit?: number } = {},
): Promise<MediaDTO[]> {
  const rows = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.venueId, venueId),
        eq(media.status, "visible"),
        sql`${media.uploadedAt} IS NOT NULL`,
        options.kind ? eq(media.kind, options.kind) : undefined,
      ),
    )
    .orderBy(desc(media.createdAt))
    .limit(Math.min(options.limit ?? 24, 60));

  return rows.flatMap(toDTO);
}

/** Media counts per venue, for the "3 photos" affordance on a card. */
export async function mediaCountsForVenues(
  venueIds: readonly string[],
): Promise<Map<string, { photos: number; videos: number }>> {
  if (venueIds.length === 0) return new Map();

  const rows = await db
    .select({
      venueId: media.venueId,
      photos: sql<number>`count(*) FILTER (WHERE ${media.kind} = 'photo')::int`,
      videos: sql<number>`count(*) FILTER (WHERE ${media.kind} = 'video')::int`,
    })
    .from(media)
    .where(
      and(
        inArray(media.venueId, [...venueIds]),
        eq(media.status, "visible"),
        sql`${media.uploadedAt} IS NOT NULL`,
      ),
    )
    .groupBy(media.venueId);

  return new Map(rows.map((r) => [r.venueId, { photos: r.photos, videos: r.videos }]));
}

export async function listPendingMedia(limit = 50): Promise<(MediaDTO & { venueId: string })[]> {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.status, "pending"), sql`${media.uploadedAt} IS NOT NULL`))
    .orderBy(desc(media.createdAt))
    .limit(limit);

  return rows.flatMap((row) => {
    const dto = toDTO(row);
    return dto.length ? [{ ...dto[0]!, venueId: row.venueId }] : [];
  });
}

export async function reviewMedia(
  mediaId: string,
  decision: "approve" | "reject",
  moderator: string,
  note?: string,
): Promise<boolean> {
  const [row] = await db
    .update(media)
    .set({
      status: decision === "approve" ? "visible" : "rejected",
      reviewedAt: new Date(),
      reviewedBy: moderator,
      reviewNote: note ?? null,
    })
    .where(eq(media.id, mediaId))
    .returning();

  if (!row) return false;

  // Rejected bytes are deleted from storage, not merely hidden. Keeping
  // rejected uploads costs money and creates a liability for content we have
  // explicitly decided not to host.
  if (decision === "reject") {
    const onR2 = row.storageProvider === "r2";
    await deleteObject(onR2 ? row.storageKey : (row.publicUrl ?? row.storageKey));
    if (row.thumbnailKey) {
      await deleteObject(onR2 ? row.thumbnailKey : (row.thumbnailUrl ?? row.thumbnailKey));
    }
  }
  return true;
}

/** A photo of the menu is far stronger evidence than a tap. */
export async function priceEvidenceCount(dealId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(media)
    .where(
      and(
        eq(media.dealId, dealId),
        eq(media.status, "visible"),
        inArray(media.purpose, ["price_evidence", "menu"]),
        sql`${media.uploadedAt} IS NOT NULL`,
      ),
    );
  return row?.count ?? 0;
}

function toDTO(row: Media): MediaDTO[] {
  const url = row.publicUrl;
  if (!url) return [];
  return [
    {
      id: row.id,
      kind: row.kind,
      purpose: row.purpose,
      url,
      thumbnailUrl: row.thumbnailUrl,
      caption: row.caption,
      assertedPriceCents: row.assertedPriceCents,
      dealId: row.dealId,
      width: row.width,
      height: row.height,
      durationSeconds: row.durationSeconds === null ? null : Number(row.durationSeconds),
      createdAt: row.createdAt.toISOString(),
    },
  ];
}
