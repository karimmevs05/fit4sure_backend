-- Staff-curated "plate" combos: a protein paired with default sides for a
-- given week/block, surfaced to customers as a one-click recommended
-- option (still fully customizable -- this only sets the default
-- selection, it doesn't restrict what a customer can pick instead).
CREATE TABLE IF NOT EXISTS weekly_plate_options (
  id SERIAL PRIMARY KEY,
  planned_week_start DATE NOT NULL,
  block VARCHAR NOT NULL,
  protein_recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  name VARCHAR,
  side_recipe_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
