-- Optional capability upgrades. Every statement here is best-effort: the app
-- runs correctly on a bare Postgres without any of them.
--
-- pg_trgm  -> fuzzy venue-name search and better duplicate detection
-- citext   -> case-insensitive text (reserved for a future accounts table)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
