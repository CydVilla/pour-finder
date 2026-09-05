/**
 * Beer filter taxonomy.
 *
 * The user-facing filter deliberately mixes styles ("IPA") and brands ("PBR")
 * because that is how people actually search for cheap beer. Each tag carries
 * the substrings matched against beerName / brand / beerStyle, so the filter
 * works even on messy community data where "beerStyle" was left blank.
 */
export interface BeerTag {
  id: string;
  label: string;
  /** Case-insensitive substrings, OR'd together. */
  match: string[];
  group: "style" | "brand";
}

export const BEER_TAGS: readonly BeerTag[] = [
  { id: "lager", label: "Lager", group: "style", match: ["lager", "pilsner", "helles"] },
  { id: "light", label: "Light beer", group: "style", match: ["light", "lite", "ultra"] },
  { id: "ipa", label: "IPA", group: "style", match: ["ipa", "india pale"] },
  { id: "pale-ale", label: "Pale ale", group: "style", match: ["pale ale"] },
  { id: "stout", label: "Stout / porter", group: "style", match: ["stout", "porter", "guinness"] },
  { id: "wheat", label: "Wheat / hefe", group: "style", match: ["wheat", "hefe", "witbier", "white", "blue moon", "allagash"] },
  { id: "sour", label: "Sour", group: "style", match: ["sour", "gose", "berliner"] },
  { id: "cider-seltzer", label: "Cider / seltzer", group: "style", match: ["cider", "seltzer", "downeast"] },
  { id: "import", label: "Import", group: "style", match: ["corona", "modelo", "stella", "heineken", "guinness", "pacifico", "dos equis"] },

  { id: "pbr", label: "PBR", group: "brand", match: ["pbr", "pabst"] },
  { id: "narragansett", label: "Narragansett", group: "brand", match: ["narragansett", "gansett"] },
  { id: "budweiser", label: "Budweiser", group: "brand", match: ["bud"] },
  { id: "miller", label: "Miller", group: "brand", match: ["miller", "high life"] },
  { id: "coors", label: "Coors", group: "brand", match: ["coors"] },
  { id: "genesee", label: "Genesee", group: "brand", match: ["genesee", "genny"] },
  { id: "sam-adams", label: "Sam Adams", group: "brand", match: ["sam adams", "samuel adams", "sam "] },
] as const;

const TAG_BY_ID = new Map(BEER_TAGS.map((t) => [t.id, t]));

export function beerTagById(id: string): BeerTag | undefined {
  return TAG_BY_ID.get(id);
}

export function isBeerTagId(id: string): boolean {
  return TAG_BY_ID.has(id);
}
