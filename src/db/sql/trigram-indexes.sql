-- Applied only when pg_trgm is available. Powers fuzzy "did you mean Coogan's?"
-- venue search and the duplicate detector's name-similarity candidates.
CREATE INDEX IF NOT EXISTS venues_name_trgm_idx
  ON venues USING GIN (name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS deals_beer_name_trgm_idx
  ON deals USING GIN (lower(beer_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS places_search_trgm_idx
  ON places USING GIN (search_text gin_trgm_ops);
