/**
 * Diagnoses DATABASE_URL without ever printing the password.
 *
 *   npm run db:check
 *   DATABASE_URL="postgres://…" npm run db:check
 *
 * Catches, in order: the string being a copy-pasted placeholder, a malformed
 * URL, a host that won't resolve, auth/TLS failures, and a database that is
 * reachable but has no schema or no data yet.
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;

function fail(message: string, hint?: string): never {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`\n  ${hint}`);
  process.exit(1);
}

if (!url) {
  fail(
    "DATABASE_URL is not set.",
    "Locally: cp .env.example .env and edit it.\n  On Vercel: Project → Settings → Environment Variables.",
  );
}

// The placeholder in the docs uses a real ellipsis character. Pasting it
// verbatim is an easy mistake and produces a confusing DNS error later.
if (/[…]/.test(url) || /<[^>]+>/.test(url) || url.includes("YOUR_")) {
  fail(
    "DATABASE_URL still contains a placeholder, not a real connection string.",
    "Copy the real one from the Neon dashboard: Project → Connection Details →\n" +
      '  "Connection string", with "Pooled connection" selected.',
  );
}

let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  fail("DATABASE_URL is not a valid URL.", "It should look like postgres://user:password@host/dbname?sslmode=require");
}

if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
  fail(`Unexpected protocol "${parsed.protocol}". Expected postgres:// or postgresql://`);
}
if (!parsed.hostname) fail("DATABASE_URL has no host.");
if (!parsed.password) {
  console.warn("⚠ No password in the connection string — that's unusual for a hosted database.");
}

const database = parsed.pathname.replace(/^\//, "") || "(default)";
console.log("Connection target");
console.log(`  host:     ${parsed.hostname}`);
console.log(`  database: ${database}`);
console.log(`  user:     ${parsed.username || "(none)"}`);
console.log(`  password: ${parsed.password ? "•".repeat(8) + " (present)" : "(none)"}`);
console.log(`  sslmode:  ${parsed.searchParams.get("sslmode") ?? "(unset)"}`);

if (parsed.hostname.includes("neon.tech")) {
  const pooled = parsed.hostname.includes("-pooler");
  console.log(`  neon:     ${pooled ? "pooled endpoint ✓" : "DIRECT endpoint"}`);
  if (!pooled) {
    console.warn(
      "\n⚠ This is Neon's direct endpoint. For serverless (Vercel) prefer the\n" +
        '  pooled one — the host contains "-pooler". The direct endpoint can\n' +
        "  exhaust connections under concurrent traffic.",
    );
  }
  if (parsed.searchParams.get("sslmode") !== "require") {
    console.warn('\n⚠ Neon requires TLS. Add ?sslmode=require to the URL.');
  }
}

const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5 });

async function main(): Promise<void> {
  try {
    const started = Date.now();
    const [version] = await sql`SELECT version()`;
    console.log(`\n✓ Connected in ${Date.now() - started}ms`);
    console.log(`  ${String(version?.version ?? "").split(",")[0]}`);

    const [postgis] = await sql`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS present
    `;
    console.log(`  PostGIS:  ${postgis?.present ? "installed → geo backend 'postgis'" : "absent → geo backend 'haversine' (fine)"}`);

    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;

    if (tables.length === 0) {
      console.log("\n⚠ Connected, but the schema is empty.");
      console.log("  Next: npm run db:push && npm run db:seed");
      process.exit(0);
    }

    console.log(`\n  ${tables.length} tables present`);

    const [counts] = await sql`
      SELECT
        (SELECT count(*) FROM venues)                        AS venues,
        (SELECT count(*) FROM deals WHERE status = 'active') AS active_deals,
        (SELECT count(*) FROM places)                        AS places
    `;

    const venues = Number(counts?.venues ?? 0);
    console.log(`  venues: ${venues}  active deals: ${counts?.active_deals}  gazetteer: ${counts?.places}`);

    if (venues === 0) {
      console.log("\n⚠ Schema is there but empty. Next: npm run db:seed");
    } else {
      console.log("\n✓ Database is ready to serve.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string }).code;

    let hint = "";
    if (code === "ENOTFOUND" || message.includes("ENOTFOUND")) {
      hint = "The host doesn't resolve. Check for a typo, or a placeholder you didn't replace.";
    } else if (code === "ETIMEDOUT" || message.includes("timeout")) {
      hint = "Connection timed out. Check the host and that the database isn't paused.";
    } else if (/password|authentication/i.test(message)) {
      hint = "Authentication failed. Re-copy the connection string from the Neon dashboard.";
    } else if (/ssl|tls/i.test(message)) {
      hint = "TLS problem. Neon needs ?sslmode=require on the end of the URL.";
    } else if (/database .* does not exist/i.test(message)) {
      hint = `The database "${database}" doesn't exist on that host. Create it, or fix the path in the URL.`;
    }

    fail(`Could not connect: ${message}`, hint);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
