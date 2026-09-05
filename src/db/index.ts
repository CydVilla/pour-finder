import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and point it at a Postgres instance.",
  );
}

/**
 * Reuse the client across hot reloads and (on long-lived hosts) across
 * requests. `max: 1` is the right default for serverless; bump it via
 * DATABASE_POOL_MAX when running on a persistent node.
 */
const globalForDb = globalThis as unknown as {
  __pourFinderSql?: postgres.Sql;
};

export const client =
  globalForDb.__pourFinderSql ??
  postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    // Keep numeric/decimal as strings so cent math never round-trips a float.
    transform: { undefined: null },
  });

if (process.env.NODE_ENV !== "production") globalForDb.__pourFinderSql = client;

export const db = drizzle(client, { schema, logger: process.env.DB_LOG === "true" });

export type Db = typeof db;
export { schema };
