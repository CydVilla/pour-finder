import type { NewPlace } from "./schema";
import { slugify } from "@/lib/slug";

/**
 * Gazetteer seed.
 *
 * All 50 states plus DC are loaded from day one - not because Massachusetts
 * needs them, but because the free offline geocoder is the thing that would
 * otherwise have to be rewritten to launch a second market. Cities and
 * neighborhoods start with the Boston area and grow per market.
 */

type StateRow = [code: string, name: string, lat: number, lng: number];

const STATES: StateRow[] = [
  ["AL", "Alabama", 32.8067, -86.7911], ["AK", "Alaska", 61.3707, -152.4044],
  ["AZ", "Arizona", 33.7298, -111.4312], ["AR", "Arkansas", 34.9697, -92.3731],
  ["CA", "California", 36.1162, -119.6816], ["CO", "Colorado", 39.0598, -105.3111],
  ["CT", "Connecticut", 41.5978, -72.7554], ["DE", "Delaware", 39.3185, -75.5071],
  ["DC", "District of Columbia", 38.8974, -77.0268], ["FL", "Florida", 27.7663, -81.6868],
  ["GA", "Georgia", 33.0406, -83.6431], ["HI", "Hawaii", 21.0943, -157.4983],
  ["ID", "Idaho", 44.2405, -114.4788], ["IL", "Illinois", 40.3495, -88.9861],
  ["IN", "Indiana", 39.8494, -86.2583], ["IA", "Iowa", 42.0115, -93.2105],
  ["KS", "Kansas", 38.5266, -96.7265], ["KY", "Kentucky", 37.6681, -84.6701],
  ["LA", "Louisiana", 31.1695, -91.8678], ["ME", "Maine", 44.6939, -69.3819],
  ["MD", "Maryland", 39.0639, -76.8021], ["MA", "Massachusetts", 42.2302, -71.5301],
  ["MI", "Michigan", 43.3266, -84.5361], ["MN", "Minnesota", 45.6945, -93.9002],
  ["MS", "Mississippi", 32.7416, -89.6787], ["MO", "Missouri", 38.4561, -92.2884],
  ["MT", "Montana", 46.9219, -110.4544], ["NE", "Nebraska", 41.1254, -98.2681],
  ["NV", "Nevada", 38.3135, -117.0554], ["NH", "New Hampshire", 43.4525, -71.5639],
  ["NJ", "New Jersey", 40.2989, -74.5210], ["NM", "New Mexico", 34.8405, -106.2485],
  ["NY", "New York", 42.1657, -74.9481], ["NC", "North Carolina", 35.6301, -79.8064],
  ["ND", "North Dakota", 47.5289, -99.7840], ["OH", "Ohio", 40.3888, -82.7649],
  ["OK", "Oklahoma", 35.5653, -96.9289], ["OR", "Oregon", 44.5720, -122.0709],
  ["PA", "Pennsylvania", 40.5908, -77.2098], ["RI", "Rhode Island", 41.6809, -71.5118],
  ["SC", "South Carolina", 33.8569, -80.9450], ["SD", "South Dakota", 44.2998, -99.4388],
  ["TN", "Tennessee", 35.7478, -86.6923], ["TX", "Texas", 31.0545, -97.5635],
  ["UT", "Utah", 40.1500, -111.8624], ["VT", "Vermont", 44.0459, -72.7107],
  ["VA", "Virginia", 37.7693, -78.1700], ["WA", "Washington", 47.4009, -121.4905],
  ["WV", "West Virginia", 38.4912, -80.9545], ["WI", "Wisconsin", 44.2685, -89.6165],
  ["WY", "Wyoming", 42.7560, -107.3025],
];

type CityRow = [name: string, state: string, lat: number, lng: number, population: number, radius?: number];

/** Launch market plus enough of the border to prove state lines aren't fences. */
const CITIES: CityRow[] = [
  ["Boston", "MA", 42.3601, -71.0589, 675_000, 12_000],
  ["Cambridge", "MA", 42.3736, -71.1097, 118_000, 6_000],
  ["Somerville", "MA", 42.3876, -71.0995, 81_000, 5_000],
  ["Brookline", "MA", 42.3318, -71.1212, 63_000, 5_000],
  ["Quincy", "MA", 42.2529, -71.0023, 101_000, 7_000],
  ["Medford", "MA", 42.4184, -71.1062, 59_000, 5_000],
  ["Malden", "MA", 42.4251, -71.0662, 66_000, 4_000],
  ["Everett", "MA", 42.4084, -71.0537, 49_000, 4_000],
  ["Chelsea", "MA", 42.3918, -71.0328, 40_000, 3_500],
  ["Newton", "MA", 42.3370, -71.2092, 88_000, 7_000],
  ["Waltham", "MA", 42.3765, -71.2356, 65_000, 6_000],
  ["Watertown", "MA", 42.3709, -71.1828, 35_000, 4_000],
  ["Arlington", "MA", 42.4154, -71.1565, 46_000, 4_500],
  ["Revere", "MA", 42.4084, -71.0120, 62_000, 5_000],
  ["Lynn", "MA", 42.4668, -70.9495, 101_000, 6_000],
  ["Salem", "MA", 42.5195, -70.8967, 44_000, 4_500],
  ["Worcester", "MA", 42.2626, -71.8023, 206_000, 10_000],
  ["Springfield", "MA", 42.1015, -72.5898, 155_000, 9_000],
  ["Lowell", "MA", 42.6334, -71.3162, 115_000, 7_000],
  ["Attleboro", "MA", 41.9445, -71.2856, 46_000, 6_000],
  // Cross-border: an Attleboro search should reach these.
  ["Providence", "RI", 41.8240, -71.4128, 190_000, 9_000],
  ["Pawtucket", "RI", 41.8787, -71.3826, 75_000, 5_000],
  ["Nashua", "NH", 42.7654, -71.4676, 91_000, 7_000],
  ["Manchester", "NH", 42.9956, -71.4548, 115_000, 7_000],
];

type HoodRow = [name: string, city: string, state: string, lat: number, lng: number];

const NEIGHBORHOODS: HoodRow[] = [
  ["Downtown", "Boston", "MA", 42.3557, -71.0603],
  ["Financial District", "Boston", "MA", 42.3559, -71.0550],
  ["Back Bay", "Boston", "MA", 42.3503, -71.0810],
  ["Fenway", "Boston", "MA", 42.3467, -71.0972],
  ["Allston", "Boston", "MA", 42.3539, -71.1337],
  ["Brighton", "Boston", "MA", 42.3464, -71.1627],
  ["Jamaica Plain", "Boston", "MA", 42.3097, -71.1151],
  ["Dorchester", "Boston", "MA", 42.3016, -71.0676],
  ["South Boston", "Boston", "MA", 42.3331, -71.0495],
  ["North End", "Boston", "MA", 42.3647, -71.0542],
  ["Beacon Hill", "Boston", "MA", 42.3588, -71.0707],
  ["Charlestown", "Boston", "MA", 42.3782, -71.0602],
  ["South End", "Boston", "MA", 42.3388, -71.0765],
  ["Seaport", "Boston", "MA", 42.3519, -71.0428],
  ["West End", "Boston", "MA", 42.3647, -71.0656],
  ["Davis Square", "Somerville", "MA", 42.3967, -71.1218],
  ["Union Square", "Somerville", "MA", 42.3796, -71.0955],
  ["Magoun Square", "Somerville", "MA", 42.3933, -71.1010],
  ["Ball Square", "Somerville", "MA", 42.4021, -71.1076],
  ["Assembly Square", "Somerville", "MA", 42.3925, -71.0774],
  ["Harvard Square", "Cambridge", "MA", 42.3736, -71.1190],
  ["Central Square", "Cambridge", "MA", 42.3654, -71.1037],
  ["Kendall Square", "Cambridge", "MA", 42.3625, -71.0862],
  ["Porter Square", "Cambridge", "MA", 42.3884, -71.1191],
  ["Inman Square", "Cambridge", "MA", 42.3743, -71.1013],
];

type ZipRow = [zip: string, name: string, state: string, lat: number, lng: number];

const POSTAL_CODES: ZipRow[] = [
  ["02108", "Beacon Hill, Boston", "MA", 42.3576, -71.0656],
  ["02109", "North End / Waterfront, Boston", "MA", 42.3652, -71.0540],
  ["02110", "Financial District, Boston", "MA", 42.3557, -71.0512],
  ["02111", "Chinatown, Boston", "MA", 42.3505, -71.0621],
  ["02114", "West End, Boston", "MA", 42.3618, -71.0685],
  ["02115", "Fenway, Boston", "MA", 42.3406, -71.0928],
  ["02116", "Back Bay, Boston", "MA", 42.3496, -71.0765],
  ["02118", "South End, Boston", "MA", 42.3388, -71.0724],
  ["02124", "Dorchester, Boston", "MA", 42.2871, -71.0713],
  ["02127", "South Boston", "MA", 42.3345, -71.0450],
  ["02134", "Allston", "MA", 42.3552, -71.1318],
  ["02135", "Brighton", "MA", 42.3501, -71.1562],
  ["02138", "Cambridge (Harvard)", "MA", 42.3796, -71.1284],
  ["02139", "Cambridge (Central)", "MA", 42.3646, -71.1028],
  ["02141", "Cambridge (East)", "MA", 42.3705, -71.0872],
  ["02143", "Somerville (Union)", "MA", 42.3812, -71.0959],
  ["02144", "Somerville (Davis)", "MA", 42.4004, -71.1226],
  ["02145", "Somerville (Winter Hill)", "MA", 42.3899, -71.0925],
  ["02215", "Fenway / Kenmore, Boston", "MA", 42.3479, -71.1030],
];

export function buildPlaces(): NewPlace[] {
  const rows: NewPlace[] = [];

  for (const [code, name, lat, lng] of STATES) {
    rows.push({
      kind: "state",
      name,
      slug: code.toLowerCase(),
      state: code,
      latitude: lat,
      longitude: lng,
      defaultRadiusMeters: 150_000,
      population: null,
      postalCode: null,
      parentSlug: null,
      searchText: `${name} ${code}`.toLowerCase(),
    });
  }

  for (const [name, state, lat, lng, population, radius] of CITIES) {
    rows.push({
      kind: "city",
      name,
      slug: slugify(name),
      state,
      latitude: lat,
      longitude: lng,
      defaultRadiusMeters: radius ?? 8_000,
      population,
      postalCode: null,
      parentSlug: null,
      searchText: `${name} ${state}`.toLowerCase(),
    });
  }

  for (const [name, city, state, lat, lng] of NEIGHBORHOODS) {
    rows.push({
      kind: "neighborhood",
      name,
      slug: slugify(`${name}-${city}`),
      state,
      latitude: lat,
      longitude: lng,
      defaultRadiusMeters: 2_500,
      population: null,
      postalCode: null,
      parentSlug: slugify(city),
      searchText: `${name} ${city} ${state}`.toLowerCase(),
    });
  }

  for (const [zip, name, state, lat, lng] of POSTAL_CODES) {
    rows.push({
      kind: "postal_code",
      name,
      slug: zip,
      state,
      latitude: lat,
      longitude: lng,
      defaultRadiusMeters: 3_000,
      population: null,
      postalCode: zip,
      parentSlug: null,
      searchText: `${zip} ${name} ${state}`.toLowerCase(),
    });
  }

  return rows;
}
