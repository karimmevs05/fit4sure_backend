-- Suggested per-plate serving size (grams) for an ingredient, e.g. "141.7g"
-- for a Regular-tier protein portion. Reference/guidance data only -- not
-- wired into any automatic calculation.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS suggested_serving_g NUMERIC(10,2);
