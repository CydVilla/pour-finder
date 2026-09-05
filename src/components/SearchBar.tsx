"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import type { GeocodeResult } from "@/lib/geocode/types";

export interface PlacePick {
  label: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Fires on submit / debounce; drives the text filter. */
  onSearch: (value: string) => void;
  onPickPlace: (place: PlacePick) => void;
  onUseMyLocation: () => void;
  locationLabel: string | null;
  isLocating: boolean;
}

/**
 * One input for both jobs: filter the results by text, or jump the map to a
 * place. Place suggestions come from the offline gazetteer, so typing a ZIP
 * works even with GPS denied - which is the whole point of having it.
 */
export function SearchBar({
  value,
  onChange,
  onSearch,
  onPickPlace,
  onUseMyLocation,
  locationLabel,
  isLocating,
}: Props) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Only ask for place suggestions when the text plausibly names a place.
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { places: GeocodeResult[] };
        setSuggestions(data.places.slice(0, 5));
      } catch {
        /* aborted or offline; the text filter still works */
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const choose = (place: GeocodeResult) => {
    onPickPlace({
      label: place.label,
      lat: place.latitude,
      lng: place.longitude,
      radiusMeters: place.defaultRadiusMeters,
    });
    onChange("");
    onSearch("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (event.key === "Enter") onSearch(value);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = suggestions[activeIndex];
      if (picked) choose(picked);
      else onSearch(value);
      setOpen(false);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={wrapRef} className="relative flex-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            ⌕
          </span>
          <input
            type="search"
            className="pf-input pl-8"
            placeholder="Bar, beer, city or ZIP"
            aria-label="Search for a bar, a beer, or a place"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            role="combobox"
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            enterKeyHint="search"
          />
        </div>

        <button
          type="button"
          onClick={onUseMyLocation}
          disabled={isLocating}
          className="pf-button pf-button-quiet shrink-0 px-3 py-2.5 text-sm"
          aria-label={locationLabel ? `Using ${locationLabel}. Update location` : "Use my current location"}
          title="Use my current location"
        >
          <span aria-hidden>{isLocating ? "…" : "◎"}</span>
          <span className="hidden sm:inline">{isLocating ? "Locating" : "Near me"}</span>
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Places"
          className="pf-card absolute z-30 mt-1.5 w-full overflow-hidden py-1"
        >
          {suggestions.map((place, index) => (
            <li key={`${place.label}-${index}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => choose(place)}
                onMouseEnter={() => setActiveIndex(index)}
                className={clsx(
                  "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm",
                  index === activeIndex ? "bg-paper-sunk" : "bg-transparent",
                )}
              >
                <span aria-hidden className="text-ink-faint">
                  ⌖
                </span>
                <span className="truncate">{place.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {locationLabel && (
        <p className="mt-1 truncate text-xs text-ink-faint">
          Showing near <span className="font-semibold text-ink-soft">{locationLabel}</span>
        </p>
      )}
    </div>
  );
}
