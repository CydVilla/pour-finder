"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { servingTypeEnum, venueTypeEnum } from "@/db/schema";
import type { GeocodeResult } from "@/lib/geocode/types";
import { SERVING_TYPE_LABEL } from "@/lib/format";
import { parseDollarsToCents } from "@/lib/money";
import type { SubmitResult, VenueSearchResult } from "@/lib/types";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  userLocation: { lat: number; lng: number } | null;
  /** Pre-selects a venue when the user taps "Add a deal here" on a card. */
  presetVenue?: { id: string; name: string } | null;
  onSubmitted: () => void;
}

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

/**
 * Community contribution has to be nearly free or it doesn't happen.
 *
 * Required: a venue and a price. Everything else is optional and folded away.
 * Serving size in particular is left blank by default - a bar advertising
 * "$1 drafts" genuinely doesn't tell you the size, and a guessed number is
 * worse than an honest unknown.
 */
export function AddDealSheet({ open, onClose, userLocation, presetVenue, onSubmitted }: Props) {
  const [venue, setVenue] = useState<{ id: string; name: string } | null>(presetVenue ?? null);
  const [creatingVenue, setCreatingVenue] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [beerName, setBeerName] = useState("");
  const [price, setPrice] = useState("");
  const [servingType, setServingType] = useState<(typeof servingTypeEnum.enumValues)[number]>("draft");
  const [sizeOz, setSizeOz] = useState("");
  const [sizeLabel, setSizeLabel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [restrictions, setRestrictions] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isHappyHour, setIsHappyHour] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [newVenue, setNewVenue] = useState({
    name: "",
    address1: "",
    city: "",
    state: "MA",
    venueType: "bar" as (typeof venueTypeEnum.enumValues)[number],
  });

  useEffect(() => {
    if (open) setVenue(presetVenue ?? null);
  }, [open, presetVenue]);

  const reset = () => {
    setVenue(null);
    setCreatingVenue(false);
    setShowDetails(false);
    setResult(null);
    setError(null);
    setBeerName("");
    setPrice("");
    setSizeOz("");
    setSizeLabel("");
    setQuantity("1");
    setRestrictions("");
    setSourceUrl("");
    setIsHappyHour(false);
    setDays([]);
    setStartTime("");
    setEndTime("");
    setNewVenue({ name: "", address1: "", city: "", state: "MA", venueType: "bar" });
  };

  const close = () => {
    onClose();
    // Let the closing animation finish before wiping the form.
    window.setTimeout(reset, 250);
  };

  const priceCents = parseDollarsToCents(price);
  const hasVenue = Boolean(venue) || (creatingVenue && newVenue.name.trim() && newVenue.city.trim());
  const canSubmit = Boolean(hasVenue && beerName.trim() && priceCents !== null && !submitting);

  const submit = async () => {
    if (priceCents === null) {
      setError("Enter a price like 3 or 3.50");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      let coords = userLocation;
      if (!venue && creatingVenue && !coords) {
        // No GPS: fall back to the city centroid from the free gazetteer and
        // mark it approximate rather than dropping a fake rooftop pin.
        coords = await geocodeCity(newVenue.city, newVenue.state);
        if (!coords) {
          setError("We couldn't place that city. Check the city and state.");
          setSubmitting(false);
          return;
        }
      }

      const schedule =
        days.length > 0 || startTime || endTime
          ? [
              {
                days: days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6],
                startTime: startTime || undefined,
                endTime: endTime || undefined,
              },
            ]
          : [];

      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_deal",
          venueId: venue?.id,
          newVenue: venue
            ? undefined
            : {
                name: newVenue.name.trim(),
                address1: newVenue.address1.trim() || undefined,
                city: newVenue.city.trim(),
                state: newVenue.state.trim().toUpperCase(),
                venueType: newVenue.venueType,
                latitude: coords!.lat,
                longitude: coords!.lng,
              },
          deal: {
            beerName: beerName.trim(),
            priceCents,
            servingType,
            servingSizeOz: sizeOz ? Number(sizeOz) : undefined,
            servingSizeLabel: sizeLabel.trim() || undefined,
            quantity: Number(quantity) || 1,
            restrictions: restrictions.trim() || undefined,
            isHappyHour,
            isConditional: false,
            schedule,
            sourceType: sourceUrl ? "venue_website" : "community_submission",
            sourceUrl: sourceUrl.trim() || undefined,
          },
        }),
      });

      const data = (await response.json()) as SubmitResult | { error: string; fieldErrors?: Record<string, string[]> };

      if (!response.ok || "error" in data) {
        const detail =
          "fieldErrors" in data && data.fieldErrors
            ? Object.values(data.fieldErrors).flat().join(" ")
            : "";
        setError([("error" in data && data.error) || "Something went wrong", detail].filter(Boolean).join(" — "));
        return;
      }

      setResult(data);
      onSubmitted();
    } catch {
      setError("Couldn't reach the server. Try again?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={result ? "Thanks!" : "Add a beer deal"}
      size="lg"
      footer={
        result ? (
          <button type="button" onClick={close} className="pf-button pf-button-primary w-full px-4 py-3">
            Done
          </button>
        ) : (
          <div className="space-y-2">
            {error && (
              <p role="alert" className="text-sm font-medium text-outdated">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="pf-button pf-button-amber w-full px-4 py-3"
            >
              {submitting ? "Sending…" : "Submit deal"}
            </button>
            <p className="text-center text-xs text-ink-faint">
              No account needed. A moderator checks new deals before they go live.
            </p>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-4 py-4 text-center">
          <div aria-hidden className="text-5xl">
            🍻
          </div>
          <p className="text-lg font-semibold">{result.message}</p>
          {result.possibleDuplicates.length > 0 && (
            <div className="pf-card mx-auto max-w-sm p-3 text-left text-sm">
              <p className="font-semibold text-ink">We might already have this:</p>
              <ul className="mt-1 space-y-1 text-ink-soft">
                {result.possibleDuplicates.map((duplicate) => (
                  <li key={duplicate.id}>· {duplicate.label}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="Where?" required>
            {venue ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border-[1.5px] border-ink bg-card px-3 py-2.5">
                <span className="truncate font-semibold">{venue.name}</span>
                <button
                  type="button"
                  onClick={() => setVenue(null)}
                  className="shrink-0 text-sm text-ink-soft underline underline-offset-2"
                >
                  Change
                </button>
              </div>
            ) : creatingVenue ? (
              <div className="space-y-2">
                <input
                  className="pf-input"
                  placeholder="Bar name"
                  aria-label="New venue name"
                  value={newVenue.name}
                  onChange={(event) => setNewVenue({ ...newVenue, name: event.target.value })}
                />
                <input
                  className="pf-input"
                  placeholder="Street address (optional)"
                  aria-label="Street address"
                  value={newVenue.address1}
                  onChange={(event) => setNewVenue({ ...newVenue, address1: event.target.value })}
                />
                <div className="flex gap-2">
                  <input
                    className="pf-input flex-[2]"
                    placeholder="City"
                    aria-label="City"
                    value={newVenue.city}
                    onChange={(event) => setNewVenue({ ...newVenue, city: event.target.value })}
                  />
                  <input
                    className="pf-input flex-1 uppercase"
                    placeholder="ST"
                    aria-label="State code"
                    maxLength={2}
                    value={newVenue.state}
                    onChange={(event) => setNewVenue({ ...newVenue, state: event.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCreatingVenue(false)}
                  className="text-sm text-ink-soft underline underline-offset-2"
                >
                  Search existing bars instead
                </button>
              </div>
            ) : (
              <VenuePicker
                userLocation={userLocation}
                onPick={setVenue}
                onCreateNew={(name) => {
                  setNewVenue((v) => ({ ...v, name }));
                  setCreatingVenue(true);
                }}
              />
            )}
          </Field>

          <Field label="What beer?" required>
            <input
              className="pf-input"
              placeholder="Bud Light, PBR, Narragansett…"
              aria-label="Beer name"
              value={beerName}
              onChange={(event) => setBeerName(event.target.value)}
            />
          </Field>

          <Field label="How much?" required>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-ink-faint">
                  $
                </span>
                <input
                  className="pf-input pl-7 text-lg font-bold tabular-nums"
                  inputMode="decimal"
                  placeholder="3.00"
                  aria-label="Price in dollars"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </div>
              <select
                className="pf-input w-auto"
                aria-label="Serving type"
                value={servingType}
                onChange={(event) =>
                  setServingType(event.target.value as (typeof servingTypeEnum.enumValues)[number])
                }
              >
                {servingTypeEnum.enumValues.map((value) => (
                  <option key={value} value={value}>
                    {SERVING_TYPE_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="pf-button pf-button-quiet w-full px-4 py-2.5 text-sm"
          >
            {showDetails ? "Hide extra details" : "Add size, hours, or a source (optional)"}
          </button>

          {showDetails && (
            <div className="space-y-5 border-t border-rule pt-5">
              <Field
                label="Serving size"
                hint="Leave blank if you don't know — an honest unknown beats a guess."
              >
                <div className="flex gap-2">
                  <input
                    className="pf-input flex-1"
                    inputMode="decimal"
                    placeholder="oz (e.g. 16)"
                    aria-label="Serving size in ounces"
                    value={sizeOz}
                    onChange={(event) => setSizeOz(event.target.value)}
                  />
                  <input
                    className="pf-input flex-1"
                    placeholder='or "large", "liter"'
                    aria-label="Serving size label"
                    value={sizeLabel}
                    onChange={(event) => setSizeLabel(event.target.value)}
                  />
                </div>
              </Field>

              {(servingType === "bucket" || servingType === "flight") && (
                <Field label="How many in the bucket?">
                  <input
                    className="pf-input"
                    inputMode="numeric"
                    aria-label="Quantity"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </Field>
              )}

              <Field label="When is it available?">
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-ink"
                    checked={isHappyHour}
                    onChange={(event) => setIsHappyHour(event.target.checked)}
                  />
                  It&apos;s a happy hour / limited-time deal
                </label>

                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days available">
                  {DAYS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={days.includes(day.value)}
                      onClick={() =>
                        setDays((current) =>
                          current.includes(day.value)
                            ? current.filter((d) => d !== day.value)
                            : [...current, day.value],
                        )
                      }
                      className="pf-chip min-h-9 w-11 justify-center px-0 py-1.5 text-xs"
                    >
                      {day.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="time"
                    className="pf-input"
                    aria-label="Start time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                  <span className="text-ink-faint">to</span>
                  <input
                    type="time"
                    className="pf-input"
                    aria-label="End time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </div>
                <p className="mt-1 text-xs text-ink-faint">Times are the bar&apos;s local time.</p>
              </Field>

              <Field label="Any conditions?" hint="With food, cash only, one per customer…">
                <input
                  className="pf-input"
                  aria-label="Restrictions"
                  value={restrictions}
                  onChange={(event) => setRestrictions(event.target.value)}
                />
              </Field>

              <Field label="Link to a menu or post" hint="Helps a lot. Not required.">
                <input
                  className="pf-input"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  aria-label="Source URL"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* -------------------------------------------------------------- pieces */

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">
        {label}
        {required && <span className="ml-1 text-amber-deep">*</span>}
      </p>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
      {children}
    </div>
  );
}

function VenuePicker({
  userLocation,
  onPick,
  onCreateNew,
}: {
  userLocation: { lat: number; lng: number } | null;
  onPick: (venue: { id: string; name: string }) => void;
  onCreateNew: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VenueSearchResult[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query });
    if (userLocation) {
      params.set("lat", String(userLocation.lat));
      params.set("lng", String(userLocation.lng));
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/venues/search?${params}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { venues: VenueSearchResult[] };
        setResults(data.venues);
      } catch {
        /* aborted */
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, userLocation]);

  return (
    <div className="space-y-2">
      <input
        className="pf-input"
        placeholder={userLocation ? "Search, or pick one nearby" : "Search for the bar"}
        aria-label="Search for a venue"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {results.length > 0 && (
        <ul className="pf-card divide-y divide-rule overflow-hidden">
          {results.slice(0, 6).map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => onPick({ id: result.id, name: result.name })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-paper-sunk"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{result.name}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {[result.address1, result.city, result.state].filter(Boolean).join(", ")}
                  </span>
                </span>
                {result.distanceMeters !== null && (
                  <span className="shrink-0 text-xs text-ink-faint tabular-nums">
                    {(result.distanceMeters / 1609.344).toFixed(1)} mi
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onCreateNew(query.trim())}
        className={clsx("text-sm underline underline-offset-2", "text-ink-soft hover:text-ink")}
      >
        Can&apos;t find it? Add a new bar
      </button>
    </div>
  );
}

async function geocodeCity(city: string, state: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(`/api/places?q=${encodeURIComponent(`${city} ${state}`)}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { places: GeocodeResult[] };
    const match = data.places[0];
    return match ? { lat: match.latitude, lng: match.longitude } : null;
  } catch {
    return null;
  }
}
