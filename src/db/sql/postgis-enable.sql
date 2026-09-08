-- Attempt to enable PostGIS. Applied separately from the other extensions so
-- that a host which does not offer it (or does not permit CREATE EXTENSION)
-- leaves pg_trgm intact. Failure here is expected and non-fatal: the geo layer
-- falls back to the portable haversine backend.
CREATE EXTENSION IF NOT EXISTS postgis;
