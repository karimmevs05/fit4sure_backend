-- Per-recipe overrides on top of the shared plate_formats standard
-- (migrations/create_plate_config.sql). A recipe defaults to the shared
-- format's price/portion sizes everywhere (getWeeklyMenu, findOrCreateMenu,
-- recipe servings math) unless an active override row exists here for that
-- (recipe_id, format_key) pair -- "mostly comes as standard unless checked
-- and changed", per the business requirement this was built for.
--
-- format_key is a plain string, not a foreign key to plate_formats.key --
-- recipe_id is a real recipes.recipe_id, but this table deliberately has no
-- FK to it either, matching this app's existing convention of not
-- FK-constraining cross-concern tables (see pos-studio's own notes on this)
-- so a recipe deletion never silently cascades into pricing history.
CREATE TABLE IF NOT EXISTS recipe_format_overrides (
  id SERIAL PRIMARY KEY,
  recipe_id INT NOT NULL,
  format_key VARCHAR(30) NOT NULL,
  protein_oz NUMERIC(5,2) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  veggies_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  price_cents INT NOT NULL CHECK (price_cents > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recipe_id, format_key)
);
CREATE INDEX IF NOT EXISTS idx_recipe_format_overrides_recipe ON recipe_format_overrides(recipe_id);
