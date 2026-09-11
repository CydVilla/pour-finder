import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Recent-activity feed for the moderation queue.
 *
 * With auto-approve on, nothing waits for a human — so the safety net has to
 * move from "review before" to "review after, and be able to undo". This is
 * that feed: one chronological list of everything the public added, each row
 * carrying enough context to judge it and a reversible action.
 *
 * A UNION over the four tables the public can write to. Each source projects
 * into the same shape so the feed can be ordered by time as a whole rather
 * than four separate lists the moderator has to interleave by eye.
 */
export type ActivityKind = "deal" | "venue" | "media" | "comment";

export interface ActivityItem {
  kind: ActivityKind;
  id: string;
  createdAt: string;
  /** One-line summary, e.g. "$3.00 PBR at Biddy Early's". */
  title: string;
  detail: string | null;
  venueSlug: string | null;
  venueName: string | null;
  /** Media only. */
  mediaUrl: string | null;
  /** False once removed/hidden, so the row can show its own state. */
  isLive: boolean;
}

export async function recentActivity(days = 14, limit = 120): Promise<ActivityItem[]> {
  const rows = (await db.execute(sql`
    WITH recent AS (
      SELECT 'deal' AS kind, d.id::text AS id, d.created_at,
             concat('$', to_char(d.price_cents / 100.0, 'FM999990.00'), ' ', d.beer_name) AS title,
             nullif(concat_ws(' · ',
               nullif(d.serving_size_label, ''),
               nullif(d.description, ''),
               nullif(d.restrictions, '')), '') AS detail,
             v.slug AS venue_slug, v.name AS venue_name, NULL::text AS media_url,
             (d.status = 'active') AS is_live
      FROM deals d JOIN venues v ON v.id = d.venue_id
      WHERE d.created_at > now() - (${days} * interval '1 day') AND d.submitted_by <> 'seed'

      UNION ALL
      SELECT 'venue', v.id::text, v.created_at, v.name,
             concat_ws(', ', nullif(v.address1,''), v.city, v.state),
             v.slug, v.name, NULL::text,
             (v.status <> 'permanently_closed')
      FROM venues v
      WHERE v.created_at > now() - (${days} * interval '1 day') AND v.submitted_by <> 'seed'

      UNION ALL
      SELECT 'media', m.id::text, m.created_at,
             concat(m.kind, ' · ', replace(m.purpose::text, '_', ' ')),
             nullif(m.caption, ''), v.slug, v.name, m.public_url,
             (m.status = 'visible')
      FROM media m JOIN venues v ON v.id = m.venue_id
      WHERE m.created_at > now() - (${days} * interval '1 day') AND m.uploaded_at IS NOT NULL

      UNION ALL
      SELECT 'comment', c.id::text, c.created_at,
             coalesce(nullif(c.display_name, ''), 'Anonymous'),
             concat(
               CASE WHEN c.signal <> 'none' THEN '[' || replace(c.signal::text, '_', ' ') || '] ' ELSE '' END,
               c.body),
             v.slug, v.name, NULL::text,
             (c.status = 'visible')
      FROM comments c JOIN venues v ON v.id = c.venue_id
      WHERE c.created_at > now() - (${days} * interval '1 day')
    )
    SELECT * FROM recent ORDER BY created_at DESC LIMIT ${limit}
  `)) as unknown as {
    kind: ActivityKind;
    id: string;
    created_at: string | Date;
    title: string;
    detail: string | null;
    venue_slug: string | null;
    venue_name: string | null;
    media_url: string | null;
    is_live: boolean;
  }[];

  return rows.map((row) => ({
    kind: row.kind,
    id: row.id,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    title: row.title,
    detail: row.detail,
    venueSlug: row.venue_slug,
    venueName: row.venue_name,
    mediaUrl: row.media_url,
    isLive: row.is_live,
  }));
}

/** Counts for the "since you last looked" line. */
export async function activityCounts(days = 7): Promise<Record<ActivityKind, number>> {
  const [row] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM deals d WHERE d.created_at > now() - (${days} * interval '1 day') AND d.submitted_by <> 'seed') AS deal,
      (SELECT count(*)::int FROM venues v WHERE v.created_at > now() - (${days} * interval '1 day') AND v.submitted_by <> 'seed') AS venue,
      (SELECT count(*)::int FROM media m WHERE m.created_at > now() - (${days} * interval '1 day') AND m.uploaded_at IS NOT NULL) AS media,
      (SELECT count(*)::int FROM comments c WHERE c.created_at > now() - (${days} * interval '1 day')) AS comment
  `)) as unknown as Record<ActivityKind, number>[];

  return row ?? { deal: 0, venue: 0, media: 0, comment: 0 };
}
