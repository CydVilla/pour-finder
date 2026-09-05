import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { places } from "@/db/schema";
import { DiscoveryApp } from "@/components/DiscoveryApp";
import { parseFilters } from "@/lib/filters";
import { searchDeals } from "@/server/deals-query";

/**
 * /ma — a state landing page.
 *
 * Same application, pre-filtered. This is why `state` is a filter dimension
 * rather than a partition: adding all 50 states needs no new code, and the
 * moment a visitor shares their location the state filter is dropped so
 * results cross the border.
 */
export const dynamic = "force-dynamic";

async function loadState(code: string) {
  if (!/^[a-z]{2}$/i.test(code)) return null;
  const [row] = await db
    .select()
    .from(places)
    .where(and(eq(places.kind, "state"), eq(places.slug, code.toLowerCase())))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const row = await loadState(state);
  if (!row) return { title: "Not found" };
  return {
    title: `Cheap beer in ${row.name}`,
    description: `Community-reported cheap beer deals across ${row.name}, with the date each price was last confirmed.`,
    alternates: { canonical: `/${row.slug}` },
  };
}

export default async function StatePage({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const row = await loadState(state);
  if (!row) notFound();

  const filters = parseFilters(new URLSearchParams({ state: row.state ?? state.toUpperCase() }));
  const initialData = await searchDeals(filters, "ssr-state");

  return (
    <main className="h-full">
      <h1 className="sr-only">Cheap beer in {row.name}</h1>
      <DiscoveryApp initialData={initialData} initialFilters={filters} />
    </main>
  );
}
