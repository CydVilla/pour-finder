"use client";

import { useCallback, useState } from "react";

export interface Position {
  lat: number;
  lng: number;
}

export type GeoState = "idle" | "locating" | "granted" | "denied" | "unavailable";

/**
 * User position, requested only on an explicit tap.
 *
 * We never poll, never watch, and never persist coordinates - the position
 * lives in memory for the length of the session and is used solely to compute
 * distances. Nothing about the user's location is stored server-side.
 */
export function useGeolocation() {
  const [position, setPosition] = useState<Position | null>(null);
  const [state, setState] = useState<GeoState>("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      return;
    }

    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({
          // ~11m precision is plenty for "how far is that bar" and avoids
          // carrying a more precise coordinate than the feature needs.
          lat: round(result.coords.latitude),
          lng: round(result.coords.longitude),
        });
        setState("granted");
      },
      (error) => {
        setState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  const clear = useCallback(() => {
    setPosition(null);
    setState("idle");
  }, []);

  return { position, state, request, clear };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
