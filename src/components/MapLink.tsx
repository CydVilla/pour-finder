"use client";

import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";

interface Props {
  name: string;
  address1?: string | null;
  city: string;
  state: string;
  postalCode?: string | null;
  latitude: number;
  longitude: number;
  className?: string;
  children?: ReactNode;
}

/**
 * Opens the address in whatever map app the device actually uses.
 *
 * Rendered server-side with the universal Google Maps web URL, then upgraded
 * on mount to a platform scheme. That order matters: the https URL is
 * crawlable, works with JavaScript disabled, and is a correct fallback, so the
 * upgrade is pure enhancement rather than a requirement.
 *
 *   iOS      maps://       → Apple Maps, the platform default
 *   Android  geo:          → the system chooser (Google Maps, Waze, OsmAnd…)
 *   else     https://…     → Google Maps in a new tab
 *
 * Coordinates are included alongside the query so a venue whose street address
 * we could not confirm (geoPrecision "approximate") still lands in the right
 * place rather than failing to geocode.
 */
export function MapLink({
  name,
  address1,
  city,
  state,
  postalCode,
  latitude,
  longitude,
  className,
  children,
}: Props) {
  const label = [name, address1, city, state, postalCode].filter(Boolean).join(", ");
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    label,
  )}&query_place_id=`;

  const [href, setHref] = useState(webUrl);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const coords = `${latitude},${longitude}`;

    // iPadOS reports as Macintosh, so also check for touch support.
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);

    if (isIOS) {
      setHref(`maps://?q=${encodeURIComponent(label)}&ll=${coords}`);
      setIsNative(true);
      return;
    }
    if (/Android/.test(ua)) {
      // geo: with a q label lets the OS offer every installed map app.
      setHref(`geo:${coords}?q=${coords}(${encodeURIComponent(name)})`);
      setIsNative(true);
    }
  }, [label, name, latitude, longitude]);

  return (
    <a
      href={href}
      // Native schemes must not open a new tab; the web fallback should.
      {...(isNative ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      className={clsx(
        "underline decoration-rule-strong underline-offset-2 hover:decoration-ink",
        className,
      )}
    >
      {children ?? [address1, city, state].filter(Boolean).join(", ")}
    </a>
  );
}
