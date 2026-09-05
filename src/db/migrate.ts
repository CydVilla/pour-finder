/**
 * Migration runner.
 *
 * Applies the generated Drizzle migrations, then layers on optional
 * capabilities (pg_trgm, PostGIS) when the target database supports them.
 * Never fails because an optional extension is missing.
 *
 *   npm run db:push          apply migrations
 *   npm run db:push -- --drop  drop the public schema first (dev only)
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const shouldDrop = process.argv.includes("--drop");
const sqlDir = join(process.cwd(), "src", "db", "sql");

async function main(): Promise<void> {
  const sql = postgres(connectionString!, { max: 1 });

  try {
    if (shouldDrop) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to --drop with NODE_ENV=production.");
      }
      console.log("• dropping public schema");
      await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    }

    console.log("• applying migrations");
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: join(process.cwd(), "src", "db", "migrations") });

    // ---- optional capabilities -------------------------------------------
    const hasTrgm = await tryApply(sql, "optional-extensions.sql", "pg_trgm");
    if (hasTrgm) await tryApply(sql, "trigram-indexes.sql", "trigram indexes");

    const hasPostgis = await probe(sql, "SELECT postgis_version()");
    if (hasPostgis) {
      await tryApply(sql, "postgis.sql", "PostGIS geography column");
      console.log("  geo backend: postgis");
    } else {
      console.log("  geo backend: haversine (PostGIS not installed - this is fine)");
    }

    console.log("✓ database ready");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function probe(sql: postgres.Sql, statement: string): Promise<boolean> {
  try {
    await sql.unsafe(statement);
    return true;
  } catch {
    return false;
  }
}

async function tryApply(sql: postgres.Sql, file: string, label: string): Promise<boolean> {
  try {
    const contents = await readFile(join(sqlDir, file), "utf8");
    await sql.unsafe(contents);
    console.log(`  + ${label}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  - ${label} unavailable (${message.split("\n")[0]})`);
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
