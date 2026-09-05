import clsx from "clsx";
import { freshnessLabel, type Freshness } from "@/lib/freshness";

const STYLES: Record<Freshness, { dot: string; text: string; wash: string; short: string }> = {
  fresh: { dot: "bg-fresh", text: "text-fresh", wash: "bg-fresh-wash", short: "Fresh" },
  aging: { dot: "bg-aging", text: "text-aging", wash: "bg-aging-wash", short: "Aging" },
  stale: { dot: "bg-stale", text: "text-stale", wash: "bg-stale-wash", short: "Getting old" },
  likely_outdated: {
    dot: "bg-outdated",
    text: "text-outdated",
    wash: "bg-outdated-wash",
    short: "Likely outdated",
  },
  unverified: { dot: "bg-unknown", text: "text-unknown", wash: "bg-unknown-wash", short: "Unverified" },
};

interface Props {
  freshness: Freshness;
  daysSinceVerified: number | null;
  /** "dot" for the dense card meta row, "pill" for detail views. */
  variant?: "dot" | "pill";
  className?: string;
}

/**
 * Freshness is the single most important signal on this site - beer prices
 * change and stale data is worse than no data - so it gets a colour, a shape
 * and a full sentence, never colour alone.
 */
export function FreshnessBadge({
  freshness,
  daysSinceVerified,
  variant = "dot",
  className,
}: Props) {
  const style = STYLES[freshness];
  const label = freshnessLabel(daysSinceVerified);

  if (variant === "pill") {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          style.wash,
          style.text,
          className,
        )}
      >
        <span aria-hidden className={clsx("size-2 rounded-full", style.dot)} />
        {label}
      </span>
    );
  }

  return (
    <span className={clsx("inline-flex items-center gap-1.5", style.text, className)}>
      <span aria-hidden className={clsx("size-2 shrink-0 rounded-full", style.dot)} />
      <span className="font-medium">{label}</span>
    </span>
  );
}

export function freshnessShortLabel(freshness: Freshness): string {
  return STYLES[freshness].short;
}
