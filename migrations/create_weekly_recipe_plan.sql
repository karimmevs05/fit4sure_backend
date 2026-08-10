-- Weekly Recipe Plan: replaces "which recipes are live this block" with a
-- single lightweight table instead of the old plate-builder model.
-- `block` reuses the same values as menus.delivery_day ('monday' / 'thursday')
-- so it lines up with the existing delivery-day plumbing, even though the
-- UI presents them as "Block 1 (Mon-Wed)" / "Block 2 (Thu-Sun)".
--
-- This is additive only -- it does not touch the `menus` / `menu_plan_recipes`
-- tables, so the existing plate-based ordering flow keeps working untouched
-- while this is evaluated.

CREATE TABLE IF NOT EXISTS weekly_recipe_plan (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  block VARCHAR(10) NOT NULL CHECK (block IN ('monday', 'thursday')),
  planned_week_start DATE NOT NULL,
  expected_volume INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (recipe_id, block, planned_week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_recipe_plan_week
  ON weekly_recipe_plan (planned_week_start, block);
