"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";

interface Props {
  /** Stable identifier for the position, e.g. "list-inline". */
  slot: string;
  /** Reserved height. Always set one: an ad that pops in shifts the layout. */
  height?: number;
  className?: string;
}

const ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

/**
 * A single advertising position.
 *
 * Renders **nothing at all** unless ads are explicitly switched on and a
 * network is configured, so the default experience is unchanged and no
 * third-party script loads.
 *
 * Two rules this component enforces, deliberately:
 *
 * 1. **Space is reserved before the ad loads.** Late-arriving ads that push
 *    content down are the single most common way a site wrecks its own Core
 *    Web Vitals, and CLS is a ranking factor — an ad that costs you search
 *    traffic is not revenue.
 * 2. **Ads never sit between a price and its venue.** They go between cards,
 *    never inside one. The price is the product; anything that makes an ad
 *    look like part of a listing is both bad UX and, for an alcohol-adjacent
 *    site, a real compliance problem.
 *
 * See docs/ADS.md before enabling — there are licensing consequences.
 */
export function AdSlot({ slot, height = 250, className }: Props) {
  const ref = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!ENABLED || !CLIENT || pushed.current) return;
    pushed.current = true;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle ?? []).push({});
    } catch {
      /* blocked or not loaded; the reserved space simply stays empty */
    }
  }, []);

  if (!ENABLED || !CLIENT) return null;

  return (
    <aside
      // "Advertisement" is required by most networks' policies and by the FTC
      // for anything that could be mistaken for editorial content.
      aria-label="Advertisement"
      className={clsx("overflow-hidden rounded-[14px] border border-rule bg-paper-sunk", className)}
      style={{ minHeight: height }}
    >
      <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        Advertisement
      </p>
      <ins
        ref={ref}
        className="adsbygoogle block"
        style={{ display: "block", minHeight: height - 24 }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="fluid"
        data-full-width-responsive="true"
      />
    </aside>
  );
}

/** True when ads are on, so callers can avoid rendering wrappers for nothing. */
export function adsEnabled(): boolean {
  return ENABLED && CLIENT.length > 0;
}
