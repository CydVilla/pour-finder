import type { GeoPrecision, ServingType, SourceType, VenueStatus, VenueType } from "./schema";

/**
 * Massachusetts launch data.
 *
 * Every row records what we actually know and nothing more:
 *
 *  - `servingSizeOz` is null wherever the source didn't state a size. A bar
 *    advertising "$1 drafts" genuinely does not tell you whether that's 7 or
 *    16 ounces, and a guessed number would silently corrupt the value sort.
 *  - `geoPrecision` is "approximate" wherever the street address could not be
 *    confirmed, and `notes` says so.
 *  - `verifiedDaysAgo` reflects how recent the underlying evidence is, so the
 *    freshness badges are honest on the very first page load. The Redbones
 *    rows are deliberately old because the venue changed ownership.
 */

export interface SeedDeal {
  beerName: string;
  brand?: string;
  beerStyle?: string;
  priceCents: number;
  servingType: ServingType;
  /** Only ever set when the source states a size or it is definitional. */
  servingSizeOz?: number;
  servingSizeLabel?: string;
  quantity?: number;
  individualServingSizeOz?: number;
  description?: string;
  restrictions?: string;
  ruleDescription?: string;
  isHappyHour?: boolean;
  isConditional?: boolean;
  schedule?: { days: number[]; startTime?: string; endTime?: string }[];
  sourceType: SourceType;
  sourceUrl?: string;
  sourceSnapshot?: string;
  verifiedDaysAgo: number | null;
  verificationCount?: number;
  status?: "active" | "expired";
  endedAt?: string;
  endedReason?: string;
  /** Backdated price timeline, oldest first. Demonstrates revision history. */
  priceHistory?: { priceCents: number; daysAgo: number; note?: string }[];
}

export interface SeedVenue {
  name: string;
  address1?: string;
  city: string;
  neighborhood?: string;
  state: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  geoPrecision: GeoPrecision;
  venueType?: VenueType;
  status?: VenueStatus;
  website?: string;
  notes?: string;
  deals: SeedDeal[];
}

export const SEED_VENUES: SeedVenue[] = [
  {
    name: "Coogan's",
    address1: "171 Milk St",
    city: "Boston",
    neighborhood: "Financial District",
    state: "MA",
    postalCode: "02109",
    latitude: 42.3573,
    longitude: -71.0545,
    geoPrecision: "rooftop",
    venueType: "dive_bar",
    deals: [
      {
        beerName: "Budweiser",
        brand: "Budweiser",
        beerStyle: "American lager",
        priceCents: 100,
        servingType: "draft",
        description: "Advertised as a $1 draft. Pour size is not stated on the menu.",
        sourceType: "official_menu",
        sourceSnapshot: "Menu lists Bud draft at $1.",
        verifiedDaysAgo: 5,
        verificationCount: 4,
        // The example from the brief: $1 -> $2 -> back to $1, never lost.
        priceHistory: [
          { priceCents: 100, daysAgo: 400, note: "First recorded" },
          { priceCents: 200, daysAgo: 210, note: "Reported increase" },
          { priceCents: 100, daysAgo: 32, note: "Back to $1 per menu" },
        ],
      },
      {
        beerName: "Bud Light",
        brand: "Budweiser",
        beerStyle: "Light lager",
        priceCents: 100,
        servingType: "draft",
        description: "Advertised as a $1 draft. Pour size is not stated on the menu.",
        sourceType: "official_menu",
        verifiedDaysAgo: 5,
        verificationCount: 3,
      },
    ],
  },

  {
    name: "Sissy K's",
    address1: "6 Commercial St",
    city: "Boston",
    neighborhood: "Waterfront",
    state: "MA",
    postalCode: "02109",
    latitude: 42.3617,
    longitude: -71.0533,
    geoPrecision: "rooftop",
    venueType: "bar",
    deals: [
      {
        beerName: "Beer",
        priceCents: 200,
        servingType: "other",
        description:
          "The venue advertises \"$2 Beer all day everyday\" without naming a specific beer or size.",
        sourceType: "venue_website",
        sourceSnapshot: "$2 Beer all day everyday",
        verifiedDaysAgo: 12,
        verificationCount: 2,
      },
    ],
  },

  {
    name: "Biddy Early's",
    address1: "141 Pearl St",
    city: "Boston",
    neighborhood: "Financial District",
    state: "MA",
    postalCode: "02110",
    latitude: 42.3556,
    longitude: -71.0553,
    geoPrecision: "rooftop",
    venueType: "dive_bar",
    deals: [
      {
        beerName: "Pabst Blue Ribbon",
        brand: "Pabst",
        beerStyle: "American lager",
        priceCents: 300,
        servingType: "other",
        description: "Community report; the size was not stated.",
        sourceType: "reddit",
        verifiedDaysAgo: 46,
        verificationCount: 1,
      },
    ],
  },

  {
    name: "SideBar",
    address1: "14 Bromfield St",
    city: "Boston",
    neighborhood: "Downtown",
    state: "MA",
    postalCode: "02108",
    latitude: 42.3572,
    longitude: -71.0605,
    geoPrecision: "rooftop",
    venueType: "bar",
    notes: "Exact current product and size are uncertain; needs confirmation.",
    deals: [
      {
        beerName: "Beer",
        priceCents: 200,
        servingType: "other",
        description:
          "A $2 beer was reported here. The specific beer and the size are both unconfirmed.",
        sourceType: "reddit",
        verifiedDaysAgo: 41,
      },
    ],
  },

  {
    name: "Boston Burger Company",
    address1: "1100 Boylston St",
    city: "Boston",
    neighborhood: "Fenway",
    state: "MA",
    postalCode: "02215",
    latitude: 42.3477,
    longitude: -71.0879,
    geoPrecision: "rooftop",
    venueType: "restaurant",
    deals: [
      {
        beerName: "Pabst Blue Ribbon pitcher",
        brand: "Pabst",
        beerStyle: "American lager",
        priceCents: 1000,
        servingType: "pitcher",
        servingSizeLabel: "described as very large",
        description: "Reported as a very large pitcher; exact volume unconfirmed.",
        sourceType: "reddit",
        verifiedDaysAgo: 35,
        verificationCount: 1,
      },
    ],
  },

  {
    name: "J.J. Donovan's Tavern",
    city: "Boston",
    neighborhood: "Financial District",
    state: "MA",
    latitude: 42.3562,
    longitude: -71.0561,
    geoPrecision: "approximate",
    venueType: "pub",
    notes: "Street address unconfirmed — pin is approximate to the Financial District.",
    deals: [
      {
        beerName: "Miller",
        brand: "Miller",
        priceCents: 400,
        servingType: "other",
        description: "Reported as a promotional price. Size not stated.",
        isConditional: true,
        ruleDescription: "Reported as a promotional price rather than the everyday one.",
        sourceType: "community_submission",
        verifiedDaysAgo: 30,
      },
      {
        beerName: "Miller",
        brand: "Miller",
        priceCents: 500,
        servingType: "other",
        description: "Reported as the regular price. Size not stated.",
        sourceType: "community_submission",
        verifiedDaysAgo: 30,
      },
    ],
  },

  {
    name: "Olde Magoun's Saloon",
    address1: "518 Medford St",
    city: "Somerville",
    neighborhood: "Magoun Square",
    state: "MA",
    postalCode: "02145",
    latitude: 42.3930,
    longitude: -71.0930,
    geoPrecision: "rooftop",
    venueType: "bar",
    deals: [
      {
        beerName: "Narragansett tallboy",
        brand: "Narragansett",
        beerStyle: "American lager",
        priceCents: 400,
        servingType: "tallboy",
        description: "Listed on the menu as a tallboy; the menu does not print the ounces.",
        sourceType: "official_menu",
        verifiedDaysAgo: 8,
        verificationCount: 3,
      },
    ],
  },

  {
    name: "State Park",
    address1: "1 Kendall Sq",
    city: "Cambridge",
    neighborhood: "Kendall Square",
    state: "MA",
    postalCode: "02139",
    latitude: 42.3663,
    longitude: -71.0900,
    geoPrecision: "rooftop",
    venueType: "bar",
    deals: [
      {
        beerName: "Genesee",
        brand: "Genesee",
        beerStyle: "American lager",
        priceCents: 300,
        servingType: "other",
        description: "Menu evidence indicates approximately $3. Size not stated.",
        sourceType: "official_menu",
        verifiedDaysAgo: 15,
        verificationCount: 2,
      },
    ],
  },

  {
    name: "Cambridge Common",
    address1: "1667 Massachusetts Ave",
    city: "Cambridge",
    neighborhood: "Porter Square",
    state: "MA",
    postalCode: "02138",
    latitude: 42.3846,
    longitude: -71.1190,
    geoPrecision: "rooftop",
    venueType: "restaurant",
    deals: [
      {
        beerName: "Narragansett",
        brand: "Narragansett",
        beerStyle: "American lager",
        priceCents: 595,
        servingType: "draft",
        servingSizeOz: 16,
        sourceType: "official_menu",
        verifiedDaysAgo: 6,
        verificationCount: 2,
      },
      {
        beerName: "Budweiser",
        brand: "Budweiser",
        priceCents: 495,
        servingType: "other",
        servingSizeLabel: "bottle or can",
        description: "Menu lists it as bottle/can without distinguishing.",
        sourceType: "official_menu",
        verifiedDaysAgo: 6,
      },
      {
        beerName: "Bud Light",
        brand: "Budweiser",
        priceCents: 495,
        servingType: "other",
        servingSizeLabel: "bottle or can",
        sourceType: "official_menu",
        verifiedDaysAgo: 6,
      },
      {
        beerName: "Miller Lite",
        brand: "Miller",
        priceCents: 495,
        servingType: "other",
        servingSizeLabel: "bottle or can",
        sourceType: "official_menu",
        verifiedDaysAgo: 6,
      },
      {
        beerName: "Miller High Life",
        brand: "Miller",
        priceCents: 495,
        servingType: "other",
        servingSizeLabel: "bottle or can",
        sourceType: "official_menu",
        verifiedDaysAgo: 6,
      },
      {
        beerName: "Harpoon IPA",
        brand: "Harpoon",
        beerStyle: "IPA",
        priceCents: 695,
        servingType: "draft",
        servingSizeOz: 16,
        sourceType: "official_menu",
        verifiedDaysAgo: 6,
      },
      {
        beerName: "Allagash White",
        brand: "Allagash",
        beerStyle: "Witbier",
        priceCents: 695,
        servingType: "draft",
        servingSizeOz: 16,
        sourceType: "official_menu",
        verifiedDaysAgo: 6,
      },
      {
        beerName: "Victory Golden Monkey",
        brand: "Victory",
        beerStyle: "Belgian tripel",
        priceCents: 695,
        servingType: "draft",
        servingSizeOz: 13,
        sourceType: "official_menu",
        verifiedDaysAgo: 6,
      },
    ],
  },

  {
    name: "Lower Mills Tavern",
    address1: "2269 Dorchester Ave",
    city: "Boston",
    neighborhood: "Dorchester",
    state: "MA",
    postalCode: "02124",
    latitude: 42.2861,
    longitude: -71.0700,
    geoPrecision: "rooftop",
    venueType: "pub",
    deals: (
      [
        ["Miller High Life", "Miller", 500],
        ["Bud Light", "Budweiser", 500],
        ["Budweiser", "Budweiser", 500],
        ["Miller Lite", "Miller", 500],
        ["Coors Light", "Coors", 600],
        ["Corona", "Corona", 600],
        ["Michelob Ultra", "Michelob", 600],
        ["Modelo", "Modelo", 600],
        ["Dorchester Gold", null, 700],
      ] as [string, string | null, number][]
    ).map(([beerName, brand, priceCents]) => ({
      beerName,
      ...(brand ? { brand } : {}),
      priceCents,
      servingType: "other" as ServingType,
      description: "Menu price. Serving size is not printed on the menu.",
      sourceType: "official_menu" as SourceType,
      verifiedDaysAgo: 9,
    })),
  },

  {
    name: "Sullivan's Tap",
    address1: "168 Canal St",
    city: "Boston",
    neighborhood: "West End",
    state: "MA",
    postalCode: "02114",
    latitude: 42.3660,
    longitude: -71.0620,
    geoPrecision: "rooftop",
    venueType: "dive_bar",
    deals: [
      {
        beerName: "Sully's Light",
        beerStyle: "Light lager",
        priceCents: 600,
        servingType: "draft",
        description: "House draft. Pour size is not printed on the menu.",
        sourceType: "official_menu",
        verifiedDaysAgo: 11,
        verificationCount: 1,
      },
      {
        beerName: "Narragansett",
        brand: "Narragansett",
        beerStyle: "American lager",
        priceCents: 600,
        servingType: "other",
        description: "Menu price. Serving format and size not stated.",
        sourceType: "official_menu",
        verifiedDaysAgo: 11,
      },
    ],
  },

  {
    name: "Redbones Barbecue",
    address1: "55 Chester St",
    city: "Somerville",
    neighborhood: "Davis Square",
    state: "MA",
    postalCode: "02144",
    latitude: 42.3985,
    longitude: -71.1220,
    geoPrecision: "rooftop",
    venueType: "restaurant",
    notes:
      "Menu evidence exists but the restaurant changed ownership, so these prices need fresh confirmation.",
    deals: [
      // The 16oz / liter pair is the "multiple serving sizes" case: two separate
      // deals, not one row with a price range.
      {
        beerName: "Redbones IPA",
        beerStyle: "IPA",
        priceCents: 500,
        servingType: "draft",
        servingSizeOz: 16,
        description: "Menu predates an ownership change — please confirm.",
        sourceType: "official_menu",
        verifiedDaysAgo: 210,
      },
      {
        beerName: "Redbones IPA",
        beerStyle: "IPA",
        priceCents: 1000,
        servingType: "draft",
        // A litre is a defined volume, so converting it is a fact, not a guess.
        servingSizeOz: 33.81,
        servingSizeLabel: "liter",
        description: "Menu predates an ownership change — please confirm.",
        sourceType: "official_menu",
        verifiedDaysAgo: 210,
      },
      {
        beerName: "Remnant Hella Crispy",
        brand: "Remnant",
        beerStyle: "Pilsner",
        priceCents: 550,
        servingType: "draft",
        servingSizeOz: 16,
        sourceType: "official_menu",
        verifiedDaysAgo: 210,
      },
      {
        beerName: "Remnant Hella Crispy",
        brand: "Remnant",
        beerStyle: "Pilsner",
        priceCents: 1100,
        servingType: "draft",
        servingSizeOz: 33.81,
        servingSizeLabel: "liter",
        sourceType: "official_menu",
        verifiedDaysAgo: 210,
      },
      {
        beerName: "Lawson's Sip of Sunshine",
        brand: "Lawson's Finest Liquids",
        beerStyle: "IPA",
        priceCents: 750,
        servingType: "draft",
        description: "Menu price; pour size not printed. Predates an ownership change.",
        sourceType: "official_menu",
        verifiedDaysAgo: 210,
      },
      {
        beerName: "Hill Farmstead Abner",
        brand: "Hill Farmstead",
        beerStyle: "Double IPA",
        priceCents: 750,
        servingType: "draft",
        description: "Menu price; pour size not printed. Predates an ownership change.",
        sourceType: "official_menu",
        verifiedDaysAgo: 210,
      },
    ],
  },

  {
    name: "Mike's Food & Spirits",
    address1: "9 Davis Sq",
    city: "Somerville",
    neighborhood: "Davis Square",
    state: "MA",
    postalCode: "02144",
    latitude: 42.3966,
    longitude: -71.1226,
    geoPrecision: "rooftop",
    venueType: "restaurant",
    notes:
      "Sizes on this menu are described only as \"medium\" and \"large\"; the ounces are unknown.",
    deals: [
      {
        beerName: "Special beer",
        priceCents: 500,
        servingType: "other",
        description: "Listed simply as the beer special. Product and size vary.",
        sourceType: "official_menu",
        verifiedDaysAgo: 25,
      },
      ...(
        [
          ["Coors", "Coors", "medium", 950],
          ["Michelob", "Michelob", "medium", 950],
          ["Guinness", "Guinness", "medium", 1000],
          ["Sam Adams Lager", "Samuel Adams", "medium", 1050],
          ["Blue Moon", "Blue Moon", "medium", 1050],
          ["Coors", "Coors", "large", 1250],
          ["Blue Moon", "Blue Moon", "large", 1400],
          ["Sam Adams", "Samuel Adams", "large", 1400],
          ["Modelo", "Modelo", "large", 1400],
          ["Stella Artois", "Stella Artois", "large", 1400],
          ["Fiddlehead", "Fiddlehead", "large", 1400],
          ["Guinness", "Guinness", "large", 1600],
          ["Downeast", "Downeast", "large", 1600],
        ] as [string, string, string, number][]
      ).map(([beerName, brand, size, priceCents]) => ({
        beerName: `${beerName} (${size})`,
        brand,
        priceCents,
        servingType: "other" as ServingType,
        // "medium"/"large" is all the menu says, so that is all we store.
        servingSizeLabel: size,
        description: `Menu lists this as a ${size}. The menu does not state the ounces.`,
        sourceType: "official_menu" as SourceType,
        verifiedDaysAgo: 25,
      })),
    ],
  },

  /* ---------------------------------------------- historical / inactive */

  {
    name: "A&B Kitchen",
    city: "Cambridge",
    state: "MA",
    latitude: 42.3654,
    longitude: -71.1037,
    geoPrecision: "approximate",
    venueType: "restaurant",
    notes: "Street address unconfirmed — pin is approximate.",
    deals: [
      {
        beerName: "Coors Light",
        brand: "Coors",
        priceCents: 300,
        servingType: "draft",
        servingSizeOz: 22,
        description: "Ran as a $3 / 22 oz deal. Reported ended 31 July 2026.",
        sourceType: "community_submission",
        verifiedDaysAgo: 60,
        status: "expired",
        endedAt: "2026-07-31T23:59:59.000Z",
        endedReason: "Reported ended 31 July 2026",
      },
    ],
  },

  {
    name: "Eddie C's",
    city: "Boston",
    state: "MA",
    latitude: 42.3505,
    longitude: -71.0680,
    geoPrecision: "approximate",
    venueType: "bar",
    status: "permanently_closed",
    notes: "Closed in 2025. Kept for history; excluded from live results.",
    deals: [
      {
        beerName: "Beer",
        priceCents: 200,
        servingType: "other",
        description: "Historical listing retained after the venue closed.",
        sourceType: "community_submission",
        verifiedDaysAgo: 500,
        status: "expired",
        endedAt: "2025-12-31T00:00:00.000Z",
        endedReason: "Venue permanently closed",
      },
    ],
  },
];

/**
 * Opt-in fixtures (`npm run db:seed -- --demo`) that exercise happy-hour
 * schedules and conditional rules. Kept out of the default seed on purpose:
 * the real dataset should never contain invented deals.
 */
export const DEMO_VENUES: SeedVenue[] = [
  {
    name: "Example Tap Room (demo data)",
    address1: "1 Demo St",
    city: "Somerville",
    neighborhood: "Union Square",
    state: "MA",
    latitude: 42.3796,
    longitude: -71.0955,
    geoPrecision: "approximate",
    venueType: "bar",
    notes: "DEMO DATA — not a real venue. Seeded with --demo to exercise schedules.",
    deals: [
      {
        beerName: "House lager",
        beerStyle: "Lager",
        priceCents: 300,
        servingType: "draft",
        servingSizeOz: 16,
        isHappyHour: true,
        description: "DEMO DATA — happy-hour window for testing 'Available now'.",
        schedule: [{ days: [1, 2, 3, 4, 5], startTime: "16:00", endTime: "18:00" }],
        sourceType: "other",
        verifiedDaysAgo: 1,
        verificationCount: 6,
      },
      {
        beerName: "Narragansett",
        brand: "Narragansett",
        priceCents: 200,
        servingType: "can",
        isConditional: true,
        ruleDescription: "DEMO DATA — $2 during Red Sox games.",
        restrictions: "One per customer.",
        sourceType: "other",
        verifiedDaysAgo: 3,
      },
      {
        beerName: "Bucket of light lager",
        priceCents: 1800,
        servingType: "bucket",
        quantity: 5,
        individualServingSizeOz: 12,
        description: "DEMO DATA — bucket of 5, exercises quantity-based value math.",
        sourceType: "other",
        verifiedDaysAgo: 2,
      },
    ],
  },
];
