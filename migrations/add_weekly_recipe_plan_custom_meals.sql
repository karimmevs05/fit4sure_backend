-- Lets a block include a one-off "custom meal" that isn't a saved recipe --
-- just a name + estimated macros/cost typed in for this week's plan, so it
-- doesn't pollute the Recipes library. recipe_id becomes nullable; a custom
-- row is identified by having custom_name set instead. The existing
-- UNIQUE (recipe_id, block, planned_week_start) constraint still works fine
-- with multiple NULL recipe_ids, since Postgres never treats two NULLs as
-- duplicates for uniqueness purposes.
ALTER TABLE weekly_recipe_plan
  ALTER COLUMN recipe_id DROP NOT NULL;

ALTER TABLE weekly_recipe_plan
  ADD COLUMN IF NOT EXISTS custom_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS custom_calories NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS custom_protein_g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS custom_carbs_g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS custom_fat_g NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS custom_cost_per_pound_cents INTEGER;

ALTER TABLE weekly_recipe_plan
  DROP CONSTRAINT IF EXISTS weekly_recipe_plan_identity_check;
ALTER TABLE weekly_recipe_plan
  ADD CONSTRAINT weekly_recipe_plan_identity_check CHECK (recipe_id IS NOT NULL OR custom_name IS NOT NULL);
