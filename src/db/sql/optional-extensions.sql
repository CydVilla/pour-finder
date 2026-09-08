-- Optional capability upgrades. Every statement here is best-effort: the app
-- runs correctly on a bare Postgres without any of them, and the migration
-- runner reports which ones landed rather than failing.
--
-- pg_trgm  -> fuzzy venue-name search and better duplicate detection
CREATE EXTENSION IF NOT EXISTS pg_trgm;
