-- Applied only when PostGIS is available. Adds a stored, generated geography
-- column plus a GiST index so the `postgis` geo backend can use ST_DWithin /
-- ST_Distance / && envelope tests.
--
-- The column is GENERATED, so latitude/longitude remain the single source of
-- truth and nothing can drift out of sync.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS geog geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED;

CREATE INDEX IF NOT EXISTS venues_geog_idx ON venues USING GIST (geog);
