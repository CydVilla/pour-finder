/**
 * Slug + normalization helpers. Used for URLs, duplicate detection and
 * deal dedupe keys. Deterministic and dependency-free so the seed script,
 * the API and the client all produce identical output.
 */

/** "Coogan's Bar & Grill" -> "coogans-bar-grill" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const LEADING_ARTICLES = /^(the|a|an)\s+/i;
const VENUE_NOISE =
  /\b(bar|grill|grille|tavern|pub|restaurant|saloon|lounge|kitchen|cafe|brewery|brewing|taproom|company|co|inc|llc|and|the)\b/g;

/**
 * Aggressive normalization for duplicate detection only. NOT for display and
 * NOT for URLs: "Coogans", "Coogan's" and "COOGAN'S BAR & GRILL" all collapse
 * to the same string so we can catch a resubmission of an existing venue.
 */
export function normalizeVenueName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(LEADING_ARTICLES, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(VENUE_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Looser normalization for beer names: keeps brand words, drops packaging. */
export function normalizeBeerName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\b(draft|draught|bottle|can|tallboy|pitcher|bucket|pint|oz|ounce)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Signature used to flag likely-duplicate deals at the same venue. Includes
 * happy-hour status and size so a legitimate "$3 happy hour / $5 all day" pair
 * on the same beer does NOT collide.
 */
export function buildDealDedupeKey(input: {
  beerName: string;
  servingType: string;
  servingSizeOz: number | null;
  servingSizeLabel: string | null;
  isHappyHour: boolean;
}): string {
  const size =
    input.servingSizeOz !== null
      ? `oz${input.servingSizeOz}`
      : input.servingSizeLabel
        ? `lbl${slugify(input.servingSizeLabel)}`
        : "unknown";
  return [
    normalizeBeerName(input.beerName) || "unnamed",
    input.servingType,
    size,
    input.isHappyHour ? "hh" : "all",
  ].join("|");
}

/** Appends `-2`, `-3`, ... until the slug is free. */
export function disambiguateSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Unable to disambiguate slug "${base}"`);
}

/** Venue slugs carry the city so chains stay distinguishable in URLs. */
export function buildVenueSlug(name: string, city: string): string {
  const namePart = slugify(name);
  const cityPart = slugify(city);
  if (!cityPart || namePart.endsWith(`-${cityPart}`)) return namePart;
  return `${namePart}-${cityPart}`;
}
