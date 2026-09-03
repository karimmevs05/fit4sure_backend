-- Lets a recipe step's prep-vs-cook classification be a real, editable fact
-- instead of always being re-guessed from its description text via the
-- COOK_STEP_PATTERN regex in adminMenuPlanner.js. NULL means "not
-- classified yet" -- every read site falls back to the regex in that case,
-- so nothing breaks for steps written before this column existed.
ALTER TABLE recipe_steps
  ADD COLUMN IF NOT EXISTS step_type VARCHAR(10)
    CHECK (step_type IN ('prep', 'cook'));
