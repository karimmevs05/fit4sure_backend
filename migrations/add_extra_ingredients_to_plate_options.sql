-- Extra "garnish" ingredients on a staff-curated plate -- e.g. maple syrup
-- on a breakfast plate, parmesan on a pasta plate. Distinct from
-- side_recipe_ids: those are swappable, customer-visible Weekly Menu
-- recipes; these are flat additions pulled straight from inventory (not
-- the recipe catalog), always included in the plate as curated, never
-- separately priced or swapped by the customer.
--
-- Array of { inventoryId: number, grams: number } objects. Resolved to
-- live name/macros/price (from `inventory`) at read time rather than
-- snapshotted here, same as how side_recipe_ids is resolved against
-- `recipes` on every read -- a later price/macro correction on the
-- ingredient applies automatically rather than requiring every plate that
-- uses it to be re-saved.
ALTER TABLE weekly_plate_options
  ADD COLUMN IF NOT EXISTS extra_ingredients JSONB NOT NULL DEFAULT '[]';
