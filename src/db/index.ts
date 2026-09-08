import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { envBool, envInt, envString } from "@/lib/env";
import * as schema from "./schema";

/**
 * Database client.
 *
 * Connecting is LAZY on purpose. `next build` imports every route module to
 * collect page data, so anything that opens a connection (or throws on a
 * missing DATABASE_URL) at module scope turns a missing env var into a failed
 * build rather than a clear runtime error. A build should not need a database.
 *
 * Everything below is created on first query instead, and cached for the life
 * of the process.
 */
const globalForDb = globalThis as unknown as {
  __pourFinderSql?: postgres.Sql;
  __pourFinderDb?: PostgresJsDatabase<typeof schema>;
};

function connectionString(): string {
  const url = envString("DATABASE_URL");
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env (locally) or add it to your " +
        "host's environment variables (in production) and point it at a Postgres instance.",
    );
  }
  return url;
}

/**
 * The raw postgres.js client. Prefer `db`; this exists for the few places that
 * need a tagged-template query (the PostGIS probe) or connection lifecycle
 * control (the seed script).
 */
export function getClient(): postgres.Sql {
  if (globalForDb.__pourFinderSql) return globalForDb.__pourFinderSql;

  const client = postgres(connectionString(), {
    // 1 is right for serverless; raise it on a long-lived host.
    // envInt, not Number(): an empty DATABASE_POOL_MAX would parse to 0,
    // i.e. a pool that can never open a connection.
    max: envInt("DATABASE_POOL_MAX", 10),
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null },
  });

  // Cache in prod too: on serverless the module is re-evaluated per cold start
  // anyway, and on a persistent host this is what keeps the pool from leaking
  // across hot reloads.
  globalForDb.__pourFinderSql = client;
  return client;
}

function getDb(): PostgresJsDatabase<typeof schema> {
  if (globalForDb.__pourFinderDb) return globalForDb.__pourFinderDb;
  const instance = drizzle(getClient(), { schema, logger: envBool("DB_LOG") });
  globalForDb.__pourFinderDb = instance;
  return instance;
}

/**
 * Drizzle instance. Looks and behaves like a normal `db`, but the underlying
 * connection isn't opened until the first property access, so importing this
 * module is free.
 */
export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_target, property) {
      const instance = getDb() as unknown as Record<string | symbol, unknown>;
      const value = instance[property];
      // Bind so Drizzle's internals see the real instance as `this`, not the proxy.
      return typeof value === "function" ? value.bind(instance) : value;
    },
  },
);

/** Closes the pool. Used by scripts; server processes keep it open. */
export async function closeDb(timeoutSeconds = 5): Promise<void> {
  const client = globalForDb.__pourFinderSql;
  if (!client) return;
  globalForDb.__pourFinderSql = undefined;
  globalForDb.__pourFinderDb = undefined;
  await client.end({ timeout: timeoutSeconds });
}

export type Db = PostgresJsDatabase<typeof schema>;
export { schema };
