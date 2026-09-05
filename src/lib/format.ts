import { metersToMiles } from "@/lib/geo-math";
import type { ServingType } from "@/db/schema";

/** "0.4 mi", "1.2 mi", "12 mi". Null distance renders as null, never "0 mi". */
export function formatDistance(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters)) return null;
  const miles = metersToMiles(meters);
  if (miles < 0.1) return "< 0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export const SERVING_TYPE_LABEL: Record<ServingType, string> = {
  draft: "Draft",
  bottle: "Bottle",
  can: "Can",
  tallboy: "Tallboy",
  pitcher: "Pitcher",
  bucket: "Bucket",
  flight: "Flight",
  stein: "Stein",
  crowler: "Crowler",
  growler: "Growler",
  other: "Other",
};

/**
 * Human size string. Returns null when the size is unknown so callers can
 * render "size unknown" explicitly rather than an empty gap.
 */
export function formatServingSize(deal: {
  servingSizeOz: number | null;
  servingSizeLabel: string | null;
  quantity: number;
  individualServingSizeOz: number | null;
}): string | null {
  const { servingSizeOz, servingSizeLabel, quantity, individualServingSizeOz } = deal;

  if (quantity > 1) {
    const each = individualServingSizeOz !== null ? ` × ${trimNum(individualServingSizeOz)} oz` : "";
    return `${quantity}${each}`;
  }
  if (servingSizeOz !== null) return `${trimNum(servingSizeOz)} oz`;
  if (servingSizeLabel) return servingSizeLabel;
  return null;
}

/** The line under the price: "16 oz draft", "Draft · size unknown". */
export function formatServingDescription(deal: {
  servingType: ServingType;
  servingSizeOz: number | null;
  servingSizeLabel: string | null;
  quantity: number;
  individualServingSizeOz: number | null;
}): string {
  const size = formatServingSize(deal);
  const type = SERVING_TYPE_LABEL[deal.servingType];
  if (!size) return deal.servingType === "other" ? "Size unknown" : `${type} · size unknown`;
  if (deal.servingType === "other") return size;
  return `${size} ${type.toLowerCase()}`;
}

function trimNum(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ScheduleWindow {
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
}

/**
 * "Mon–Fri 4–6pm", "Tue all day", "Daily 4–6pm".
 * Collapses consecutive days that share a time window.
 */
export function formatSchedule(windows: readonly ScheduleWindow[]): string | null {
  if (windows.length === 0) return null;

  const byTime = new Map<string, number[]>();
  for (const w of windows) {
    const key = `${w.startTime ?? ""}|${w.endTime ?? ""}`;
    const list = byTime.get(key) ?? [];
    list.push(w.dayOfWeek);
    byTime.set(key, list);
  }

  const parts: string[] = [];
  for (const [key, daysRaw] of byTime) {
    const days = [...new Set(daysRaw)].sort((a, b) => a - b);
    const [start, end] = key.split("|");
    const timePart = start && end ? ` ${formatTimeRange(start, end)}` : " all day";
    parts.push(`${formatDayList(days)}${timePart}`);
  }
  return parts.join(" · ");
}

function formatDayList(days: number[]): string {
  if (days.length === 7) return "Daily";
  if (days.length === 5 && days.join() === "1,2,3,4,5") return "Mon–Fri";
  if (days.length === 2 && days.join() === "0,6") return "Sat–Sun";

  // Collapse runs of consecutive days.
  const runs: string[] = [];
  let runStart = 0;
  for (let i = 0; i < days.length; i += 1) {
    const isLast = i === days.length - 1;
    const breaks = isLast || days[i + 1]! !== days[i]! + 1;
    if (breaks) {
      const from = days[runStart]!;
      const to = days[i]!;
      runs.push(from === to ? DAY_NAMES[from]! : `${DAY_NAMES[from]}–${DAY_NAMES[to]}`);
      runStart = i + 1;
    }
  }
  return runs.join(", ");
}

/** "16:00"/"18:00" -> "4–6pm"; drops the redundant meridiem when they match. */
export function formatTimeRange(start: string, end: string): string {
  const a = formatTime(start);
  const b = formatTime(end);
  const aMeridiem = a.slice(-2);
  const bMeridiem = b.slice(-2);
  if (aMeridiem === bMeridiem) return `${a.slice(0, -2)}–${b}`;
  return `${a}–${b}`;
}

export function formatTime(value: string): string {
  const [hRaw, mRaw] = value.split(":");
  const hour = Number(hRaw ?? 0);
  const minute = Number(mRaw ?? 0);
  const meridiem = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${displayHour}${meridiem}` : `${displayHour}:${String(minute).padStart(2, "0")}${meridiem}`;
}

/** "3 deals from $1" summary line. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
