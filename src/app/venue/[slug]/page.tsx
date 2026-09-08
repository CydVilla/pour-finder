import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VenueDetail } from "@/components/VenueDetail";
import { siteUrl } from "@/lib/env";
import { parseFilters } from "@/lib/filters";
import { breadcrumbSchema, jsonLdGraph, venueDescription, venueSchema } from "@/lib/seo";
import { searchDeals } from "@/server/deals-query";
import { getVenueBySlug, listIndexableVenueSlugs } from "@/server/venues";
import { formatCents } from "@/lib/money";

/**
 * Per-venue page — the deepest and most specific page type, and the one most
 * likely to rank for "cheap beer at <bar name>". It carries the full
 * BarOrPub + Offer structured data; everything it asserts is also rendered as
 * visible text by VenueDetail.
 */
export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const slugs = await listIndexableVenueSlugs();
    return slugs.slice(0, 1000).map((v) => ({ slug: v.slug }));
  } catch {
    return [];
  }
}

async function load(slug: string) {
  const venue = await getVenueBySlug(slug);
  if (!venue) return null;

  const filters = parseFilters(
    new URLSearchParams({
      citySlug: venue.citySlug,
      state: venue.state,
      includeInactive: "1",
      limit: "100",
    }),
  );
  const result = await searchDeals(filters, "venue-page");
  return { venue, dto: result.venues.find((v) => v.id === venue.id) ?? null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await load(slug);
  if (!loaded) return { title: "Venue not found" };

  const { venue, dto } = loaded;
  const active = dto?.deals.filter((d) => d.status === "active") ?? [];
  const cheapest = active.length ? Math.min(...active.map((d) => d.priceCents)) : null;

  const title = cheapest
    ? `${venue.name} — beer from ${formatCents(cheapest)} (${venue.city}, ${venue.state})`
    : `Beer prices at ${venue.name} — ${venue.city}, ${venue.state}`;

  return {
    title,
    description: dto
      ? venueDescription(dto)
      : `Beer prices at ${venue.name} in ${venue.city}, ${venue.state}.`,
    alternates: { canonical: `/venue/${venue.slug}` },
    openGraph: { title, url: `${siteUrl()}/venue/${venue.slug}`, type: "website" },
    // A closed venue's page stays reachable for history, but shouldn't compete
    // in search for a bar that no longer exists.
    robots:
      venue.status === "permanently_closed" ? { index: false, follow: true } : undefined,
  };
}

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = await load(slug);
  if (!loaded) notFound();

  const { venue, dto } = loaded;
  const base = siteUrl();
  const stateSlug = venue.state.toLowerCase();
  const url = `${base}/venue/${venue.slug}`;

  return (
    <>
      <main className="mx-auto min-h-full max-w-3xl px-4 py-6">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-ink hover:underline">
                Cheap beer
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li>
              <Link href={`/${stateSlug}`} className="hover:text-ink hover:underline">
                {venue.state}
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li>
              <Link
                href={`/${stateSlug}/${venue.citySlug}`}
                className="hover:text-ink hover:underline"
              >
                {venue.city}
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li aria-current="page" className="font-semibold text-ink">
              {venue.name}
            </li>
          </ol>
        </nav>

        {dto ? (
          <VenueDetail venue={dto} />
        ) : (
          <div className="pf-card mt-4 p-5">
            <h1 className="wordmark text-2xl">{venue.name}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {[venue.address1, venue.city, venue.state].filter(Boolean).join(", ")}
            </p>
            <p className="mt-4 text-sm text-ink-soft">
              We don&apos;t have any current beer deals listed here.{" "}
              <Link href="/" className="underline underline-offset-2">
                Add one
              </Link>{" "}
              if you know a price.
            </p>
          </div>
        )}

        <p className="mt-6 text-sm text-ink-soft">
          More{" "}
          <Link href={`/${stateSlug}/${venue.citySlug}`} className="underline underline-offset-2">
            cheap beer in {venue.city}
          </Link>
          .
        </p>
      </main>

      {dto && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdGraph([
              venueSchema(dto, url),
              breadcrumbSchema([
                { name: "Pour Finder", url: base },
                { name: venue.state, url: `${base}/${stateSlug}` },
                { name: venue.city, url: `${base}/${stateSlug}/${venue.citySlug}` },
                { name: venue.name, url },
              ]),
            ]),
          }}
        />
      )}
    </>
  );
}
