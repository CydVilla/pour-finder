import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscoveryApp } from "@/components/DiscoveryApp";
import { findCity } from "@/lib/geocode";
import { parseFilters } from "@/lib/filters";
import { searchDeals } from "@/server/deals-query";

/** /ma/boston — the same app, scoped to one city. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}): Promise<Metadata> {
  const { state, city } = await params;
  const row = await findCity(state, city);
  if (!row) return { title: "Not found" };
  return {
    title: `Cheap beer in ${row.name}, ${row.state}`,
    description: `The cheapest beer people have reported in ${row.name}, ${row.state} — with how recently each price was confirmed.`,
    alternates: { canonical: `/${state.toLowerCase()}/${city}` },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}) {
  const { state, city } = await params;
  const row = await findCity(state, city);
  if (!row) notFound();

  const filters = parseFilters(
    new URLSearchParams({
      state: row.state ?? state.toUpperCase(),
      citySlug: row.slug,
      // Seed the map on the city so it opens in the right place.
      lat: String(row.latitude),
      lng: String(row.longitude),
    }),
  );
  const initialData = await searchDeals(filters, "ssr-city");

  return (
    <main className="h-full">
      <h1 className="sr-only">
        Cheap beer in {row.name}, {row.state}
      </h1>
      <DiscoveryApp initialData={initialData} initialFilters={filters} />
    </main>
  );
}
