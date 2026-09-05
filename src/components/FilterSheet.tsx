"use client";

import clsx from "clsx";
import { servingTypeEnum } from "@/db/schema";
import { BEER_TAGS } from "@/lib/beer";
import {
  FRESHNESS_PRESETS_DAYS,
  RADIUS_PRESETS_MILES,
  type DealFilters,
} from "@/lib/filters";
import { SERVING_TYPE_LABEL } from "@/lib/format";
import { milesToMeters } from "@/lib/geo-math";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  filters: DealFilters;
  hasOrigin: boolean;
  activeCount: number;
  onChange: (patch: Partial<DealFilters>) => void;
  onClear: () => void;
  resultCount: number;
}

/** Everything secondary, in one sheet, grouped the way people think about it. */
export function FilterSheet({
  open,
  onClose,
  filters,
  hasOrigin,
  activeCount,
  onChange,
  onClear,
  resultCount,
}: Props) {
  const toggleServing = (value: (typeof servingTypeEnum.enumValues)[number]) => {
    const next = filters.servingTypes.includes(value)
      ? filters.servingTypes.filter((v) => v !== value)
      : [...filters.servingTypes, value];
    onChange({ servingTypes: next });
  };

  const toggleBeer = (id: string) => {
    const next = filters.beerTags.includes(id)
      ? filters.beerTags.filter((v) => v !== id)
      : [...filters.beerTags, id];
    onChange({ beerTags: next });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      size="lg"
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClear}
            disabled={activeCount === 0}
            className="pf-button pf-button-quiet flex-1 px-4 py-3"
          >
            Clear all
          </button>
          <button type="button" onClick={onClose} className="pf-button pf-button-primary flex-[2] px-4 py-3">
            Show {resultCount} {resultCount === 1 ? "place" : "places"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <Group label="When">
          <Toggle
            label="Available right now"
            hint="Uses each bar's own local time, so happy hours are correct"
            checked={Boolean(filters.availableNow)}
            onChange={(checked) => onChange({ availableNow: checked || undefined })}
          />
          <Toggle
            label="Happy hour only"
            checked={Boolean(filters.happyHourOnly)}
            onChange={(checked) =>
              onChange({ happyHourOnly: checked || undefined, allDayOnly: undefined })
            }
          />
          <Toggle
            label="All-day deals only"
            hint="No time restrictions at all"
            checked={Boolean(filters.allDayOnly)}
            onChange={(checked) =>
              onChange({ allDayOnly: checked || undefined, happyHourOnly: undefined })
            }
          />
          <div className="pt-1">
            <ChipRow
              options={[
                { id: "any", label: "Any day" },
                { id: "weekday", label: "Weekdays" },
                { id: "weekend", label: "Weekends" },
              ]}
              isActive={(id) => filters.dayPart === id}
              onToggle={(id) => onChange({ dayPart: id as DealFilters["dayPart"] })}
            />
          </div>
        </Group>

        <Group label="Distance" hint={hasOrigin ? undefined : "Share your location or search a place first"}>
          <ChipRow
            disabled={!hasOrigin}
            options={[
              { id: "any", label: "Any distance" },
              ...RADIUS_PRESETS_MILES.map((miles) => ({
                id: String(miles),
                label: `${miles} mi`,
              })),
            ]}
            isActive={(id) =>
              id === "any"
                ? filters.radiusMeters === undefined
                : Math.round(milesToMeters(Number(id))) === filters.radiusMeters
            }
            onToggle={(id) =>
              onChange({
                radiusMeters: id === "any" ? undefined : Math.round(milesToMeters(Number(id))),
              })
            }
          />
        </Group>

        <Group label="Serving">
          <ChipRow
            options={servingTypeEnum.enumValues
              .filter((value) => value !== "other")
              .map((value) => ({ id: value, label: SERVING_TYPE_LABEL[value] }))}
            isActive={(id) => filters.servingTypes.includes(id as never)}
            onToggle={(id) => toggleServing(id as never)}
            multi
          />
        </Group>

        <Group label="Beer">
          <ChipRow
            options={BEER_TAGS.filter((t) => t.group === "style").map((t) => ({
              id: t.id,
              label: t.label,
            }))}
            isActive={(id) => filters.beerTags.includes(id)}
            onToggle={toggleBeer}
            multi
          />
          <p className="pt-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Brands</p>
          <ChipRow
            options={BEER_TAGS.filter((t) => t.group === "brand").map((t) => ({
              id: t.id,
              label: t.label,
            }))}
            isActive={(id) => filters.beerTags.includes(id)}
            onToggle={toggleBeer}
            multi
          />
        </Group>

        <Group
          label="Freshness"
          hint="Beer prices change. This hides anything nobody has confirmed recently."
        >
          <ChipRow
            options={[
              { id: "any", label: "Any" },
              ...FRESHNESS_PRESETS_DAYS.map((days) => ({
                id: String(days),
                label: `Verified in ${days} days`,
              })),
            ]}
            isActive={(id) =>
              id === "any"
                ? filters.verifiedWithinDays === undefined
                : filters.verifiedWithinDays === Number(id)
            }
            onToggle={(id) =>
              onChange({ verifiedWithinDays: id === "any" ? undefined : Number(id) })
            }
          />
        </Group>
      </div>
    </Sheet>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</h3>
      {hint && <p className="-mt-1 text-xs text-ink-soft">{hint}</p>}
      {children}
    </section>
  );
}

function ChipRow({
  options,
  isActive,
  onToggle,
  multi = false,
  disabled = false,
}: {
  options: { id: string; label: string }[];
  isActive: (id: string) => boolean;
  onToggle: (id: string) => void;
  multi?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role={multi ? "group" : "radiogroup"}>
      {options.map((option) => {
        const active = isActive(option.id);
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-pressed={multi ? active : undefined}
            role={multi ? undefined : "radio"}
            aria-checked={multi ? undefined : active}
            data-active={!multi && active ? "true" : undefined}
            onClick={() => onToggle(option.id)}
            className={clsx("pf-chip min-h-9 px-3 py-1.5 text-sm", disabled && "opacity-50")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-ink"
      />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
    </label>
  );
}
