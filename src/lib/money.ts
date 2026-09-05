/**
 * All money is integer cents. Never floats, never `number` dollars in storage.
 */

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Compact hero price: "$1", "$5.95", "Free". */
export function formatHeroPrice(cents: number, currency = "USD"): string {
  if (cents === 0) return "Free";
  return formatCents(cents, currency);
}

/** "$0.25/oz". Returns null when the size is unknown - we never guess. */
export function formatPricePerOunce(pricePerOunceCents: number | null): string | null {
  if (pricePerOunceCents === null || !Number.isFinite(pricePerOunceCents)) return null;
  const dollars = pricePerOunceCents / 100;
  return `$${dollars.toFixed(dollars < 1 ? 2 : 2)}/oz`;
}

/** Parses "5", "$5", "5.50", "$5.50" -> 550. Returns null on garbage. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d{0,7}(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Total fluid ounces, or null when genuinely unknown. */
export function totalOunces(deal: {
  servingSizeOz: number | null;
  individualServingSizeOz: number | null;
  quantity: number;
}): number | null {
  if (deal.individualServingSizeOz !== null && deal.individualServingSizeOz > 0) {
    return deal.individualServingSizeOz * deal.quantity;
  }
  if (deal.servingSizeOz !== null && deal.servingSizeOz > 0) return deal.servingSizeOz;
  return null;
}
