-- Wet/Dry ingredient prep-station grouping for recipe_ingredients.
-- Defaulting existing rows to 'dry' is a reasonable backfill -- it means
-- every ingredient already in the system today doesn't silently disappear
-- from the form, and chefs can re-sort anything that should actually be
-- wet the next time they touch that recipe.
ALTER TABLE recipe_ingredients
  ADD COLUMN prep_section VARCHAR(10) NOT NULL DEFAULT 'dry'
    CHECK (prep_section IN ('dry', 'wet'));
