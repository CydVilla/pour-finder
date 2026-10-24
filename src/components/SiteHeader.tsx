import Link from "next/link";
import { LogoMark } from "./LogoMark";

/**
 * The header for content pages (venue, not-found). The discovery pages have
 * their own, with search built in; these used to have none, so the only way
 * home from a venue page was a breadcrumb reading "Cheap beer".
 */
export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-3xl items-center px-4">
        <Link
          href="/"
          className="flex min-h-touch items-center gap-2 py-1.5"
          aria-label="Pour Finder home"
        >
          <LogoMark className="size-7" />
          <span className="wordmark text-lg leading-none">
            Pour<span className="text-amber-deep">Finder</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
