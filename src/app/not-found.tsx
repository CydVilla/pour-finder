import Link from "next/link";
import { SearchX } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * Replaces Next's stock "404 | This page could not be found", which dropped
 * the reader onto an unstyled page with no way back. A dead venue link is the
 * usual way here, so the way out is the search.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <SearchX aria-hidden className="mx-auto size-12 text-ink-faint" strokeWidth={1.75} />
        <h1 className="wordmark mt-4 text-2xl">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The bar may have closed, or the link may be out of date.
        </p>
        <Link href="/" className="pf-button pf-button-primary mt-6 px-5 py-2.5 text-sm">
          Find cheap beer nearby
        </Link>
      </main>
    </>
  );
}
