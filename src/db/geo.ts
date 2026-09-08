/**
 * SQL-emitting half of the geo layer. Server-only: it touches the database
 * client to probe for PostGIS. The pure math lives in @/lib/geo-math so the
 * browser bundle never sees the Postgres driver.
 *
 * Two interchangeable backends:
 *
 *   haversine - btree bbox prefilter on (latitude, longitude) plus an exact
 *               haversine expression for distance/ordering. Runs on ANY
 *               Postgres with no extensions, which is what makes the app
 *               deployable on a bare Neon/Supabase/brew instance.
 *
 *   postgis   - geography(Point,4326) + GiST + ST_DWithin/ST_Distance. Faster
 *               and more correct at scale; recommended once venue count grows.
 *
 * The backend is auto-detected once per process. Nothing above this module
 * knows which one is in use.
 */
import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { envString } from "@/lib/env";
import {
  boundingBoxFromRadius,
  EARTH_RADIUS_M,
  type BoundingBox,
  type LatLng,
} from "@/lib/geo-math";
import { getClient } from "./index";

export * from "@/lib/geo-math";

export type GeoBackend = "postgis" | "haversine";

let cached: Promise<GeoBackend> | null = null;

export function resolveGeoBackend(): Promise<GeoBackend> {
  if (cached) return cached;
  const configured = envString("GEO_BACKEND", "auto").toLowerCase();

  if (configured === "haversine") {
    cached = Promise.resolve<GeoBackend>("haversine");
    return cached;
  }

  cached = (async (): Promise<GeoBackend> => {
    try {
      await getClient()`SELECT postgis_version()`;
      return "postgis";
    } catch {
      if (configured === "postgis") {
        throw new Error(
          "GEO_BACKEND=postgis but the PostGIS extension is not installed. " +
            "Run `CREATE EXTENSION postgis;` or set GEO_BACKEND=auto.",
        );
      }
      return "haversine";
    }
  })();

  return cached;
}

/** Test seam: force a backend without touching the environment. */
export function __setGeoBackendForTests(backend: GeoBackend | null): void {
  cached = backend ? Promise.resolve(backend) : null;
}

/* ------------------------------------------------------------ expressions */

/**
 * Distance in metres from `origin` to each venue row.
 * Assumes the venues table is aliased as `venues` in the surrounding query.
 */
export function distanceMeters(origin: LatLng, backend: GeoBackend): SQL<number> {
  if (backend === "postgis") {
    return sql<number>`ST_Distance(
      venues.geog,
      ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography
    )`;
  }
  // Every numeric bind is cast explicitly. Without the casts Postgres infers a
  // parameter type from context and picks `integer` for the Earth radius,
  // which fails at runtime with "invalid input syntax for type integer".
  return sql<number>`(
    ${EARTH_RADIUS_M}::double precision * 2 * asin(
      sqrt(
        power(sin(radians((venues.latitude - ${origin.lat}::double precision) / 2)), 2)
        + cos(radians(${origin.lat}::double precision)) * cos(radians(venues.latitude))
        * power(sin(radians((venues.longitude - ${origin.lng}::double precision) / 2)), 2)
      )
    )
  )`;
}

/** Index-friendly bounding-box filter. Handles antimeridian wrap. */
export function withinBoundingBox(box: BoundingBox, backend: GeoBackend): SQL {
  if (backend === "postgis") {
    return sql`venues.geog && ST_MakeEnvelope(
      ${box.minLng}, ${box.minLat}, ${box.maxLng}, ${box.maxLat}, 4326
    )::geography`;
  }

  const latPredicate = sql`venues.latitude BETWEEN ${box.minLat}::double precision AND ${box.maxLat}::double precision`;

  // A box spanning the antimeridian (Aleutians) has minLng > maxLng.
  const lngPredicate =
    box.minLng <= box.maxLng
      ? sql`venues.longitude BETWEEN ${box.minLng}::double precision AND ${box.maxLng}::double precision`
      : sql`(venues.longitude >= ${box.minLng}::double precision OR venues.longitude <= ${box.maxLng}::double precision)`;

  return sql`(${latPredicate} AND ${lngPredicate})`;
}

/**
 * Radius filter. On the haversine backend this deliberately emits a bbox
 * prefilter *and* the exact circle test: the bbox uses the index, the circle
 * trims the corners.
 */
export function withinRadius(origin: LatLng, meters: number, backend: GeoBackend): SQL {
  if (backend === "postgis") {
    return sql`ST_DWithin(
      venues.geog,
      ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography,
      ${meters}
    )`;
  }
  const box = boundingBoxFromRadius(origin, meters);
  return sql`(${withinBoundingBox(box, backend)} AND ${distanceMeters(origin, backend)} <= ${meters}::double precision)`;
}
