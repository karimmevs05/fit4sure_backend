-- Custom diets: named, reusable plate collections (e.g. "Keto Reset") that
-- a customer can be tagged with, separate from the Weekly Recipe Plan
-- blocks (which are about bulk weekly volume, not an individual client's
-- standing diet). A diet is just a name; its content is whatever plates
-- get added to it from the Custom Plate Builder.
CREATE TABLE IF NOT EXISTS custom_diets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- One row per plate added to a diet. Macros/cost and the ingredient
-- breakdown are snapshotted at add-time (not live-recomputed from
-- recipe_ingredients) so a diet's plate list stays stable even if a
-- recipe's price or ingredients change later.
CREATE TABLE IF NOT EXISTS custom_diet_plates (
  id SERIAL PRIMARY KEY,
  diet_id INTEGER NOT NULL REFERENCES custom_diets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  calories NUMERIC(10,2) NOT NULL DEFAULT 0,
  protein_g NUMERIC(10,2) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(10,2) NOT NULL DEFAULT 0,
  fat_g NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_diet_plates_diet ON custom_diet_plates(diet_id);
